// Tuye Bites — the back office (API) for fast-food orders delivered in Wote town.
// The same code runs online (Netlify Functions + Turso) and on this computer (dev-server.mjs + a local SQLite file).
import bcrypt from "bcryptjs";
import { createHmac, randomBytes, timingSafeEqual, createECDH, createCipheriv, createPrivateKey, generateKeyPairSync, sign as cryptoSign } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

// Remembers who made the current request, so the activity history can say who did what
const current = new AsyncLocalStorage();

const SCHEMA = [
  // The menu. "cost" (buying price) and "hotel" (where it is bought) are never shown to customers.
  `CREATE TABLE IF NOT EXISTS items (
     id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, price INTEGER NOT NULL, old_price INTEGER,
     cost INTEGER, hotel TEXT, description TEXT, options TEXT, available INTEGER NOT NULL DEFAULT 1,
     image_ver INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS images (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  // Admins and riders. The main admin (created with the setup code) can never be switched off or removed.
  `CREATE TABLE IF NOT EXISTS users (
     id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT NOT NULL UNIQUE, pass_hash TEXT NOT NULL,
     role TEXT NOT NULL, is_main INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
     updated_at INTEGER NOT NULL, created_at INTEGER NOT NULL, last_login INTEGER)`,
  // One row per customer order; the foods in it are kept in "items" (JSON) as they were when ordered
  `CREATE TABLE IF NOT EXISTS orders (
     id INTEGER PRIMARY KEY AUTOINCREMENT, token TEXT NOT NULL UNIQUE, at INTEGER NOT NULL,
     customer TEXT NOT NULL, phone TEXT NOT NULL, area TEXT NOT NULL, directions TEXT, note TEXT,
     items TEXT NOT NULL, food_total INTEGER NOT NULL, delivery_fee INTEGER NOT NULL, total INTEGER NOT NULL,
     cost_total INTEGER NOT NULL DEFAULT 0, mpesa_code TEXT, status TEXT NOT NULL,
     problem TEXT, paid_at INTEGER, paid_by TEXT, rider_id INTEGER, rider_name TEXT, assigned_at INTEGER,
     picked_at INTEGER, delivered_at INTEGER, cancelled_at INTEGER, cancel_reason TEXT, refund TEXT, ip TEXT)`,
  `CREATE INDEX IF NOT EXISTS orders_at ON orders (at)`,
  `CREATE TABLE IF NOT EXISTS activity (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, who TEXT, action TEXT NOT NULL, detail TEXT)`,
  // Wrong logins and too many orders from one place are counted here
  // Phone numbers that may not order (fake or prank orders)
  `CREATE TABLE IF NOT EXISTS blocked (phone TEXT PRIMARY KEY, reason TEXT, at INTEGER NOT NULL, by TEXT)`,
  // Discount codes the owner creates, e.g. WELCOME50
  `CREATE TABLE IF NOT EXISTS discounts (
     code TEXT PRIMARY KEY, kind TEXT NOT NULL, value INTEGER NOT NULL, min_order INTEGER, ends_at INTEGER, max_uses INTEGER,
     uses INTEGER NOT NULL DEFAULT 0, first_only INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL)`,
  // Phones of admins and riders that get new-order alerts
  `CREATE TABLE IF NOT EXISTS push_subs (
     endpoint TEXT PRIMARY KEY, user_id INTEGER NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, first_at INTEGER NOT NULL, locked_until INTEGER NOT NULL DEFAULT 0)`
];

// Columns added after the first version; adding them again is harmless
const ADDED = [
  ["orders", "rating INTEGER"], ["orders", "rating_note TEXT"], ["orders", "rated_at INTEGER"],   // customer's stars after delivery
  ["orders", "rider_pay INTEGER"],      // what the rider earns for this delivery, fixed when it is delivered
  ["users", "pay INTEGER"],             // a rider's own pay per delivery (empty = the shop's normal rider pay)
  ["orders", "eta_min INTEGER"], ["orders", "eta_at INTEGER"],    // minutes promised when the payment is confirmed, and the time that gives
  // Typed by the owner to encourage customers; never counted in sales or reports
  ["items", "ordered_today INTEGER"], ["items", "viewing INTEGER"],
  ["items", "ordered_date TEXT"],       // the day "ordered today" was typed; on other days it counts as 0
  ["orders", "deliver_at INTEGER"],     // "order for later": the time the customer chose
  ["orders", "discount INTEGER"], ["orders", "discount_code TEXT"],   // money taken off the food by a discount code
  ["orders", "free_delivery INTEGER"],  // loyalty reward: delivery fee not charged
  ["items", "photos TEXT"],             // [{ id, v }]: up to 8 photos of the food, the first is the main one
  ["orders", "big_fee INTEGER"]         // extra delivery for big orders (items above the number included)
];

// The "Privacy and refunds" page, until an admin changes it in Settings.
// # = section, ## = small heading, - = point, **...** = bold; {whatsapp} and {till} become the shop's numbers.
const DEFAULT_POLICY = `# Your details
## What we keep
- Your name and phone number.
- Where to deliver (area and directions) and any note you write.
- Your order, the M-Pesa code you typed and the stars you give after delivery.
## Why we keep it
- To check your payment, buy your food and bring it to you.
- To call or WhatsApp you about your order.
- For the free delivery reward and first-order discounts, which count your past orders.
- To keep our business records and to stop fake orders.
## Who sees it
- Only the Tuye Bites team: our admins, and the rider who brings your order (they see your name, phone and directions).
- We never sell your details or give them to other businesses.
- You pay us directly on M-Pesa. We never ask for your M-Pesa PIN. Never share it with anyone.
## On your phone
- If you tick "Remember my details on this phone", your name, number and directions are saved on that phone only, so the next order is faster. Tap "Not you? Clear" at checkout to remove them, for example on a shared phone.
- Your order page opens only from your secret order link. On another phone it asks for the last 4 digits of your number. Three days after delivery, the details on that page are hidden.
## Seeing, changing or removing your details
WhatsApp or call us on **{whatsapp}**. We will tell you what we keep, correct it, or remove it (we may keep what the law asks us to keep for business records).

# Payment and refunds
- **Pay first.** We buy and deliver your food after we confirm your M-Pesa payment to Till **{till}**.
- **If we cannot deliver** (for example the hotel has finished that food), we tell you and send **all your money back** to the M-Pesa number you paid from, the same day.
- **Changed your mind?** Tell us quickly on WhatsApp. If we have not yet bought your food, we refund you in full. After the food is bought, we cannot take it back, but we will do our best to help.
- **Something wrong or missing?** WhatsApp us within 1 hour of delivery, with a photo if you can. We will bring what is missing or refund that part.
- **Wrong M-Pesa code?** Your order page will ask you to type the correct one. Nothing is delivered until the payment is found.
- **Please be reachable.** Keep your phone on. If the rider cannot find you or reach you, we will wait a reasonable time and try to contact you before taking the food back.

# Delivery times
The time we give is our best estimate. Rain, traffic or a busy hotel can make us a little late. Your order page always shows the latest time and the rider's number once the food is on the way.`;

// Order steps: new (payment being checked) -> confirmed (paid, food being bought) -> on_the_way -> delivered.
// payment_problem = the M-Pesa code was not found; the customer can type it again. cancelled = stopped.
const STATUS = ["new", "payment_problem", "confirmed", "on_the_way", "delivered", "cancelled"];
const orderNo = id => "TB-" + String(id).padStart(5, "0");

const DEFAULTS = {
  whatsapp: "0750755226", till: "1234567", tillName: "TUYE BITES",
  open: "08:00", close: "22:00", mode: "auto",         // auto = follow the hours; open / closed = owner's switch
  notice: "", minOrder: 0, logoVer: 0,
  heroVer: 0, heroOn: false,            // the owner's own picture beside the welcome words (instead of food photos)
  categories: ["Chips", "Chicken", "Burgers", "Pizza", "Snacks", "Drinks", "Combos"],
  deliveryAreas: [{ name: "Wote town centre", fee: 50 }],
  deliveryTime: "05-15 minutes",        // shown to customers
  lateCheck: 5, lateDeliver: 45,        // minutes before an order shows as late on the admin page
  riderPay: 50,                         // normal rider pay per delivery
  deal: { on: false, title: "Hot Deals", items: [] },  // items: [{ id, price, start, end, qty }], each food with its own price and time
  busyAt: 8, busyTime: "about 60 minutes",   // busy mode: this many orders in progress shows a "very busy" message (0 = off)
  loyaltyEvery: 10,                     // every 10th delivered order gets free delivery (0 = off)
  // Big orders are heavy for a rider: items above "bigIncluded" add "bigPerItem" each to the delivery; above "maxItems" customers must call
  bigOn: true, bigIncluded: 4, bigPerItem: 20, maxItems: 15
};
// Hot Deals are on while switched on and at least one food's deal time is running now
const dealOn = s => !!(s.deal && s.deal.on && s.deal.items.some(d => (d.start || 0) <= Date.now() && d.end > Date.now()));

const MAX_IMAGE = 1_500_000;          // characters of a photo (about 1.1 MB); photos are shrunk in the browser first
const SESSION_DAYS = 30;
const MAX_FAILS = 5, FAIL_WINDOW = 15 * 6e4, LOCK_TIME = 15 * 6e4;   // 5 wrong tries in 15 minutes locks for 15 minutes
const MAX_ORDERS_HOUR = 8;            // orders one phone/internet connection can place in an hour
const EAT = 3 * 36e5;                 // Kenya time is 3 hours ahead of UTC all year

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});
const isDataImage = s => typeof s === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(s);
function checkImage(s) {
  if (!isDataImage(s)) throw new HttpError(400, "Please choose a photo (JPG, PNG or WebP).");
  if (s.length > MAX_IMAGE) throw new HttpError(413, "That photo is too big. Try a smaller one.");
  return s;
}
const checkPassword = p => {
  if (typeof p !== "string" || p.length < 6) throw new HttpError(400, "Use at least 6 characters for the password.");
  return p;
};
const newToken = () => randomBytes(18).toString("base64url");
const newId = () => Date.now().toString(36) + randomBytes(3).toString("hex");
const clip = (v, n) => String(v ?? "").trim().slice(0, n);
const kes = n => "KES " + Number(n || 0).toLocaleString("en-KE");
const num = v => v == null ? null : Number(v);
const optInt = (v, max) => {
  if (v === "" || v == null) return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : null;
};
// M-Pesa transaction codes: exactly 10 capital letters and numbers, starting with a letter (e.g. QJK7Y2B4XZ)
const MPESA_CODE = /^[A-Z][A-Z0-9]{9}$/;
const MPESA_MSG = "M-Pesa codes have exactly 10 letters and numbers and start with a letter, e.g. QJK7Y2B4XZ.";
const cleanCode = v => {
  const c = String(v || "").replace(/\s/g, "").toUpperCase();
  if (!MPESA_CODE.test(c)) throw new HttpError(400, MPESA_MSG);
  return c;
};
// Kenyan mobile numbers: 07XXXXXXXX or 01XXXXXXXX (254... and +254... are accepted and changed to 07...)
function cleanPhone(v, what = "phone number") {
  let n = String(v || "").replace(/\D/g, "");
  if (n.startsWith("254") && n.length === 12) n = "0" + n.slice(3);
  if (!/^0[17]\d{8}$/.test(n)) throw new HttpError(400, `Type a correct ${what} with 10 digits, e.g. 0712345678.`);
  return n;
}
const hhmm = v => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || "").trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new HttpError(400, "Type the time like 08:00 or 22:30.");
  return m[1].padStart(2, "0") + ":" + m[2];
};
const mins = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const ampm = t => { const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };

// Kenya dates and times (3 hours ahead of UTC)
// Extra delivery for the items above the number included
const bigOrderFee = (s, count) => s.bigOn ? Math.max(0, count - (s.bigIncluded || 0)) * (s.bigPerItem || 0) : 0;
const kenyaDate = (t = Date.now()) => new Date(t + EAT).toISOString().slice(0, 10);
const kenyaDayStart = (t = Date.now()) => { const d = new Date(t + EAT); d.setUTCHours(0, 0, 0, 0); return d.getTime() - EAT; };
const kenyaMins = t => { const d = new Date(t + EAT); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const kenyaWhen = t => {
  const d = new Date(t + EAT), today = kenyaDate(), day = kenyaDate(t);
  const h = d.getUTCHours(), m = String(d.getUTCMinutes()).padStart(2, "0");
  return `${day === today ? "today" : day === kenyaDate(Date.now() + 864e5) ? "tomorrow" : day} at ${h % 12 || 12}:${m} ${h < 12 ? "AM" : "PM"}`;
};
// Are the opening hours on at this time of day?
function hoursOpenAt(s, t) {
  const now = kenyaMins(t), o = mins(s.open), c = mins(s.close);
  return o === c ? true : o < c ? now >= o && now < c : now >= o || now < c;
}

// Is the shop taking orders right now?
function openState(s) {
  if (s.mode === "open") return { open: true, text: "" };
  if (s.mode === "closed") return { open: false, text: "We are not taking orders right now." };
  const open = hoursOpenAt(s, Date.now());   // hours may run past midnight
  return { open, text: open ? "" : `We are closed now. We open at ${ampm(s.open)} and close at ${ampm(s.close)}.` };
}

// ---------- menu options: e.g. { name: "Size", pick: "one", required: true, choices: [{ name: "Large", price: 50 }] } ----------
function cleanOptions(list) {
  if (list == null) return [];
  if (!Array.isArray(list) || list.length > 6) throw new HttpError(400, "Up to 6 groups of choices per food.");
  return list.map(g => {
    const name = clip(g.name, 30);
    const choices = (Array.isArray(g.choices) ? g.choices : []).slice(0, 15)
      .map(c => ({ name: clip(c.name, 40), price: optInt(c.price, 100000) || 0 })).filter(c => c.name);
    if (!name) throw new HttpError(400, "Every group of choices needs a name, e.g. Size or Extras.");
    if (!choices.length) throw new HttpError(400, `Add at least one choice under "${name}".`);
    if (new Set(choices.map(c => c.name.toLowerCase())).size !== choices.length) throw new HttpError(400, `Two choices under "${name}" have the same name.`);
    return { name, pick: g.pick === "many" ? "many" : "one", required: g.pick !== "many" && !!g.required, choices };
  });
}
// The phone alert services of Chrome/Android, Firefox, Safari/iPhone and Edge/Windows
const pushHostOk = u => {
  try {
    const x = new URL(u);
    return x.protocol === "https:" && /(^|\.)(fcm\.googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)$/.test(x.hostname);
  } catch { return false; }
};
const escHtml = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const parseJson = (v, fallback) => { try { return v ? JSON.parse(v) : fallback; } catch { return fallback; } };

export function makeApp(db, env) {
  let ready = null;
  async function migrate() {
    await db.batch(SCHEMA, "write");
    for (const [table, col] of ADDED) {
      try { await db.execute(`ALTER TABLE ${table} ADD COLUMN ${col}`); }
      catch (e) { if (!/duplicate column/i.test(String(e.message || e))) throw e; }
    }
  }
  const init = () => (ready ??= migrate().catch(e => { ready = null; throw e; }));

  // ---------- activity history ----------
  const who = () => (current.getStore() || {}).who || "";
  const log = (action, detail = "") => db.execute({
    sql: "INSERT INTO activity (at, who, action, detail) VALUES (?, ?, ?, ?)", args: [Date.now(), who(), action, clip(detail, 500)]
  });

  // ---------- login tokens (signed with SESSION_SECRET) ----------
  function secret() {
    if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 16)
      throw new HttpError(500, "SESSION_SECRET is missing in the Netlify settings (needs 16+ characters).");
    return env.SESSION_SECRET;
  }
  function sign(payload) {
    const p = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return p + "." + createHmac("sha256", secret()).update(p).digest("base64url");
  }
  function verify(token) {
    const [p, s] = String(token || "").split(".");
    if (!p || !s) return null;
    const want = createHmac("sha256", secret()).update(p).digest();
    const got = Buffer.from(s, "base64url");
    if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
    try {
      const data = JSON.parse(Buffer.from(p, "base64url").toString());
      return data.exp > Date.now() ? data : null;
    } catch { return null; }
  }
  // The token remembers when the password last changed, so changing it logs out every other device
  const issue = u => sign({ id: u.id, v: u.updated_at, exp: Date.now() + SESSION_DAYS * 864e5 });
  // Order page keys: proof that this phone placed the order (or typed the last 4 digits of the order's phone number)
  const orderKey = token => sign({ k: "order", t: token, exp: Date.now() + 365 * 864e5 });
  const orderKeyOk = (token, key) => { const d = key && verify(key); return !!(d && d.k === "order" && d.t === token); };

  const userOut = r => ({ id: Number(r.id), name: r.name, phone: r.phone, role: r.role, main: !!Number(r.is_main),
    active: !!Number(r.active), createdAt: Number(r.created_at), lastLogin: num(r.last_login), pay: num(r.pay) });
  async function getUser(where, arg) {
    const r = (await db.execute({ sql: `SELECT * FROM users WHERE ${where} = ?`, args: [arg] })).rows[0];
    return r ? { ...userOut(r), hash: r.pass_hash, updated_at: Number(r.updated_at) } : null;
  }
  const hasMain = async () => !!(await db.execute("SELECT 1 FROM users WHERE is_main = 1")).rows[0];
  async function requireUser(req) {
    const data = verify((req.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""));
    const u = data && data.id && await getUser("id", data.id);
    if (!u || !u.active || u.updated_at !== data.v) throw new HttpError(401, "Please log in again.");
    return u;
  }
  function setupCodeOk(code) {
    if (!env.SETUP_CODE) throw new HttpError(403, "SETUP_CODE is not set in the Netlify settings.");
    const a = Buffer.from(String(code || "").trim()), b = Buffer.from(env.SETUP_CODE);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  // ---------- limits: too many wrong logins (or orders) from one place locks it for a while ----------
  const clientIp = req => ((req.headers.get("x-nf-client-connection-ip")
    || (req.headers.get("x-forwarded-for") || "").split(",")[0] || "local").trim());
  async function checkLocked(key) {
    const r = (await db.execute({ sql: "SELECT locked_until FROM limits WHERE key = ?", args: [key] })).rows[0];
    const until = r ? Number(r.locked_until) : 0;
    if (until > Date.now()) {
      const m = Math.ceil((until - Date.now()) / 6e4);
      throw new HttpError(429, `Too many tries. Please wait ${m} minute${m === 1 ? "" : "s"} and try again.`);
    }
  }
  async function count(key, max, windowMs, lockMs) {
    const now = Date.now();
    if (Math.random() < 0.05) await db.execute({ sql: "DELETE FROM limits WHERE first_at < ? AND locked_until < ?", args: [now - 2 * 864e5, now] });
    const r = (await db.execute({ sql: "SELECT count, first_at FROM limits WHERE key = ?", args: [key] })).rows[0];
    const fresh = !r || now - Number(r.first_at) > windowMs;
    const n = fresh ? 1 : Number(r.count) + 1;
    const locked = n >= max ? now + lockMs : 0;
    await db.execute({
      sql: `INSERT INTO limits (key, count, first_at, locked_until) VALUES (?, ?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET count = excluded.count, first_at = excluded.first_at, locked_until = excluded.locked_until`,
      args: [key, n, fresh ? now : Number(r.first_at), locked]
    });
    return { n, locked };
  }
  async function recordFail(ip, what) {
    const { n, locked } = await count("login:" + ip, MAX_FAILS, FAIL_WINDOW, LOCK_TIME);
    await log(locked ? "Login blocked for 15 minutes" : "Wrong " + what, `From ${ip} (try ${n} of ${MAX_FAILS})`);
    return locked;
  }
  const clearFails = ip => db.execute({ sql: "DELETE FROM limits WHERE key = ?", args: ["login:" + ip] });

  // ---------- images ----------
  const putImage = (id, data) => db.execute({
    sql: `INSERT INTO images (id, data, updated_at) VALUES (?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    args: [id, data, Date.now()]
  });
  async function serveImage(id) {
    const r = (await db.execute({ sql: "SELECT data FROM images WHERE id = ?", args: [id] })).rows[0];
    if (!r) return new Response("Not found", { status: 404 });
    const [head, b64] = String(r.data).split(",");
    return new Response(Buffer.from(b64, "base64"), {
      headers: { "content-type": head.slice(5, head.indexOf(";")), "cache-control": "public, max-age=31536000, immutable" }
    });
  }

  // ---------- settings ----------
  async function getSettings() {
    const r = (await db.execute("SELECT value FROM settings WHERE key = 'shop'")).rows[0];
    const s = { ...DEFAULTS, ...parseJson(r && r.value, {}) };
    if (s.deal && s.deal.end) s.deal = { ...s.deal, items: s.deal.items.map(d => ({ start: 0, end: s.deal.end, ...d })), end: undefined };
    return s;
  }
  const putSettings = s => db.execute({
    sql: "INSERT INTO settings (key, value) VALUES ('shop', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    args: [JSON.stringify(s)]
  });
  // What customers' phones receive: rider pay and late-warning minutes stay with the admins
  const publicSettings = s => { const { riderPay, lateCheck, lateDeliver, ...pub } = settingsOut(s); return pub; };
  const settingsOut = s => ({ ...s, logo: s.logoVer ? "/api/img/logo?v=" + s.logoVer : null, hero: s.heroVer ? "/api/img/hero?v=" + s.heroVer : null,
    state: openState(s), dealActive: dealOn(s) });
  async function updateSettings(p) {
    const s = await getSettings(), before = JSON.parse(JSON.stringify(s)), changed = [];
    // Only what really changed goes into the activity history
    const note = (key, msg) => { if (JSON.stringify(before[key]) !== JSON.stringify(s[key])) changed.push(msg); };
    if ("whatsapp" in p) { s.whatsapp = cleanPhone(p.whatsapp, "WhatsApp number"); note("whatsapp", "WhatsApp " + s.whatsapp); }
    if ("till" in p) {
      const t = String(p.till || "").replace(/\D/g, "");
      if (t.length < 5 || t.length > 8) throw new HttpError(400, "The till number has 5 to 8 digits.");
      s.till = t; note("till", "Till " + t);
    }
    if ("tillName" in p) { s.tillName = clip(p.tillName, 40); note("tillName", "Till name " + s.tillName); }
    if ("open" in p) s.open = hhmm(p.open);
    if ("close" in p) s.close = hhmm(p.close);
    if (before.open !== s.open || before.close !== s.close) changed.push(`Hours ${s.open} to ${s.close}`);
    if ("mode" in p) {
      if (!["auto", "open", "closed"].includes(p.mode)) throw new HttpError(400, "Bad open/closed choice.");
      s.mode = p.mode; note("mode", { auto: "Follow opening hours", open: "Open now", closed: "Closed now" }[p.mode]);
    }
    if ("notice" in p) { s.notice = clip(p.notice, 200); note("notice", "Notice: " + (s.notice || "(none)")); }
    if ("minOrder" in p) { s.minOrder = optInt(p.minOrder, 100000) || 0; note("minOrder", "Smallest order " + kes(s.minOrder)); }
    if ("categories" in p) {
      if (!Array.isArray(p.categories) || p.categories.length > 20) throw new HttpError(400, "Up to 20 food groups.");
      const list = [...new Set(p.categories.map(c => clip(c, 30)).filter(Boolean))];
      if (!list.length) throw new HttpError(400, "Keep at least one food group.");
      s.categories = list; note("categories", "Food groups: " + list.join(", "));
    }
    if ("deliveryAreas" in p) {
      if (!Array.isArray(p.deliveryAreas) || p.deliveryAreas.length > 40) throw new HttpError(400, "Up to 40 delivery areas.");
      const list = p.deliveryAreas.map(d => ({ name: clip(d.name, 40), fee: optInt(d.fee, 100000) || 0 })).filter(d => d.name);
      if (!list.length) throw new HttpError(400, "Keep at least one delivery area.");
      if (new Set(list.map(d => d.name.toLowerCase())).size !== list.length) throw new HttpError(400, "Two delivery areas have the same name.");
      s.deliveryAreas = list; note("deliveryAreas", "Delivery areas: " + list.map(d => `${d.name} ${kes(d.fee)}`).join("; "));
    }
    if ("deliveryTime" in p) { s.deliveryTime = clip(p.deliveryTime, 40); note("deliveryTime", "Delivery time " + (s.deliveryTime || "(not shown)")); }
    if ("lateCheck" in p) { s.lateCheck = Math.max(1, optInt(p.lateCheck, 600) || 5); note("lateCheck", `Late if payment not checked in ${s.lateCheck} min`); }
    if ("lateDeliver" in p) { s.lateDeliver = Math.max(5, optInt(p.lateDeliver, 600) || 45); note("lateDeliver", `Late if not delivered in ${s.lateDeliver} min`); }
    if ("riderPay" in p) { s.riderPay = optInt(p.riderPay, 100000) || 0; note("riderPay", "Rider pay " + kes(s.riderPay) + " per delivery"); }
    if ("deal" in p) {
      // Each food: its own deal price, start and end time, and (if wanted) how many are sold at that price
      const d = p.deal || {};
      if (!Array.isArray(d.items) || d.items.length > 20) throw new HttpError(400, "Up to 20 Hot Deals.");
      const list = [];
      for (const x of d.items) {
        const r = await getItem(String(x.id || ""));
        if (!r) throw new HttpError(400, "One of the Hot Deals foods is no longer on the menu.");
        const price = optInt(x.price, 1000000);
        if (!price || price >= Number(r.price)) throw new HttpError(400, `The deal price for ${r.name} must be lower than its normal price (${kes(r.price)}).`);
        const start = Math.round(Number(x.start)) || Date.now(), end = Math.round(Number(x.end)) || 0;
        if (!end) throw new HttpError(400, `Choose when the deal for ${r.name} ends.`);
        if (end <= start) throw new HttpError(400, `The deal for ${r.name} must end after it starts.`);
        if (end <= Date.now()) continue;   // ended deals are dropped when saving
        if (list.some(y => y.id === r.id && start < y.end && y.start < end)) throw new HttpError(400, `${r.name} has two Hot Deals at the same time.`);
        list.push({ id: r.id, price, start, end, qty: optInt(x.qty, 9999) || null, name: r.name });
      }
      s.deal = { on: !!d.on && list.length > 0, title: clip(d.title, 40) || "Hot Deals", items: list.map(({ name, ...x }) => x) };
      note("deal", `Hot Deals ${s.deal.on ? "on" : "off"}: ` + list.map(x => `${x.name} ${kes(x.price)} until ${kenyaWhen(x.end)}${x.qty ? ` (${x.qty} only)` : ""}`).join("; "));
    }
    if ("busyAt" in p) { s.busyAt = optInt(p.busyAt, 100) || 0; note("busyAt", s.busyAt ? `Busy message at ${s.busyAt} orders in progress` : "Busy message off"); }
    if ("busyTime" in p) { s.busyTime = clip(p.busyTime, 40) || "about 60 minutes"; note("busyTime", "Busy delivery time " + s.busyTime); }
    if ("bigOn" in p) { s.bigOn = !!p.bigOn; note("bigOn", s.bigOn ? "Big order fee on" : "Big order fee off"); }
    if ("bigIncluded" in p) { s.bigIncluded = Math.max(1, optInt(p.bigIncluded, 100) || 1); note("bigIncluded", `${s.bigIncluded} items included in delivery`); }
    if ("bigPerItem" in p) { s.bigPerItem = optInt(p.bigPerItem, 10000) || 0; note("bigPerItem", `${kes(s.bigPerItem)} for each extra item`); }
    if ("maxItems" in p) {
      s.maxItems = optInt(p.maxItems, 500) || 0;
      if (s.maxItems && s.maxItems < s.bigIncluded) throw new HttpError(400, "The most items per order cannot be less than the items included.");
      note("maxItems", s.maxItems ? `At most ${s.maxItems} items per order` : "No limit on items per order");
    }
    if ("loyaltyEvery" in p) {
      const n = optInt(p.loyaltyEvery, 100) || 0;
      s.loyaltyEvery = n >= 2 ? n : 0;
      note("loyaltyEvery", s.loyaltyEvery ? `Free delivery on every ${s.loyaltyEvery}th order` : "Loyalty reward off");
    }
    if ("hero" in p) {
      if (p.hero === null) { await db.execute("DELETE FROM images WHERE id = 'hero'"); s.heroVer = 0; s.heroOn = false; changed.push("Welcome picture removed"); }
      else { await putImage("hero", checkImage(p.hero)); s.heroVer = Date.now(); changed.push("Welcome picture changed"); }
    }
    if ("heroOn" in p) { s.heroOn = !!p.heroOn && !!s.heroVer; note("heroOn", s.heroOn ? "Showing my own welcome picture" : "Showing food photos beside the welcome words"); }
    if ("logo" in p) {
      if (p.logo === null) { await db.execute("DELETE FROM images WHERE id = 'logo'"); s.logoVer = 0; changed.push("Logo removed"); }
      else { await putImage("logo", checkImage(p.logo)); s.logoVer = Date.now(); changed.push("Logo changed"); }
    }
    await putSettings(s);
    if (changed.length) await log("Settings saved", changed.join(" | "));
    return settingsOut(s);
  }

  // ---------- menu ----------
  function itemOut(r, priv = false) {
    const it = {
      id: r.id, name: r.name, category: r.category, price: Number(r.price), oldPrice: num(r.old_price),
      description: r.description || "", options: parseJson(r.options, []), available: !!Number(r.available),
      image: photoUrls(r)[0] || null, images: photoUrls(r),
      orderedToday: r.ordered_date === kenyaDate() ? num(r.ordered_today) : null, viewing: num(r.viewing)
    };
    if (priv) Object.assign(it, { cost: num(r.cost), hotel: r.hotel || "", createdAt: Number(r.created_at) });
    return it;
  }
  function cleanItem(b) {
    const name = clip(b.name, 60), category = clip(b.category, 30);
    const price = optInt(b.price, 1000000);
    if (!name) throw new HttpError(400, "Type the name of the food.");
    if (!category) throw new HttpError(400, "Choose the food group.");
    if (!price) throw new HttpError(400, "Type the selling price.");
    const oldPrice = optInt(b.oldPrice, 1000000);
    if (oldPrice != null && oldPrice <= price) throw new HttpError(400, "The \"was\" price must be higher than the selling price.");
    return {
      name, category, price, oldPrice, cost: optInt(b.cost, 1000000), hotel: clip(b.hotel, 60),
      description: clip(b.description, 300), options: JSON.stringify(cleanOptions(b.options)), available: b.available === false ? 0 : 1,
      orderedToday: optInt(b.orderedToday, 9999) || null, viewing: optInt(b.viewing, 9999) || null
    };
  }
  // Photos of a food: the list saved with it (older foods had one photo saved under the food's own id)
  const itemPhotos = r => r.photos ? parseJson(r.photos, []) : Number(r.image_ver) ? [{ id: r.id, v: Number(r.image_ver) }] : [];
  const photoUrls = r => itemPhotos(r).map(x => `/api/img/${x.id}?v=${x.v}`);
  // A new list arrives as new photos or the addresses of photos already saved; removed photos are deleted
  async function savePhotos(itemId, input, old) {
    if (!Array.isArray(input)) return old;
    if (input.length > 8) throw new HttpError(400, "Up to 8 photos for each food.");
    const out = [];
    for (const x of input) {
      if (isDataImage(x)) {
        const id = itemId + "-" + randomBytes(4).toString("hex");
        await putImage(id, checkImage(x));
        out.push({ id, v: Date.now() });
      } else {
        const m = /\/api\/img\/([A-Za-z0-9-]+)/.exec(String(x || ""));
        const was = m && old.find(o => o.id === m[1]);
        if (was && !out.includes(was)) out.push(was);
      }
    }
    for (const o of old) if (!out.includes(o)) await db.execute({ sql: "DELETE FROM images WHERE id = ?", args: [o.id] });
    return out;
  }
  const getItem = async id => (await db.execute({ sql: "SELECT * FROM items WHERE id = ?", args: [id] })).rows[0] || null;

  // ---------- orders ----------
  function orderOut(r, view = "admin") {
    const o = {
      id: Number(r.id), no: orderNo(r.id), at: Number(r.at), customer: r.customer, phone: r.phone, area: r.area,
      directions: r.directions || "", note: r.note || "", items: parseJson(r.items, []),
      foodTotal: Number(r.food_total), deliveryFee: Number(r.delivery_fee), total: Number(r.total),
      mpesaCode: r.mpesa_code || "", status: r.status, problem: r.problem || "",
      paidAt: num(r.paid_at), riderId: num(r.rider_id), riderName: r.rider_name || "",
      assignedAt: num(r.assigned_at), pickedAt: num(r.picked_at), deliveredAt: num(r.delivered_at),
      cancelledAt: num(r.cancelled_at), cancelReason: r.cancel_reason || "",
      rating: num(r.rating), ratingNote: r.rating_note || "",
      etaMin: num(r.eta_min), etaAt: num(r.eta_at), deliverAt: num(r.deliver_at),
      discount: Number(r.discount) || 0, discountCode: r.discount_code || "", freeDelivery: !!Number(r.free_delivery), bigFee: Number(r.big_fee) || 0
    };
    if (view === "admin") Object.assign(o, { token: r.token, paidBy: r.paid_by || "", costTotal: Number(r.cost_total), refund: r.refund || "", riderPay: num(r.rider_pay) });
    // Riders see which hotel to pick the food from, never buying prices; customers see neither
    if (view === "rider") o.items = o.items.map(({ cost, ...rest }) => rest);
    if (view === "customer") {
      for (const k of ["id", "riderId", "customer", "phone"]) delete o[k];
      o.items = o.items.map(({ cost, hotel, ...rest }) => rest);
    }
    return o;
  }
  const getOrder = async id => (await db.execute({ sql: "SELECT * FROM orders WHERE id = ?", args: [id] })).rows[0] || null;
  async function codeUsed(code, exceptId = 0) {
    const r = (await db.execute({ sql: "SELECT id FROM orders WHERE mpesa_code = ? AND status != 'cancelled' AND id != ?", args: [code, exceptId] })).rows[0];
    if (r) throw new HttpError(409, `This M-Pesa code was already used on order ${orderNo(r.id)}. Check the code in your M-Pesa message.`);
  }

  // Hot Deals now: which foods are at their deal price, which are coming up, and how many are left at that price
  async function dealState(s) {
    const now = Date.now(), list = s.deal && s.deal.on ? s.deal.items.filter(d => d.end > now) : [];
    if (!list.length) return { live: {}, list: [] };
    const since = Math.min(...list.map(d => d.start || 0));
    const rows = list.some(d => d.qty) ? (await db.execute({ sql: "SELECT at, items FROM orders WHERE at >= ? AND status != 'cancelled'", args: [since] })).rows : [];
    const out = list.map(d => {
      let sold = 0;
      for (const r of rows) if (Number(r.at) >= (d.start || 0)) for (const l of parseJson(r.items, [])) if (l.id === d.id && l.deal) sold += l.qty;
      const left = d.qty ? Math.max(0, d.qty - sold) : null;
      return { ...d, sold, left, started: (d.start || 0) <= now, live: (d.start || 0) <= now && left !== 0 };
    });
    return { live: Object.fromEntries(out.filter(d => d.live).map(d => [d.id, d])), list: out.sort((a, b) => a.start - b.start) };
  }

  // Real orders today for each food (cancelled ones not counted), added to the owner's typed "ordered today"
  async function soldToday() {
    const r = await db.execute({ sql: "SELECT items FROM orders WHERE at >= ? AND status != 'cancelled'", args: [kenyaDayStart()] });
    const n = {};
    for (const row of r.rows) for (const l of parseJson(row.items, [])) n[l.id] = (n[l.id] || 0) + l.qty;
    return n;
  }
  // Orders still being handled now (orders for much later do not count)
  const inProgress = async () => Number((await db.execute({
    sql: "SELECT COUNT(*) AS n FROM orders WHERE status IN ('new','payment_problem','confirmed','on_the_way') AND (deliver_at IS NULL OR deliver_at < ?)",
    args: [Date.now() + 36e5] })).rows[0].n);

  // Discount code and loyalty reward for this order (also used to show them at checkout before ordering)
  async function perks(s, phone, codeIn, food) {
    const out = { discount: 0, code: "", text: "", freeDelivery: false, loyalty: null };
    if (s.loyaltyEvery && phone) {
      const n = Number((await db.execute({ sql: "SELECT COUNT(*) AS n FROM orders WHERE phone = ? AND status = 'delivered'", args: [phone] })).rows[0].n);
      out.freeDelivery = n % s.loyaltyEvery === s.loyaltyEvery - 1;
      out.loyalty = { every: s.loyaltyEvery, done: n };
    }
    const code = String(codeIn || "").replace(/\s/g, "").toUpperCase().slice(0, 20);
    if (code) {
      const d = (await db.execute({ sql: "SELECT * FROM discounts WHERE code = ?", args: [code] })).rows[0];
      const bad = m => { throw new HttpError(400, m); };
      if (!d || !Number(d.active)) bad("That discount code is not valid.");
      if (d.ends_at && Number(d.ends_at) < Date.now()) bad("That discount code has ended.");
      if (d.max_uses && Number(d.uses) >= Number(d.max_uses)) bad("That discount code has been used up.");
      if (d.min_order && food < Number(d.min_order)) bad(`This code works on orders of ${kes(d.min_order)} or more of food.`);
      if (Number(d.first_only)) {
        if (!phone) bad("Type your phone number first: this code is for a first order.");
        const prev = Number((await db.execute({ sql: "SELECT COUNT(*) AS n FROM orders WHERE phone = ? AND status != 'cancelled'", args: [phone] })).rows[0].n);
        if (prev) bad("This code is only for a first order.");
      }
      out.discount = Math.min(food, d.kind === "percent" ? Math.round(food * Number(d.value) / 100) : Number(d.value));
      out.code = code;
      out.text = d.kind === "percent" ? `${Number(d.value)}% off the food` : `${kes(d.value)} off the food`;
    }
    return out;
  }

  // "Order for later": today or tomorrow, at least 30 minutes from now, inside the opening hours
  function checkLater(s, v) {
    const t = Math.round(Number(v));
    if (!t) return null;
    if (s.mode === "closed") throw new HttpError(400, "We are not taking orders right now.");
    if (t < Date.now() + 30 * 6e4) throw new HttpError(400, "Choose a time at least 30 minutes from now.");
    if (t >= kenyaDayStart() + 2 * 864e5) throw new HttpError(400, "You can order for today or tomorrow.");
    if (s.mode === "auto" && !hoursOpenAt(s, t)) throw new HttpError(400, `Choose a time between ${ampm(s.open)} and ${ampm(s.close)}.`);
    return t;
  }

  async function placeOrder(req, p) {
    const s = await getSettings(), st = openState(s);
    const later = checkLater(s, p.deliverAt);
    if (!st.open && !later) throw new HttpError(400, st.text + (s.mode === "auto" ? " You can order for later." : ""));
    const customer = clip(p.customer, 50);
    if (!customer) throw new HttpError(400, "Type your name.");
    const phone = cleanPhone(p.phone);
    if ((await db.execute({ sql: "SELECT 1 FROM blocked WHERE phone = ?", args: [phone] })).rows[0])
      throw new HttpError(403, "Sorry, we cannot take online orders from this number. Please call or WhatsApp us.");
    const area = s.deliveryAreas.find(d => d.name === p.area);
    if (!area) throw new HttpError(400, "Choose where we should deliver.");
    const directions = clip(p.directions, 200);
    if (!directions) throw new HttpError(400, "Tell us exactly where to bring the food (building, gate, landmark).");
    const code = cleanCode(p.mpesaCode);
    if (!Array.isArray(p.items) || !p.items.length) throw new HttpError(400, "Your cart is empty.");
    if (p.items.length > 30) throw new HttpError(400, "That is too many lines in one order. Please split it into two orders.");

    // Prices always come from the menu here, never from the customer's phone
    const lines = [], deals = await dealState(s), dealUsed = {};
    for (const line of p.items) {
      const r = await getItem(String(line.id || ""));
      if (!r) throw new HttpError(400, "One of the foods in your cart is no longer on the menu. Please remove it.");
      const it = itemOut(r, true);
      if (!it.available) throw new HttpError(400, `Sorry, ${it.name} is finished for today. Please remove it from your cart.`);
      const qty = Math.round(Number(line.qty));
      if (!(qty >= 1 && qty <= 20)) throw new HttpError(400, `Choose between 1 and 20 of ${it.name}.`);
      const picked = line.choices && typeof line.choices === "object" ? line.choices : {};
      const chosen = [];
      let extra = 0;
      for (const g of it.options) {
        const names = [].concat(picked[g.name] || []).map(String);
        const sel = g.choices.filter(c => names.includes(c.name));
        if (g.pick === "one" && sel.length > 1) throw new HttpError(400, `Choose only one ${g.name} for ${it.name}.`);
        if (g.required && !sel.length) throw new HttpError(400, `Choose the ${g.name} for ${it.name}.`);
        for (const c of sel) { chosen.push({ group: g.name, name: c.name, price: c.price }); extra += c.price; }
      }
      const deal = deals.live[it.id];
      if (deal && deal.left != null) {
        const left = deal.left - (dealUsed[it.id] || 0);
        if (qty > left) throw new HttpError(400, left > 0 ? `Only ${left} ${it.name} left at the Hot Deal price. Please change the number to ${left}.` : `Sorry, the Hot Deal for ${it.name} has just sold out. Please remove it and add it again.`);
        dealUsed[it.id] = (dealUsed[it.id] || 0) + qty;
      }
      const unit = (deal ? deal.price : it.price) + extra;
      lines.push({ id: it.id, name: it.name, qty, unit, total: unit * qty, choices: chosen, cost: (it.cost || 0) * qty, hotel: it.hotel || "", ...(deal ? { deal: true } : {}) });
    }
    const food = lines.reduce((a, l) => a + l.total, 0);
    // Too many items for one rider: the customer calls or WhatsApps instead
    const itemCount = lines.reduce((a, l) => a + l.qty, 0);
    if (s.maxItems && itemCount > s.maxItems)
      throw new HttpError(400, `That is a big order (${itemCount} items; the most online is ${s.maxItems}). Please call or WhatsApp us on ${s.whatsapp} and we will arrange it.`);
    const bigFee = bigOrderFee(s, itemCount);
    if (s.minOrder && food < s.minOrder) throw new HttpError(400, `The smallest order is ${kes(s.minOrder)} of food (delivery not counted).`);
    await codeUsed(code);
    const pk = await perks(s, phone, p.discountCode, food);
    // The loyalty reward covers the normal delivery fee only, not the big-order part
    const fee = pk.freeDelivery ? 0 : area.fee, total = food - pk.discount + fee + bigFee;

    const ip = clientIp(req), key = "order:" + ip;
    await checkLocked(key);
    const { locked } = await count(key, MAX_ORDERS_HOUR + 1, 36e5, 36e5);
    if (locked) throw new HttpError(429, "Too many orders from this phone in one hour. Please call or WhatsApp us.");

    const token = newToken();
    const r = await db.execute({
      sql: `INSERT INTO orders (token, at, customer, phone, area, directions, note, items, food_total, delivery_fee, total, cost_total, mpesa_code, status, ip,
              deliver_at, discount, discount_code, free_delivery, big_fee)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?, ?, ?) RETURNING id`,
      args: [token, Date.now(), customer, phone, area.name, directions, clip(p.note, 200), JSON.stringify(lines),
        food, fee, total, lines.reduce((a, l) => a + l.cost, 0), code, ip, later, pk.discount || null, pk.code || null, pk.freeDelivery ? 1 : 0, bigFee || null]
    });
    const id = Number(r.rows[0].id);
    if (pk.code) await db.execute({ sql: "UPDATE discounts SET uses = uses + 1 WHERE code = ?", args: [pk.code] });
    current.getStore().who = "Customer " + customer;
    await log("New order " + orderNo(id), `${kes(total)} to ${area.name}, code ${code}${later ? ", for " + kenyaWhen(later) : ""}${pk.code ? ", discount " + pk.code : ""}${pk.freeDelivery ? ", free delivery reward" : ""}`);
    await notify("u.role = 'admin'", [], { title: `New order ${orderNo(id)}`, body: `${kes(total)} | ${area.name} | ${customer}${later ? " | for " + kenyaWhen(later) : ""}`, url: "/admin.html#orders", tag: "order-" + id });
    // The phone that placed the order keeps this key, so it can open the order page without the 4-digit check
    return { ...orderOut(await getOrder(id), "customer"), customer, phone, token, key: orderKey(token) };
  }

  const etaMinutes = v => {
    const m = Math.round(Number(v));
    if (!(m >= 5 && m <= 240)) throw new HttpError(400, "Type the minutes until the food arrives (5 to 240).");
    return m;
  };

  // What each person may do to an order, and what it changes
  async function changeOrder(user, id, p) {
    const r = await getOrder(id);
    if (!r) throw new HttpError(404, "That order was not found.");
    const o = orderOut(r), now = Date.now(), isAdmin = user.role === "admin";
    const mine = o.riderId === user.id;
    const set = (sql, args, msg) => ({ sql: `UPDATE orders SET ${sql} WHERE id = ?`, args: [...args, id], msg });
    const need = (ok, msg) => { if (!ok) throw new HttpError(400, msg); };
    const adminOnly = () => { if (!isAdmin) throw new HttpError(403, "Only an admin can do this."); };
    let step;
    switch (p.action) {
      case "paid":
        adminOnly();
        need(["new", "payment_problem"].includes(o.status), "This order's payment was already handled.");
        if (o.deliverAt && o.deliverAt > now + 5 * 6e4 && !p.minutes) {
          // Ordered for later: the customer's chosen time is the delivery time
          step = set("status = 'confirmed', paid_at = ?, paid_by = ?, problem = NULL, eta_min = ?, eta_at = ?",
            [now, user.name, Math.round((o.deliverAt - now) / 6e4), o.deliverAt], `Payment confirmed, for ${kenyaWhen(o.deliverAt)}`);
        } else {
          const m = etaMinutes(p.minutes);
          step = set("status = 'confirmed', paid_at = ?, paid_by = ?, problem = NULL, eta_min = ?, eta_at = ?", [now, user.name, m, now + m * 6e4],
            `Payment confirmed, food in ${m} min`);
        }
        break;
      case "eta": {
        // A new delivery time, e.g. when the hotel is slow; the customer's page shows it at once
        adminOnly();
        need(["confirmed", "on_the_way"].includes(o.status), "Only paid orders that are not yet delivered can get a new time.");
        const m = etaMinutes(p.minutes);
        step = set("eta_min = ?, eta_at = ?", [m, now + m * 6e4], `New delivery time: ${m} min from now`);
        break;
      }
      case "nopay":
        adminOnly();
        need(o.status === "new", "Only new orders can be marked as payment not found.");
        step = set("status = 'payment_problem', problem = ?", [clip(p.note, 200) || "We could not find this M-Pesa payment."], "Payment not found");
        break;
      case "assign": {
        adminOnly();
        need(["confirmed", "on_the_way"].includes(o.status), "Confirm the payment before choosing a rider.");
        const rider = await getUser("id", Number(p.riderId));
        need(rider && rider.active && rider.role === "rider", "Choose an active rider.");
        step = set("rider_id = ?, rider_name = ?, assigned_at = ?", [rider.id, rider.name, now], "Rider chosen: " + rider.name);
        break;
      }
      case "pickup":
        need(isAdmin || mine, "This order is not yours.");
        need(o.status === "confirmed" && o.riderId, "Choose a rider first.");
        step = set("status = 'on_the_way', picked_at = ?", [now], "On the way");
        break;
      case "delivered":
        need(isAdmin || mine, "This order is not yours.");
        need(["confirmed", "on_the_way"].includes(o.status), "Only paid orders can be marked delivered.");
        {
          const rider = o.riderId && await getUser("id", o.riderId);
          const pay = rider ? (rider.pay ?? (await getSettings()).riderPay) : null;
          step = set("status = 'delivered', delivered_at = ?, picked_at = COALESCE(picked_at, ?), rider_pay = ?", [now, now, pay], "Delivered");
        }
        break;
      case "cancel": {
        adminOnly();
        need(!["delivered", "cancelled"].includes(o.status), "This order can no longer be cancelled.");
        const reason = clip(p.reason, 200);
        need(reason, "Type why the order is cancelled (the customer will see it).");
        step = set("status = 'cancelled', cancelled_at = ?, cancel_reason = ?, refund = ?", [now, reason, clip(p.refund, 200)],
          "Cancelled: " + reason + (p.refund ? " | Refund: " + clip(p.refund, 200) : ""));
        break;
      }
      default: throw new HttpError(400, "Unknown action.");
    }
    await db.execute({ sql: step.sql, args: step.args });
    await log(step.msg + " - " + o.no, `${o.customer} ${o.phone}, ${kes(o.total)}`);
    if (p.action === "assign")
      await notify("u.id = ?", [Number(p.riderId)], { title: `New delivery ${o.no}`, body: `${o.area} - ${o.directions} | ${o.customer}`, url: "/admin.html#orders", tag: "order-" + id });
    return orderOut(await getOrder(id), isAdmin ? "admin" : "rider");
  }

  // ---------- money summary for a period ----------
  async function report(from, to) {
    const rows = (await db.execute({ sql: "SELECT * FROM orders WHERE at >= ? AND at < ? ORDER BY at", args: [from, to] })).rows.map(r => orderOut(r));
    const done = rows.filter(o => o.status === "delivered");
    const sum = (list, f) => list.reduce((a, o) => a + f(o), 0);
    const foods = {}, areas = {}, riders = {}, hotels = {}, hours = Array(24).fill(0);
    for (const o of done) {
      for (const l of o.items) {
        const f = foods[l.name] ??= { name: l.name, qty: 0, money: 0 };
        f.qty += l.qty; f.money += l.total;
        const h = hotels[l.hotel || "(hotel not set)"] ??= { name: l.hotel || "(hotel not set)", qty: 0, cost: 0 };
        h.qty += l.qty; h.cost += l.cost || 0;
      }
      const a = areas[o.area] ??= { name: o.area, orders: 0, fees: 0 };
      a.orders++; a.fees += o.deliveryFee + o.bigFee;
      if (o.riderName) {
        const x = riders[o.riderName] ??= { name: o.riderName, orders: 0, pay: 0, stars: 0, rated: 0 };
        x.orders++; x.pay += o.riderPay || 0;
        if (o.rating) { x.stars += o.rating; x.rated++; }
      }
      hours[new Date(o.at + EAT).getUTCHours()]++;
    }
    const food = sum(done, o => o.foodTotal), cost = sum(done, o => o.costTotal), bigFees = sum(done, o => o.bigFee), fees = sum(done, o => o.deliveryFee) + bigFees;
    const riderPay = sum(done, o => o.riderPay || 0), rated = done.filter(o => o.rating), discounts = sum(done, o => o.discount);
    const by = obj => Object.values(obj).sort((x, y) => (y.qty ?? y.orders) - (x.qty ?? x.orders));
    return {
      from, to, orders: rows.length, delivered: done.length,
      cancelled: rows.filter(o => o.status === "cancelled").length,
      waiting: rows.filter(o => ["new", "payment_problem", "confirmed", "on_the_way"].includes(o.status)).length,
      food, fees, bigFees, discounts, received: food - discounts + fees, cost, riderPay, foodProfit: food - discounts - cost, profit: food - discounts - cost + fees - riderPay,
      freeDeliveries: done.filter(o => o.freeDelivery).length,
      rating: rated.length ? Math.round(sum(rated, o => o.rating) / rated.length * 10) / 10 : null, ratedCount: rated.length,
      comments: rated.filter(o => o.ratingNote).slice(-20).reverse().map(o => ({ no: o.no, customer: o.customer, rating: o.rating, note: o.ratingNote, rider: o.riderName })),
      hotels: Object.values(hotels).sort((x, y) => y.cost - x.cost),
      missingCost: done.some(o => o.items.some(l => !l.cost)),
      foods: by(foods), areas: by(areas), riders: by(riders).map(({ stars, rated, ...x }) => ({ ...x, rating: rated ? Math.round(stars / rated * 10) / 10 : null })), hours,
      list: rows
    };
  }

  // ---------- phone alerts (Web Push, encrypted as the standard asks; no outside service account needed) ----------
  const b64u = b => Buffer.from(b).toString("base64url");
  const hmac = (key, data) => createHmac("sha256", key).update(data).digest();
  async function vapidKeys() {
    const read = async () => (await db.execute("SELECT value FROM settings WHERE key = 'vapid'")).rows[0];
    if (!(await read())) {
      const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
      const jwk = privateKey.export({ format: "jwk" });
      const pub = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url")]);
      await db.execute({ sql: "INSERT INTO settings (key, value) VALUES ('vapid', ?) ON CONFLICT(key) DO NOTHING", args: [JSON.stringify({ publicKey: b64u(pub), jwk })] });
    }
    return JSON.parse((await read()).value);
  }
  function encryptPush(sub, payload) {
    const ua = Buffer.from(sub.p256dh, "base64url"), authSecret = Buffer.from(sub.auth, "base64url");
    const ecdh = createECDH("prime256v1"), as = ecdh.generateKeys();
    const salt = randomBytes(16);
    const ikm = hmac(hmac(authSecret, ecdh.computeSecret(ua)), Buffer.concat([Buffer.from("WebPush: info\0"), ua, as, Buffer.from([1])]));
    const prk = hmac(salt, ikm);
    const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01", "binary")).subarray(0, 16);
    const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01", "binary")).subarray(0, 12);
    const cipher = createCipheriv("aes-128-gcm", cek, nonce);
    const data = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
    const head = Buffer.alloc(21);
    salt.copy(head, 0); head.writeUInt32BE(4096, 16); head[20] = 65;
    return Buffer.concat([head, as, data]);
  }
  function vapidHeader(v, endpoint) {
    const site = (current.getStore() || {}).origin || "";
    const claims = { aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: site.startsWith("https://") ? site : "mailto:alerts@tuyebites.invalid" };
    const unsigned = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" })) + "." + b64u(JSON.stringify(claims));
    const sig = cryptoSign("sha256", Buffer.from(unsigned), { key: createPrivateKey({ key: v.jwk, format: "jwk" }), dsaEncoding: "ieee-p1363" });
    return `vapid t=${unsigned}.${b64u(sig)}, k=${v.publicKey}`;
  }
  // Sends an alert to the phones of active admins/riders that match; never stops the order if it fails
  async function notify(where, args, msg) {
    try {
      const subs = (await db.execute({ sql: `SELECT p.* FROM push_subs p JOIN users u ON u.id = p.user_id WHERE u.active = 1 AND ${where}`, args })).rows;
      if (!subs.length) return;
      const v = await vapidKeys(), payload = JSON.stringify(msg);
      await Promise.allSettled(subs.map(async sub => {
        const res = await fetch(sub.endpoint, {
          method: "POST", body: encryptPush(sub, payload), signal: AbortSignal.timeout(5000),
          headers: { "content-encoding": "aes128gcm", "content-type": "application/octet-stream", ttl: "86400", urgency: "high", authorization: vapidHeader(v, sub.endpoint) }
        });
        if (res.status === 404 || res.status === 410) await db.execute({ sql: "DELETE FROM push_subs WHERE endpoint = ?", args: [sub.endpoint] });
        else if (!res.ok) console.error("Alert not sent:", res.status, await res.text().catch(() => ""));
      }));
    } catch (e) { console.error("Alert not sent:", e); }
  }

  // ---------- share links: /f/<food> shows the food's photo, name and price when shared on WhatsApp ----------
  async function sharePage(req, id) {
    const url = new URL(req.url);
    const r = id && await getItem(id);
    const target = r ? `/#food=${encodeURIComponent(id)}` : "/";
    let meta = "";
    if (r) {
      const it = itemOut(r), s = await getSettings(), deal = (await dealState(s)).live[id], price = deal ? deal.price : it.price;
      const desc = `${kes(price)}${it.description ? " | " + it.description : ""} | Order on Tuye Bites, delivered in Wote`;
      const img = it.image || (s.logoVer ? "/api/img/logo?v=" + s.logoVer : "/logo-full.webp");
      meta = `<title>${escHtml(it.name)} - Tuye Bites</title>
<meta property="og:type" content="product">
<meta property="og:site_name" content="Tuye Bites">
<meta property="og:title" content="${escHtml(it.name)} - ${escHtml(kes(price))}">
<meta property="og:description" content="${escHtml(desc)}">
${img ? `<meta property="og:image" content="${escHtml(url.origin + img)}">` : ""}
<meta property="og:url" content="${escHtml(url.origin + "/f/" + id)}">
<meta name="twitter:card" content="summary_large_image">`;
    }
    return new Response(`<!doctype html><html><head><meta charset="utf-8">${meta}
<meta http-equiv="refresh" content="0;url=${target}"></head><body>
<script>location.replace(${JSON.stringify(target)})</script><a href="${target}">Open Tuye Bites</a></body></html>`, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" }
    });
  }

  // ---------- routes ----------
  async function route(req) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/f/")) return sharePage(req, decodeURIComponent(url.pathname.slice(3)));
    const [a, b, c] = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
    const method = req.method;
    const body = async () => {
      try { return await req.json(); } catch { throw new HttpError(400, "Bad request."); }
    };

    // ----- public: customers -----
    if (method === "GET" && a === "shop") {
      const [items, s, sold, busyNow] = await Promise.all([db.execute("SELECT * FROM items ORDER BY category, name"), getSettings(), soldToday(), inProgress()]);
      const deals = await dealState(s);
      return json({ items: items.rows.map(r => {
        const it = itemOut(r), d = deals.live[it.id];
        // "Ordered today" = what the owner typed today + the real orders today
        it.orderedToday = (it.orderedToday || 0) + (sold[it.id] || 0) || null;
        return d ? { ...it, price: d.price, oldPrice: it.price, deal: true, dealEnd: d.end, dealLeft: d.left, dealQty: d.qty } : it;
      }), settings: { ...publicSettings(s), busy: !!(s.busyAt && busyNow >= s.busyAt),
        // Hot Deals running now and coming up (sold-out ones stay until their time ends)
        deals: deals.list.map(({ id, price, start, end, qty, left, started }) => ({ id, price, start, end, qty, left, started })) } });
    }
    // Checkout asks what discount code and loyalty reward give, before the order is placed
    if (method === "POST" && a === "perks") {
      const q = await body(), s = await getSettings(), key = "code:" + clientIp(req);
      let phone = "";
      try { phone = q.phone ? cleanPhone(q.phone) : ""; } catch { /* no reward check without a correct number */ }
      if (q.code) await checkLocked(key);
      try {
        const pk = await perks(s, phone, q.code, Math.max(0, Math.round(Number(q.food) || 0)));
        return json({ discount: pk.discount, code: pk.code, text: pk.text, freeDelivery: pk.freeDelivery });
      } catch (e) {
        if (q.code && e instanceof HttpError && e.status === 400) await count(key, 15, 30 * 6e4, 30 * 6e4);
        throw e;
      }
    }
    if (method === "GET" && a === "img" && b) return serveImage(b);
    if (method === "POST" && a === "orders" && !b) return json({ order: await placeOrder(req, await body()) });
    // A customer's order page, opened from the secret link: /t/<token>
    if (a === "track" && b) {
      const r = String(b).length >= 20 && (await db.execute({ sql: "SELECT * FROM orders WHERE token = ?", args: [b] })).rows[0];
      if (!r) throw new HttpError(404, "This order link is not valid.");
      const s = await getSettings();
      const shop = { whatsapp: s.whatsapp, till: s.till, tillName: s.tillName, logo: settingsOut(s).logo, deliveryTime: s.deliveryTime };
      let key = req.headers.get("x-order-key") || "";
      if (method === "POST" && c === "open") {
        // Another phone: the last 4 digits of the phone number used to order. 5 wrong tries locks this order page for 15 minutes.
        const lk = "pin:" + r.token;
        await checkLocked(lk);
        const pin = String((await body()).pin || "").replace(/\D/g, "");
        if (pin.length !== 4 || pin !== String(r.phone).slice(-4)) {
          const { n, locked } = await count(lk, MAX_FAILS, FAIL_WINDOW, LOCK_TIME);
          if (locked) await log("Order page locked for 15 minutes - " + orderNo(r.id), `Wrong phone digits from ${clientIp(req)}`);
          throw new HttpError(locked ? 429 : 403, locked ? "Too many wrong tries. Please wait 15 minutes and try again."
            : `Those digits are wrong. ${MAX_FAILS - n} ${MAX_FAILS - n === 1 ? "try" : "tries"} left.`);
        }
        await db.execute({ sql: "DELETE FROM limits WHERE key = ?", args: [lk] });
        key = orderKey(r.token);
      } else if (!orderKeyOk(r.token, key)) {
        if (method !== "GET") throw new HttpError(403, "Please open your order again.");
        return json({ needPin: true, no: orderNo(r.id), settings: shop });
      }
      if (method === "POST" && c === "code") {
        // The customer types the M-Pesa code again after it was not found
        if (r.status !== "payment_problem") throw new HttpError(400, "This order does not need a new M-Pesa code.");
        const code = cleanCode((await body()).mpesaCode);
        await codeUsed(code, Number(r.id));
        await db.execute({ sql: "UPDATE orders SET mpesa_code = ?, status = 'new', problem = NULL WHERE id = ?", args: [code, r.id] });
        current.getStore().who = "Customer " + r.customer;
        await log("New M-Pesa code - " + orderNo(r.id), code);
        await notify("u.role = 'admin'", [], { title: `New M-Pesa code - ${orderNo(r.id)}`, body: `${r.customer} sent ${code}. Please check the payment.`, url: "/admin.html#orders", tag: "order-" + r.id });
      } else if (method === "POST" && c === "rate") {
        // Stars (1 to 5) and a short comment, once, after the food is delivered
        if (r.status !== "delivered") throw new HttpError(400, "You can rate the order after it is delivered.");
        if (r.rating) throw new HttpError(400, "Thank you, this order was already rated.");
        const q = await body(), stars = Math.round(Number(q.stars));
        if (!(stars >= 1 && stars <= 5)) throw new HttpError(400, "Choose 1 to 5 stars.");
        await db.execute({ sql: "UPDATE orders SET rating = ?, rating_note = ?, rated_at = ? WHERE id = ?", args: [stars, clip(q.comment, 200), Date.now(), r.id] });
        current.getStore().who = "Customer " + r.customer;
        await log(`Rated ${stars} stars - ${orderNo(r.id)}`, clip(q.comment, 200));
      } else if (method !== "GET" && c !== "open") throw new HttpError(404, "Not found.");
      let o = orderOut(await getOrder(Number(r.id)), "customer");
      // Three days after delivery or cancellation the page only says what happened
      const endedAt = o.deliveredAt || o.cancelledAt;
      if (endedAt && Date.now() - endedAt > 3 * 864e5)
        o = { no: o.no, status: o.status, at: o.at, deliveredAt: o.deliveredAt, cancelledAt: o.cancelledAt, expired: true };
      else {
        if (o.status === "on_the_way") {
          const rider = await getUser("id", Number(r.rider_id));
          if (rider) o.riderPhone = rider.phone;
        }
        // For the receipt (ready once the payment is confirmed): the customer's own name and part of their number
        if (["confirmed", "on_the_way", "delivered"].includes(o.status)) {
          o.customer = r.customer;
          o.phone = String(r.phone).slice(0, 4) + " *** " + String(r.phone).slice(-3);
        }
      }
      if (!o.expired && s.loyaltyEvery) {
        const n = Number((await db.execute({ sql: "SELECT COUNT(*) AS n FROM orders WHERE phone = ? AND status = 'delivered'", args: [r.phone] })).rows[0].n);
        o.loyalty = { every: s.loyaltyEvery, left: s.loyaltyEvery - 1 - (n % s.loyaltyEvery) };
      }
      return json({ order: o, settings: shop, key: c === "open" ? key : undefined });
    }
    if (method === "GET" && a === "status") return json({ hasAdmin: await hasMain(), setupHint: env.SETUP_HINT || null });
    // The privacy and refunds wording (anyone can read it; admins change it below)
    if (method === "GET" && a === "policy") {
      const r = (await db.execute("SELECT value FROM settings WHERE key = 'policy'")).rows[0];
      const saved = parseJson(r && r.value, null);
      return json({ text: saved ? saved.text : DEFAULT_POLICY, updatedAt: saved ? saved.at : null, isDefault: !saved, defaultText: DEFAULT_POLICY });
    }

    // ----- logging in (wrong tries are counted and can lock for 15 minutes) -----
    if (method === "POST" && ["setup", "reset", "login"].includes(a)) {
      const ip = clientIp(req);
      await checkLocked("login:" + ip);
      const p = await body();
      if (a === "login") {
        let phone = "";
        try { phone = cleanPhone(p.phone); } catch { /* counted as a wrong try below */ }
        const u = phone && await getUser("phone", phone);
        if (!u || !(await bcrypt.compare(String(p.password || ""), u.hash))) {
          const locked = await recordFail(ip, "password");
          throw new HttpError(locked ? 429 : 401, locked ? "Too many wrong tries. Please wait 15 minutes and try again." : "Wrong phone number or password.");
        }
        if (!u.active) throw new HttpError(403, "This login has been switched off by an admin.");
        await clearFails(ip);
        await db.execute({ sql: "UPDATE users SET last_login = ? WHERE id = ?", args: [Date.now(), u.id] });
        current.getStore().who = u.name;
        await log("Logged in", `From ${ip}`);
        return json({ token: issue(u), user: userOut({ ...u, is_main: u.main, active: 1, created_at: u.createdAt }) });
      }
      if (!setupCodeOk(p.code)) {
        const locked = await recordFail(ip, "setup code");
        throw new HttpError(locked ? 429 : 403, locked ? "Too many wrong tries. Please wait 15 minutes and try again." : "That setup code is wrong.");
      }
      const now = Date.now(), hash = await bcrypt.hash(checkPassword(p.password), 10);
      let u;
      if (a === "setup") {
        if (await hasMain()) throw new HttpError(409, "The main admin already exists. Please log in.");
        const name = clip(p.name, 40) || "Admin", phone = cleanPhone(p.phone);
        if (await getUser("phone", phone)) throw new HttpError(400, "Someone already uses that phone number.");
        await db.execute({ sql: "INSERT INTO users (name, phone, pass_hash, role, is_main, active, updated_at, created_at) VALUES (?, ?, ?, 'admin', 1, 1, ?, ?)",
          args: [name, phone, hash, now, now] });
        u = await getUser("phone", phone);
        current.getStore().who = u.name;
        await log("Main admin created", phone);
      } else {
        // A forgotten password: the setup code lets the main admin choose a new one
        const r = (await db.execute("SELECT id FROM users WHERE is_main = 1")).rows[0];
        if (!r) throw new HttpError(400, "There is no admin yet. Create one first.");
        await db.execute({ sql: "UPDATE users SET pass_hash = ?, updated_at = ?, active = 1 WHERE id = ?", args: [hash, now, r.id] });
        u = await getUser("id", Number(r.id));
        current.getStore().who = u.name;
        await log("Password reset with the setup code");
      }
      await clearFails(ip);
      return json({ token: issue(u), user: userOut({ ...u, is_main: u.main, active: 1, created_at: u.createdAt }) });
    }

    // ----- everything below needs a login -----
    const user = await requireUser(req);
    current.getStore().who = user.name;
    const isAdmin = user.role === "admin";
    const adminOnly = () => { if (!isAdmin) throw new HttpError(403, "Only an admin can do this."); };
    const { hash: _h, updated_at: _u, ...me } = user;

    if (method === "GET" && a === "me") return json({ user: me });
    if (method === "POST" && a === "account" && b === "password") {
      const p = await body();
      if (!(await bcrypt.compare(String(p.current || ""), user.hash))) throw new HttpError(403, "The current password is wrong.");
      const now = Date.now();
      await db.execute({ sql: "UPDATE users SET pass_hash = ?, updated_at = ? WHERE id = ?", args: [await bcrypt.hash(checkPassword(p.next), 10), now, user.id] });
      await log("Password changed");
      return json({ token: issue({ id: user.id, updated_at: now }) });
    }

    // Orders: admins see everything; a rider sees only the orders given to them
    if (a === "orders" && method === "GET" && !b) {
      const days = Math.min(Math.max(Number(url.searchParams.get("days")) || 2, 1), 60);
      const since = Date.now() - days * 864e5;
      const r = isAdmin
        ? await db.execute({ sql: "SELECT * FROM orders WHERE at >= ? OR status IN ('new','payment_problem','confirmed','on_the_way') ORDER BY id DESC LIMIT 500", args: [since] })
        : await db.execute({ sql: "SELECT * FROM orders WHERE rider_id = ? AND (status IN ('confirmed','on_the_way') OR (status = 'delivered' AND delivered_at >= ?)) ORDER BY id DESC", args: [user.id, Date.now() - 864e5] });
      const out = { orders: r.rows.map(x => orderOut(x, isAdmin ? "admin" : "rider")) };
      if (isAdmin) out.riders = (await db.execute("SELECT * FROM users WHERE role = 'rider' AND active = 1 ORDER BY name")).rows.map(userOut);
      return json(out);
    }
    if (a === "orders" && b && method === "POST" && c === "status") return json({ order: await changeOrder(user, Number(b), await body()) });

    // Phone alerts: this phone asks to be told about new orders (admins) or new deliveries (riders)
    if (a === "push") {
      if (method === "GET" && b === "key") return json({ key: (await vapidKeys()).publicKey });
      const q = await body();
      const endpoint = String(q.endpoint || "");
      if (endpoint.length > 1000 || !pushHostOk(endpoint)) throw new HttpError(400, "This phone cannot get alerts.");
      if (method === "POST" && b === "subscribe") {
        const k = q.keys || {};
        if (!k.p256dh || !k.auth) throw new HttpError(400, "This phone cannot get alerts.");
        await db.execute({ sql: `INSERT INTO push_subs (endpoint, user_id, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
          args: [endpoint, user.id, clip(k.p256dh, 200), clip(k.auth, 100), Date.now()] });
        await log("Phone alerts turned on");
        await notify("p.endpoint = ?", [endpoint], { title: "Tuye Bites alerts are on", body: user.role === "admin" ? "You will be told about every new order." : "You will be told about every new delivery.", url: "/admin.html#orders" });
        return json({ ok: true });
      }
      if (method === "POST" && b === "unsubscribe") {
        await db.execute({ sql: "DELETE FROM push_subs WHERE endpoint = ?", args: [endpoint] });
        await log("Phone alerts turned off");
        return json({ ok: true });
      }
    }

    adminOnly();

    if (a === "items") {
      if (method === "GET" && !b) {
        const [r, sold] = await Promise.all([db.execute("SELECT * FROM items ORDER BY category, name"), soldToday()]);
        return json({ items: r.rows.map(x => ({ ...itemOut(x, true), realToday: sold[x.id] || 0 })) });
      }
      if (method === "POST" && !b) {
        const p = await body(), it = cleanItem(p), id = newId();
        const photos = await savePhotos(id, p.photos || [], []);
        await db.execute({
          sql: `INSERT INTO items (id, name, category, price, old_price, cost, hotel, description, options, available, image_ver, created_at, ordered_today, ordered_date, viewing, photos)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
          args: [id, it.name, it.category, it.price, it.oldPrice, it.cost, it.hotel, it.description, it.options, it.available, Date.now(), it.orderedToday, kenyaDate(), it.viewing, JSON.stringify(photos)]
        });
        await log("Food added", `${it.name} ${kes(it.price)}`);
        return json({ item: itemOut(await getItem(id), true) });
      }
      const row = b && await getItem(b);
      if (!row) throw new HttpError(404, "That food was not found.");
      if (method === "PUT" && !c) {
        const p = await body(), it = cleanItem(p);
        const photos = await savePhotos(b, p.photos, itemPhotos(row));
        await db.execute({
          sql: `UPDATE items SET name = ?, category = ?, price = ?, old_price = ?, cost = ?, hotel = ?, description = ?, options = ?, available = ?,
                ordered_today = ?, ordered_date = ?, viewing = ?, photos = ? WHERE id = ?`,
          args: [it.name, it.category, it.price, it.oldPrice, it.cost, it.hotel, it.description, it.options, it.available, it.orderedToday, kenyaDate(), it.viewing, JSON.stringify(photos), b]
        });
        const was = [];
        if (Number(row.price) !== it.price) was.push(`price ${kes(row.price)} to ${kes(it.price)}`);
        if (num(row.cost) !== it.cost) was.push(`buying price ${kes(row.cost)} to ${kes(it.cost)}`);
        await log("Food changed", it.name + (was.length ? ": " + was.join(", ") : ""));
        return json({ item: itemOut(await getItem(b), true) });
      }
      if (method === "PATCH" && c === "available") {
        const on = !!(await body()).available;
        await db.execute({ sql: "UPDATE items SET available = ? WHERE id = ?", args: [on ? 1 : 0, b] });
        await log(on ? "Food available again" : "Food finished for today", row.name);
        return json({ item: itemOut(await getItem(b), true) });
      }
      if (method === "DELETE" && !c) {
        await db.batch([{ sql: "DELETE FROM items WHERE id = ?", args: [b] },
          ...[...itemPhotos(row).map(x => x.id), b].map(id => ({ sql: "DELETE FROM images WHERE id = ?", args: [id] }))], "write");
        await log("Food removed", row.name);
        return json({ ok: true });
      }
    }

    // Admins and riders. Only the main admin can add, change or remove other admins.
    if (a === "users") {
      if (method === "GET" && !b) return json({ users: (await db.execute("SELECT * FROM users ORDER BY role, name")).rows.map(userOut) });
      const p = method === "DELETE" ? {} : await body();
      const role = p.role === "admin" ? "admin" : "rider";
      if (method === "POST" && !b) {
        if (role === "admin" && !user.main) throw new HttpError(403, "Only the main admin can add another admin.");
        const name = clip(p.name, 40), phone = cleanPhone(p.phone);
        if (!name) throw new HttpError(400, "Type the person's name.");
        if (await getUser("phone", phone)) throw new HttpError(400, "Someone already uses that phone number.");
        if (Number((await db.execute("SELECT COUNT(*) AS n FROM users")).rows[0].n) >= 40) throw new HttpError(400, "Up to 40 logins.");
        const now = Date.now();
        await db.execute({ sql: "INSERT INTO users (name, phone, pass_hash, role, active, updated_at, created_at, pay) VALUES (?, ?, ?, ?, 1, ?, ?, ?)",
          args: [name, phone, await bcrypt.hash(checkPassword(p.password), 10), role, now, now, role === "rider" ? optInt(p.pay, 100000) : null] });
        await log(role === "admin" ? "Admin added" : "Rider added", `${name} ${phone}`);
        return json({ user: userOut((await db.execute({ sql: "SELECT * FROM users WHERE phone = ?", args: [phone] })).rows[0]) });
      }
      const t = b && await getUser("id", Number(b));
      if (!t) throw new HttpError(404, "That login was not found.");
      if (t.main && t.id !== user.id) throw new HttpError(403, "Nobody else can change the main admin.");
      if (t.role === "admin" && !user.main && t.id !== user.id) throw new HttpError(403, "Only the main admin can change other admins.");
      if (method === "PUT" && !c) {
        const name = clip(p.name, 40) || t.name, phone = p.phone ? cleanPhone(p.phone) : t.phone;
        const other = phone !== t.phone && await getUser("phone", phone);
        if (other) throw new HttpError(400, "Someone already uses that phone number.");
        const active = t.main || t.id === user.id ? 1 : p.active === false ? 0 : 1;
        const now = Date.now(), pw = p.password ? await bcrypt.hash(checkPassword(p.password), 10) : null;
        // A new password or switching off logs that person out everywhere
        await db.execute({
          sql: `UPDATE users SET name = ?, phone = ?, active = ?, pass_hash = COALESCE(?, pass_hash), updated_at = ?, pay = ? WHERE id = ?`,
          args: [name, phone, active, pw, pw || active !== Number(t.active) ? now : t.updated_at, t.role === "rider" ? optInt(p.pay, 100000) : null, t.id]
        });
        await log("Login changed", `${name} ${phone}${active ? "" : " (switched off)"}${pw ? " (new password)" : ""}`);
        return json({ user: userOut((await db.execute({ sql: "SELECT * FROM users WHERE id = ?", args: [t.id] })).rows[0]) });
      }
      if (method === "DELETE" && !c) {
        if (t.main || t.id === user.id) throw new HttpError(400, "You cannot remove this login.");
        await db.execute({ sql: "DELETE FROM users WHERE id = ?", args: [t.id] });
        await log(t.role === "admin" ? "Admin removed" : "Rider removed", `${t.name} ${t.phone}`);
        return json({ ok: true });
      }
    }

    if (a === "discounts") {
      const dOut = r => ({ code: r.code, kind: r.kind, value: Number(r.value), minOrder: num(r.min_order), endsAt: num(r.ends_at),
        maxUses: num(r.max_uses), uses: Number(r.uses), firstOnly: !!Number(r.first_only), active: !!Number(r.active), createdAt: Number(r.created_at) });
      if (method === "GET" && !b) return json({ discounts: (await db.execute("SELECT * FROM discounts ORDER BY created_at DESC")).rows.map(dOut) });
      if (method === "POST" && !b) {
        const q = await body();
        const code = String(q.code || "").replace(/\s/g, "").toUpperCase();
        if (!/^[A-Z0-9]{3,20}$/.test(code)) throw new HttpError(400, "The code needs 3 to 20 letters or numbers, e.g. WELCOME50.");
        const kind = q.kind === "percent" ? "percent" : "amount";
        const value = optInt(q.value, kind === "percent" ? 90 : 100000);
        if (!value) throw new HttpError(400, kind === "percent" ? "Type the percent off (1 to 90)." : "Type the KES off.");
        const ends = Number(q.endsAt) || null;
        if (ends && ends < Date.now()) throw new HttpError(400, "The end date is already past.");
        if ((await db.execute({ sql: "SELECT 1 FROM discounts WHERE code = ?", args: [code] })).rows[0]) throw new HttpError(400, "That code already exists.");
        await db.execute({ sql: `INSERT INTO discounts (code, kind, value, min_order, ends_at, max_uses, first_only, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
          args: [code, kind, value, optInt(q.minOrder, 1000000) || null, ends, optInt(q.maxUses, 100000) || null, q.firstOnly ? 1 : 0, Date.now()] });
        await log("Discount code added", `${code}: ${kind === "percent" ? value + "%" : kes(value)} off${q.firstOnly ? ", first order only" : ""}`);
        return json({ ok: true });
      }
      const d = b && (await db.execute({ sql: "SELECT * FROM discounts WHERE code = ?", args: [b] })).rows[0];
      if (!d) throw new HttpError(404, "That code was not found.");
      if (method === "PUT") {
        const on = !!(await body()).active;
        await db.execute({ sql: "UPDATE discounts SET active = ? WHERE code = ?", args: [on ? 1 : 0, b] });
        await log(on ? "Discount code switched on" : "Discount code switched off", b);
        return json({ ok: true });
      }
      if (method === "DELETE") {
        await db.execute({ sql: "DELETE FROM discounts WHERE code = ?", args: [b] });
        await log("Discount code deleted", b);
        return json({ ok: true });
      }
    }

    // Customers, from their orders (one row per phone number), and blocking fake-order numbers
    if (a === "customers") {
      if (method === "GET" && !b) {
        const [r, bl] = await Promise.all([
          db.execute("SELECT customer, phone, area, at, status, total, rating FROM orders ORDER BY at"),
          db.execute("SELECT * FROM blocked")
        ]);
        const map = {};
        const blank = phone => ({ phone, name: "", area: "", orders: 0, delivered: 0, cancelled: 0, spent: 0, first: 0, last: 0, stars: 0, rated: 0 });
        for (const o of r.rows) {
          const c = map[o.phone] ??= { ...blank(o.phone), first: Number(o.at) };
          c.name = o.customer; c.area = o.area; c.orders++; c.last = Number(o.at);
          if (o.status === "delivered") { c.delivered++; c.spent += Number(o.total); }
          if (o.status === "cancelled") c.cancelled++;
          if (o.rating) { c.stars += Number(o.rating); c.rated++; }
        }
        const blocked = Object.fromEntries(bl.rows.map(x => [x.phone, { reason: x.reason || "", at: Number(x.at), by: x.by || "" }]));
        for (const ph of Object.keys(blocked)) map[ph] ??= blank(ph);
        const list = Object.values(map).map(({ stars, rated, ...c }) => ({ ...c, rating: rated ? Math.round(stars / rated * 10) / 10 : null, blocked: blocked[c.phone] || null }))
          .sort((x, y) => y.spent - x.spent || y.orders - x.orders);
        return json({ customers: list });
      }
      if (method === "POST" && b && c === "block") {
        const phone = cleanPhone(b), q = await body();
        if (q.blocked) {
          await db.execute({ sql: "INSERT INTO blocked (phone, reason, at, by) VALUES (?, ?, ?, ?) ON CONFLICT(phone) DO UPDATE SET reason = excluded.reason",
            args: [phone, clip(q.reason, 200), Date.now(), user.name] });
          await log("Customer blocked", `${phone}${q.reason ? ": " + clip(q.reason, 200) : ""}`);
        } else {
          await db.execute({ sql: "DELETE FROM blocked WHERE phone = ?", args: [phone] });
          await log("Customer unblocked", phone);
        }
        return json({ ok: true });
      }
    }

    if (method === "GET" && a === "report") {
      const from = Number(url.searchParams.get("from")), to = Number(url.searchParams.get("to"));
      if (!(from > 0 && to > from)) throw new HttpError(400, "Choose the dates.");
      return json(await report(from, to));
    }
    // Everything in one file to keep on the computer: menu, settings, team (no passwords), orders, customers, codes and history.
    // Photos are not inside (they stay online); the alert keys are never sent.
    if (method === "GET" && a === "backup") {
      const all = async sql => (await db.execute(sql)).rows.map(r => ({ ...r }));
      const [items, users, orders, discounts, blocked, activity, s] = await Promise.all([
        db.execute("SELECT * FROM items ORDER BY category, name"), all("SELECT id, name, phone, role, is_main, active, pay, created_at, last_login FROM users"),
        db.execute("SELECT * FROM orders ORDER BY id"), all("SELECT * FROM discounts"), all("SELECT * FROM blocked"),
        all("SELECT * FROM activity ORDER BY id DESC LIMIT 5000"), getSettings()]);
      await log("Backup downloaded");
      return new Response(JSON.stringify({
        app: "Tuye Bites", exportedAt: new Date().toISOString(), exportedBy: user.name,
        settings: s, items: items.rows.map(r => itemOut(r, true)), team: users,
        orders: orders.rows.map(r => orderOut(r)), discounts, blocked, activity
      }, null, 1), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store",
        "content-disposition": `attachment; filename="Tuye Bites backup ${kenyaDate()}.json"` } });
    }

    if (method === "GET" && a === "activity") {
      const r = await db.execute("SELECT * FROM activity ORDER BY id DESC LIMIT 500");
      return json({ activity: r.rows.map(x => ({ id: Number(x.id), at: Number(x.at), who: x.who || "", action: x.action, detail: x.detail || "" })) });
    }
    if (method === "GET" && a === "settings") return json(settingsOut(await getSettings()));
    if (method === "POST" && a === "policy") {
      const q = await body();
      if (q.text === null) {
        await db.execute("DELETE FROM settings WHERE key = 'policy'");
        await log("Privacy and refunds page put back to the original wording");
        return json({ text: DEFAULT_POLICY, updatedAt: null, isDefault: true });
      }
      const text = String(q.text || "").replace(/\r\n/g, "\n").trim().slice(0, 20000);
      if (text.length < 50) throw new HttpError(400, "The page is too short. Write your privacy and refund rules (at least a few lines).");
      const at = Date.now();
      await db.execute({ sql: "INSERT INTO settings (key, value) VALUES ('policy', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", args: [JSON.stringify({ text, at })] });
      await log("Privacy and refunds page changed", `${text.length} letters`);
      return json({ text, updatedAt: at, isDefault: false });
    }
    if (method === "POST" && a === "settings") return json(await updateSettings(await body()));

    throw new HttpError(404, "Not found.");
  }

  return async function handle(req) {
    try {
      await init();
      return await current.run({ who: "", origin: new URL(req.url).origin }, () => route(req));
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: "Server problem. Please try again in a moment." }, 500);
    }
  };
}

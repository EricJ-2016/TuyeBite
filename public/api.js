// Talks to the Tuye Bites back office (/api/...). Online that is Netlify + Turso; on this computer it is dev-server.mjs.
window.Api = (() => {
  const TOKEN = "tb_token";
  const getToken = () => { try { return localStorage.getItem(TOKEN); } catch (e) { return null; } };
  const setToken = t => { try { t ? localStorage.setItem(TOKEN, t) : localStorage.removeItem(TOKEN); } catch (e) {} };
  let onLoggedOut = null;

  async function api(path, { method = "GET", body, extra } = {}) {
    const headers = { ...extra };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (getToken()) headers.authorization = "Bearer " + getToken();
    let res;
    try {
      res = await fetch("/api/" + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (e) {
      throw new Error("No internet connection. Check your data and try again.");
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && getToken() && !["login", "setup", "reset"].includes(path)) { setToken(null); if (onLoggedOut) onLoggedOut(); }
    if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
    return data;
  }
  const post = (path, body) => api(path, { method: "POST", body });
  const signedIn = r => { setToken(r.token); return r.user; };
  const orderKeyHeader = token => { const k = OrderKeys.get(token); return k ? { "x-order-key": k } : {}; };

  return {
    // ---------- customers ----------
    shop: () => api("shop"),
    // data = { customer, phone, area, directions, note, mpesaCode, items: [{ id, qty, choices: { "Size": ["Large"] } }] }
    placeOrder: data => post("orders", data),
    // What a discount code and the loyalty reward give at checkout: { discount, code, text, freeDelivery }
    perks: (phone, code, food) => post("perks", { phone, code, food }),
    // Order pages need the order key this phone got when ordering (or after typing the last 4 phone digits)
    track: token => api("track/" + encodeURIComponent(token), { extra: orderKeyHeader(token) }),
    openOrder: (token, pin) => api("track/" + encodeURIComponent(token) + "/open", { method: "POST", body: { pin } }),
    newCode: (token, mpesaCode) => api("track/" + encodeURIComponent(token) + "/code", { method: "POST", body: { mpesaCode }, extra: orderKeyHeader(token) }),
    rate: (token, stars, comment) => api("track/" + encodeURIComponent(token) + "/rate", { method: "POST", body: { stars, comment }, extra: orderKeyHeader(token) }),

    // ---------- logins ----------
    status: () => api("status"),
    setup: async (code, name, phone, password) => signedIn(await post("setup", { code, name, phone, password })),
    reset: async (code, password) => signedIn(await post("reset", { code, password })),
    login: async (phone, password) => signedIn(await post("login", { phone, password })),
    me: async () => (await api("me")).user,
    hasToken: () => !!getToken(),
    logout: () => setToken(null),
    onLoggedOut: cb => { onLoggedOut = cb; },
    async changePassword(current, next) { setToken((await post("account/password", { current, next })).token); },

    // ---------- orders (admins and riders) ----------
    orders: days => api("orders?days=" + (days || 2)),
    // action = paid | nopay | assign | pickup | delivered | cancel
    orderAction: (id, action, extra = {}) => post("orders/" + id + "/status", { action, ...extra }),

    // ---------- admins only ----------
    items: () => api("items"),
    saveItem: (id, data) => id ? api("items/" + encodeURIComponent(id), { method: "PUT", body: data }) : post("items", data),
    setAvailable: (id, available) => api("items/" + encodeURIComponent(id) + "/available", { method: "PATCH", body: { available } }),
    removeItem: id => api("items/" + encodeURIComponent(id), { method: "DELETE" }),
    users: () => api("users"),
    saveUser: (id, data) => id ? api("users/" + id, { method: "PUT", body: data }) : post("users", data),
    removeUser: id => api("users/" + id, { method: "DELETE" }),
    report: (from, to) => api(`report?from=${from}&to=${to}`),
    customers: () => api("customers"),
    block: (phone, blocked, reason) => post("customers/" + encodeURIComponent(phone) + "/block", { blocked, reason }),
    activity: () => api("activity"),
    // The backup file, downloaded with the admin's login
    async backup() {
      const res = await fetch("/api/backup", { headers: { authorization: "Bearer " + getToken() } });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "The backup could not be made. Please try again.");
      return res.blob();
    },
    saveSettings: patch => post("settings", patch),
    policy: () => api("policy"),
    // text = null puts back the original wording
    savePolicy: text => post("policy", { text }),
    settings: () => api("settings"),
    discounts: () => api("discounts"),
    addDiscount: data => post("discounts", data),
    setDiscount: (code, active) => api("discounts/" + encodeURIComponent(code), { method: "PUT", body: { active } }),
    removeDiscount: code => api("discounts/" + encodeURIComponent(code), { method: "DELETE" }),

    // ---------- phone alerts (admins and riders) ----------
    pushKey: async () => (await api("push/key")).key,
    pushSubscribe: sub => post("push/subscribe", sub),
    pushUnsubscribe: endpoint => post("push/unsubscribe", { endpoint })
  };
})();

// ---------- what this phone remembers for customers ----------
// "Remember my details" ticked: kept on the phone. Not ticked: only until the browser is closed.
window.OrderKeys = (() => {
  const read = st => { try { return JSON.parse(st.getItem("tb_keys")) || {}; } catch (e) { return {}; } };
  const write = (st, v) => { try { st.setItem("tb_keys", JSON.stringify(v)); } catch (e) {} };
  return {
    get: token => read(localStorage)[token] || read(sessionStorage)[token] || "",
    set(token, key, remember = true) {
      const st = remember ? localStorage : sessionStorage, all = read(st);
      all[token] = key;
      // keep the newest 20 orders only
      write(st, Object.fromEntries(Object.entries(all).slice(-20)));
    }
  };
})();
// "Not you? Clear": forget the name, number, directions, recent orders, order keys and cart on this phone
window.forgetMe = () => {
  for (const k of ["tb_me", "tb_orders", "tb_keys", "tb_cart"]) {
    try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch (e) {}
  }
};

// The privacy and refunds wording: # section, ## heading, - point, **bold**; {whatsapp} and {till} are filled in
window.policyHtml = (text, s = {}) => {
  const fill = t => t.replace(/\{whatsapp\}/gi, s.whatsapp || "").replace(/\{till\}/gi, (s.till || "") + (s.tillName ? " (" + s.tillName + ")" : ""));
  const inline = t => esc(fill(t)).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  let html = "", open = false, list = false;
  const endList = () => { if (list) { html += "</ul>"; list = false; } };
  const endCard = () => { endList(); if (open) { html += "</div>"; open = false; } };
  for (const raw of String(text || "").split("\n")) {
    const line = raw.trim();
    if (!line) { endList(); continue; }
    if (line.startsWith("# ")) { endCard(); html += `<div class="card"><h2>${inline(line.slice(2))}</h2>`; open = true; continue; }
    if (!open) { html += `<div class="card">`; open = true; }
    if (line.startsWith("## ")) { endList(); html += `<h3>${inline(line.slice(3))}</h3>`; continue; }
    if (line.startsWith("- ")) { if (!list) { html += "<ul>"; list = true; } html += `<li>${inline(line.slice(2))}</li>`; continue; }
    endList(); html += `<p>${inline(line)}</p>`;
  }
  endCard();
  return html;
};

// ---------- helpers shared by all pages ----------
window.esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
window.money = n => "KES " + Number(n || 0).toLocaleString("en-KE");
window.$ = (sel, root = document) => root.querySelector(sel);
window.$$ = (sel, root = document) => [...root.querySelectorAll(sel)];
// 0712345678 -> 254712345678 for WhatsApp links
window.waNumber = phone => { const d = String(phone || "").replace(/\D/g, ""); return d.startsWith("0") ? "254" + d.slice(1) : d; };
window.waLink = (phone, text) => `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(text)}`;
window.timeAgo = t => {
  const m = Math.round((Date.now() - t) / 6e4);
  if (m < 1) return "just now";
  if (m < 60) return m + " min ago";
  const h = Math.floor(m / 60);
  return h < 24 ? h + " hr " + (m % 60) + " min ago" : new Date(t).toLocaleDateString("en-KE", { day: "numeric", month: "short" });
};
window.clock = t => new Date(t).toLocaleTimeString("en-KE", { hour: "numeric", minute: "2-digit" });
window.choiceText = l => (l.choices || []).map(c => c.name).join(", ");

// Shrinks a photo so the menu loads fast on phones
window.compressImage = (file, max = 700, q = 0.72) => new Promise((resolve, reject) => {
  if (!file || !file.type.startsWith("image/")) return reject(new Error("Please choose a photo."));
  const img = new Image();
  img.onload = () => {
    const s = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(img.src);
    resolve(c.toDataURL("image/jpeg", q));
  };
  img.onerror = () => reject(new Error("That file is not a photo."));
  img.src = URL.createObjectURL(file);
});

// The Tuye Bites mark used until a logo is uploaded in admin -> Settings
// The Tuye Bites burger (from the owner's logo), used until another logo is uploaded in admin -> Settings
window.DEFAULT_LOGO = `<img src="/logo-icon.webp" alt="Tuye Bites">`;
// The full logo with the name and "Let's eat. Fast food delivered to you."
window.FULL_LOGO = `<img src="/logo-full.webp" alt="Tuye Bites - Let's eat. Fast food delivered to you.">`;
window.logoHtml = s => s && s.logo ? `<img src="${esc(s.logo)}" alt="Tuye Bites">` : DEFAULT_LOGO;

window.toast = (msg, bad) => {
  let t = $("#toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
  t.textContent = msg; t.className = "show" + (bad ? " bad" : "");
  clearTimeout(t._h); t._h = setTimeout(() => { t.className = ""; }, 3200);
};

// "2 h 05 min" / "12:04" style countdown pieces
window.timeLeft = end => {
  const ms = Math.max(0, end - Date.now());
  return { ms, d: Math.floor(ms / 864e5), h: Math.floor(ms / 36e5) % 24, m: Math.floor(ms / 6e4) % 60, s: Math.floor(ms / 1e3) % 60 };
};
window.shareLink = id => location.origin + "/f/" + encodeURIComponent(id);

// The site can be installed on a phone like an app (Add to Home screen)
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => { navigator.serviceWorker.register("/sw.js").catch(() => {}); });
}

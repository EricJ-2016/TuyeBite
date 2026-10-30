// Adds the foods in data/menu-import.json (name, group, price, photo) to the TEST copy's menu (data/local.db).
// Foods already on the menu (same name) are skipped, so running it twice is safe. Run with "IMPORT MENU.bat".
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const db = createClient({ url: "file:" + path.join(root, "data", "local.db").replace(/\\/g, "/") });
const foods = JSON.parse(await readFile(path.join(root, "data", "menu-import.json"), "utf8"));
const kenyaDate = () => new Date(Date.now() + 3 * 36e5).toISOString().slice(0, 10);

// The shop's food groups must include every group used
const s = await db.execute("SELECT value FROM settings WHERE key = 'shop'");
if (s.rows[0]) {
  const shop = JSON.parse(s.rows[0].value), cats = shop.categories || [];
  for (const f of foods) if (!cats.some(c => c.toLowerCase() === f.category.toLowerCase())) cats.push(f.category);
  shop.categories = cats;
  await db.execute({ sql: "UPDATE settings SET value = ? WHERE key = 'shop'", args: [JSON.stringify(shop)] });
}
const have = new Set((await db.execute("SELECT name FROM items")).rows.map(r => String(r.name).toLowerCase()));
let added = 0, skipped = 0;
for (const f of foods) {
  if (have.has(f.name.toLowerCase())) { skipped++; continue; }
  const id = Date.now().toString(36) + randomBytes(3).toString("hex"), now = Date.now();
  const photo = { id: id + "-" + randomBytes(4).toString("hex"), v: now, t: 1 };
  await db.batch([
    { sql: "INSERT INTO images (id, data, updated_at) VALUES (?, ?, ?)", args: [photo.id, f.photo.src, now] },
    { sql: "INSERT INTO images (id, data, updated_at) VALUES (?, ?, ?)", args: [photo.id + "t", f.photo.thumb, now] },
    { sql: `INSERT INTO items (id, name, category, price, old_price, cost, hotel, description, options, available, image_ver, created_at, ordered_date, photos)
            VALUES (?, ?, ?, ?, NULL, NULL, '', '', '[]', 1, 0, ?, ?, ?)`, args: [id, f.name, f.category, f.price, now, kenyaDate(), JSON.stringify([photo])] }
  ], "write");
  added++;
  process.stdout.write(`\rAdded ${added} foods...`);
}
console.log(`\nDone: ${added} foods added, ${skipped} already on the menu.`);

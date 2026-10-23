// Runs Tuye Bites on this computer for testing: http://localhost:5700
// Uses a local database file (data/local.db), never the real online Turso data.
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { makeApp } from "./lib/app.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, "public");
const port = Number(process.env.PORT) || 5700;

// "node dev-server.mjs --db other.db" uses a different test file (Claude tests with its own)
const dbArg = process.argv.indexOf("--db");
const dbFile = dbArg > 0 ? process.argv[dbArg + 1] : "local.db";

const app = makeApp(
  createClient({ url: "file:" + path.join(root, "data", dbFile).replace(/\\/g, "/") }),
  {
    SESSION_SECRET: "local-testing-secret-not-used-online",
    SETUP_CODE: "tuye",
    SETUP_HINT: "Testing on this computer: the setup code is  tuye"
  }
);

const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".webp": "image/webp", ".webmanifest": "application/manifest+json"
};

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${port}`);
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/f/")) {
      const chunks = [];
      for await (const ch of req) chunks.push(ch);
      const r = await app(new Request(url, {
        method: req.method, headers: req.headers,
        body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks)
      }));
      res.writeHead(r.status, Object.fromEntries(r.headers));
      res.end(Buffer.from(await r.arrayBuffer()));
      return;
    }
    // Same as Netlify: order links /t/<secret> show the tracking page
    const page = url.pathname.startsWith("/t/") ? "/track.html" : url.pathname;
    let file = path.normalize(path.join(publicDir, decodeURIComponent(page)));
    if (!file.startsWith(publicDir)) { res.writeHead(403).end(); return; }
    if (url.pathname.endsWith("/")) file = path.join(file, "index.html");
    const data = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "no-cache" });
    res.end(data);
  } catch (e) {
    res.writeHead(e.code === "ENOENT" ? 404 : 500, { "content-type": "text/plain" }).end(e.code === "ENOENT" ? "Not found" : "Error");
    if (e.code !== "ENOENT") console.error(e);
  }
}).listen(port, () => console.log(`Tuye Bites running at http://localhost:${port}  (keep this window open)`));

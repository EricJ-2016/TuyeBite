// Netlify runs this for every address that starts with /api/
// Settings come from Netlify → Site configuration → Environment variables.
import { createClient } from "@libsql/client/web";
import { makeApp } from "../../lib/app.mjs";

let app;

export default async req => {
  app ??= makeApp(
    createClient({ url: process.env.DATABASE_URL, authToken: process.env.DATABASE_AUTH_TOKEN }),
    process.env
  );
  return app(req);
};

// /f/<food> gives shared links a photo, name and price preview
export const config = { path: ["/api/*", "/f/*"] };

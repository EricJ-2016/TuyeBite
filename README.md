# Tuye Bites

Fast food ordered online and delivered in Wote town. Tuye Bites buys the food from fast-food hotels and delivers it.
Customers pay first on the M-Pesa Till and type the M-Pesa code; an admin checks the payment, gives the order to a rider, and the rider delivers.
Customers never make an account.

## Pages

| Page | Who | What |
|---|---|---|
| `/` | Customers | Menu with photos, Hot Deals (flash sale), cart, checkout with Till payment, confirm screen, "Send my order on WhatsApp" |
| `/t/<secret>` | Customers | Order page: live status and countdown, receipt (PDF) once paid, rating, "Order this again" |
| `/f/<food>` | Anyone | Share link for one food: photo and price preview on WhatsApp, then opens that food |
| `/policy.html` | Anyone | Privacy and refunds (the wording is edited by admins in Settings) |
| `/admin.html` | Admins and riders | Admins: Orders, Menu, Customers, Reports, Team, Settings. Riders: only their deliveries |

Everyone logs in with a phone number and password. The main admin is created once with the setup code and can add admins and riders; other admins can add riders.

### What the system does

- **Orders:** payment check (with the minutes until delivery), "Code not found", riders, late warnings, hotel shopping list, cancel and refund note, receipts (till-roll PDF), WhatsApp messages to customers.
- **Order privacy:** order pages open only from the secret link on the phone that ordered, or with the last 4 digits of the order's phone number; details are hidden 3 days after delivery.
- **Menu:** food groups, choices and extras, up to 8 photos per food, "finished for today" switch, buying price and hotel (private), "ordered today" / "viewing now" numbers to encourage customers (never counted in sales).
- **Selling:** Hot Deals (each food with its own price, start, end and optional quantity), discount codes, loyalty free delivery, order for later, big-order fee and maximum items, busy mode, delivery areas and fees, opening hours.
- **Admin:** customers list and blocking fake-order numbers, reports (profit after buying cost and rider pay, best sellers, hotels, riders, ratings, rewards, refunds), end-of-day summary on WhatsApp, Excel download, backup download, phone alerts for new orders (Web Push). No activity history is kept.
- **Customers' phones:** installable like an app (`manifest.webmanifest`, `sw.js`), bottom bar, My orders, "Your usual", order updates on the phone, works offline with the last menu, small photos to save data, Share with a friend's code and the customer's own share link, "new version" notice, "Remember my details" and "Not you? Clear".
- **Rewards:** after 10 delivered orders, and after 10 friends order with the customer's share link (`/?ref=CODE`), the next order gets money off the food (amounts in Settings, Rewards).
- **Cancelling:** customers can cancel on their order page until the rider leaves: full refund within 5 minutes of ordering, 50% after that. The rider's phone number is not shown to customers.
- **My orders:** every order on the customer's phone, with a receipt (view, PDF, print) for each paid order.

## Testing on this computer

Double-click **`OPEN TUYE BITES.bat`** or **`OPEN TUYE ADMIN.bat`** (or the Desktop shortcuts). Keep the black window open while testing.
This test copy uses its own database (`data/local.db`). The first time, the admin page asks for a setup code: on this computer it is `tuye`.
The `data` folder is never uploaded to GitHub.

## How it is built

| Part | Where | What it is |
|---|---|---|
| `public/` | Netlify (website) | Customer page, order page, policy page, admin page, styles, browser code, logo and app icons |
| `public/receipt.js` | Browser | Draws the receipt and makes the PDF (html2canvas + jsPDF, loaded from jsdelivr) |
| `lib/app.mjs` | Netlify Functions | The back office (`/api/...` and `/f/...`): menu, orders, logins, reports, settings, phone alerts |
| `netlify/functions/api.mjs` | Netlify Functions | Connects the back office to Turso |
| `dev-server.mjs` | This computer | Runs everything locally with a test database |

Tables (created and updated automatically): `items`, `images`, `settings`, `users`, `orders`, `ref_codes`, `blocked`, `discounts`, `push_subs`, `customer_push`, `limits`.
Photos are stored in the database (`images`), shrunk in the browser before upload. The phone-alert keys are made automatically and kept in `settings`.

## Netlify environment variables (when it goes online)

| Name | Value |
|---|---|
| `DATABASE_URL` | The Turso database URL (`libsql://...`) |
| `DATABASE_AUTH_TOKEN` | The Turso database token (mark as secret) |
| `SESSION_SECRET` | A long random text, at least 16 characters (mark as secret) |
| `SETUP_CODE` | A code only the owner knows, to create the main admin and reset a forgotten password (mark as secret) |

Secrets are only ever kept in Netlify, never in these files. Every push to the `main` branch on GitHub makes Netlify rebuild the site automatically.

## Putting it on a (new) Netlify account

1. Log in to Netlify, then **Add new project** (or **Add new site**), then **Import an existing project**, then **GitHub**, and choose **TUYE-BITES**.
2. Netlify reads `netlify.toml` by itself (website folder `public`, back office `netlify/functions`). Leave the build settings as they are and tap **Deploy**.
3. In **Site configuration**, then **Environment variables**, add the four values from the table above:
   - Use the **same** Turso `DATABASE_URL` and `DATABASE_AUTH_TOKEN` to keep all the menu, orders, customers and logins. A new Turso database starts empty.
   - Use the **same** `SESSION_SECRET` so nobody has to log in again (a new one just logs everyone out once).
   - Use a `SETUP_CODE` only you know.
4. In **Deploys**, tap **Trigger deploy**, then **Deploy site**, so the new values are used.
5. The site now lives at `tuye-bites.netlify.app`. If the address ever changes, change the two `og:url` / `og:image` lines at the top of `public/index.html` to the new address (they make the WhatsApp preview picture).
6. Open the new address, log in to `/admin.html`, and check Settings. Turn on phone alerts again on each phone (they belong to the old address).

Each upload to GitHub makes Netlify publish again and uses some of the plan's credits, so save changes up and upload them together.
When uploading a new version, change `APP_VERSION` in `public/api.js` and the number in `public/version.json` to the same new value:
customers with the app open then see "A new version of Tuye Bites is ready".

## Before the first real order

In admin, Settings: set the real M-Pesa till number and till name (1234567 is only an example), the real delivery areas and fees, opening hours,
and read the Privacy and refunds page. Add the menu with photos and buying prices.

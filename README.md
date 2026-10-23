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
- **Admin:** customers list and blocking fake-order numbers, reports (profit after buying cost and rider pay, best sellers, hotels, riders, ratings), end-of-day summary on WhatsApp, Excel download, backup download, activity history, phone alerts for new orders (Web Push).
- **Customers' phones:** installable like an app (`manifest.webmanifest`, `sw.js`), "Remember my details" and "Not you? Clear".

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

Tables (created and updated automatically): `items`, `images`, `settings`, `users`, `orders`, `activity`, `blocked`, `discounts`, `push_subs`, `limits`.
Photos are stored in the database (`images`), shrunk in the browser before upload. The phone-alert keys are made automatically and kept in `settings`.

## Netlify environment variables (when it goes online)

| Name | Value |
|---|---|
| `DATABASE_URL` | The Turso database URL (`libsql://...`) |
| `DATABASE_AUTH_TOKEN` | The Turso database token (mark as secret) |
| `SESSION_SECRET` | A long random text, at least 16 characters (mark as secret) |
| `SETUP_CODE` | A code only the owner knows, to create the main admin and reset a forgotten password (mark as secret) |

Secrets are only ever kept in Netlify, never in these files. Every push to the `main` branch on GitHub makes Netlify rebuild the site automatically.

## Before the first real order

In admin, Settings: set the real M-Pesa till number and till name (1234567 is only an example), the real delivery areas and fees, opening hours,
and read the Privacy and refunds page. Add the menu with photos and buying prices.

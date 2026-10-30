"""Builds the Tuye Bites handover PDF: everything a new assistant or developer needs to continue the project.
No secret values are written here, only where they are kept.
Run by make_package.py (or on its own): python make_handover.py <output.pdf>"""

import json
import re
import subprocess
import sys
from datetime import date
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Image, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

ROOT = Path(__file__).resolve().parent.parent  # ...\Tuye Bites Website
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "Tuye Bites - HANDOVER.pdf"

VERSION = json.loads((ROOT / "public" / "version.json").read_text(encoding="utf-8"))["v"]
SITE = re.search(r'og:url" content="([^"]+)"', (ROOT / "public" / "index.html").read_text(encoding="utf-8")).group(1).rstrip("/")
TODAY = date.today().strftime("%d %B %Y")


def git(*args):
    try:
        return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, encoding="utf-8").stdout.strip()
    except OSError:
        return ""


HISTORY = [line.split("|", 1) for line in git("log", "--format=%ad|%s", "--date=format:%d %b %Y").splitlines() if "|" in line]
LAST = git("log", "-1", "--format=%h %ad", "--date=format:%d %b %Y %H:%M")
UNSENT = git("status", "--porcelain") or git("rev-list", "origin/main..HEAD")

RED = colors.HexColor("#CC010A")
PLUM = colors.HexColor("#883A61")
LIGHT = colors.HexColor("#FCEFE0")
GREY = colors.HexColor("#6B5A62")

ss = getSampleStyleSheet()
H1 = ParagraphStyle("H1", parent=ss["Heading1"], textColor=RED, fontSize=17, spaceBefore=10, spaceAfter=6)
H2 = ParagraphStyle("H2", parent=ss["Heading2"], textColor=PLUM, fontSize=13, spaceBefore=8, spaceAfter=4)
B = ParagraphStyle("B", parent=ss["BodyText"], fontSize=9.5, leading=13, alignment=TA_LEFT, spaceAfter=3)
CELL = ParagraphStyle("C", parent=B, fontSize=8.5, leading=11, spaceAfter=0)
CODEST = ParagraphStyle("Code", parent=B, fontName="Courier", fontSize=8, leading=10.5,
                        backColor=colors.HexColor("#F6F1EE"), borderPadding=4, spaceBefore=2, spaceAfter=6)

story = []


def h1(t): story.append(Paragraph(t, H1))
def h2(t): story.append(Paragraph(t, H2))
def p(t): story.append(Paragraph(t, B))
def code(t): story.append(Paragraph(t.replace("&", "&amp;").replace("<", "&lt;").replace("\n", "<br/>").replace("  ", "&nbsp;&nbsp;"), CODEST))


def bullets(items):
    for it in items:
        story.append(Paragraph(it, B, bulletText="-"))


def table(rows, widths, header=True):
    data = [[Paragraph(str(c), CELL) for c in r] for r in rows]
    t = Table(data, colWidths=[w * mm for w in widths], repeatRows=1 if header else 0)
    style = [
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#E2D3CA")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]
    if header:
        style += [("BACKGROUND", (0, 0), (-1, 0), LIGHT)]
    t.setStyle(TableStyle(style))
    story.append(t)
    story.append(Spacer(1, 6))


# ------------------------------------------------------------------ cover
story.append(Spacer(1, 14 * mm))
logo = ROOT / "public" / "icon-512.png"
if logo.exists():
    story.append(Image(str(logo), width=45 * mm, height=45 * mm))
    story.append(Spacer(1, 6 * mm))
story.append(Paragraph("Tuye Bites", ParagraphStyle("T", parent=H1, fontSize=30, leading=36)))
story.append(Paragraph("Project handover: what is built, how it works, how to keep it running and how to continue",
                       ParagraphStyle("ST", parent=B, fontSize=13, leading=17, textColor=GREY)))
story.append(Spacer(1, 8 * mm))
p(f"<b>Updated:</b> {TODAY} &nbsp;&nbsp; <b>Website version:</b> {VERSION} &nbsp;&nbsp; <b>Last saved change:</b> {LAST or '-'}")
p(f"<b>Live address:</b> {SITE} &nbsp;&nbsp; <b>Admin page:</b> {SITE}/admin.html")
p("<b>Owner:</b> Muthwii Mukamba &nbsp;&nbsp; <b>Business:</b> fast food delivery in Wote town, Makueni")
if UNSENT:
    p("<b>Note:</b> some changes on the computer were not yet uploaded to GitHub when this was made "
      "(they are in the zips, but not on the live site yet).")
story.append(Spacer(1, 6 * mm))
p("<b>To the assistant or developer reading this:</b> the owner built this project with Claude Code on their Windows PC. "
  "Read this as context, then check the real files before acting; the files win if anything here is out of date. "
  "No passwords, tokens or codes are in this PDF, only where they are kept. The folder next to this PDF holds zips of "
  "the website code, pictures and menu photos (section 10).")
story.append(PageBreak())

# ------------------------------------------------------------------ 1
h1("1. What Tuye Bites is")
p("A food ordering website for <b>Wote town</b>. Tuye Bites is the owner's own business: the owner buys the food from "
  "fast-food hotels in Wote and delivers it with their own riders. Customers choose food on the website, <b>pay first</b> "
  "on the owner's M-Pesa <b>Till</b>, type the M-Pesa code, and an admin checks the payment. Then a rider takes the food "
  "to the customer. Customers never make an account.")
p("It works on any phone browser and can be installed like an app (Add to Home screen). Everything is in English "
  "(the Kiswahili switch was removed on 30 Oct 2026 at the owner's request).")

h2("How to work with this owner")
bullets([
    "Non-technical; does not like code editors. Give <b>short, click-by-click</b> steps in plain language.",
    "The assistant writes all code, tests it on the computer first, then uploads to GitHub (Netlify then publishes by itself).",
    "<b>Test with the separate test database</b> (data/claude-test.db, port 5710). The owner's own local copy uses data/local.db on port 5700: never change it.",
    "Never ask for the Turso token or other secrets in chat. They live only in Netlify and in the owner's own text files.",
    "No emojis anywhere (site, messages, documents).",
    "Do not send files to the owner's email unless asked.",
    "Netlify plans have limited build credits: <b>save changes up and upload them together</b>, not one by one.",
    "After every update: run <b>Update handover.bat</b> (section 10) so this folder stays current.",
])

# ------------------------------------------------------------------ 2
h1("2. Agreed business rules")
bullets([
    "Payment is <b>before delivery</b>, to the M-Pesa Till. The till number, till name, WhatsApp number and logo are "
    "changed by an admin in Settings (1234567 was only a placeholder; WhatsApp default 0750755226).",
    "<b>One main admin</b> is created once with the SETUP_CODE. Admins can add admins and riders; other admins can add riders. "
    "Riders see only their own deliveries.",
    "New orders show on every admin page (checked every 20 seconds, with sound) and as a phone alert, and the customer "
    "can also send the order to the Tuye Bites WhatsApp.",
    "All prices are worked out again on the server from the menu (customers cannot change prices). Delivery fee comes "
    "from the delivery area. The owner chose to keep the delivery fee separate (not inside the food price).",
    "Payment received asks <b>how many minutes</b> until delivery; the customer sees a countdown. Late = past that time.",
    "Big orders: after 4 items, KES 20 per extra item; maximum 15 items per order (both changeable in Settings).",
    "Limits: 8 orders per hour per internet connection, the same M-Pesa code cannot be used twice, blocked numbers cannot order.",
    "\"Ordered today\" and \"viewing now\" numbers on foods are typed by the owner to encourage customers and are "
    "<b>never counted in sales or reports</b>.",
    "Order privacy: an order page opens only on the phone that ordered (secret key) or with the last 4 digits of the "
    "order phone number (5 tries, then 15 minutes wait). Name and phone are never shown to customers, except on the "
    "receipt once paid. Details are hidden 3 days after delivery or cancelling.",
    "Brand colours: plum #883A61, red #CC010A, amber #E7A545, lime #72B800, green #189E01. "
    "App opening screen: full logo and \"Powered by Muthwii Mukamba\".",
    "Delivery time shown in the top bar: 05-15 minutes (changeable; busy mode shows a longer time).",
])

# ------------------------------------------------------------------ 3
h1("3. What is built")
h2("Customer site (/)")
bullets([
    "Full logo in the top bar, moving delivery motorbike with the delivery time, Open/Closed pill, cart button.",
    "Welcome box: 3 steps, tap \"Pay on Till ...\" to copy the till number; beside it: own picture, Hot Deals slideshow, food photos or logo.",
    "<b>Hot Deals</b> flash sale: each food with its own price, start, end and optional quantity, countdown, \"Coming up\". "
    "On phones the deals are one row to <b>swipe sideways</b> (\"Swipe for more\").",
    "Menu with food groups, search, choices and extras, up to 8 photos per food (swipe gallery), \"Added to cart\" pop-up.",
    "Checkout: name, phone, area, directions, order for later, discount code, loyalty free delivery, big-order fee, "
    "confirm screen, \"Leave checkout?\" check, Remember my details / Not you? Clear.",
    "After ordering: WhatsApp message button, order updates on the phone, install card, share with a friend's code.",
    "Phones: bottom bar (Menu, Hot Deals, My orders, Help). The <b>top My orders bar shows only orders in progress</b>; "
    "the bottom My orders shows <b>every order placed on that phone</b> (newest 200), totals spent, reward progress and a "
    "<b>Receipt</b> button (view, PDF, print) for each paid order. \"Your usual\" (order the last food again).",
    "<b>Rewards</b> (Settings, Rewards): after N delivered orders (default 10) and after N friends order with the customer's own "
    "share link (?ref=CODE, default 10), the next order gets % or KES off the food, once or every time. One reward per order, "
    "on top of a discount code. Friends count when their first order is delivered; cancelled orders give the reward back.",
    "Works offline with the last menu, small photos to save data, new version notice.",
])
h2("Order page (/t/...)")
bullets([
    "Status steps, delivery countdown, rider name while on the way (the rider's phone number is <b>not</b> shown to customers), "
    "receipt (till-roll PDF, view, print) once paid.",
    "<b>Cancel my order</b> until the rider leaves: within 5 minutes of ordering a full refund, after that 50%. Admins get an "
    "alert and the order card shows the amount to send back. The rule is always on the Privacy and refunds page.",
    "Rating 1 to 5 stars with a comment after delivery. About <b>10 minutes after delivery</b> the customer's phone gets "
    "a reminder to rate (only phones that turned on order updates; once per order).",
    "Order again, loyalty dots (free delivery every Nth delivered order).",
])
h2("Admin page (/admin.html)")
table([
    ["Tab", "What it does"],
    ["Orders", "New, paid, on the way, delivered. Payment received (minutes), Code not found, Change time, give to rider, "
               "cancel with reason and refund note, receipt (send, PDF, print), hotel shopping list, late warnings, ratings."],
    ["Menu", "Foods, groups, choices and extras, photos (up to 8), buying price and hotel (private), finished for today, "
             "ordered today / viewing now numbers, Make small photos."],
    ["Customers", "Everyone who ordered, orders, ratings they give, block or unblock a number."],
    ["Reports", "Sales, profit after buying cost and rider pay, best sellers, areas, hotels, riders and pay owed, "
                "average rating and comments, busy hours, Excel download, summary to WhatsApp."],
    ["Team", "Add admins and riders, rider pay, switch off a login."],
    ["Settings", "Shop details (till, WhatsApp, logo, welcome picture), hours, delivery time, busy mode, late minutes, "
                 "rider pay, Hot Deals, discount codes, big orders, rewards (10 orders / 10 friends), Share Tuye Bites code, loyalty, delivery "
                 "areas, food groups, phone alerts, account, privacy and refunds wording, backup. (No activity history: "
                 "it was switched off and deleted on 30 Oct 2026.)"],
], [28, 148])
p("Phone alerts (Web Push) go to admins for every new order, new M-Pesa code and <b>every new rating</b> "
  "(1 or 2 stars say \"please check\"); riders get an alert for each new delivery.")

# ------------------------------------------------------------------ 4
h1("4. Where everything is")
table([
    ["What", "Where"],
    ["Live website", f"{SITE} (admin: {SITE}/admin.html)"],
    ["Code on GitHub", "github.com/Muthwiimukamba/TUYE-BITES, branch main (git remote \"origin\"). Spare old copy: "
                       "github.com/muthwii-mukamba/TUYE-BITES (remote \"oldgithub\", not updated)."],
    ["Hosting", "Netlify, owner's new account (site tuye-bites). Publishes by itself about 20 seconds after each upload to main."],
    ["Database", "Turso (libsql). Holds menu, photos, orders, customers, logins, settings and phone-alert keys."],
    ["Code on the PC", r"C:\Users\ADMIN\Documents\Muthwii Claude\Tuye Bites Website"],
    ["Menu photos", r"C:\Users\ADMIN\Documents\Muthwii Claude\Tuye Bites Menu Photos (by food group)"],
    ["Owner's test copy", "Desktop shortcuts \"Tuye Bites Site\" and \"Tuye Bites Admin\" (OPEN TUYE BITES.bat / "
                          "OPEN TUYE ADMIN.bat, port 5700, data/local.db, setup code on this computer: tuye)."],
    ["Assistant's test copy", "Claude Code launch \"tuye-bites\": port 5710, data/claude-test.db."],
    ["Secrets", "Only in Netlify (Site configuration, Environment variables) and in the owner's own text file "
                "\"Turso for Tuye Bites.txt\" in the Muthwii Claude folder. Never in the code, GitHub or this PDF."],
], [36, 140])
h2("Netlify environment variables (names only)")
table([
    ["Name", "What it is"],
    ["DATABASE_URL", "The Turso database address (libsql://...)"],
    ["DATABASE_AUTH_TOKEN", "The Turso token (secret)"],
    ["SESSION_SECRET", "Long random text that signs logins and order keys (secret). Changing it logs everyone out."],
    ["SETUP_CODE", "Code only the owner knows: creates the main admin and resets a forgotten main-admin password (secret)"],
    ["SETUP_HINT", "Optional: a hint shown on the setup screen"],
], [45, 131])

# ------------------------------------------------------------------ 5
h1("5. How it is built")
table([
    ["Part", "What it is"],
    ["public/index.html, shop.js", "Customer site"],
    ["public/track.html", "Order page (/t/...)"],
    ["public/admin.html, admin.js, admin.css", "Admin and rider pages"],
    ["public/policy.html", "Privacy and refunds (wording edited in Settings)"],
    ["public/api.js", "Shared browser code: API calls, helpers, logos, order keys, phone updates, APP_VERSION"],
    ["public/style.css", "All styles (brand colours)"],
    ["public/receipt.js", "Receipt drawing and PDF (html2canvas 1.4.1 and jsPDF 2.5.1 from jsdelivr)"],
    ["public/lang.js", "Old Kiswahili word list, no longer used by any page (can be deleted)"],
    ["public/sw.js, manifest.webmanifest", "Installable app, offline files, phone alerts"],
    ["public/version.json", "Must match APP_VERSION in api.js (new version notice)"],
    ["lib/app.mjs", "The whole back office: /api/... and /f/... (menu, orders, logins, reports, settings, phone alerts)"],
    ["netlify/functions/api.mjs", "Connects the back office to Turso on Netlify"],
    ["netlify.toml", "Netlify settings: website folder public, /t/* goes to track.html, no search-engine listing"],
    ["dev-server.mjs", "Runs everything on the PC (node dev-server.mjs --db data/...)"],
    ["handover-tools/", "Makes this PDF and the handover zips"],
], [62, 114])
bullets([
    "Node.js (ES modules). Packages: @libsql/client, bcryptjs. No build step.",
    "Tables (made and updated by themselves): items, images, settings, users, orders, ref_codes, blocked, discounts, "
    "push_subs, customer_push, limits. New columns are added through the ADDED list at the top of lib/app.mjs.",
    "Logins: phone number and password (bcrypt), signed tokens with SESSION_SECRET, lockout after wrong tries.",
    "Phone alerts are written by hand (VAPID ES256 and aes128gcm with node:crypto); keys are made by themselves and kept in settings.",
    "Photos are shrunk in the browser and kept in the database; each has a small copy (id ending in t).",
    "Times use Kenya time (EAT, UTC+3).",
])

# ------------------------------------------------------------------ 6
h1("6. How to make an update")
code("1. Change the files in Tuye Bites Website and test on the test copy (port 5710, data/claude-test.db).\n"
     "2. Raise the ?v= number on any changed .js/.css in the .html files.\n"
     "3. Give APP_VERSION in public/api.js and public/version.json the same new value (e.g. 2026-10-24.3).\n"
     "4. If the offline files changed a lot, raise CACHE in public/sw.js (tuye-v8 -> tuye-v9).\n"
     "5. git add, git commit, git push origin main  (Netlify publishes in about 20 seconds).\n"
     "6. Check <site>/version.json shows the new value.\n"
     "7. If lib/app.mjs changed and the owner's copy is open, restart it (OPEN TUYE ADMIN.bat).\n"
     "8. Double-click Update handover.bat (or: python handover-tools/make_package.py).")
p("Git uploads work through Windows Git Credential Manager (the GitHub CLI is not logged in). "
  "Save changes up and upload together to save Netlify credits.")

# ------------------------------------------------------------------ 7
h1("7. Moving to a new Netlify account")
bullets([
    "Netlify: Add new project, Import an existing project, GitHub, choose TUYE-BITES. Leave the build settings (netlify.toml is read by itself). Deploy.",
    "Site configuration, Environment variables: add the names in section 4. Same Turso values keep all data; a new Turso database starts empty.",
    "Deploys, Trigger deploy, Deploy site.",
    "If the address changes: change og:url and og:image at the top of public/index.html (WhatsApp preview picture).",
    "Turn on phone alerts again on each phone (they belong to the address).",
])
p("History: the first Netlify team ran out of credits on 23 Oct 2026. The site moved to the owner's new account and "
  "GitHub (Muthwiimukamba/TUYE-BITES) with a new empty Turso database, and has used the address tuye-bites.netlify.app since 24 Oct 2026.")

# ------------------------------------------------------------------ 8
h1("8. Status and what is left")
h2("Owner still to do before the first real order")
bullets([
    "Create the main admin on the live admin page with the SETUP_CODE.",
    "Settings: real till number and till name, WhatsApp, delivery areas and fees, hours, delivery time, rider pay, privacy and refunds wording.",
    "Add the menu with photos and buying prices; add riders in Team.",
    "Turn on phone alerts on the owner's and riders' phones; do a real small-money test order from start to receipt.",
    "Check Settings, Rewards (10 orders / 10 friends, how much off); choose a Share Tuye Bites code.",
])
h2("Not yet tested on real phones")
bullets([
    "Phone alerts (admin, rider, customer updates, rating alert and rate reminder): the test browser cannot receive them.",
    "Installing the app, the opening screen, the WhatsApp link preview picture.",
])
h2("Ideas offered, not built")
bullets([
    "Printable poster with a QR code to the site.",
])

# ------------------------------------------------------------------ 9
h1("9. Backups and if something goes wrong")
bullets([
    "<b>Data:</b> Admin, Settings, Backup downloads a file with menu, orders, customers and settings (no passwords, keys or photos). Do it weekly.",
    "<b>Code:</b> GitHub has every version; this folder has zips of the latest.",
    "Site shows an error everywhere: check Netlify environment variables and that the Turso database is awake.",
    "Forgot main-admin password: admin page, Forgot password, use the SETUP_CODE.",
    "Old look on a phone: close the site and open again (or tap the new version notice).",
    "Netlify deploy says Skipped: the account is out of credits; wait for the next month or move account (section 7).",
])

# ------------------------------------------------------------------ 10
h1("10. This handover folder")
table([
    ["File", "What it is"],
    ["Tuye Bites - HANDOVER.pdf", "This document"],
    ["1 - Website code (everything).zip", "The whole project to restore or move it (no database, no secrets, no node_modules: run npm install)"],
    ["2 - Customer and admin pages.zip", "The public folder: every page, style, script, logo and icon"],
    ["3 - Back office.zip", "lib, netlify, netlify.toml, package files, dev-server and the start files"],
    ["4 - Logo and pictures.zip", "Logo, app icons, WhatsApp share picture, brand colours picture"],
    ["5 - Menu photos.zip", "The menu photos by food group"],
    ["README.txt", "Short list of the above with the update date"],
    ["Update handover.bat", "Double-click after any update: makes this PDF and every zip again"],
], [62, 114])
p("Keep the folder private. Copy it to a USB stick and Google Drive now and then.")

# ------------------------------------------------------------------ 11
h1("11. Change history")
table([["Date", "Change"]] + [[d, s] for d, s in HISTORY], [26, 150])


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(GREY)
    canvas.drawString(18 * mm, 10 * mm, f"Tuye Bites handover - {TODAY} - version {VERSION}")
    canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, f"Page {doc.page}")
    canvas.restoreState()


SimpleDocTemplate(str(OUT), pagesize=A4, leftMargin=17 * mm, rightMargin=17 * mm, topMargin=16 * mm, bottomMargin=17 * mm,
                  title="Tuye Bites - Handover", author="Muthwii Mukamba").build(story, onFirstPage=footer, onLaterPages=footer)
print(f"  {OUT.name}")

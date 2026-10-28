"""Rebuilds the "Tuye Bites - Handover" folder: the handover PDF + one zip per part of the project.
Run after every update: double-click "Update handover.bat" in that folder (or: python make_package.py)."""

import json
import subprocess
import sys
import zipfile
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # ...\Tuye Bites Website
BASE = ROOT.parent                                      # ...\Muthwii Claude
OUT = BASE / "Tuye Bites - Handover"
PHOTOS = BASE / "Tuye Bites Menu Photos"
BRAND = BASE / "tuye bites.JPG"                         # the brand colours picture the owner sent
SKIP_DIRS = {".git", "node_modules", "data", ".netlify", "__pycache__"}
SKIP_FILES = {".env"}
PICTURES = (".png", ".webp", ".jpg", ".jpeg", ".svg")

VERSION = json.loads((ROOT / "public" / "version.json").read_text(encoding="utf-8"))["v"]


def add_tree(z, folder, arc_base, only_ext=None):
    for f in sorted(folder.rglob("*")):
        rel = f.relative_to(folder)
        if any(part in SKIP_DIRS for part in rel.parts) or not f.is_file() or f.name in SKIP_FILES:
            continue
        if only_ext and f.suffix.lower() not in only_ext:
            continue
        z.write(f, str(Path(arc_base) / rel))


def write_zip(name, fill):
    """Builds the zip next to the target, then swaps it in, so a half-written zip never replaces a good one."""
    target = OUT / name
    tmp = target.with_suffix(".tmp")
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as z:
        fill(z)
    tmp.replace(target)
    print(f"  {name}  ({target.stat().st_size // 1024} KB)")


def everything(z):
    add_tree(z, ROOT, "Tuye Bites Website")


def pages(z):
    add_tree(z, ROOT / "public", "public")


def back_office(z):
    for folder in ["lib", "netlify"]:
        add_tree(z, ROOT / folder, folder)
    for name in ["netlify.toml", "package.json", "package-lock.json", "dev-server.mjs", "README.md",
                 "OPEN TUYE BITES.bat", "OPEN TUYE ADMIN.bat", ".gitignore"]:
        if (ROOT / name).exists():
            z.write(ROOT / name, name)


def pictures(z):
    add_tree(z, ROOT / "public", "website pictures", only_ext=PICTURES)
    if BRAND.exists():
        z.write(BRAND, "brand colours picture" + BRAND.suffix.lower())


def menu_photos(z):
    if PHOTOS.exists():
        add_tree(z, PHOTOS, "Tuye Bites Menu Photos")
    else:
        z.writestr("READ ME.txt", "The menu photos folder was not found on this computer.\r\n")


README = """TUYE BITES - HANDOVER PACKAGE
Updated: {when}    Website version: {version}

WHAT IS IN THIS FOLDER
  Tuye Bites - HANDOVER.pdf           Everything about the project: features, rules, where things are, how to update
                                      and move it. Give it to any assistant/developer who continues the work.
  1 - Website code (everything).zip   The whole project, to restore or move it (no database, no secrets).
  2 - Customer and admin pages.zip    Every page, style, script, logo and icon (the public folder).
  3 - Back office.zip                 The server code, Netlify settings and the start files.
  4 - Logo and pictures.zip           Logo, app icons, WhatsApp share picture, brand colours picture.
  5 - Menu photos.zip                 The menu photos by food group.
  Update handover.bat                 Double-click after any update: rebuilds the PDF and every zip.

TO KEEP IT UP TO DATE
  Double-click "Update handover.bat". Claude also runs it after every website update.

IMPORTANT
  - No passwords, Turso token or setup code are in this folder. They stay in Netlify and your own private notes.
  - Keep the folder private. Copy it to a USB stick and your Google Drive now and then.
  - Your shop data (menu, orders, customers) is online in Turso: download a copy weekly in Admin, Settings, Backup.
"""


def main():
    OUT.mkdir(exist_ok=True)
    print(f"Updating {OUT} (website {VERSION})")
    pdf = OUT / "Tuye Bites - HANDOVER.pdf"
    subprocess.run([sys.executable, str(Path(__file__).with_name("make_handover.py")), str(pdf)], check=True)
    write_zip("1 - Website code (everything).zip", everything)
    write_zip("2 - Customer and admin pages.zip", pages)
    write_zip("3 - Back office.zip", back_office)
    write_zip("4 - Logo and pictures.zip", pictures)
    write_zip("5 - Menu photos.zip", menu_photos)
    (OUT / "README.txt").write_text(
        README.format(when=datetime.now().strftime("%d %b %Y %H:%M"), version=VERSION).replace("\n", "\r\n"), encoding="utf-8"
    )
    (OUT / "Update handover.bat").write_text(
        "@echo off\r\n"
        "title Updating Tuye Bites handover...\r\n"
        f'python "{Path(__file__).resolve()}" || py "{Path(__file__).resolve()}"\r\n'
        "echo.\r\necho Done. You can close this window.\r\npause >nul\r\n",
        encoding="utf-8",
    )
    print("Done.")


if __name__ == "__main__":
    main()

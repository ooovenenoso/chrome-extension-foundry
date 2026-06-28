#!/usr/bin/env python3
"""
cws_asset_pack.py — flatten raw Codex outputs into CWS contract.

Reads a source dir of raw images, produces:
  <out>/icon-128.png            (RGB, 128x128, no alpha, dark bg)
  <out>/screenshot-1280x800.png (RGB, 1280x800)
  <out>/promo-small-440x280.png (RGB, 440x280)
  <out>/promo-wide-1400x560.png (RGB, 1400x560)

Picks files by name pattern (icon, screenshot, promo-*).
"""

import argparse, sys
from pathlib import Path
from PIL import Image, ImageOps

DARK_BG = (17, 24, 39)  # slate-900

def normalize_icon(src: Path, dst: Path, size=(128, 128)) -> None:
    im = Image.open(src).convert("RGBA")
    canvas = Image.new("RGB", size, DARK_BG)
    im = im.resize(size, Image.Resampling.LANCZOS)
    canvas.paste(im, mask=im.split()[3] if im.mode == "RGBA" else None)
    canvas.save(dst, "PNG")

def normalize_screenshot(src: Path, dst: Path, size=(1280, 800)) -> None:
    im = Image.open(src).convert("RGB")
    im = ImageOps.fit(im, size, method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
    im.save(dst, "PNG")

def normalize_promo_small(src: Path, dst: Path, size=(440, 280)) -> None:
    im = Image.open(src).convert("RGB")
    im = ImageOps.fit(im, size, method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
    im.save(dst, "PNG")

def normalize_promo_wide(src: Path, dst: Path, size=(1400, 560)) -> None:
    im = Image.open(src).convert("RGB")
    im = ImageOps.fit(im, size, method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
    im.save(dst, "PNG")

def find_by_pattern(src_dir: Path, *patterns: str) -> Path | None:
    for p in patterns:
        for f in src_dir.glob(p):
            return f
    return None

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--name", required=True, help="extension id, used in filenames")
    args = ap.parse_args()

    src = Path(args.source)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    icon = find_by_pattern(src, "icon*.png", "*icon*.png", "logo*.png")
    if icon:
        normalize_icon(icon, out / "icon-128.png")
        print(f"✅ icon-128.png <- {icon.name}")
    else:
        print("⚠️  no icon source found")

    screenshot = find_by_pattern(src, "screenshot*.png", "*screen*.png", "captura*.png")
    if screenshot:
        normalize_screenshot(screenshot, out / "screenshot-1280x800.png")
        print(f"✅ screenshot-1280x800.png <- {screenshot.name}")
    else:
        print("⚠️  no screenshot source found")

    promo_small = find_by_pattern(src, "promo-small*.png", "*small*.png")
    if promo_small:
        normalize_promo_small(promo_small, out / "promo-small-440x280.png")
        print(f"✅ promo-small-440x280.png <- {promo_small.name}")

    promo_wide = find_by_pattern(src, "promo-wide*.png", "marquee*.png")
    if promo_wide:
        normalize_promo_wide(promo_wide, out / "promo-wide-1400x560.png")
        print(f"✅ promo-wide-1400x560.png <- {promo_wide.name}")

if __name__ == "__main__":
    main()

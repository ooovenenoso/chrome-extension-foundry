#!/usr/bin/env python3
"""
cws_contact_sheet.py — composite all final CWS assets into one PNG for vision check.
"""

import argparse
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="src", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    src = Path(args.src)
    out = Path(args.out)

    assets = [
        ("icon-128.png", "Icon 128x128"),
        ("screenshot-1280x800.png", "Screenshot 1280x800"),
        ("promo-small-440x280.png", "Promo small 440x280"),
        ("promo-wide-1400x560.png", "Promo wide 1400x560"),
    ]

    # Build composite
    label_h = 40
    panel_w = 1500
    total_h = label_h
    panels = []
    for fname, label in assets:
        f = src / fname
        if not f.exists():
            continue
        im = Image.open(f).convert("RGB")
        # Fit into panel_w - 40px margin
        max_w = panel_w - 40
        if im.width > max_w:
            ratio = max_w / im.width
            im = im.resize((max_w, int(im.height * ratio)), Image.Resampling.LANCZOS)
        panels.append((label, im))
        total_h += im.height + label_h + 20

    composite = Image.new("RGB", (panel_w, total_h), (24, 24, 27))  # zinc-900
    draw = ImageDraw.Draw(composite)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 24)
    except Exception:
        font = ImageFont.load_default()

    y = 10
    for label, im in panels:
        draw.text((20, y), label, fill=(245, 158, 11), font=font)  # amber-500
        y += label_h
        composite.paste(im, (20, y))
        y += im.height + 20

    composite.save(out, "PNG")
    print(f"✅ contact sheet -> {out}")

if __name__ == "__main__":
    main()

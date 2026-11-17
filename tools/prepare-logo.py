#!/usr/bin/env python3
"""Turns the studio logo (art on black) into the three web assets.

    python3 tools/prepare-logo.py <logo.png>

Writes public/img/logo.png (lockup, transparent), logo-mark.png (the hibiscus,
square) and favicon.png.
"""
import sys
from PIL import Image
import numpy as np

src = Image.open(sys.argv[1]).convert('RGBA')
a = np.array(src).astype(np.float32)
rgb = a[:, :, :3]
# the artwork sits on pure black — alpha from luminance keeps the gold edges clean
alpha = np.clip((rgb.max(axis=2) - 6) / 244 * 255, 0, 255)
full = Image.fromarray(np.dstack([rgb, alpha]).astype(np.uint8), 'RGBA')
full = full.crop(full.getbbox())
W, H = full.size

lock = full.copy(); lock.thumbnail((400, 400), Image.LANCZOS)
lock.save('public/img/logo.png', optimize=True)

# a dedicated mark is better than cropping the lockup — use it when supplied
MARK_SRC = 'tools/assets/logo-mark-src.png'
import os
if os.path.exists(MARK_SRC):
    mark = Image.open(MARK_SRC).convert('RGBA')
    mark = mark.crop(mark.getbbox())
    side = int(max(mark.size) * 1.04)
    sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    sq.paste(mark, ((side - mark.size[0]) // 2, (side - mark.size[1]) // 2))
    sq = sq.resize((192, 192), Image.LANCZOS)
else:
    mark = full.crop((int(W * 0.60), int(H * 0.005), int(W * 0.90), int(H * 0.30)))
    mark = mark.crop(mark.getbbox())
    side = int(max(mark.size) * 1.06)
    sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    sq.paste(mark, ((side - mark.size[0]) // 2, (side - mark.size[1]) // 2))
    sq = sq.resize((192, 192), Image.LANCZOS)
sq.save('public/img/logo-mark.png', optimize=True)
# the tab icon is the lockup itself, on a soft ivory tile so the gold reads
fav = lock.copy()
fav.thumbnail((56, 56), Image.LANCZOS)
tile = Image.new('RGBA', (64, 64), (253, 251, 247, 255))
tile.alpha_composite(fav, ((64 - fav.size[0]) // 2, (64 - fav.size[1]) // 2))
tile.save('public/img/favicon.png', optimize=True)
# a wider mark for the admin sidebar and share cards
side = lock.copy(); side.thumbnail((360, 360), Image.LANCZOS)
side.save('public/img/logo-wide.png', optimize=True)
print('logo assets written:', lock.size, sq.size)

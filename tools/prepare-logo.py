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

mark = full.crop((int(W * 0.60), int(H * 0.005), int(W * 0.90), int(H * 0.30)))
mark = mark.crop(mark.getbbox())
side = int(max(mark.size) * 1.06)
sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
sq.paste(mark, ((side - mark.size[0]) // 2, (side - mark.size[1]) // 2))
sq = sq.resize((192, 192), Image.LANCZOS)
sq.save('public/img/logo-mark.png', optimize=True)
fav = sq.copy(); fav.thumbnail((64, 64), Image.LANCZOS)
fav.save('public/img/favicon.png', optimize=True)
print('logo assets written:', lock.size, sq.size)

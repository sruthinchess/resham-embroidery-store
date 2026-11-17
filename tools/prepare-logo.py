#!/usr/bin/env python3
"""Turns the studio logo artwork into the web assets.

    python3 tools/prepare-logo.py <logo.png>

Handles either ground: artwork on black gets an alpha ramp from luminance,
artwork on white is keyed with a flood fill from the border, so highlights
inside the art survive. Writes public/img/logo.png (lockup), logo-mark.png
(the crowned S with the flower), logo-wide.png and favicon.png.
"""
import os
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageFilter

MARK_SRC = 'tools/assets/logo-mark-src.png'
SRC = sys.argv[1]

src = Image.open(SRC).convert('RGB')
w, h = src.size
arr = np.array(src).astype(np.int16)

corners = [arr[0, 0], arr[0, w - 1], arr[h - 1, 0], arr[h - 1, w - 1]]
corner_lum = float(np.mean([c.mean() for c in corners]))
on_white = corner_lum > 160


def key_white(a):
    """Clear the white ground and the counters inside the letters.

    Every near-white region is measured: the big ones (the outer ground and the
    holes in a, n, d, y) go transparent, while tiny specular highlights inside
    the gold are left alone so the artwork keeps its shine.
    """
    near = (a[:, :, 0] > 226) & (a[:, :, 1] > 226) & (a[:, :, 2] > 226)
    seen = np.zeros((h, w), dtype=bool)
    clear = np.zeros((h, w), dtype=bool)
    min_area = max(120, int(w * h * 0.0004))

    for sy in range(h):
        for sx in range(w):
            if not near[sy, sx] or seen[sy, sx]:
                continue
            comp = []
            q = deque([(sx, sy)])
            seen[sy, sx] = True
            touches_edge = False
            while q:
                x, y = q.popleft()
                comp.append((x, y))
                if x == 0 or y == 0 or x == w - 1 or y == h - 1:
                    touches_edge = True
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and near[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        q.append((nx, ny))
            if touches_edge or len(comp) >= min_area:
                for x, y in comp:
                    clear[y, x] = True

    alpha = np.where(clear, 0, 255).astype(np.uint8)
    return Image.fromarray(alpha, 'L').filter(ImageFilter.GaussianBlur(0.6))


if on_white:
    alpha = key_white(arr)
else:
    alpha = Image.fromarray(np.clip((arr.max(axis=2) - 6) / 244 * 255, 0, 255).astype(np.uint8), 'L')

full = src.convert('RGBA')
full.putalpha(alpha)
full = full.crop(full.getbbox())
W, H = full.size

lock = full.copy()
lock.thumbnail((460, 460), Image.LANCZOS)
lock.save('public/img/logo.png', optimize=True)

# the mark: a supplied one wins, otherwise take the crowned S and its flower
if os.path.exists(MARK_SRC):
    mark = Image.open(MARK_SRC).convert('RGBA')
    mark = mark.crop(mark.getbbox())
    side = int(max(mark.size) * 1.04)
    sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    sq.paste(mark, ((side - mark.size[0]) // 2, (side - mark.size[1]) // 2))
    sq = sq.resize((192, 192), Image.LANCZOS)
else:
    mark = full.crop((0, 0, int(W * 0.46), int(H * 0.72)))
    mark = mark.crop(mark.getbbox())
    side = int(max(mark.size) * 1.05)
    sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    sq.paste(mark, ((side - mark.size[0]) // 2, (side - mark.size[1]) // 2))
    sq = sq.resize((192, 192), Image.LANCZOS)
sq.save('public/img/logo-mark.png', optimize=True)

wide = lock.copy()
wide.thumbnail((420, 420), Image.LANCZOS)
wide.save('public/img/logo-wide.png', optimize=True)

# the tab icon is the lockup on a soft ivory tile so the gold reads at 16px
fav = lock.copy()
fav.thumbnail((58, 58), Image.LANCZOS)
tile = Image.new('RGBA', (64, 64), (253, 251, 247, 255))
tile.alpha_composite(fav, ((64 - fav.size[0]) // 2, (64 - fav.size[1]) // 2))
tile.save('public/img/favicon.png', optimize=True)

print('logo assets written:', lock.size, sq.size, '| keyed on', 'white' if on_white else 'black')

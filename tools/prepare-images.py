#!/usr/bin/env python3
"""Resizes + palette-quantises a pack image into public/img/.

    python3 tools/prepare-images.py <src.png> <out.png> [max] [colours]
"""
import sys
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
limit = int(sys.argv[3]) if len(sys.argv) > 3 else 800
colors = int(sys.argv[4]) if len(sys.argv) > 4 else 0

im = Image.open(src).convert('RGBA')
im.thumbnail((limit, limit), Image.LANCZOS)
if colors:
    im = im.quantize(colors=colors, method=Image.FASTOCTREE).convert('RGBA')
im.save(out, optimize=True)

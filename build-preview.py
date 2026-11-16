#!/usr/bin/env python3
"""Builds docs/index.html — one self-contained page (works from disk, served by GitHub Pages)."""
import json, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent
PUB, OUT = ROOT / 'public', ROOT / 'docs' / 'index.html'

css = (PUB / 'styles.css').read_text()
demo = (PUB / 'demo-backend.js').read_text()
app = (PUB / 'app.js').read_text()
admin = (PUB / 'admin.js').read_text()
seed = json.loads((ROOT / 'src/data/seed.json').read_text())
html = (PUB / 'index.html').read_text()
seed['settings'].pop('admin_password', None)          # never ship the hash

body = re.search(r'<body>(.*?)</body>', html, re.S).group(1)
body = re.sub(r'<script src="[^"]+"></script>\s*', '', body).strip()

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Resham &amp; Co. — Hand-Embroidered Heirlooms</title>
<meta name="description" content="Resham & Co. — hand-embroidered sarees, kurtis, dupattas, hoop art and home linen. Self-contained build with a working admin panel (password 252525).">
<meta name="theme-color" content="#7e2b33">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%237e2b33'/%3E%3Ccircle cx='16' cy='16' r='7' fill='none' stroke='%23f4e7d3' stroke-width='2' stroke-dasharray='3 3'/%3E%3Ccircle cx='16' cy='16' r='2.4' fill='%23d6b177'/%3E%3C/svg%3E">
<style>
{css}
</style>
</head>
<body>
{body}
<script>window.__SEED__ = {json.dumps(seed, ensure_ascii=False)};</script>
<script>
{demo}
</script>
<script>
{app}
</script>
<script>
{admin}
</script>
</body>
</html>
""")
print('wrote', OUT, OUT.stat().st_size, 'bytes')

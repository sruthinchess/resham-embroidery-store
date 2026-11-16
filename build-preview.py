#!/usr/bin/env python3
"""Builds docs/index.html — one self-contained page (opens from disk, served by Pages)."""
import json, pathlib, re, subprocess

ROOT = pathlib.Path(__file__).resolve().parent
PUB, OUT = ROOT / 'public', ROOT / 'docs' / 'index.html'

subprocess.run(['node', str(ROOT / 'tools' / 'build-assets.js')], check=True, cwd=ROOT)
assets = json.loads((ROOT / 'build' / 'assets.json').read_text())

css = (PUB / 'styles.css').read_text()
qr = (PUB / 'vendor/qrcode.js').read_text()
logos = (PUB / 'upi-logos.js').read_text()
demo = (PUB / 'demo-backend.js').read_text()
app = (PUB / 'app.js').read_text()
admin = (PUB / 'admin.js').read_text()
html = (PUB / 'index.html').read_text()

body = re.search(r'<body>(.*?)</body>', html, re.S).group(1)
body = re.sub(r'<script src="[^"]+"></script>\s*', '', body).strip()

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Resham Atelier — machine embroidery designs, instant download</title>
<meta name="description" content="Hand-digitised machine embroidery designs. Choose DST, EXP, SVG, PNG or PDF at checkout, pay by UPI, download instantly.">
<meta name="theme-color" content="#14110e">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='15' fill='%23fdfbf7'/%3E%3Ccircle cx='16' cy='16' r='11' fill='none' stroke='%237E2B33' stroke-width='1.4'/%3E%3Ccircle cx='16' cy='16' r='3' fill='%23B4884B'/%3E%3C/svg%3E">
<style>
{css}
</style>
</head>
<body>
{body}
<script>window.__SEED__ = {json.dumps({'settings': assets['settings'], 'designs': assets['designs']}, ensure_ascii=False)};</script>
<script>window.__FILES__ = {json.dumps(assets['files'])};</script>
<script>
{qr}
</script>
<script>
{logos}
</script>
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
print('wrote', OUT, f'{OUT.stat().st_size/1024:.0f} KB')

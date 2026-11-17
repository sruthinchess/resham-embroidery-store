#!/usr/bin/env python3
"""Builds docs/ — a static copy of the store that runs from disk or GitHub Pages.

  docs/index.html   the app (seed + code, no images inlined)
  docs/img/*.png    artwork, stitch previews and the logo
  docs/files/<slug>/ the machine files the demo ZIP is assembled from

Keeping the images and design files as real files (not base64 in the HTML) keeps
the page small, lets the browser cache them, and means the catalogue can grow
without the HTML growing with it.
"""
import json, pathlib, re, shutil, subprocess
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent
PUB, DOCS = ROOT / 'public', ROOT / 'docs'
IMG, FILES = DOCS / 'img', DOCS / 'files'
DEMO_FORMATS = ['pes', 'dst']          # what the static demo ships per design

seed = json.loads((ROOT / 'src/data/designs.json').read_text())

# ---- images
for d in (IMG, FILES):
    if d.exists():
        shutil.rmtree(d)
IMG.mkdir(parents=True)
FILES.mkdir(parents=True)

LIMITS = {'logo': 300, 'logo-mark': 128, 'favicon': 64}
for src in list((PUB / 'img').glob('*.png')) + list((PUB / 'img').glob('*.webp')):
    limit = LIMITS.get(src.stem) or (360 if src.stem.endswith('-stitch') else 340)
    im = Image.open(src).convert('RGBA')
    im.thumbnail((limit, limit), Image.LANCZOS)
    if src.suffix.lower() == '.webp':
        im.save(IMG / src.name, 'WEBP', quality=80, method=4)
    else:
        if not src.stem.startswith('logo') and src.stem != 'favicon':
            im = im.quantize(colors=128, method=Image.FASTOCTREE).convert('RGBA')
        im.save(IMG / src.name, optimize=True)

# ---- machine files for the demo
files = {}
for d in seed['designs']:
    out = FILES / d['slug']
    out.mkdir()
    files[d['slug']] = {}
    for f in d['formats']:
        if f['key'] not in DEMO_FORMATS:
            continue
        src = ROOT / d['dir'] / f['file']
        if src.exists():
            shutil.copy2(src, out / f['file'])
            files[d['slug']][f['key']] = {'name': f['file'], 'url': f'files/{d["slug"]}/{f["file"]}'}

# ---- the page
css = (PUB / 'styles.css').read_text()
qr = (PUB / 'vendor/qrcode.js').read_text()
logos = (PUB / 'upi-logos.js').read_text()
demo = (PUB / 'demo-backend.js').read_text()
app = (PUB / 'app.js').read_text()
admin = (PUB / 'admin.js').read_text()
html = (PUB / 'index.html').read_text()
head_meta = re.search(r'<meta name="google-site-verification"[^>]*>', html)
meta_tag = head_meta.group(0) if head_meta else ''

body = re.search(r'<body>(.*?)</body>', html, re.S).group(1)
body = body.replace('<script>window.__BASE__ = "/";</script>', '<script>window.__BASE__ = "/resham-embroidery-store/";</script>')
body = body.replace('<base href="/">', '<base href="/resham-embroidery-store/">')
body = re.sub(r'<script src="[^"]+"></script>\s*', '', body).strip()

settings = dict(seed['settings'])
settings['logo_url'] = 'img/logo.png'
settings['logo_mark_url'] = 'img/logo-mark.png'
settings['favicon_url'] = 'img/favicon.png'
settings.pop('admin_password', None)

designs = []
for d in seed['designs']:
    designs.append({
        'slug': d['slug'], 'name': d['name'], 'hoop': d['hoop'], 'tags': d['tags'],
        'price': d['price'], 'mrp': d['mrp'],
        'discount': d['mrp'] > d['price'] and round(((d['mrp'] - d['price']) / d['mrp']) * 100) or 0,
        'summary': d['summary'], 'description': d['description'],
        'stitchCount': d['stitchCount'], 'widthMm': d['widthMm'], 'heightMm': d['heightMm'],
        'colorCount': d['colorCount'], 'trims': d['trims'], 'threads': d['threads'],
        'sewMinutes': d['sewMinutes'], 'pricePer1k': d['pricePer1k'],
        'preview': f'img/{d["slug"]}.png', 'stitchPreview': f'img/{d["slug"]}-stitch.png',
        'formats': [{'key': f['key'], 'label': f['label'], 'note': f['note']} for f in d['formats'] if f['key'] in DEMO_FORMATS],
        'defaultFormats': [k for k in d['defaultFormats'] if k in DEMO_FORMATS],
        'featured': d['featured'], 'badge': d['badge']
    })

PAGES_BASE = '/resham-embroidery-store/'

def page(seed_settings, seed_designs, files_map, base, inline_assets):
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sandya Emb Designs — machine embroidery designs, instant download</title>
<meta name="description" content="Hand-digitised machine embroidery designs. Choose PES, DST, JEF, EXP or VP3 at checkout, pay by UPI, download instantly.">
<meta name="theme-color" content="#14110e">
{meta_tag}
<link rel="icon" href="{base}img/favicon.png">
<link rel="apple-touch-icon" href="{base}img/favicon.png">
<style>
{css}
</style>
</head>
<body>
{body}
<script>window.__BASE__ = "{base}";</script>
<script>window.__SEED__ = {json.dumps({'settings': seed_settings, 'designs': seed_designs}, ensure_ascii=False)};</script>
<script>window.__FILES__ = {json.dumps(files_map)};</script>
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
"""

# 1. the deployed site: images and machine files as real files under the Pages base
for d in designs:
    d['preview'] = PAGES_BASE + d['preview']
    d['stitchPreview'] = PAGES_BASE + d['stitchPreview']
page_files = {slug: {k: {**v, 'url': PAGES_BASE + v['url']} for k, v in m.items()} for slug, m in files.items()}
page_settings = dict(settings)
for k in ('logo_url', 'logo_mark_url', 'favicon_url'):
    page_settings[k] = PAGES_BASE + page_settings[k].lstrip('/')
(DOCS / 'index.html').write_text(page(page_settings, designs, page_files, PAGES_BASE, False))
(DOCS / '404.html').write_text((DOCS / 'index.html').read_text())
(DOCS / '.nojekyll').write_text('')

# 2. a single file for opening from disk: everything inlined, hash routing
import base64
def data_uri(path):
    return 'data:image/png;base64,' + base64.b64encode(path.read_bytes()).decode()
one = json.loads(json.dumps({'settings': settings, 'designs': designs}))
for d in one['designs']:
    d['preview'] = data_uri(IMG / (d['slug'] + '.png'))
    d['stitchPreview'] = data_uri(IMG / (d['slug'] + '-stitch.png'))
for k in ('logo_url', 'logo_mark_url', 'favicon_url'):
    one['settings'][k] = data_uri(IMG / one['settings'][k].split('/')[-1])
one_files = {slug: {k: {**v, 'url': 'data:application/octet-stream;base64,' + base64.b64encode((ROOT / d['dir'] / v['name']).read_bytes()).decode()}
                    for k, v in m.items()} for (slug, m), d in zip(files.items(), seed['designs'])}
SINGLE = ROOT.parent / 'Sandya-Emb-Designs-Preview.html'
SINGLE.write_text(page(one['settings'], one['designs'], one_files, '/', True))

# search engines: sitemap and robots for the static build
site = 'https://sruthinchess.github.io' + PAGES_BASE.rstrip('/')
pages = ['', 'designs', 'categories', 'offers', 'vip', 'about', 'contact']
lines = ['<?xml version="1.0" encoding="UTF-8"?>',
         '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
for pg in pages:
    lines.append(f'  <url><loc>{site}/{pg}</loc><changefreq>{"daily" if pg == "" else "weekly"}</changefreq><priority>{"1.0" if pg == "" else "0.8"}</priority></url>')
for d in designs:
    lines.append(f'  <url><loc>{site}/design/{d["slug"]}</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>')
lines.append('</urlset>')
(DOCS / 'sitemap.xml').write_text('\n'.join(lines))
(DOCS / 'robots.txt').write_text('User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n\nSitemap: ' + site + '/sitemap.xml\n')

size = (DOCS / 'index.html').stat().st_size
imgs = sum(f.stat().st_size for f in IMG.glob('*.png'))
fls = sum(f.stat().st_size for f in FILES.rglob('*') if f.is_file())
print(f'docs/index.html {size/1024:.0f} KB · img {imgs/1024/1024:.1f} MB · files {fls/1024/1024:.1f} MB · {len(designs)} designs')
print(f'single file {SINGLE.stat().st_size/1024/1024:.1f} MB → {SINGLE}')

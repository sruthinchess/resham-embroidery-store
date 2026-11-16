'use strict';
/** Emits the catalogue + per-format files as JSON for the single-file static build. */
const fs = require('fs');
const path = require('path');
const E = require('../src/embroidery.js');
const seed = require('../src/data/designs.json');

const MIME = { dst: 'application/octet-stream', exp: 'application/octet-stream', svg: 'image/svg+xml', png: 'image/png', pdf: 'application/pdf' };
const settings = { ...seed.settings };
delete settings.admin_password;

const designs = [];
const files = {};
for (const d of seed.designs) {
  const geo = E.build(d);
  const price = d.price, mrp = d.mrp || d.price;
  designs.push({
    slug: d.slug, name: d.name, motif: d.motif, hoop: d.hoop, tags: d.tags || [],
    price, mrp, discount: mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0,
    summary: d.summary, description: d.description,
    colors: d.colors, colorCount: geo.colors.length,
    stitchCount: geo.stitches.length,
    widthMm: Math.round(geo.width) / 10, heightMm: Math.round(geo.height) / 10,
    preview: E.toSvgPreview(geo),
    formats: Object.keys(E.FORMATS),
    featured: d.featured ? 1 : 0, badge: d.badge || null
  });
  const packed = {
    dst: E.toDst(geo), exp: E.toExp(geo), svg: Buffer.from(E.toSvg(geo), 'utf8'),
    png: E.toPng(geo, 720), pdf: E.toPdf(geo, d, ['DST', 'EXP', 'SVG', 'PNG', 'PDF'])
  };
  files[d.slug] = {};
  for (const [k, buf] of Object.entries(packed)) files[d.slug][k] = `data:${MIME[k]};base64,${buf.toString('base64')}`;
}

const out = { settings, designs, files };
fs.mkdirSync(path.join(__dirname, '..', 'build'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'build', 'assets.json'), JSON.stringify(out));
const bytes = fs.statSync(path.join(__dirname, '..', 'build', 'assets.json')).size;
console.log('assets.json', (bytes / 1024).toFixed(0), 'KB ·', designs.length, 'designs');

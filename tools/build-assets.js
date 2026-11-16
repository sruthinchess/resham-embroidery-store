'use strict';
/** Emits catalogue + per-format files (data URIs) for the single-file static build. */
const fs = require('fs');
const path = require('path');
const P = require('../src/pack.js');

const ROOT = path.join(__dirname, '..');
const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/designs.json'), 'utf8'));
const POPULAR = ['pes', 'dst', 'jef', 'exp', 'vp3', 'hus', 'xxx', 'sew', 'pec'];
const MIME = { png: 'image/png', pes: 'application/octet-stream', dst: 'application/octet-stream' };

const designs = [];
const files = {};
for (const d of seed.designs) {
  // the demo build carries the common formats; the server has all 24
  const formats = d.formats.filter(f => POPULAR.includes(f.key));
  const asData = name => {
    const f = path.join(ROOT, 'build', 'img', name);
    return fs.existsSync(f) ? `data:image/png;base64,${fs.readFileSync(f).toString('base64')}` : null;
  };
  const preview = asData(`${d.slug}.png`);
  const stitchPreview = asData(`${d.slug}-stitch.png`);
  designs.push({
    slug: d.slug, name: d.name, hoop: d.hoop, tags: d.tags, price: d.price, mrp: d.mrp,
    discount: d.mrp > d.price ? Math.round(((d.mrp - d.price) / d.mrp) * 100) : 0,
    summary: d.summary, description: d.description,
    stitchCount: d.stitchCount, widthMm: d.widthMm, heightMm: d.heightMm,
    colorCount: d.colorCount, trims: d.trims, threads: d.threads,
    sewMinutes: d.sewMinutes, pricePerColour: d.pricePerColour,
    preview, stitchPreview, formats: formats.map(f => ({ key: f.key, label: f.label, note: f.note })),
    defaultFormats: d.defaultFormats.filter(k => formats.some(f => f.key === k)),
    featured: d.featured ? 1 : 0, badge: d.badge || null
  });
  files[d.slug] = {};
  for (const f of formats) {
    const abs = path.join(ROOT, d.dir, f.file);
    if (!fs.existsSync(abs)) continue;
    files[d.slug][f.key] = { name: f.file, data: `data:${MIME[f.key] || 'application/octet-stream'};base64,${fs.readFileSync(abs).toString('base64')}` };
  }
}

fs.mkdirSync(path.join(ROOT, 'build'), { recursive: true });
const asData = name => {
  const f = path.join(ROOT, 'build', 'img', name);
  return fs.existsSync(f) ? `data:image/png;base64,${fs.readFileSync(f).toString('base64')}` : null;
};
const payload = { settings: { ...seed.settings }, designs, files };
payload.settings.logo_url = asData('logo.png') || payload.settings.logo_url;
payload.settings.logo_mark_url = asData('logo-mark.png') || payload.settings.logo_mark_url;
payload.settings.favicon_url = asData('favicon.png') || payload.settings.favicon_url;
delete payload.settings.admin_password;
fs.writeFileSync(path.join(ROOT, 'build', 'assets.json'), JSON.stringify(payload));
console.log('assets.json', (fs.statSync(path.join(ROOT, 'build', 'assets.json')).size / 1024).toFixed(0), 'KB ·', designs.length, 'designs ·',
  designs.reduce((s, d) => s + d.formats.length, 0), 'format files embedded');

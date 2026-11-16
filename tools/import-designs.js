'use strict';
/**
 * Imports real design packs (a folder per design, each with 24 machine formats,
 * a stitch preview and a README) into the store.
 *
 *   node tools/import-designs.js <pack-dir> [<pack-dir> ...]
 *
 * For every design folder it:
 *   - copies the format files to src/designs/<slug>/
 *   - copies the stitch preview to public/img/<slug>.png
 *   - reads the README for size / stitch count / colours / hoop / thread list
 *   - parses the .DST itself and checks the readme against the binary
 *   - rewrites src/data/designs.json
 *
 * Re-runnable: the catalogue is rebuilt from scratch each time.
 */
const fs = require('fs');
const path = require('path');
const { readDst } = require('../src/dst.js');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'src', 'designs');
const IMG_DIR = path.join(ROOT, 'public', 'img');

const PRICES = {
  'floral-spray': { price: 699, mrp: 1199, featured: 1, badge: 'Bestseller', tags: ['floral', 'botanical', 'hoop'] },
  'blue-blossom': { price: 649, mrp: 999, featured: 1, badge: null, tags: ['floral', 'hoop', 'cushion'] },
  'magnolia-branch': { price: 749, mrp: 1199, featured: 0, badge: null, tags: ['floral', 'botanical', 'border'] },
  'silhouette-10': { price: 399, mrp: 699, featured: 0, badge: 'New', tags: ['sport', 'jersey', 'kids'] }
};

const COPY = {
  'floral-spray': 'A five-flower spray — green stem and leaves, a purple bell, a teal bloom, a salmon bloom and a white linework layer. Tatami fill at 0.4 mm with an edge-run underlay under every shape; 366 trims keep the layers clean on medium-weight woven fabric.',
  'blue-blossom': 'A five-petal blossom with a blue gradient and a yellow centre. Three thread changes, only 33 trims, and a soft tatami fill — the quickest sew of the four and the easiest to place on a cushion or a placket.',
  'magnolia-branch': 'A magnolia branch: pink flowers, olive leaves and a dark outline that holds the shape together. Tall and narrow, so it sits well on a kurta placket, a stole end or a sleeve.',
  'silhouette-10': 'A single-colour silhouette figure holding the number 10 — one thread, ten trims, 3,111 stitches. Made for jerseys, caps and bags where a clean solid shape is the whole point.'
};

const FORMAT_NOTE = {
  pes: 'Brother · Babylock · Bernina', dst: 'Tajima — commercial standard', jef: 'Janome', exp: 'Melco · Bernina',
  vp3: 'Pfaff · Husqvarna Viking', hus: 'Husqvarna', xxx: 'Singer', sew: 'Janome (older)', pec: 'Brother colour file',
  dsb: 'Barudan', dsz: 'ZSK', zxy: 'ZSK', emd: 'Elna · Melco', gt: 'Gold Thread', inb: 'Inbro', new: 'NEC · New Home',
  jpx: 'Janome JPX', pcd: 'Pfaff PCD', pcm: 'Pfaff PCM', pcq: 'Pfaff Creative MAXI', pcs: 'Pfaff (large hoop)',
  stx: 'Data Stitch', tap: 'Happy', tbf: 'Tajima blocks', u01: 'Barudan'
};
const POPULAR = ['pes', 'dst', 'jef', 'exp', 'vp3', 'hus', 'xxx', 'sew'];

function parseReadme(txt) {
  const num = re => { const m = txt.match(re); return m ? Number(m[1].replace(/[,\s]/g, '')) : null; };
  const size = txt.match(/Finished size\s*:\s*([\d.]+)\s*mm\s*x\s*([\d.]+)\s*mm/i);
  const threads = [];
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*\d+\.\s*(.*?)\s*(#[0-9a-f]{6})\s+(\d+)\s+stitches/i);
    if (m) threads.push({ name: m[1].trim(), hex: m[2].toLowerCase(), stitches: Number(m[3]) });
  }
  const formats = [];
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s{2}([A-Z]{3})\s{2,}(.+)$/);
    if (m && FORMAT_NOTE[m[1].toLowerCase()]) formats.push({ key: m[1].toLowerCase(), note: m[2].trim() });
  }
  const artwork = (txt.match(/Artwork\s*:\s*(.+)/i) || [])[1] || '';
  return {
    widthMm: size ? Number(size[1]) : null,
    heightMm: size ? Number(size[2]) : null,
    stitchCount: num(/Stitch count\s*:\s*([\d,]+)/i),
    colors: num(/(?:Colours|Thread colours)\s*:\s*(\d+)/i),
    trims: num(/Trims\s*:\s*(\d+)/i),
    hoop: (() => {
      const line = (txt.match(/Fits hoop\s*:\s*(.+)/i) || [])[1] || '';
      const inch = line.match(/\(([^)]*in)\)/i);
      return inch ? inch[1].replace(/\s*x\s*/i, ' × ') : line.replace(/\s*or larger/i, '');
    })(),
    artwork, threads, formats
  };
}

const titleise = s => s.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
const slugify = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const designs = [];
const packs = process.argv.slice(2);
if (!packs.length) { console.error('usage: node tools/import-designs.js <pack-dir> [...]'); process.exit(1); }

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(IMG_DIR, { recursive: true });

for (const pack of packs) {
  const base = path.resolve(pack);
  for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(base, entry.name);
    const files = fs.readdirSync(dir);
    const readmeName = files.find(f => /^readme/i.test(f));
    if (!readmeName) { console.log('skip (no readme):', entry.name); continue; }

    const slug = slugify(entry.name);
    const meta = parseReadme(fs.readFileSync(path.join(dir, readmeName), 'utf8'));
    const dstName = files.find(f => f.toLowerCase().endsWith('.dst'));
    const check = dstName ? readDst(fs.readFileSync(path.join(dir, dstName))) : null;

    // copy the design folder, keeping the pack's own filenames
    const dest = path.join(OUT_DIR, slug);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });
    const formatFiles = [];
    for (const f of files) {
      const ext = path.extname(f).toLowerCase().replace('.', '');
      if (!FORMAT_NOTE[ext]) continue;                       // formats only, not the pngs
      fs.copyFileSync(path.join(dir, f), path.join(dest, f));
      formatFiles.push({ key: ext, file: f, bytes: fs.statSync(path.join(dest, f)).size });
    }
    const readmeOut = path.join(dest, 'README.txt');
    fs.copyFileSync(path.join(dir, readmeName), readmeOut);

    // stitch preview → public/img
    const previewName = files.find(f => /stitch-preview\.png$/i.test(f)) || files.find(f => /\.png$/i.test(f));
    if (previewName) fs.copyFileSync(path.join(dir, previewName), path.join(IMG_DIR, `${slug}.png`));

    const p = PRICES[slug] || { price: 499, mrp: 899, featured: 0, badge: null, tags: ['floral'] };
    const formats = formatFiles
      .map(f => ({ key: f.key, label: f.key.toUpperCase(), note: (meta.formats.find(x => x.key === f.key) || {}).note || FORMAT_NOTE[f.key] || '', file: f.file, bytes: f.bytes }))
      .sort((a, b) => {
        const ia = POPULAR.indexOf(a.key), ib = POPULAR.indexOf(b.key);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.key.localeCompare(b.key);
      });

    designs.push({
      slug,
      name: titleise(entry.name),
      source: 'pack',
      dir: `src/designs/${slug}`,
      previewImg: `img/${slug}.png`,
      price: p.price, mrp: p.mrp, badge: p.badge, featured: p.featured, tags: p.tags,
      summary: (COPY[slug] || meta.artwork || '').split('. ')[0] + '.',
      description: COPY[slug] || '',
      hoop: meta.hoop, stitchCount: meta.stitchCount, widthMm: meta.widthMm, heightMm: meta.heightMm,
      colorCount: meta.colors, trims: meta.trims, threads: meta.threads,
      formats,
      defaultFormats: formats.filter(f => ['pes', 'dst', 'jef', 'exp'].includes(f.key)).map(f => f.key)
    });

    const ok = !check || Math.abs(check.stitches - meta.stitchCount) / meta.stitchCount < 0.08;
    console.log(
      `${slug.padEnd(18)} ${String(meta.stitchCount).padStart(5)} stitches  ` +
      `${meta.widthMm}×${meta.heightMm}mm  ${meta.colors}c  ${meta.trims} trims  ` +
      `${formats.length} formats  dst-check:${check ? `${check.stitches} ${ok ? 'ok' : 'MISMATCH'}` : 'n/a'}`
    );
  }
}

const out = { settings: JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/settings.json'), 'utf8')), designs };
fs.writeFileSync(path.join(ROOT, 'src/data/designs.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`\nwrote src/data/designs.json — ${designs.length} designs`);

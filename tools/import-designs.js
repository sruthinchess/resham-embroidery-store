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
const crypto = require('crypto');
const path = require('path');
const { readDst } = require('../src/dst.js');

const ROOT = path.join(__dirname, '..');
const P = require('../src/pack.js');
const SETTINGS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src/data/settings.json'), 'utf8'));
const RATE = Number(SETTINGS.price_per_1k_stitches || 50);
const MIN = Number(SETTINGS.min_price || 60);
const MAX = Number(SETTINGS.max_price || 500);
/** price = stitches / 1000 x rate, kept inside the shop's floor and ceiling */
const priceFor = stitches => Math.max(MIN, Math.min(MAX, Math.ceil((stitches || 0) / 1000) * RATE));
const OUT_DIR = path.join(ROOT, 'src', 'designs');
const IMG_DIR = path.join(ROOT, 'public', 'img');

const CHRISTMAS = new Set(['folk-floral-ornament', 'folk-floral-round', 'crocus-spray', 'autumn-wreath', 'ornament-mandala', 'teal-damask', 'ornamental-spray',
  'damask-ornament', 'pinwheel-burst', 'midnight-floral', 'floral-sprig', 'tulip', 'koi-yinyang',
  'red-bird', 'yellow-bird', 'blue-bird-logo', 'squirrel', 'snow']);

const META = {
  'floral-spray': { featured: 1, badge: 'Bestseller', tags: ['floral', 'botanical', 'hoop'] },
  'blue-blossom': { featured: 1, badge: null, tags: ['floral', 'hoop', 'cushion'] },
  'magnolia-branch': { featured: 0, badge: null, tags: ['floral', 'botanical', 'border'] },
  'silhouette-10': { featured: 0, badge: null, tags: ['sport', 'jersey', 'kids'] },
  'folk-floral-spray': { featured: 1, badge: 'New', tags: ['floral', 'folk', 'hoop'] },
  'gamer-wordmark': { featured: 0, badge: null, tags: ['wordmark', 'jersey', 'kids'] },
  'jai-shree-ram': { featured: 1, badge: 'New', tags: ['devotional', 'portrait', 'hoop'] },
  'peony-bloom': { featured: 1, badge: 'Couture', tags: ['floral', 'peony', 'cushion'] },
  'blue-bouquet': { featured: 1, badge: 'New', tags: ['floral', 'bouquet', 'hoop'] },
  'eight-petal-star': { featured: 0, badge: null, tags: ['geometric', 'star', 'hoop'] },
  'football-trophy': { featured: 0, badge: null, tags: ['sport', 'trophy', 'jersey'] },
  'hibiscus-red': { featured: 1, badge: null, tags: ['floral', 'hibiscus', 'cushion'] },
  'mitsudomoe-symbol': { featured: 0, badge: null, tags: ['symbol', 'geometric', 'kids'] },
  'panda-cub': { featured: 0, badge: 'New', tags: ['animal', 'kids', 'jersey'] },
  'rama-medallion': { featured: 1, badge: null, tags: ['devotional', 'medallion', 'hoop'] },
  'seven-logo': { featured: 0, badge: null, tags: ['wordmark', 'jersey', 'kids'] },
  'soccer-ball-motion': { featured: 0, badge: null, tags: ['sport', 'football', 'jersey'] },
  'amber-blossoms': { featured: 1, badge: 'New', tags: ['floral', 'amber', 'hoop'] },
  'camellia-bouquet': { featured: 1, badge: 'New', tags: ['floral', 'bouquet', 'cushion'] },
  'cherry-blossom-branch': { featured: 0, badge: 'New', tags: ['floral', 'branch', 'border'] },
  'damask-ornament': { featured: 0, badge: null, tags: ['ornament', 'damask', 'home'] },
  'golden-peacock': { featured: 1, badge: 'Couture', tags: ['peacock', 'bridal', 'hoop'] },
  'mickey-badge': { featured: 0, badge: null, tags: ['character', 'kids', 'jersey'] },
  'peacock-folk-art': { featured: 0, badge: null, tags: ['peacock', 'folk', 'cushion'] },
  'red-black-folk': { featured: 0, badge: null, tags: ['folk', 'geometric', 'jersey'] },
  'seven-halftone': { featured: 0, badge: null, tags: ['wordmark', 'sport', 'jersey'] },
  'soccer-flame-ball': { featured: 0, badge: null, tags: ['sport', 'football', 'jersey'] },
  'adiyogi-portrait': { featured: 1, badge: 'New', tags: ['devotional', 'portrait', 'hoop'] },
  'apple-mark': { featured: 0, badge: 'New', tags: ['wordmark', 'logo', 'jersey'] },
  'autumn-wreath': { featured: 1, badge: 'New', tags: ['floral', 'wreath', 'home'] },
  'bmw-roundel': { featured: 0, badge: 'New', tags: ['logo', 'motorsport', 'jersey'] },
  'durga-eyes': { featured: 1, badge: 'New', tags: ['devotional', 'durga', 'hoop'] },
  'geo-peacock': { featured: 0, badge: 'New', tags: ['peacock', 'geometric', 'cushion'] },
  'green-parrot': { featured: 0, badge: 'New', tags: ['bird', 'parrot', 'kids'] },
  'magenta-pinwheel': { featured: 0, badge: 'New', tags: ['geometric', 'pinwheel', 'kids'] },
  'panda-wave': { featured: 1, badge: 'New', tags: ['animal', 'kids', 'jersey'] },
  'diya-lamp': { featured: 1, badge: 'New', tags: ['devotional', 'diya', 'hoop'] },
  'durga-trishul': { featured: 0, badge: 'New', tags: ['devotional', 'trishul', 'jersey'] },
  'krishna-flute': { featured: 1, badge: 'New', tags: ['devotional', 'krishna', 'hoop'] },
  'krishna-profile': { featured: 0, badge: 'New', tags: ['devotional', 'krishna', 'cushion'] },
  'om-badge': { featured: 1, badge: 'New', tags: ['devotional', 'om', 'jersey'] },
  'peacock-feather': { featured: 0, badge: 'New', tags: ['peacock', 'feather', 'border'] },
  'adidas-logo': { featured: 0, badge: 'New', tags: ['logo', 'sport', 'jersey'] },
  'dragon-sword': { featured: 0, badge: 'New', tags: ['fantasy', 'dragon', 'jersey'] },
  'dripping-heart': { featured: 0, badge: 'New', tags: ['heart', 'street', 'jersey'] },
  'gada-hand': { featured: 0, badge: 'New', tags: ['devotional', 'gada', 'hoop'] },
  'krishna-face': { featured: 1, badge: 'New', tags: ['devotional', 'krishna', 'hoop'] },
  'namam-gold': { featured: 1, badge: 'New', tags: ['devotional', 'namam', 'hoop'] },
  'shanku-chakra': { featured: 0, badge: 'New', tags: ['devotional', 'symbol', 'jersey'] },
  'trishul-outline': { featured: 0, badge: 'New', tags: ['devotional', 'trishul', 'border'] },
  'trishul-shiv': { featured: 0, badge: 'New', tags: ['devotional', 'trishul', 'jersey'] },
  'vaishnava-trio': { featured: 1, badge: 'New', tags: ['devotional', 'vaishnava', 'hoop'] },
  'adidas-trefoil': { featured: 0, badge: 'New', tags: ['logo', 'sport', 'jersey'] },
  'dollar-at': { featured: 0, badge: 'New', tags: ['logo', 'street', 'jersey'] },
  'ganesha-flame': { featured: 1, badge: 'New', tags: ['devotional', 'ganesha', 'hoop'] },
  'ganesha-monogram': { featured: 0, badge: 'New', tags: ['devotional', 'ganesha', 'cushion'] },
  'gap-letters': { featured: 0, badge: 'New', tags: ['logo', 'wordmark', 'jersey'] },
  'maa-heart': { featured: 1, badge: 'New', tags: ['devotional', 'maa', 'hoop'] },
  'pinwheel-burst': { featured: 0, badge: 'New', tags: ['geometric', 'pinwheel', 'kids'] },
  'ram-sita': { featured: 1, badge: 'New', tags: ['devotional', 'ram', 'hoop'] },
  'shiv-triskel': { featured: 0, badge: 'New', tags: ['devotional', 'shiv', 'jersey'] },
  'trishul-damaru': { featured: 0, badge: 'New', tags: ['devotional', 'trishul', 'border'] },
  'durga-linework': { featured: 1, badge: 'New', tags: ['devotional', 'durga', 'hoop'] },
  'floral-sprig': { featured: 0, badge: 'New', tags: ['floral', 'sprig', 'border'] },
  'mahadev-silhouette': { featured: 1, badge: 'New', tags: ['devotional', 'mahadev', 'jersey'] },
  'mickey-color-peek': { featured: 0, badge: 'New', tags: ['character', 'kids', 'jersey'] },
  'mickey-peek': { featured: 0, badge: 'New', tags: ['character', 'kids', 'jersey'] },
  'midnight-floral': { featured: 1, badge: 'New', tags: ['floral', 'cushion', 'hoop'] },
  'ornament-mandala': { featured: 0, badge: 'New', tags: ['mandala', 'ornament', 'home'] },
  'shanku-namam-chakra': { featured: 0, badge: 'New', tags: ['devotional', 'symbol', 'jersey'] },
  'sun-flame': { featured: 0, badge: 'New', tags: ['geometric', 'sun', 'jersey'] },
  'blossom-girl': { featured: 1, badge: 'New', tags: ['character', 'kids', 'hoop'] },
  'koi-yinyang': { featured: 0, badge: 'New', tags: ['symbol', 'koi', 'cushion'] },
  'om-sunburst': { featured: 0, badge: 'New', tags: ['devotional', 'om', 'jersey'] },
  'pumpkin-lantern': { featured: 0, badge: 'New', tags: ['halloween', 'kids', 'cushion'] },
  'red-bird': { featured: 0, badge: 'New', tags: ['bird', 'kids', 'jersey'] },
  'spider-chibi': { featured: 0, badge: 'New', tags: ['character', 'kids', 'jersey'] },
  'tweety-bird': { featured: 0, badge: 'New', tags: ['bird', 'kids', 'jersey'] },
  'yellow-bird': { featured: 0, badge: 'New', tags: ['bird', 'kids', 'jersey'] },
  'blue-bird-logo': { featured: 0, badge: 'New', tags: ['logo', 'bird', 'jersey'] },
  'ghost-headphones': { featured: 0, badge: 'New', tags: ['character', 'kids', 'jersey'] },
  'lingam-trishul': { featured: 1, badge: 'New', tags: ['devotional', 'shiv', 'hoop'] },
  'mahadev-word': { featured: 0, badge: 'New', tags: ['devotional', 'mahadev', 'jersey'] },
  'ornamental-spray': { featured: 0, badge: 'New', tags: ['floral', 'ornament', 'cushion'] },
  'ram-archer': { featured: 1, badge: 'New', tags: ['devotional', 'ram', 'hoop'] },
  'sasuke-chibi': { featured: 0, badge: 'New', tags: ['character', 'kids', 'jersey'] },
  'squirrel': { featured: 0, badge: 'New', tags: ['animal', 'kids', 'hoop'] },
  'teal-damask': { featured: 0, badge: 'New', tags: ['damask', 'ornament', 'home'] },
  'tulip': { featured: 0, badge: 'New', tags: ['floral', 'tulip', 'hoop'] },
  'crocus-spray': { featured: 0, badge: 'New', tags: ['floral', 'crocus', 'hoop'] },
  'folk-floral-round': { featured: 1, badge: 'New', tags: ['folk', 'floral', 'cushion'] },
  'folk-floral-tall': { featured: 0, badge: 'New', tags: ['folk', 'floral', 'border'] },
  'krishna-silhouette': { featured: 1, badge: 'New', tags: ['devotional', 'krishna', 'jersey'] },
  'navy-soccer-ball': { featured: 0, badge: 'New', tags: ['sport', 'football', 'jersey'] },
  'om-symbol': { featured: 0, badge: 'New', tags: ['devotional', 'om', 'hoop'] },
  'penguin-balloons': { featured: 0, badge: 'New', tags: ['animal', 'kids', 'jersey'] },
  'star-shield': { featured: 0, badge: 'New', tags: ['crest', 'sport', 'jersey'] },
  'straw-hat-pirate': { featured: 0, badge: 'New', tags: ['character', 'kids', 'jersey'] },
  'blue-floral-spray': { featured: 1, badge: 'New', tags: ['floral', 'spray', 'cushion'] },
  'lotus-bloom': { featured: 1, badge: 'New', tags: ['floral', 'lotus', 'hoop'] },
  'pikachu-peek': { featured: 0, badge: 'New', tags: ['character', 'kids', 'jersey'] },
  'shiva-portrait': { featured: 1, badge: 'New', tags: ['devotional', 'shiva', 'hoop'] },
  'cliff-silhouette': { featured: 0, badge: 'New', tags: ['landscape', 'silhouette', 'jersey'] },
  'folk-floral-ornament': { featured: 1, badge: 'New', tags: ['folk', 'floral', 'cushion'] },
  'leaf-swirl-symbol': { featured: 0, badge: 'New', tags: ['symbol', 'leaf', 'hoop'] },
  'love-heart': { featured: 0, badge: 'New', tags: ['heart', 'love', 'jersey'] },
  'om-trishul': { featured: 1, badge: 'New', tags: ['devotional', 'om', 'hoop'] },
  'purple-elephant': { featured: 1, badge: 'New', tags: ['animal', 'elephant', 'cushion'] },
  'royal-elephant': { featured: 0, badge: 'New', tags: ['animal', 'elephant', 'hoop'] },
  'family-script': { featured: 0, badge: 'New', tags: ['wordmark', 'family', 'cushion'] },
  'happy-birthday-script': { featured: 0, badge: 'New', tags: ['wordmark', 'celebration', 'cushion'] },
  'honda-wing': { featured: 0, badge: 'New', tags: ['logo', 'motorsport', 'jersey'] },
  'king-crest': { featured: 0, badge: 'New', tags: ['crest', 'crown', 'jersey'] },
  'lion-s-monogram': { featured: 0, badge: 'New', tags: ['monogram', 'lion', 'cushion'] },
  'ornate-crown': { featured: 1, badge: 'New', tags: ['crown', 'ornament', 'hoop'] },
  'pikachu-wordmark': { featured: 0, badge: 'New', tags: ['wordmark', 'kids', 'jersey'] },
  'royatly-script': { featured: 0, badge: 'New', tags: ['wordmark', 'script', 'cushion'] },
  'star-crown-s': { featured: 0, badge: 'New', tags: ['monogram', 'crown', 'jersey'] },
  'toyota-logo': { featured: 0, badge: 'New', tags: ['logo', 'motorsport', 'jersey'] }
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
      if (!FORMAT_NOTE[ext] || !P.MAIN.includes(ext)) continue;   // main formats only
      fs.copyFileSync(path.join(dir, f), path.join(dest, f));
      formatFiles.push({ key: ext, file: f, bytes: fs.statSync(path.join(dest, f)).size });
    }
    const readmeOut = path.join(dest, 'README.txt');
    fs.copyFileSync(path.join(dir, readmeName), readmeOut);

    // images: the clean artwork is the shop image, the stitch-out is the proof
    const artName = files.find(f => /-transparent\.png$/i.test(f));
    const stitchName = files.find(f => /-stitch-preview\.png$/i.test(f));
    const shrink = (src, out, max, colors) => {
      try {
        require('child_process').execFileSync('python3',
          [path.join(__dirname, 'prepare-images.py'), src, out, String(max), String(colors)], { stdio: 'ignore' });
      } catch { fs.copyFileSync(src, out); }
    };
    if (artName) shrink(path.join(dir, artName), path.join(IMG_DIR, `${slug}.png`), 720, 96);
    if (stitchName) shrink(path.join(dir, stitchName), path.join(IMG_DIR, `${slug}-stitch.png`), 800, 128);

    const p = META[slug] || { featured: 0, badge: null, tags: ['floral'] };
    const price = priceFor(meta.stitchCount || 0);
    const mrp = Math.round(price * 1.7);
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
      stitchImg: stitchName ? `img/${slug}-stitch.png` : null,
      price, mrp, pricePer1k: RATE, badge: p.badge, featured: p.featured,
      tags: CHRISTMAS.has(slug) ? [...p.tags, 'christmas'] : p.tags,
      sewMinutes: Math.max(1, Math.round((meta.stitchCount || 0) / 700)),
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
// every count in the file we are about to write must match its DST
let mismatched = 0;
for (const d of designs) {
  const dst = (d.formats || []).find(f => f.key === 'dst');
  const m = readDst(fs.readFileSync(path.join(ROOT, d.dir, dst.file)));
  if (m.stitches !== d.stitchCount) { mismatched++; console.error(`! ${d.slug}: ${d.stitchCount} vs ${m.stitches}`); }
}
if (mismatched) { console.error(`\nrefusing to write: ${mismatched} designs disagree with their DST files`); process.exit(1); }
console.log(`\nwrote src/data/designs.json — ${designs.length} designs, every stitch count verified against its DST`);

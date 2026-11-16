'use strict';
/**
 * Seeds settings + the design catalogue from src/data/designs.json.
 * The catalogue is produced by tools/import-designs.js from the real packs, so
 * every number here (stitch count, size, trims, formats) comes from the files.
 *
 *   node src/seed.js           -> only if empty
 *   node src/seed.js --force   -> wipe designs + orders and re-seed
 */
const fs = require('fs');
const path = require('path');
const { db, hashPassword, setSetting } = require('./db');

const ROOT = path.join(__dirname, '..');
const seed = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'designs.json'), 'utf8'));

function run() {
  const force = process.argv.includes('--force');
  const count = db.prepare('SELECT COUNT(*) c FROM designs').get().c;
  if (count > 0 && !force) { console.log(`[seed] catalogue already has ${count} designs — skipping`); return; }

  const tx = db.transaction(() => {
    if (force) {
      db.exec(`DELETE FROM download_tokens; DELETE FROM orders; DELETE FROM designs;
               DELETE FROM sqlite_sequence WHERE name IN ('designs','orders');`);
    }
    for (const [k, v] of Object.entries(seed.settings || {})) {
      if (k === 'admin_password') {
        const { hash, salt } = hashPassword(v);
        setSetting('admin_password_hash', hash);
        setSetting('admin_password_salt', salt);
      } else setSetting(k, v);
    }
    const ins = db.prepare(`INSERT OR IGNORE INTO designs
      (slug,name,source,dir,preview_img,stitch_img,price,mrp,summary,description,hoop,stitch_count,width_mm,height_mm,
       color_count,trims,threads,formats,default_formats,tags,featured,badge)
      VALUES (@slug,@name,@source,@dir,@preview_img,@stitch_img,@price,@mrp,@summary,@description,@hoop,@stitch_count,
       @width_mm,@height_mm,@color_count,@trims,@threads,@formats,@default_formats,@tags,@featured,@badge)`);
    for (const d of seed.designs) {
      ins.run({
        slug: d.slug, name: d.name, source: d.source || 'pack', dir: d.dir, preview_img: d.previewImg, stitch_img: d.stitchImg,
        price: d.price, mrp: d.mrp, summary: d.summary, description: d.description, hoop: d.hoop,
        stitch_count: d.stitchCount, width_mm: d.widthMm, height_mm: d.heightMm,
        color_count: d.colorCount, trims: d.trims,
        threads: JSON.stringify(d.threads || []), formats: JSON.stringify(d.formats || []),
        default_formats: JSON.stringify(d.defaultFormats || []), tags: JSON.stringify(d.tags || []),
        featured: d.featured ? 1 : 0, badge: d.badge || null
      });
    }
  });
  tx();
  const n = db.prepare('SELECT COUNT(*) c FROM designs').get().c;
  console.log(`[seed] done — ${n} designs, ${(seed.designs || []).reduce((s, d) => s + (d.formats || []).length, 0)} format files`);
}

run();

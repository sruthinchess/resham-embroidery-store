'use strict';
/**
 * Seeds settings and the design catalogue. Stitch counts, sizes and previews are
 * generated from the real geometry, so the numbers on the page are the numbers
 * in the files.
 *   node src/seed.js           -> only if empty
 *   node src/seed.js --force   -> wipe designs + orders and re-seed
 */
const { db, hashPassword, setSetting } = require('./db');
const E = require('./embroidery');
const seed = require('./data/designs.json');

function run() {
  const force = process.argv.includes('--force');
  const count = db.prepare('SELECT COUNT(*) c FROM designs').get().c;
  if (count > 0 && !force) { console.log(`[seed] catalogue already has ${count} designs — skipping`); return; }

  const tx = db.transaction(() => {
    if (force) {
      db.exec(`DELETE FROM download_tokens; DELETE FROM orders; DELETE FROM designs;
               DELETE FROM sqlite_sequence WHERE name IN ('designs','orders');`);
    }
    for (const [k, v] of Object.entries(seed.settings)) {
      if (k === 'admin_password') {
        const { hash, salt } = hashPassword(v);
        setSetting('admin_password_hash', hash);
        setSetting('admin_password_salt', salt);
      } else setSetting(k, v);
    }
    const ins = db.prepare(`INSERT OR IGNORE INTO designs
      (slug,name,motif,params,colors,price,mrp,summary,description,hoop,stitch_count,width_mm,height_mm,color_count,preview_svg,formats,tags,featured,badge)
      VALUES (@slug,@name,@motif,@params,@colors,@price,@mrp,@summary,@description,@hoop,@stitch_count,@width_mm,@height_mm,@color_count,@preview_svg,@formats,@tags,@featured,@badge)`);
    for (const d of seed.designs) {
      const geo = E.build(d);
      ins.run({
        slug: d.slug, name: d.name, motif: d.motif, params: JSON.stringify(d.params || {}),
        colors: JSON.stringify(d.colors), price: d.price, mrp: d.mrp,
        summary: d.summary, description: d.description, hoop: d.hoop,
        stitch_count: geo.stitches.length,
        width_mm: Math.round(geo.width) / 10, height_mm: Math.round(geo.height) / 10,
        color_count: geo.colors.length,
        preview_svg: E.toSvgPreview(geo),
        formats: JSON.stringify(Object.keys(E.FORMATS)),
        tags: JSON.stringify(d.tags || []),
        featured: d.featured ? 1 : 0, badge: d.badge || null
      });
    }
  });
  tx();
  const n = db.prepare('SELECT COUNT(*) c FROM designs').get().c;
  console.log(`[seed] done — ${n} designs digitised and ready`);
}

run();

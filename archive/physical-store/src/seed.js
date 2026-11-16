'use strict';
/**
 * Seeds the catalogue, coupons, settings and demo reviews.
 *   node src/seed.js           -> seed only if the catalogue is empty
 *   node src/seed.js --force   -> wipe catalogue/orders and re-seed
 */
const { db, hashPassword, setSetting } = require('./db');
const seed = require('./data/seed.json');

function run() {
  const force = process.argv.includes('--force');
  const count = db.prepare('SELECT COUNT(*) c FROM products').get().c;
  if (count > 0 && !force) {
    console.log(`[seed] catalogue already has ${count} products — skipping`);
    return;
  }

  const tx = db.transaction(() => {
    if (force) {
      db.exec(`DELETE FROM order_events; DELETE FROM orders; DELETE FROM reviews; DELETE FROM products;
               DELETE FROM categories; DELETE FROM coupons; DELETE FROM sessions;
               DELETE FROM sqlite_sequence WHERE name IN ('products','categories','coupons','orders','reviews','order_events');`);
    }

    // settings
    for (const [k, v] of Object.entries(seed.settings)) {
      if (k === 'admin_password') {
        const { hash, salt } = hashPassword(v);
        setSetting('admin_password_hash', hash);
        setSetting('admin_password_salt', salt);
        setSetting('admin_password_hint', '6-digit store password (default 252525)');
      } else {
        setSetting(k, v);
      }
    }

    // categories
    const insCat = db.prepare('INSERT OR IGNORE INTO categories(slug,name,icon,description) VALUES(?,?,?,?)');
    const catIds = {};
    for (const c of seed.categories) {
      insCat.run(c.slug, c.name, c.icon, c.description);
      catIds[c.slug] = db.prepare('SELECT id FROM categories WHERE slug=?').get(c.slug).id;
    }

    // products
    const insProd = db.prepare(`INSERT OR IGNORE INTO products
      (slug,name,category_id,price,mrp,stock,description,fabric,colors,sizes,pattern,palette,rating,rating_count,featured,badge)
      VALUES (@slug,@name,@category_id,@price,@mrp,@stock,@description,@fabric,@colors,@sizes,@pattern,@palette,@rating,@rating_count,@featured,@badge)`);
    for (const p of seed.products) {
      insProd.run({
        slug: p.slug, name: p.name, category_id: catIds[p.category] || null,
        price: p.price, mrp: p.mrp, stock: p.stock, description: p.description,
        fabric: p.fabric, colors: JSON.stringify(p.colors || []), sizes: JSON.stringify(p.sizes || []),
        pattern: p.pattern || 'floral', palette: JSON.stringify(p.palette || []),
        rating: p.rating || 0, rating_count: p.rating_count || 0,
        featured: p.featured ? 1 : 0, badge: p.badge || null
      });
    }

    // coupons
    const insCoupon = db.prepare('INSERT OR IGNORE INTO coupons(code,type,value,min_order,max_uses,active) VALUES(?,?,?,?,?,?)');
    for (const c of seed.coupons) insCoupon.run(c.code, c.type, c.value, c.min_order, c.max_uses, c.active ?? 1);

    // demo reviews (approved)
    const insRev = db.prepare('INSERT INTO reviews(product_id,name,rating,title,body,status) VALUES(?,?,?,?,?,?)');
    for (const r of seed.reviews) {
      const p = db.prepare('SELECT id FROM products WHERE slug=?').get(r.product);
      if (p) insRev.run(p.id, r.name, r.rating, r.title, r.body, 'approved');
    }
  });

  tx();
  const n = db.prepare('SELECT COUNT(*) c FROM products').get().c;
  console.log(`[seed] done — ${n} products, ${seed.categories.length} categories, ${seed.coupons.length} coupons`);
}

run();

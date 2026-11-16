'use strict';
/**
 * Resham Atelier — API server.
 * Embroidery designs: format selection → UPI payment → screenshot proof →
 * auto-confirm → the ZIP is generated on the fly with exactly the formats bought.
 */
const path = require('path');
const fs = require('fs');
const express = require('express');
const D = require('./src/db');
const P = require('./src/pack');
const { db, UPLOAD_DIR, hashPassword, verifyPassword, token, getSetting, setSetting, settingsMap } = D;

const app = express();
const PORT = process.env.PORT || 3000;
const PUB = path.join(__dirname, 'public');

app.use(express.json({ limit: '16mb' }));

const ok = (res, data) => res.json({ ok: true, ...(data || {}) });
const fail = (res, code, message) => res.status(code).json({ ok: false, error: message });
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const money2 = n => (Math.round(Number(n) * 100) / 100).toFixed(2);
const jparse = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
const nowISO = () => new Date().toISOString();
const slugify = s => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70);

const FORMAT_KEYS = Object.keys(P.FORMATS);

function designOut(row) {
  if (!row) return null;
  const price = row.price, mrp = row.mrp || row.price;
  const formats = jparse(row.formats, []);
  return {
    id: row.id, slug: row.slug, name: row.name, source: row.source,
    price, mrp, discount: mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0,
    summary: row.summary, description: row.description, hoop: row.hoop,
    stitchCount: row.stitch_count, widthMm: row.width_mm, heightMm: row.height_mm,
    colorCount: row.color_count, trims: row.trims,
    threads: jparse(row.threads, []),
    preview: row.preview_img ? `/${row.preview_img}` : null,
    formats: formats.map(f => ({ key: f.key, label: f.label || (P.FORMATS[f.key] || {}).label || f.key.toUpperCase(),
      note: f.note || (P.FORMATS[f.key] || {}).note || '', bytes: f.bytes || 0 })),
    defaultFormats: jparse(row.default_formats, []),
    tags: jparse(row.tags, []), featured: !!row.featured, badge: row.badge,
    downloads: row.downloads, active: !!row.active, createdAt: row.created_at
  };
}

function upiPayload(code, amount) {
  const pa = getSetting('upi_id', '6301928345@fam');
  const pn = getSetting('payee_name', 'Resham Atelier');
  // hand-built: UPI apps expect pa=name@bank un-encoded, free text is escaped
  const link = `upi://pay?pa=${pa}&pn=${encodeURIComponent(pn)}&am=${money2(amount)}&cu=INR&tn=${encodeURIComponent(code)}&tr=${encodeURIComponent(code)}`;
  return { id: pa, payee: pn, amount: money2(amount), currency: 'INR', link };
}

function linksFor(order, fresh = true) {
  const items = jparse(order.items, []);
  const hours = num(getSetting('link_hours', 72), 72);
  return items.map(it => {
    let row = fresh ? null : db.prepare('SELECT * FROM download_tokens WHERE order_id=? AND design_id=?').get(order.id, it.designId);
    if (!row) {
      const t = token();
      const exp = new Date(Date.now() + hours * 3600 * 1000).toISOString();
      db.prepare('INSERT INTO download_tokens(token,order_id,design_id,formats,expires_at) VALUES(?,?,?,?,?)')
        .run(t, order.id, it.designId, JSON.stringify(it.formats || []), exp);
      row = db.prepare('SELECT * FROM download_tokens WHERE token=?').get(t);
    }
    return {
      designId: it.designId, name: it.name, formats: jparse(row.formats, []),
      fileName: `${String(it.slug).toUpperCase()}-${jparse(row.formats, []).join('+').toUpperCase()}.zip`,
      token: row.token, url: `/api/download/${row.token}`,
      expiresAt: row.expires_at, expired: !!(row.expires_at && new Date(row.expires_at) < new Date())
    };
  });
}

function orderOut(row, opts = {}) {
  if (!row) return null;
  const out = {
    id: row.id, code: row.code, name: row.name, email: row.email, phone: row.phone,
    items: jparse(row.items, []), amount: row.amount, status: row.status, note: row.note,
    upiRef: row.upi_ref, hasProof: !!row.screenshot,
    createdAt: row.created_at, paidAt: row.paid_at,
    upi: row.status === 'awaiting' ? upiPayload(row.code, row.amount) : null
  };
  if (opts.withLinks && row.status === 'paid') out.downloads = linksFor(row, false);
  if (opts.admin) {
    out.screenshotUrl = row.screenshot
      ? `/api/admin/screenshot/${row.code}${opts.token ? '?t=' + encodeURIComponent(opts.token) : ''}`
      : null;
  }
  return out;
}

/* ------------------------------------------------------------------- auth */
function bearer(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7).trim();
  return req.headers['x-admin-token'] || null;
}
function isAdmin(req) {
  const t = bearer(req) || req.query.t;
  return !!(t && db.prepare('SELECT 1 FROM admin_sessions WHERE token=?').get(t));
}
function requireAdmin(req, res, next) {
  if (!isAdmin(req)) return fail(res, 401, 'Admin session expired — sign in again.');
  next();
}

/* ----------------------------------------------------------------- public */
app.get('/api/health', (req, res) => ok(res, { service: 'resham-designs', time: nowISO() }));

app.get('/api/settings', (req, res) => {
  const s = settingsMap();
  ok(res, { settings: {
    store_name: s.store_name, tagline: s.tagline, announcement: s.announcement,
    support_email: s.support_email, upi_id: s.upi_id, payee_name: s.payee_name,
    link_hours: num(s.link_hours, 72), auto_approve: s.auto_approve === '1'
  } });
});

app.get('/api/formats', (req, res) => {
  ok(res, { formats: FORMAT_KEYS.map(k => ({ key: k, ...P.FORMATS[k], popular: P.POPULAR.includes(k) })) });
});

app.get('/api/designs', (req, res) => {
  const { q, tag, sort = 'featured', featured } = req.query;
  const where = ['active = 1'];
  const params = {};
  if (featured === '1') where.push('featured = 1');
  if (q) { where.push('(name LIKE @q OR summary LIKE @q OR tags LIKE @q)'); params.q = `%${q}%`; }
  if (tag && tag !== 'all') { where.push('tags LIKE @tag'); params.tag = `%${tag}%`; }
  const order = { featured: 'featured DESC, id ASC', newest: 'id DESC', price_asc: 'price ASC', price_desc: 'price DESC', stitches: 'stitch_count DESC', name: 'name ASC' }[sort] || 'featured DESC, id ASC';
  const rows = db.prepare(`SELECT * FROM designs WHERE ${where.join(' AND ')} ORDER BY ${order}`).all(params);
  const tags = {};
  for (const r of db.prepare('SELECT tags FROM designs WHERE active=1').all()) {
    for (const t of jparse(r.tags, [])) tags[t] = (tags[t] || 0) + 1;
  }
  ok(res, { designs: rows.map(designOut), tags: Object.entries(tags).map(([tag, c]) => ({ tag, c })).sort((a, b) => b.c - a.c), total: rows.length });
});

app.get('/api/designs/:key', (req, res) => {
  const k = req.params.key;
  const row = db.prepare('SELECT * FROM designs WHERE (slug = ? OR id = ?) AND active = 1').get(k, num(k, -1));
  if (!row) return fail(res, 404, 'That design is not available.');
  const related = db.prepare('SELECT * FROM designs WHERE active=1 AND id<>? ORDER BY featured DESC, RANDOM() LIMIT 3').all(row.id).map(designOut);
  ok(res, { design: designOut(row), related });
});

/* ----------------------------------------------------------------- orders */
app.post('/api/orders', (req, res) => {
  const { items = [], name = '', email = '', phone = '' } = req.body || {};
  if (!Array.isArray(items) || !items.length) return fail(res, 400, 'Your bag is empty.');
  if (!String(name).trim()) return fail(res, 400, 'Please enter your name.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) return fail(res, 400, 'Please enter a valid email — the receipt goes there.');

  const lines = [];
  let amount = 0;
  for (const raw of items) {
    const key = raw.id ?? raw.slug;
    const row = db.prepare('SELECT * FROM designs WHERE (id = ? OR slug = ?) AND active = 1').get(num(key, -1), String(key));
    if (!row) return fail(res, 400, 'One of the designs is no longer for sale.');
    if (lines.some(l => l.designId === row.id)) continue;
    const allowed = jparse(row.formats, []).map(f => f.key);
    let formats = Array.isArray(raw.formats) ? raw.formats.filter(f => allowed.includes(f)) : [];
    if (!formats.length) formats = jparse(row.default_formats, []).length ? jparse(row.default_formats, []) : allowed.slice();
    amount += row.price;
    lines.push({
      designId: row.id, slug: row.slug, name: row.name, price: row.price,
      formats, stitchCount: row.stitch_count, hoop: row.hoop,
      preview: row.preview_img ? `/${row.preview_img}` : null
    });
  }
  amount = Math.round(amount * 100) / 100;
  const code = 'RSM-' + Date.now().toString(36).toUpperCase().slice(-4) + Math.floor(Math.random() * 900 + 100);
  const info = db.prepare(`INSERT INTO orders(code,name,email,phone,items,amount,status) VALUES (?,?,?,?,?,?,'awaiting')`)
    .run(code, String(name).trim(), String(email).trim(), String(phone).trim(), JSON.stringify(lines), amount);
  ok(res, { order: orderOut(db.prepare('SELECT * FROM orders WHERE id=?').get(info.lastInsertRowid)) });
});

app.get('/api/orders/:code', (req, res) => {
  const row = db.prepare('SELECT * FROM orders WHERE upper(code)=upper(?)').get(req.params.code.trim());
  if (!row) return fail(res, 404, 'No order with that code. Check the code from your receipt.');
  ok(res, { order: orderOut(row, { withLinks: true }) });
});

app.post('/api/orders/:code/proof', (req, res) => {
  const row = db.prepare('SELECT * FROM orders WHERE upper(code)=upper(?)').get(req.params.code.trim());
  if (!row) return fail(res, 404, 'Order not found.');
  if (row.status === 'paid') return ok(res, { order: orderOut(row, { withLinks: true }), message: 'This order is already confirmed.' });

  const { screenshot = '', ref = '' } = req.body || {};
  const m = /^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(screenshot));
  if (!m) return fail(res, 400, 'Attach a screenshot image (PNG, JPG or WebP).');
  const buf = Buffer.from(m[2].replace(/\s/g, ''), 'base64');
  if (buf.length < 1024) return fail(res, 400, 'That image looks empty — please attach the payment screenshot again.');
  if (buf.length > 8 * 1024 * 1024) return fail(res, 413, 'Screenshot is larger than 8 MB — please compress it.');

  const ext = m[1].toLowerCase().replace('jpeg', 'jpg');
  const fileName = `${row.code}-${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, fileName), buf);

  const auto = getSetting('auto_approve', '1') === '1';
  db.prepare('UPDATE orders SET screenshot=?, upi_ref=?, status=?, paid_at=?, note=? WHERE id=?')
    .run(fileName, String(ref).slice(0, 60), auto ? 'paid' : 'submitted', auto ? nowISO() : null,
      auto ? 'Auto-confirmed from uploaded payment proof' : 'Awaiting manual check', row.id);

  const fresh = db.prepare('SELECT * FROM orders WHERE id=?').get(row.id);
  ok(res, {
    order: orderOut(fresh, { withLinks: auto }), autoConfirmed: auto,
    message: auto ? 'Payment screenshot received — order confirmed, your designs are ready.'
      : 'Screenshot received. The studio will confirm your payment shortly.'
  });
});

app.post('/api/orders/:code/links', (req, res) => {
  const row = db.prepare('SELECT * FROM orders WHERE upper(code)=upper(?)').get(req.params.code.trim());
  if (!row) return fail(res, 404, 'Order not found.');
  if (row.status !== 'paid') return fail(res, 403, 'This order is not confirmed yet.');
  ok(res, { downloads: linksFor(row, true) });
});

/** Generates the ZIP for one purchased design, in exactly the chosen formats. */
app.get('/api/download/:token', (req, res) => {
  const t = db.prepare('SELECT * FROM download_tokens WHERE token=?').get(req.params.token);
  if (!t) return fail(res, 404, 'This download link is not valid.');
  if (t.expires_at && new Date(t.expires_at) < new Date()) return fail(res, 410, 'This download link has expired — reopen your order for a fresh one.');
  const row = db.prepare('SELECT * FROM designs WHERE id=?').get(t.design_id);
  if (!row) return fail(res, 404, 'That design no longer exists.');
  const formats = jparse(t.formats, ['dst']);
  let zip;
  try { zip = P.packDesign({ dir: row.dir, formats: jparse(row.formats, []) }, formats); }
  catch (e) { console.error('[pack]', e.message); return fail(res, 500, 'Could not generate the files — please contact support.'); }

  db.prepare('UPDATE download_tokens SET hits = hits + 1 WHERE token=?').run(t.token);
  db.prepare('UPDATE designs SET downloads = downloads + 1 WHERE id=?').run(row.id);
  const name = `${String(row.slug).toUpperCase()}-${formats.join('+').toUpperCase()}.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.setHeader('Content-Length', zip.length);
  res.setHeader('Cache-Control', 'no-store');
  res.end(zip);
});

/* ------------------------------------------------------------------ admin */
app.post('/api/admin/login', (req, res) => {
  const hash = getSetting('admin_password_hash'), salt = getSetting('admin_password_salt');
  if (!hash || !salt || !verifyPassword(String(req.body?.password || ''), hash, salt)) return fail(res, 401, 'Wrong password. Try again.');
  const t = token();
  db.prepare('INSERT INTO admin_sessions(token) VALUES (?)').run(t);
  ok(res, { token: t });
});
app.get('/api/admin/session', (req, res) => ok(res, { admin: isAdmin(req) }));
app.post('/api/admin/logout', (req, res) => {
  const t = bearer(req);
  if (t) db.prepare('DELETE FROM admin_sessions WHERE token=?').run(t);
  ok(res, { message: 'Signed out.' });
});

app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const orders = db.prepare('SELECT * FROM orders ORDER BY id DESC').all();
  const paid = orders.filter(o => o.status === 'paid');
  const revenue = paid.reduce((s, o) => s + o.amount, 0);
  const series = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    series.push({
      date: key, label: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
      revenue: paid.filter(o => String(o.paid_at || '').slice(0, 10) === key).reduce((s, o) => s + o.amount, 0),
      orders: orders.filter(o => String(o.created_at).slice(0, 10) === key).length
    });
  }
  const sold = {};
  for (const o of paid) for (const it of jparse(o.items, [])) {
    sold[it.designId] = sold[it.designId] || { name: it.name, units: 0, revenue: 0 };
    sold[it.designId].units++; sold[it.designId].revenue += it.price;
  }
  const fmt = {};
  for (const o of paid) for (const it of jparse(o.items, [])) for (const f of (it.formats || [])) fmt[f] = (fmt[f] || 0) + 1;
  const count = s => orders.filter(o => o.status === s).length;
  ok(res, { stats: {
    revenue, orders: orders.length, paid: paid.length, awaiting: count('awaiting'),
    submitted: count('submitted'), rejected: count('rejected'),
    aov: paid.length ? Math.round(revenue / paid.length) : 0,
    downloads: db.prepare('SELECT COUNT(*) c FROM download_tokens').get().c,
    designs: db.prepare('SELECT COUNT(*) c FROM designs WHERE active=1').get().c,
    series, topDesigns: Object.values(sold).sort((a, b) => b.units - a.units).slice(0, 5),
    formats: Object.entries(fmt).sort((a, b) => b[1] - a[1]).map(([key, n]) => ({ key, n })),
    recent: orders.slice(0, 8).map(o => orderOut(o, { admin: true, token: bearer(req) }))
  } });
});

app.get('/api/admin/orders', requireAdmin, (req, res) => {
  const st = req.query.status;
  const rows = st && st !== 'all'
    ? db.prepare('SELECT * FROM orders WHERE status=? ORDER BY id DESC').all(st)
    : db.prepare('SELECT * FROM orders ORDER BY id DESC').all();
  ok(res, { orders: rows.map(o => orderOut(o, { admin: true, withLinks: true, token: bearer(req) })) });
});

app.patch('/api/admin/orders/:id', requireAdmin, (req, res) => {
  const id = num(req.params.id, -1);
  const row = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
  if (!row) return fail(res, 404, 'Order not found.');
  const { status, note } = req.body || {};
  if (status && !['awaiting', 'submitted', 'paid', 'rejected'].includes(status)) return fail(res, 400, 'Unknown status.');
  if (status) {
    db.prepare('UPDATE orders SET status=?, paid_at=?, note=? WHERE id=?')
      .run(status, status === 'paid' ? (row.paid_at || nowISO()) : null, note ?? row.note, id);
  } else if (note !== undefined) db.prepare('UPDATE orders SET note=? WHERE id=?').run(note, id);
  ok(res, { order: orderOut(db.prepare('SELECT * FROM orders WHERE id=?').get(id), { admin: true, withLinks: true, token: bearer(req) }) });
});

app.get('/api/admin/screenshot/:code', requireAdmin, (req, res) => {
  const row = db.prepare('SELECT screenshot FROM orders WHERE upper(code)=upper(?)').get(req.params.code);
  if (!row || !row.screenshot) return fail(res, 404, 'No screenshot for that order.');
  const abs = path.join(UPLOAD_DIR, path.basename(row.screenshot));
  if (!fs.existsSync(abs)) return fail(res, 404, 'Screenshot file missing.');
  res.sendFile(abs);
});

app.get('/api/admin/designs', requireAdmin, (req, res) => {
  ok(res, { designs: db.prepare('SELECT * FROM designs ORDER BY id DESC').all().map(designOut), formats: FORMAT_KEYS.map(k => ({ key: k, ...P.FORMATS[k] })) });
});

/** Editable metadata. Format files come from tools/import-designs.js, not the panel. */
function designPayload(b) {
  return {
    name: String(b.name || '').trim(),
    price: num(b.price, 0), mrp: num(b.mrp, num(b.price, 0)),
    summary: String(b.summary || ''), description: String(b.description || ''),
    hoop: String(b.hoop || ''),
    tags: JSON.stringify(Array.isArray(b.tags) ? b.tags : String(b.tags || '').split(',').map(s => s.trim()).filter(Boolean)),
    featured: b.featured ? 1 : 0, badge: b.badge || null, active: b.active === false ? 0 : 1
  };
}

app.post('/api/admin/designs', requireAdmin, (req, res) => {
  return fail(res, 400, 'New designs are imported with their machine files — run `node tools/import-designs.js <pack-folder>` and restart. The panel edits the catalogue.');
});

app.put('/api/admin/designs/:id', requireAdmin, (req, res) => {
  const id = num(req.params.id, -1);
  if (!db.prepare('SELECT id FROM designs WHERE id=?').get(id)) return fail(res, 404, 'Design not found.');
  const p = designPayload(req.body || {});
  if (!p.name) return fail(res, 400, 'Design name is required.');
  if (p.price <= 0) return fail(res, 400, 'Price must be more than zero.');
  p.id = id;
  db.prepare(`UPDATE designs SET name=@name,price=@price,mrp=@mrp,summary=@summary,description=@description,
    hoop=@hoop,tags=@tags,featured=@featured,badge=@badge,active=@active WHERE id=@id`).run(p);
  ok(res, { design: designOut(db.prepare('SELECT * FROM designs WHERE id=?').get(id)) });
});

app.delete('/api/admin/designs/:id', requireAdmin, (req, res) => {
  db.prepare('UPDATE designs SET active=0 WHERE id=?').run(num(req.params.id, -1));
  ok(res, { message: 'Design hidden from the store.' });
});

app.get('/api/admin/settings', requireAdmin, (req, res) => {
  const s = settingsMap();
  delete s.admin_password_hash; delete s.admin_password_salt;
  ok(res, { settings: s });
});
app.put('/api/admin/settings', requireAdmin, (req, res) => {
  const allowed = ['store_name', 'tagline', 'announcement', 'support_email', 'upi_id', 'payee_name', 'link_hours', 'auto_approve'];
  for (const k of allowed) if (req.body[k] !== undefined) setSetting(k, req.body[k]);
  ok(res, { message: 'Settings saved.' });
});
app.post('/api/admin/password', requireAdmin, (req, res) => {
  const hash = getSetting('admin_password_hash'), salt = getSetting('admin_password_salt');
  if (!verifyPassword(String(req.body?.current || ''), hash, salt)) return fail(res, 400, 'Current password is incorrect.');
  if (String(req.body?.next || '').length < 4) return fail(res, 400, 'New password needs at least 4 characters.');
  const h = hashPassword(req.body.next);
  setSetting('admin_password_hash', h.hash); setSetting('admin_password_salt', h.salt);
  db.exec('DELETE FROM admin_sessions');
  ok(res, { message: 'Password updated — sign in again.' });
});

/* --------------------------------------------------------------- SPA + 404 */
app.use(express.static(PUB, { extensions: ['html'] }));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return fail(res, 404, 'Unknown API route.');
  res.sendFile(path.join(PUB, 'index.html'));
});
app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  fail(res, 500, 'Something went wrong on our side.');
});

/* Seed on first boot — works for `node server.js` and a serverless cold start. */
try { require('./src/seed'); }
catch (e) { console.error('[seed] skipped:', e.message); }

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n  Resham Atelier → http://localhost:${PORT}`);
    console.log(`  Admin          → http://localhost:${PORT}/#/admin   (password 252525)`);
    console.log(`  UPI            → ${getSetting('upi_id')}\n`);
  });
}

module.exports = app;

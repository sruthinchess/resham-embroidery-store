'use strict';
/**
 * Resham & Co. — API server
 * Express + SQLite. Serves the SPA from /public and a REST API under /api.
 */
const path = require('path');
const express = require('express');
const D = require('./src/db');
const { db, hashPassword, verifyPassword, token, getSetting, setSetting, settingsMap } = D;

const app = express();
const PORT = process.env.PORT || 3000;
const PUB = path.join(__dirname, 'public');

app.use(express.json({ limit: '1mb' }));

/* ------------------------------------------------------------------ utils */
const ok = (res, data) => res.json({ ok: true, ...(data || {}) });
const fail = (res, code, message) => res.status(code).json({ ok: false, error: message });
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const jparse = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
const nowISO = () => new Date().toISOString();

function slugify(s) {
  return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70);
}

function productOut(row) {
  if (!row) return null;
  const price = row.price, mrp = row.mrp || row.price;
  return {
    id: row.id, slug: row.slug, name: row.name,
    category: row.category_slug, categoryName: row.category_name, categoryId: row.category_id,
    price, mrp, discount: mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0,
    stock: row.stock, inStock: row.stock > 0, lowStock: row.stock > 0 && row.stock <= 5,
    description: row.description, fabric: row.fabric,
    colors: jparse(row.colors, []), sizes: jparse(row.sizes, []),
    pattern: row.pattern, palette: jparse(row.palette, ['#8c2f39', '#c8a24a', '#f4e7d3']),
    rating: row.rating, ratingCount: row.rating_count,
    featured: !!row.featured, badge: row.badge, active: !!row.active,
    createdAt: row.created_at
  };
}

const PRODUCT_SELECT = `
  SELECT p.*, c.slug AS category_slug, c.name AS category_name
  FROM products p LEFT JOIN categories c ON c.id = p.category_id`;

function orderOut(row) {
  if (!row) return null;
  const events = db.prepare('SELECT status,note,created_at FROM order_events WHERE order_id=? ORDER BY id').all(row.id);
  return {
    id: row.id, code: row.code, userId: row.user_id,
    customer: { name: row.name, email: row.email, phone: row.phone, address: row.address, city: row.city, state: row.state, pincode: row.pincode },
    items: jparse(row.items, []),
    subtotal: row.subtotal, discount: row.discount, shipping: row.shipping, codFee: row.cod_fee, total: row.total,
    coupon: row.coupon_code, paymentMethod: row.payment_method, paymentStatus: row.payment_status,
    status: row.status, notes: row.notes, createdAt: row.created_at, updatedAt: row.updated_at,
    events: events.map(e => ({ status: e.status, note: e.note, at: e.created_at }))
  };
}

/* -------------------------------------------------------------- auth core */
function bearer(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7).trim();
  return req.headers['x-admin-token'] || null;
}
function sessionFrom(req) {
  const t = bearer(req);
  if (!t) return null;
  return db.prepare('SELECT * FROM sessions WHERE token=?').get(t) || null;
}
function currentUser(req) {
  const s = sessionFrom(req);
  if (!s || !s.user_id) return null;
  return db.prepare('SELECT id,name,email,phone,created_at FROM users WHERE id=?').get(s.user_id) || null;
}
function requireUser(req, res, next) {
  const u = currentUser(req);
  if (!u) return fail(res, 401, 'Please sign in to continue.');
  req.user = u;
  next();
}
function isAdmin(req) {
  const s = sessionFrom(req);
  return !!(s && s.kind === 'admin');
}
function requireAdmin(req, res, next) {
  if (!isAdmin(req)) return fail(res, 401, 'Admin session expired — please sign in again.');
  next();
}

/* ------------------------------------------------------------------ health */
app.get('/api/health', (req, res) => ok(res, { service: 'resham-store', time: nowISO() }));

/* --------------------------------------------------------------- catalogue */
app.get('/api/settings', (req, res) => {
  const s = settingsMap();
  delete s.admin_password_hash; delete s.admin_password_salt; delete s.admin_password_hint;
  for (const k of ['free_shipping_threshold', 'shipping_fee', 'cod_fee']) s[k] = num(s[k]);
  ok(res, { settings: s });
});

app.get('/api/categories', (req, res) => {
  const rows = db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id=c.id AND p.active=1) AS count
    FROM categories c ORDER BY c.id`).all();
  ok(res, { categories: rows });
});

app.get('/api/products', (req, res) => {
  const { category, q, sort = 'featured', featured, max, page = 1, limit = 24, includeOut } = req.query;
  const where = ['p.active = 1'];
  const params = {};
  if (category && category !== 'all') { where.push('c.slug = @category'); params.category = category; }
  if (q) { where.push('(p.name LIKE @q OR p.description LIKE @q OR p.fabric LIKE @q)'); params.q = `%${q}%`; }
  if (featured === '1') where.push('p.featured = 1');
  if (max) { where.push('p.price <= @max'); params.max = num(max, 1e9); }
  if (includeOut !== '1') where.push('p.stock > 0');

  const order = {
    featured: 'p.featured DESC, p.rating DESC',
    price_asc: 'p.price ASC', price_desc: 'p.price DESC',
    rating: 'p.rating DESC', newest: 'p.id DESC', name: 'p.name ASC'
  }[sort] || 'p.featured DESC, p.rating DESC';

  const lim = Math.min(Math.max(num(limit, 24), 1), 100);
  const off = (Math.max(num(page, 1), 1) - 1) * lim;
  const sql = `${PRODUCT_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ${lim} OFFSET ${off}`;
  const rows = db.prepare(sql).all(params);
  const total = db.prepare(`SELECT COUNT(*) c FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE ${where.join(' AND ')}`).get(params).c;
  ok(res, { products: rows.map(productOut), total, page: num(page, 1), limit: lim });
});

app.get('/api/products/:key', (req, res) => {
  const key = req.params.key;
  const row = db.prepare(`${PRODUCT_SELECT} WHERE p.slug = ? OR p.id = ?`).get(key, num(key, -1));
  if (!row || !row.active) return fail(res, 404, 'Product not found.');
  const related = db.prepare(`${PRODUCT_SELECT} WHERE p.active=1 AND p.stock>0 AND p.category_id=? AND p.id<>? ORDER BY p.featured DESC LIMIT 4`)
    .all(row.category_id, row.id).map(productOut);
  const reviews = db.prepare("SELECT id,name,rating,title,body,created_at FROM reviews WHERE product_id=? AND status='approved' ORDER BY id DESC LIMIT 30")
    .all(row.id);
  ok(res, { product: productOut(row), related, reviews });
});

/* ----------------------------------------------------------------- reviews */
app.post('/api/products/:id/reviews', (req, res) => {
  const id = num(req.params.id, -1);
  const p = db.prepare('SELECT id FROM products WHERE id=?').get(id);
  if (!p) return fail(res, 404, 'Product not found.');
  const { rating, title = '', body = '' } = req.body || {};
  const r = num(rating, 0);
  if (r < 1 || r > 5) return fail(res, 400, 'Rating must be between 1 and 5.');
  if (!body || body.trim().length < 4) return fail(res, 400, 'Please write a few words in your review.');
  const u = currentUser(req);
  const name = (u && u.name) || (req.body.name || '').trim() || 'Guest';
  db.prepare('INSERT INTO reviews(product_id,user_id,name,rating,title,body,status) VALUES(?,?,?,?,?,?,?)')
    .run(id, u ? u.id : null, name, Math.round(r), title.trim().slice(0, 90), body.trim().slice(0, 800), 'pending');
  ok(res, { message: 'Thanks! Your review is queued for moderation.' });
});

/* -------------------------------------------------------------------- auth */
app.post('/api/auth/register', (req, res) => {
  const { name = '', email = '', password = '', phone = '' } = req.body || {};
  if (!name.trim()) return fail(res, 400, 'Please enter your name.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 400, 'Please enter a valid email.');
  if (String(password).length < 6) return fail(res, 400, 'Password needs at least 6 characters.');
  if (db.prepare('SELECT id FROM users WHERE lower(email)=lower(?)').get(email)) return fail(res, 409, 'That email is already registered — try signing in.');
  const { hash, salt } = hashPassword(password);
  const info = db.prepare('INSERT INTO users(name,email,phone,password_hash,salt) VALUES(?,?,?,?,?)')
    .run(name.trim(), email.trim(), phone.trim(), hash, salt);
  const t = token();
  db.prepare('INSERT INTO sessions(token,user_id,kind) VALUES(?,?,?)').run(t, info.lastInsertRowid, 'user');
  const user = db.prepare('SELECT id,name,email,phone FROM users WHERE id=?').get(info.lastInsertRowid);
  ok(res, { token: t, user });
});

app.post('/api/auth/login', (req, res) => {
  const { email = '', password = '' } = req.body || {};
  const row = db.prepare('SELECT * FROM users WHERE lower(email)=lower(?)').get(email.trim());
  if (!row || !verifyPassword(password, row.password_hash, row.salt)) return fail(res, 401, 'Email or password is incorrect.');
  const t = token();
  db.prepare('INSERT INTO sessions(token,user_id,kind) VALUES(?,?,?)').run(t, row.id, 'user');
  ok(res, { token: t, user: { id: row.id, name: row.name, email: row.email, phone: row.phone } });
});

app.get('/api/auth/me', (req, res) => {
  const u = currentUser(req);
  if (!u) return fail(res, 401, 'Not signed in.');
  const orders = db.prepare('SELECT COUNT(*) c FROM orders WHERE user_id=?').get(u.id).c;
  ok(res, { user: { ...u, orders } });
});

app.post('/api/auth/logout', (req, res) => {
  const t = bearer(req);
  if (t) db.prepare('DELETE FROM sessions WHERE token=?').run(t);
  ok(res, { message: 'Signed out.' });
});

/* ----------------------------------------------------------------- coupons */
function checkCoupon(code, subtotal) {
  const c = db.prepare('SELECT * FROM coupons WHERE upper(code)=upper(?)').get(String(code || '').trim());
  if (!c) return { error: 'That coupon code does not exist.' };
  if (!c.active) return { error: 'This coupon is no longer active.' };
  if (c.used >= c.max_uses) return { error: 'This coupon has been fully redeemed.' };
  if (c.expires_at && new Date(c.expires_at) < new Date()) return { error: 'This coupon has expired.' };
  if (subtotal < c.min_order) return { error: `Add ₹${Math.ceil(c.min_order - subtotal).toLocaleString('en-IN')} more to use ${c.code}.` };
  const discount = c.type === 'percent' ? Math.round((subtotal * c.value) / 100) : Math.min(c.value, subtotal);
  return { coupon: c, discount };
}

app.post('/api/coupons/validate', (req, res) => {
  const subtotal = num(req.body?.subtotal, 0);
  const r = checkCoupon(req.body?.code, subtotal);
  if (r.error) return fail(res, 400, r.error);
  ok(res, { code: r.coupon.code, discount: r.discount, type: r.coupon.type, value: r.coupon.value });
});

/* ------------------------------------------------------------------ orders */
const STATUSES = ['placed', 'packed', 'shipped', 'delivered', 'cancelled'];

function buildQuote(items, couponCode) {
  if (!Array.isArray(items) || !items.length) return { error: 'Your bag is empty.' };
  const lines = [];
  let subtotal = 0;
  for (const raw of items) {
    const key = raw.id ?? raw.slug;
    const row = db.prepare(`${PRODUCT_SELECT} WHERE (p.id = ? OR p.slug = ?) AND p.active = 1`).get(num(key, -1), String(key));
    if (!row) return { error: 'One of the items is no longer available.' };
    const qty = Math.max(1, Math.min(20, num(raw.qty, 1)));
    if (row.stock < qty) return { error: `Only ${row.stock} left of ${row.name}.` };
    subtotal += row.price * qty;
    lines.push({
      productId: row.id, slug: row.slug, name: row.name, price: row.price, mrp: row.mrp,
      qty, size: raw.size || (jparse(row.sizes, [])[0] || 'One Size'),
      color: raw.color || (jparse(row.colors, [])[0] || 'Natural'),
      pattern: row.pattern, palette: jparse(row.palette, [])
    });
  }
  let discount = 0, coupon = null;
  if (couponCode) {
    const r = checkCoupon(couponCode, subtotal);
    if (r.error) return { error: r.error };
    discount = r.discount; coupon = r.coupon.code;
  }
  const threshold = num(getSetting('free_shipping_threshold', 2999), 2999);
  const shipping = subtotal - discount >= threshold ? 0 : num(getSetting('shipping_fee', 99), 99);
  return { lines, subtotal, discount, shipping, coupon, threshold };
}

app.post('/api/orders', (req, res) => {
  const { items, customer = {}, paymentMethod = 'cod', couponCode = null, notes = '' } = req.body || {};
  const q = buildQuote(items, couponCode);
  if (q.error) return fail(res, 400, q.error);

  const need = ['name', 'email', 'phone', 'address', 'city', 'state', 'pincode'];
  for (const f of need) if (!String(customer[f] || '').trim()) return fail(res, 400, `Please fill in your ${f}.`);
  if (!/^\d{10}$/.test(String(customer.phone).replace(/\D/g, '').slice(-10))) return fail(res, 400, 'Please enter a valid 10-digit phone number.');
  if (!/^\d{6}$/.test(String(customer.pincode).trim())) return fail(res, 400, 'Please enter a valid 6-digit PIN code.');
  if (!['cod', 'upi', 'card', 'netbanking'].includes(paymentMethod)) return fail(res, 400, 'Unknown payment method.');

  const codFee = paymentMethod === 'cod' ? num(getSetting('cod_fee', 49), 49) : 0;
  const total = q.subtotal - q.discount + q.shipping + codFee;
  const u = currentUser(req);
  const code = 'RSM-' + Date.now().toString(36).toUpperCase().slice(-5) + Math.floor(Math.random() * 90 + 10);

  const tx = db.transaction(() => {
    const info = db.prepare(`INSERT INTO orders
      (code,user_id,name,email,phone,address,city,state,pincode,items,subtotal,discount,shipping,cod_fee,total,coupon_code,payment_method,payment_status,status,notes)
      VALUES (@code,@user_id,@name,@email,@phone,@address,@city,@state,@pincode,@items,@subtotal,@discount,@shipping,@cod_fee,@total,@coupon_code,@payment_method,@payment_status,'placed',@notes)`)
      .run({
        code, user_id: u ? u.id : null,
        name: customer.name.trim(), email: customer.email.trim(), phone: customer.phone.trim(),
        address: customer.address.trim(), city: customer.city.trim(), state: customer.state.trim(), pincode: customer.pincode.trim(),
        items: JSON.stringify(q.lines), subtotal: q.subtotal, discount: q.discount, shipping: q.shipping,
        cod_fee: codFee, total, coupon_code: q.coupon, payment_method: paymentMethod,
        payment_status: paymentMethod === 'cod' ? 'pending' : 'paid', notes: String(notes).slice(0, 500)
      });
    const orderId = info.lastInsertRowid;
    for (const l of q.lines) db.prepare('UPDATE products SET stock = MAX(stock - ?, 0) WHERE id=?').run(l.qty, l.productId);
    if (q.coupon) db.prepare('UPDATE coupons SET used = used + 1 WHERE upper(code)=upper(?)').run(q.coupon);
    db.prepare('INSERT INTO order_events(order_id,status,note) VALUES(?,?,?)').run(orderId, 'placed', 'Order received');
    return orderId;
  });

  const orderId = tx();
  ok(res, { order: orderOut(db.prepare('SELECT * FROM orders WHERE id=?').get(orderId)) });
});

app.get('/api/orders/mine', requireUser, (req, res) => {
  const rows = db.prepare('SELECT * FROM orders WHERE user_id=? ORDER BY id DESC').all(req.user.id);
  ok(res, { orders: rows.map(orderOut) });
});

app.get('/api/orders/track/:code', (req, res) => {
  const row = db.prepare('SELECT * FROM orders WHERE upper(code)=upper(?)').get(req.params.code.trim());
  if (!row) return fail(res, 404, 'No order found with that code. Check the code from your confirmation email.');
  ok(res, { order: orderOut(row) });
});

app.post('/api/orders/:code/cancel', (req, res) => {
  const row = db.prepare('SELECT * FROM orders WHERE upper(code)=upper(?)').get(req.params.code.trim());
  if (!row) return fail(res, 404, 'Order not found.');
  const u = currentUser(req);
  if (row.user_id && (!u || u.id !== row.user_id) && !isAdmin(req)) return fail(res, 403, 'You cannot cancel this order.');
  if (['shipped', 'delivered', 'cancelled'].includes(row.status)) return fail(res, 400, `A ${row.status} order cannot be cancelled.`);
  const tx = db.transaction(() => {
    db.prepare("UPDATE orders SET status='cancelled', updated_at=? WHERE id=?").run(nowISO(), row.id);
    for (const l of jparse(row.items, [])) db.prepare('UPDATE products SET stock = stock + ? WHERE id=?').run(l.qty, l.productId);
    db.prepare('INSERT INTO order_events(order_id,status,note) VALUES(?,?,?)').run(row.id, 'cancelled', req.body?.reason || 'Cancelled by customer');
  });
  tx();
  ok(res, { order: orderOut(db.prepare('SELECT * FROM orders WHERE id=?').get(row.id)) });
});

/* ------------------------------------------------------------- admin: auth */
app.post('/api/admin/login', (req, res) => {
  const pw = String(req.body?.password || '');
  const hash = getSetting('admin_password_hash');
  const salt = getSetting('admin_password_salt');
  if (!hash || !salt || !verifyPassword(pw, hash, salt)) return fail(res, 401, 'Wrong password. Try again.');
  const t = token();
  db.prepare('INSERT INTO sessions(token,user_id,kind) VALUES(?,NULL,?)').run(t, 'admin');
  ok(res, { token: t, message: 'Welcome back.' });
});
app.get('/api/admin/session', (req, res) => ok(res, { admin: isAdmin(req) }));
app.post('/api/admin/logout', (req, res) => {
  const t = bearer(req);
  if (t) db.prepare("DELETE FROM sessions WHERE token=? AND kind='admin'").run(t);
  ok(res, { message: 'Signed out.' });
});

/* -------------------------------------------------------- admin: dashboard */
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const orders = db.prepare('SELECT * FROM orders').all();
  const live = orders.filter(o => o.status !== 'cancelled');
  const revenue = live.reduce((s, o) => s + o.total, 0);
  const aov = live.length ? Math.round(revenue / live.length) : 0;

  const byStatus = {};
  for (const s of STATUSES) byStatus[s] = orders.filter(o => o.status === s).length;

  // last 14 days revenue series
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const total = live.filter(o => String(o.created_at).slice(0, 10) === key).reduce((s, o) => s + o.total, 0);
    days.push({ date: key, label: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }), revenue: total, orders: live.filter(o => String(o.created_at).slice(0, 10) === key).length });
  }

  // top products by units sold
  const units = {};
  for (const o of live) for (const l of jparse(o.items, [])) {
    units[l.productId] = units[l.productId] || { name: l.name, slug: l.slug, qty: 0, revenue: 0 };
    units[l.productId].qty += l.qty; units[l.productId].revenue += l.qty * l.price;
  }
  const topProducts = Object.values(units).sort((a, b) => b.qty - a.qty).slice(0, 5);

  const lowStock = db.prepare('SELECT id,slug,name,stock FROM products WHERE active=1 AND stock<=5 ORDER BY stock ASC LIMIT 8').all();
  const customers = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  const pendingReviews = db.prepare("SELECT COUNT(*) c FROM reviews WHERE status='pending'").get().c;

  ok(res, {
    stats: {
      revenue, orders: orders.length, liveOrders: live.length, aov,
      customers, products: db.prepare('SELECT COUNT(*) c FROM products WHERE active=1').get().c,
      lowStockCount: db.prepare('SELECT COUNT(*) c FROM products WHERE active=1 AND stock<=5').get().c,
      pendingReviews, byStatus, series: days, topProducts, lowStock,
      recentOrders: db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 8').all().map(orderOut)
    }
  });
});

/* --------------------------------------------------------- admin: products */
app.get('/api/admin/products', requireAdmin, (req, res) => {
  const rows = db.prepare(`${PRODUCT_SELECT} ORDER BY p.id DESC`).all();
  ok(res, { products: rows.map(productOut), categories: db.prepare('SELECT * FROM categories ORDER BY id').all() });
});

function productPayload(b) {
  const price = num(b.price, 0), mrp = num(b.mrp, price);
  return {
    name: String(b.name || '').trim(), slug: slugify(b.slug || b.name || ''),
    category_id: num(b.categoryId, 0) || null, price, mrp,
    stock: Math.max(0, Math.round(num(b.stock, 0))),
    description: String(b.description || '').trim(), fabric: String(b.fabric || '').trim(),
    colors: JSON.stringify(Array.isArray(b.colors) ? b.colors : String(b.colors || '').split(',').map(s => s.trim()).filter(Boolean)),
    sizes: JSON.stringify(Array.isArray(b.sizes) ? b.sizes : String(b.sizes || '').split(',').map(s => s.trim()).filter(Boolean)),
    pattern: b.pattern || 'floral',
    palette: JSON.stringify(Array.isArray(b.palette) && b.palette.length ? b.palette : ['#8c2f39', '#c8a24a', '#f4e7d3']),
    featured: b.featured ? 1 : 0, badge: b.badge || null, active: b.active === false ? 0 : 1
  };
}

app.post('/api/admin/products', requireAdmin, (req, res) => {
  const p = productPayload(req.body || {});
  if (!p.name) return fail(res, 400, 'Product name is required.');
  if (p.price <= 0) return fail(res, 400, 'Price must be greater than zero.');
  if (db.prepare('SELECT id FROM products WHERE slug=?').get(p.slug)) p.slug = `${p.slug}-${Date.now().toString(36).slice(-4)}`;
  const info = db.prepare(`INSERT INTO products(slug,name,category_id,price,mrp,stock,description,fabric,colors,sizes,pattern,palette,featured,badge,active)
    VALUES(@slug,@name,@category_id,@price,@mrp,@stock,@description,@fabric,@colors,@sizes,@pattern,@palette,@featured,@badge,@active)`).run(p);
  ok(res, { product: productOut(db.prepare(`${PRODUCT_SELECT} WHERE p.id=?`).get(info.lastInsertRowid)) });
});

app.put('/api/admin/products/:id', requireAdmin, (req, res) => {
  const id = num(req.params.id, -1);
  const exists = db.prepare('SELECT id FROM products WHERE id=?').get(id);
  if (!exists) return fail(res, 404, 'Product not found.');
  const p = productPayload(req.body || {});
  if (!p.name) return fail(res, 400, 'Product name is required.');
  p.id = id;
  db.prepare(`UPDATE products SET slug=@slug,name=@name,category_id=@category_id,price=@price,mrp=@mrp,stock=@stock,
    description=@description,fabric=@fabric,colors=@colors,sizes=@sizes,pattern=@pattern,palette=@palette,
    featured=@featured,badge=@badge,active=@active WHERE id=@id`).run(p);
  ok(res, { product: productOut(db.prepare(`${PRODUCT_SELECT} WHERE p.id=?`).get(id)) });
});

app.delete('/api/admin/products/:id', requireAdmin, (req, res) => {
  const id = num(req.params.id, -1);
  db.prepare('UPDATE products SET active=0 WHERE id=?').run(id); // soft delete keeps order history intact
  ok(res, { message: 'Product removed from the store.' });
});

/* ----------------------------------------------------------- admin: orders */
app.get('/api/admin/orders', requireAdmin, (req, res) => {
  const status = req.query.status;
  const rows = status && status !== 'all'
    ? db.prepare('SELECT * FROM orders WHERE status=? ORDER BY id DESC').all(status)
    : db.prepare('SELECT * FROM orders ORDER BY id DESC').all();
  ok(res, { orders: rows.map(orderOut) });
});

app.patch('/api/admin/orders/:id', requireAdmin, (req, res) => {
  const id = num(req.params.id, -1);
  const row = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
  if (!row) return fail(res, 404, 'Order not found.');
  const { status, note = '', paymentStatus } = req.body || {};
  if (status && !STATUSES.includes(status)) return fail(res, 400, 'Unknown status.');
  const tx = db.transaction(() => {
    if (status && status !== row.status) {
      db.prepare('UPDATE orders SET status=?, updated_at=? WHERE id=?').run(status, nowISO(), id);
      db.prepare('INSERT INTO order_events(order_id,status,note) VALUES(?,?,?)').run(id, status, note || `Marked ${status} by store`);
      if (status === 'cancelled') for (const l of jparse(row.items, [])) db.prepare('UPDATE products SET stock = stock + ? WHERE id=?').run(l.qty, l.productId);
      if (status === 'delivered') db.prepare("UPDATE orders SET payment_status='paid' WHERE id=?").run(id);
    }
    if (paymentStatus) db.prepare('UPDATE orders SET payment_status=?, updated_at=? WHERE id=?').run(paymentStatus, nowISO(), id);
  });
  tx();
  ok(res, { order: orderOut(db.prepare('SELECT * FROM orders WHERE id=?').get(id)) });
});

/* -------------------------------------------------------- admin: customers */
app.get('/api/admin/customers', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT u.id,u.name,u.email,u.phone,u.created_at,
      (SELECT COUNT(*) FROM orders o WHERE o.user_id=u.id) AS orders,
      (SELECT COALESCE(SUM(total),0) FROM orders o WHERE o.user_id=u.id AND o.status<>'cancelled') AS spent
    FROM users u ORDER BY u.id DESC`).all();
  const guests = db.prepare(`SELECT name,email,phone,COUNT(*) orders,SUM(total) spent,MAX(created_at) created_at
    FROM orders WHERE user_id IS NULL GROUP BY lower(email) ORDER BY orders DESC LIMIT 50`).all();
  ok(res, { customers: rows, guests });
});

/* ---------------------------------------------------------- admin: reviews */
app.get('/api/admin/reviews', requireAdmin, (req, res) => {
  const rows = db.prepare(`SELECT r.*, p.name AS product_name, p.slug AS product_slug
    FROM reviews r LEFT JOIN products p ON p.id=r.product_id ORDER BY r.status='pending' DESC, r.id DESC`).all();
  ok(res, { reviews: rows });
});
app.patch('/api/admin/reviews/:id', requireAdmin, (req, res) => {
  const id = num(req.params.id, -1);
  const status = req.body?.status === 'approved' ? 'approved' : 'pending';
  db.prepare('UPDATE reviews SET status=? WHERE id=?').run(status, id);
  if (status === 'approved') {
    const pid = db.prepare('SELECT product_id FROM reviews WHERE id=?').get(id)?.product_id;
    const agg = db.prepare("SELECT AVG(rating) a, COUNT(*) c FROM reviews WHERE product_id=? AND status='approved'").get(pid);
    db.prepare('UPDATE products SET rating=?, rating_count=? WHERE id=?').run(Math.round((agg.a || 0) * 10) / 10, agg.c, pid);
  }
  ok(res, { message: `Review ${status}.` });
});
app.delete('/api/admin/reviews/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM reviews WHERE id=?').run(num(req.params.id, -1));
  ok(res, { message: 'Review deleted.' });
});

/* ---------------------------------------------------------- admin: coupons */
app.get('/api/admin/coupons', requireAdmin, (req, res) => {
  ok(res, { coupons: db.prepare('SELECT * FROM coupons ORDER BY id DESC').all() });
});
app.post('/api/admin/coupons', requireAdmin, (req, res) => {
  const b = req.body || {};
  const code = String(b.code || '').trim().toUpperCase();
  if (!code) return fail(res, 400, 'Coupon code is required.');
  if (db.prepare('SELECT id FROM coupons WHERE upper(code)=?').get(code)) return fail(res, 409, 'That code already exists.');
  db.prepare('INSERT INTO coupons(code,type,value,min_order,max_uses,active,expires_at) VALUES(?,?,?,?,?,?,?)')
    .run(code, b.type === 'flat' ? 'flat' : 'percent', num(b.value, 0), num(b.minOrder, 0), num(b.maxUses, 100), b.active === false ? 0 : 1, b.expiresAt || null);
  ok(res, { coupons: db.prepare('SELECT * FROM coupons ORDER BY id DESC').all() });
});
app.put('/api/admin/coupons/:id', requireAdmin, (req, res) => {
  const b = req.body || {};
  db.prepare('UPDATE coupons SET code=?,type=?,value=?,min_order=?,max_uses=?,active=?,expires_at=? WHERE id=?')
    .run(String(b.code || '').toUpperCase(), b.type === 'flat' ? 'flat' : 'percent', num(b.value, 0), num(b.minOrder, 0),
      num(b.maxUses, 100), b.active ? 1 : 0, b.expiresAt || null, num(req.params.id, -1));
  ok(res, { coupons: db.prepare('SELECT * FROM coupons ORDER BY id DESC').all() });
});
app.delete('/api/admin/coupons/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM coupons WHERE id=?').run(num(req.params.id, -1));
  ok(res, { message: 'Coupon deleted.' });
});

/* --------------------------------------------------------- admin: settings */
app.get('/api/admin/settings', requireAdmin, (req, res) => {
  const s = settingsMap();
  delete s.admin_password_hash; delete s.admin_password_salt;
  ok(res, { settings: s });
});
app.put('/api/admin/settings', requireAdmin, (req, res) => {
  const allowed = ['store_name', 'tagline', 'support_email', 'support_phone', 'announcement', 'free_shipping_threshold', 'shipping_fee', 'cod_fee'];
  for (const k of allowed) if (req.body[k] !== undefined) setSetting(k, req.body[k]);
  ok(res, { message: 'Store settings saved.' });
});
app.post('/api/admin/password', requireAdmin, (req, res) => {
  const { current, next } = req.body || {};
  const hash = getSetting('admin_password_hash'), salt = getSetting('admin_password_salt');
  if (!verifyPassword(current || '', hash, salt)) return fail(res, 400, 'Current password is incorrect.');
  if (String(next || '').length < 4) return fail(res, 400, 'New password needs at least 4 characters.');
  const h = hashPassword(next);
  setSetting('admin_password_hash', h.hash); setSetting('admin_password_salt', h.salt);
  db.prepare("DELETE FROM sessions WHERE kind='admin'").run();
  ok(res, { message: 'Password updated — please sign in again.' });
});

/* --------------------------------------------------------------- SPA + 404 */
app.use(express.static(PUB, { extensions: ['html'] }));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return fail(res, 404, 'Unknown API route.');
  res.sendFile(path.join(PUB, 'index.html'));
});
app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  fail(res, 500, 'Something went wrong on our side. Please try again.');
});

/* ------------------------------------------------------------------- start */
if (require.main === module) {
  require('./src/seed'); // idempotent — only seeds an empty catalogue
  app.listen(PORT, () => {
    console.log(`\n  Resham & Co. running at http://localhost:${PORT}`);
    console.log(`  Storefront  →  http://localhost:${PORT}`);
    console.log(`  Admin panel →  http://localhost:${PORT}/#/admin  (password 252525)\n`);
  });
}

module.exports = app;

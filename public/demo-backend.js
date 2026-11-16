/* =========================================================================
   demo-backend.js — offline fallback
   Mirrors the REST API in memory (localStorage) so the whole store — including
   the admin panel — works when the page is opened straight from disk, with no
   Node server running. Never used when the real API answers.
   ========================================================================= */
(function () {
  const KEY = 'rsm_demo_v2';
  const LS = (function () {
    try { const k = '__rsm_probe'; window.localStorage.setItem(k, '1'); window.localStorage.removeItem(k); return window.localStorage; }
    catch (e) { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; }
  })();

  const money = n => Math.round(n * 100) / 100;
  const now = () => new Date().toISOString();

  function freshState() {
    const seed = window.__SEED__ || { settings: {}, categories: [], products: [], coupons: [], reviews: [] };
    const cats = (seed.categories || []).map((c, i) => ({ ...c, id: i + 1 }));
    const catBySlug = Object.fromEntries(cats.map(c => [c.slug, c]));
    const products = (seed.products || []).map((p, i) => ({
      id: i + 1, slug: p.slug, name: p.name,
      category_id: catBySlug[p.category] ? catBySlug[p.category].id : null,
      price: p.price, mrp: p.mrp, stock: p.stock, description: p.description, fabric: p.fabric,
      colors: p.colors || [], sizes: p.sizes || [], pattern: p.pattern, palette: p.palette,
      rating: p.rating || 0, rating_count: p.rating_count || 0,
      featured: p.featured ? 1 : 0, badge: p.badge || null, active: 1, created_at: now()
    }));
    const reviews = [];
    (seed.reviews || []).forEach((r, i) => {
      const p = products.find(x => x.slug === r.product);
      if (p) reviews.push({ id: i + 1, product_id: p.id, name: r.name, rating: r.rating, title: r.title, body: r.body, status: 'approved', created_at: now() });
    });
    const settings = { ...(seed.settings || {}) };
    settings.admin_password = '252525';
    return {
      settings, cats, products, reviews,
      coupons: (seed.coupons || []).map((c, i) => ({ ...c, id: i + 1, used: 0, expires_at: null })),
      orders: [], events: [], users: [], sessions: {},
      seq: { product: products.length, order: 0, review: reviews.length, coupon: (seed.coupons || []).length, user: 0 }
    };
  }

  let S = null;
  function load() {
    if (S) return S;
    try { S = JSON.parse(LS.getItem(KEY)); } catch { S = null; }
    if (!S || !S.products || !S.products.length) { S = freshState(); save(); }
    return S;
  }
  function save() { try { LS.setItem(KEY, JSON.stringify(S)); } catch {} }
  function reset() { S = freshState(); save(); }

  const fail = (msg, code) => ({ __error: msg, __code: code || 400 });

  /* ---------------------------------------------------------- serialisers */
  function pOut(p) {
    const c = S.cats.find(x => x.id === p.category_id);
    return {
      id: p.id, slug: p.slug, name: p.name, category: c ? c.slug : null, categoryName: c ? c.name : '—',
      categoryId: p.category_id, price: p.price, mrp: p.mrp,
      discount: p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0,
      stock: p.stock, inStock: p.stock > 0, lowStock: p.stock > 0 && p.stock <= 5,
      description: p.description, fabric: p.fabric, colors: p.colors, sizes: p.sizes,
      pattern: p.pattern, palette: p.palette, rating: p.rating, ratingCount: p.rating_count,
      featured: !!p.featured, badge: p.badge, active: !!p.active, createdAt: p.created_at
    };
  }
  function oOut(o) {
    return { ...o,
      customer: { name: o.name, email: o.email, phone: o.phone, address: o.address, city: o.city, state: o.state, pincode: o.pincode },
      codFee: o.cod_fee, coupon: o.coupon_code, paymentMethod: o.payment_method, paymentStatus: o.payment_status,
      events: S.events.filter(e => e.order_id === o.id).map(e => ({ status: e.status, note: e.note, at: e.created_at })) };
  }
  function user() {
    const t = LS.getItem('rsm_token');
    const id = t && S.sessions[t];
    return id ? S.users.find(u => u.id === id) : null;
  }
  function adminOK() {
    const t = LS.getItem('rsm_admin_token');
    return !!(t && S.sessions[t] === 'admin');
  }
  function couponCheck(code, subtotal) {
    const c = S.coupons.find(x => x.code.toUpperCase() === String(code || '').toUpperCase());
    if (!c) return fail('That coupon code does not exist.');
    if (!c.active) return fail('This coupon is no longer active.');
    if (c.used >= c.max_uses) return fail('This coupon has been fully redeemed.');
    if (subtotal < c.min_order) return fail(`Add ₹${Math.ceil(c.min_order - subtotal).toLocaleString('en-IN')} more to use ${c.code}.`);
    return { coupon: c, discount: c.type === 'percent' ? Math.round(subtotal * c.value / 100) : Math.min(c.value, subtotal) };
  }
  function quote(items, code) {
    if (!items || !items.length) return fail('Your bag is empty.');
    const lines = []; let subtotal = 0;
    for (const raw of items) {
      const p = S.products.find(x => x.id == raw.id || x.slug === raw.slug);
      if (!p || !p.active) return fail('One of the items is no longer available.');
      const qty = Math.max(1, Math.min(20, Number(raw.qty) || 1));
      if (p.stock < qty) return fail(`Only ${p.stock} left of ${p.name}.`);
      subtotal += p.price * qty;
      lines.push({ productId: p.id, slug: p.slug, name: p.name, price: p.price, mrp: p.mrp, qty,
        size: raw.size || p.sizes[0] || 'One Size', color: raw.color || p.colors[0] || 'Natural',
        pattern: p.pattern, palette: p.palette });
    }
    let discount = 0, coupon = null;
    if (code) { const r = couponCheck(code, subtotal); if (r.__error) return r; discount = r.discount; coupon = r.coupon.code; }
    const threshold = Number(S.settings.free_shipping_threshold || 2999);
    const shipping = subtotal - discount >= threshold ? 0 : Number(S.settings.shipping_fee || 99);
    return { lines, subtotal, discount, shipping, coupon };
  }

  /* --------------------------------------------------------------- routes */
  const routes = [];
  const R = (m, p, fn) => routes.push({ m, parts: p.split('/').filter(Boolean), fn });

  R('GET', '/api/health', () => ({ ok: true, service: 'resham-demo' }));

  R('GET', '/api/settings', () => {
    const s = { ...S.settings }; delete s.admin_password;
    ['free_shipping_threshold', 'shipping_fee', 'cod_fee'].forEach(k => s[k] = Number(s[k]));
    return { ok: true, settings: s };
  });

  R('GET', '/api/categories', () => ({
    ok: true, categories: S.cats.map(c => ({ ...c, count: S.products.filter(p => p.category_id === c.id && p.active).length }))
  }));

  R('GET', '/api/products', (m, q) => {
    let list = S.products.filter(p => p.active && (q.includeOut === '1' || p.stock > 0));
    if (q.category && q.category !== 'all') { const c = S.cats.find(x => x.slug === q.category); list = list.filter(p => c && p.category_id === c.id); }
    if (q.q) { const t = q.q.toLowerCase(); list = list.filter(p => (p.name + ' ' + p.description + ' ' + p.fabric).toLowerCase().includes(t)); }
    if (q.featured === '1') list = list.filter(p => p.featured);
    const sort = q.sort || 'featured';
    list.sort((a, b) => sort === 'price_asc' ? a.price - b.price : sort === 'price_desc' ? b.price - a.price
      : sort === 'rating' ? b.rating - a.rating : sort === 'newest' ? b.id - a.id
      : sort === 'name' ? a.name.localeCompare(b.name) : (b.featured - a.featured) || (b.rating - a.rating));
    return { ok: true, products: list.map(pOut), total: list.length, page: 1, limit: list.length };
  });

  R('GET', '/api/products/:key', (m, q, p) => {
    const prod = S.products.find(x => x.slug === p.key || String(x.id) === p.key);
    if (!prod || !prod.active) return fail('Product not found.', 404);
    return { ok: true, product: pOut(prod),
      related: S.products.filter(x => x.active && x.stock > 0 && x.category_id === prod.category_id && x.id !== prod.id).slice(0, 4).map(pOut),
      reviews: S.reviews.filter(r => r.product_id === prod.id && r.status === 'approved').slice().reverse() };
  });

  R('POST', '/api/products/:id/reviews', (m, q, p, body) => {
    const prod = S.products.find(x => String(x.id) === p.id);
    if (!prod) return fail('Product not found.', 404);
    const r = Number(body.rating || 0);
    if (r < 1 || r > 5) return fail('Rating must be between 1 and 5.');
    if (!body.body || body.body.trim().length < 4) return fail('Please write a few words in your review.');
    const u = user();
    S.reviews.push({ id: ++S.seq.review, product_id: prod.id, name: u ? u.name : (body.name || 'Guest'), rating: Math.round(r),
      title: (body.title || '').slice(0, 90), body: body.body.trim().slice(0, 800), status: 'pending', created_at: now() });
    save();
    return { ok: true, message: 'Thanks! Your review is queued for moderation.' };
  });

  R('POST', '/api/auth/register', (m, q, p, b) => {
    if (!b.name || !b.name.trim()) return fail('Please enter your name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email || '')) return fail('Please enter a valid email.');
    if ((b.password || '').length < 6) return fail('Password needs at least 6 characters.');
    if (S.users.some(u => u.email.toLowerCase() === b.email.toLowerCase())) return fail('That email is already registered — try signing in.', 409);
    const u = { id: ++S.seq.user, name: b.name.trim(), email: b.email.trim(), phone: b.phone || '', password: b.password, created_at: now() };
    S.users.push(u);
    const t = 'demo-' + Math.random().toString(36).slice(2);
    S.sessions[t] = u.id; LS.setItem('rsm_token', t); save();
    return { ok: true, token: t, user: { id: u.id, name: u.name, email: u.email, phone: u.phone } };
  });

  R('POST', '/api/auth/login', (m, q, p, b) => {
    const u = S.users.find(x => x.email.toLowerCase() === String(b.email || '').toLowerCase() && x.password === b.password);
    if (!u) return fail('Email or password is incorrect.', 401);
    const t = 'demo-' + Math.random().toString(36).slice(2);
    S.sessions[t] = u.id; LS.setItem('rsm_token', t); save();
    return { ok: true, token: t, user: { id: u.id, name: u.name, email: u.email, phone: u.phone } };
  });

  R('GET', '/api/auth/me', () => {
    const u = user();
    if (!u) return fail('Not signed in.', 401);
    return { ok: true, user: { id: u.id, name: u.name, email: u.email, phone: u.phone, orders: S.orders.filter(o => o.user_id === u.id).length } };
  });

  R('POST', '/api/auth/logout', () => { LS.removeItem('rsm_token'); return { ok: true }; });

  R('POST', '/api/coupons/validate', (m, q, p, b) => {
    const r = couponCheck(b.code, Number(b.subtotal || 0));
    if (r.__error) return r;
    return { ok: true, code: r.coupon.code, discount: r.discount, type: r.coupon.type, value: r.coupon.value };
  });

  R('POST', '/api/orders', (m, q, p, b) => {
    const Q = quote(b.items, b.couponCode);
    if (Q.__error) return Q;
    const c = b.customer || {};
    for (const f of ['name', 'email', 'phone', 'address', 'city', 'state', 'pincode'])
      if (!String(c[f] || '').trim()) return fail(`Please fill in your ${f}.`);
    if (!/^\d{10}$/.test(String(c.phone).replace(/\D/g, '').slice(-10))) return fail('Please enter a valid 10-digit phone number.');
    if (!/^\d{6}$/.test(String(c.pincode).trim())) return fail('Please enter a valid 6-digit PIN code.');
    const pm = b.paymentMethod || 'cod';
    const codFee = pm === 'cod' ? Number(S.settings.cod_fee || 49) : 0;
    const u = user();
    const order = {
      id: ++S.seq.order,
      code: 'RSM-' + Date.now().toString(36).toUpperCase().slice(-5) + Math.floor(Math.random() * 90 + 10),
      user_id: u ? u.id : null, name: c.name.trim(), email: c.email.trim(), phone: c.phone.trim(),
      address: c.address.trim(), city: c.city.trim(), state: c.state.trim(), pincode: c.pincode.trim(),
      items: Q.lines, subtotal: Q.subtotal, discount: Q.discount, shipping: Q.shipping, cod_fee: codFee,
      total: money(Q.subtotal - Q.discount + Q.shipping + codFee), coupon_code: Q.coupon,
      payment_method: pm, payment_status: pm === 'cod' ? 'pending' : 'paid',
      status: 'placed', notes: b.notes || '', created_at: now(), updated_at: now()
    };
    S.orders.unshift(order);
    for (const l of Q.lines) { const pr = S.products.find(x => x.id === l.productId); if (pr) pr.stock = Math.max(0, pr.stock - l.qty); }
    if (Q.coupon) { const cp = S.coupons.find(x => x.code === Q.coupon); if (cp) cp.used++; }
    S.events.push({ order_id: order.id, status: 'placed', note: 'Order received', created_at: now() });
    save();
    return { ok: true, order: oOut(order) };
  });

  R('GET', '/api/orders/mine', () => {
    const u = user();
    if (!u) return fail('Please sign in to continue.', 401);
    return { ok: true, orders: S.orders.filter(o => o.user_id === u.id).map(oOut) };
  });

  R('GET', '/api/orders/track/:code', (m, q, p) => {
    const o = S.orders.find(x => x.code.toUpperCase() === String(p.code).toUpperCase());
    if (!o) return fail('No order found with that code. Check the code from your confirmation email.', 404);
    return { ok: true, order: oOut(o) };
  });

  R('POST', '/api/orders/:code/cancel', (m, q, p, b) => {
    const o = S.orders.find(x => x.code.toUpperCase() === String(p.code).toUpperCase());
    if (!o) return fail('Order not found.', 404);
    if (['shipped', 'delivered', 'cancelled'].includes(o.status)) return fail(`A ${o.status} order cannot be cancelled.`);
    o.status = 'cancelled'; o.updated_at = now();
    for (const l of o.items) { const pr = S.products.find(x => x.id === l.productId); if (pr) pr.stock += l.qty; }
    S.events.push({ order_id: o.id, status: 'cancelled', note: (b && b.reason) || 'Cancelled by customer', created_at: now() });
    save();
    return { ok: true, order: oOut(o) };
  });

  /* --------------------------------------------------------------- admin */
  R('POST', '/api/admin/login', (m, q, p, b) => {
    if (String(b.password || '') !== String(S.settings.admin_password || '252525')) return fail('Wrong password. Try again.', 401);
    const t = 'admin-' + Math.random().toString(36).slice(2);
    S.sessions[t] = 'admin'; LS.setItem('rsm_admin_token', t); save();
    return { ok: true, token: t };
  });
  R('GET', '/api/admin/session', () => ({ ok: true, admin: adminOK() }));
  R('POST', '/api/admin/logout', () => { LS.removeItem('rsm_admin_token'); return { ok: true }; });

  R('GET', '/api/admin/stats', () => {
    if (!adminOK()) return fail('Admin session expired — please sign in again.', 401);
    const live = S.orders.filter(o => o.status !== 'cancelled');
    const revenue = live.reduce((s, o) => s + o.total, 0);
    const byStatus = {};
    ['placed', 'packed', 'shipped', 'delivered', 'cancelled'].forEach(s => byStatus[s] = S.orders.filter(o => o.status === s).length);
    const series = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const day = live.filter(o => String(o.created_at).slice(0, 10) === key);
      series.push({ date: key, label: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }), revenue: day.reduce((s, o) => s + o.total, 0), orders: day.length });
    }
    const units = {};
    live.forEach(o => o.items.forEach(l => {
      units[l.productId] = units[l.productId] || { name: l.name, slug: l.slug, qty: 0, revenue: 0 };
      units[l.productId].qty += l.qty; units[l.productId].revenue += l.qty * l.price;
    }));
    return { ok: true, stats: {
      revenue, orders: S.orders.length, liveOrders: live.length, aov: live.length ? Math.round(revenue / live.length) : 0,
      customers: S.users.length, products: S.products.filter(p => p.active).length,
      lowStockCount: S.products.filter(p => p.active && p.stock <= 5).length,
      pendingReviews: S.reviews.filter(r => r.status === 'pending').length,
      byStatus, series, topProducts: Object.values(units).sort((a, b) => b.qty - a.qty).slice(0, 5),
      lowStock: S.products.filter(p => p.active && p.stock <= 5).sort((a, b) => a.stock - b.stock).slice(0, 8)
        .map(p => ({ id: p.id, slug: p.slug, name: p.name, stock: p.stock })),
      recentOrders: S.orders.slice(0, 8).map(oOut)
    } };
  });

  R('GET', '/api/admin/products', () => {
    if (!adminOK()) return fail('Admin session expired — please sign in again.', 401);
    return { ok: true, products: S.products.slice().reverse().map(pOut), categories: S.cats };
  });
  function payload(b) {
    return {
      name: (b.name || '').trim(), slug: (b.slug || b.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      category_id: Number(b.categoryId) || null, price: Number(b.price) || 0, mrp: Number(b.mrp || b.price) || 0,
      stock: Math.max(0, Math.round(Number(b.stock) || 0)), description: b.description || '', fabric: b.fabric || '',
      colors: Array.isArray(b.colors) ? b.colors : String(b.colors || '').split(',').map(s => s.trim()).filter(Boolean),
      sizes: Array.isArray(b.sizes) ? b.sizes : String(b.sizes || '').split(',').map(s => s.trim()).filter(Boolean),
      pattern: b.pattern || 'floral', palette: (b.palette && b.palette.length ? b.palette : ['#8c2f39', '#c8a24a', '#f4e7d3']),
      featured: b.featured ? 1 : 0, badge: b.badge || null, active: b.active === false ? 0 : 1
    };
  }
  R('POST', '/api/admin/products', (m, q, p, b) => {
    if (!adminOK()) return fail('Admin session expired — please sign in again.', 401);
    const d = payload(b);
    if (!d.name) return fail('Product name is required.');
    if (d.price <= 0) return fail('Price must be greater than zero.');
    const prod = { id: ++S.seq.product, ...d, rating: 0, rating_count: 0, created_at: now() };
    S.products.push(prod); save();
    return { ok: true, product: pOut(prod) };
  });
  R('PUT', '/api/admin/products/:id', (m, q, p, b) => {
    if (!adminOK()) return fail('Admin session expired — please sign in again.', 401);
    const prod = S.products.find(x => String(x.id) === p.id);
    if (!prod) return fail('Product not found.', 404);
    Object.assign(prod, payload(b)); save();
    return { ok: true, product: pOut(prod) };
  });
  R('DELETE', '/api/admin/products/:id', (m, q, p) => {
    if (!adminOK()) return fail('Admin session expired — please sign in again.', 401);
    const prod = S.products.find(x => String(x.id) === p.id);
    if (prod) prod.active = 0;
    save();
    return { ok: true, message: 'Product removed from the store.' };
  });

  R('GET', '/api/admin/orders', (m, q) => {
    if (!adminOK()) return fail('Admin session expired — please sign in again.', 401);
    const list = q.status && q.status !== 'all' ? S.orders.filter(o => o.status === q.status) : S.orders;
    return { ok: true, orders: list.map(oOut) };
  });
  R('PATCH', '/api/admin/orders/:id', (m, q, p, b) => {
    if (!adminOK()) return fail('Admin session expired — please sign in again.', 401);
    const o = S.orders.find(x => String(x.id) === p.id);
    if (!o) return fail('Order not found.', 404);
    if (b.status && b.status !== o.status) {
      o.status = b.status; o.updated_at = now();
      S.events.push({ order_id: o.id, status: b.status, note: b.note || `Marked ${b.status} by store`, created_at: now() });
      if (b.status === 'cancelled') o.items.forEach(l => { const pr = S.products.find(x => x.id === l.productId); if (pr) pr.stock += l.qty; });
      if (b.status === 'delivered') o.payment_status = 'paid';
    }
    if (b.paymentStatus) o.payment_status = b.paymentStatus;
    save();
    return { ok: true, order: oOut(o) };
  });

  R('GET', '/api/admin/customers', () => {
    if (!adminOK()) return fail('Admin session expired — please sign in again.', 401);
    return { ok: true,
      customers: S.users.map(u => ({
        id: u.id, name: u.name, email: u.email, phone: u.phone, created_at: u.created_at,
        orders: S.orders.filter(o => o.user_id === u.id).length,
        spent: S.orders.filter(o => o.user_id === u.id && o.status !== 'cancelled').reduce((s, o) => s + o.total, 0)
      })),
      guests: [] };
  });

  R('GET', '/api/admin/reviews', () => {
    if (!adminOK()) return fail('Admin session expired — please sign in again.', 401);
    return { ok: true, reviews: S.reviews.slice().reverse().map(r => {
      const pr = S.products.find(x => x.id === r.product_id);
      return { ...r, product_name: pr ? pr.name : '—', product_slug: pr ? pr.slug : '' };
    }) };
  });
  R('PATCH', '/api/admin/reviews/:id', (m, q, p, b) => {
    if (!adminOK()) return fail('Admin session expired — please sign in again.', 401);
    const r = S.reviews.find(x => String(x.id) === p.id);
    if (r) { r.status = b.status === 'approved' ? 'approved' : 'pending'; save(); }
    return { ok: true, message: 'Review ' + (r ? r.status : 'updated') + '.' };
  });
  R('DELETE', '/api/admin/reviews/:id', (m, q, p) => {
    if (!adminOK()) return fail('Admin session expired — please sign in again.', 401);
    S.reviews = S.reviews.filter(x => String(x.id) !== p.id); save();
    return { ok: true, message: 'Review deleted.' };
  });

  R('GET', '/api/admin/coupons', () => {
    if (!adminOK()) return fail('Admin session expired — please sign in again.', 401);
    return { ok: true, coupons: S.coupons.slice().reverse() };
  });
  R('POST', '/api/admin/coupons', (m, q, p, b) => {
    if (!adminOK()) return fail('Admin session expired — please sign in again.', 401);
    const code = String(b.code || '').trim().toUpperCase();
    if (!code) return fail('Coupon code is required.');
    if (S.coupons.some(c => c.code.toUpperCase() === code)) return fail('That code already exists.', 409);
    S.coupons.push({ id: ++S.seq.coupon, code, type: b.type === 'flat' ? 'flat' : 'percent', value: Number(b.value) || 0,
      min_order: Number(b.minOrder) || 0, max_uses: Number(b.maxUses) || 100, used: 0, active: b.active === false ? 0 : 1, expires_at: b.expiresAt || null });
    save();
    return { ok: true, coupons: S.coupons.slice().reverse() };
  });
  R('PUT', '/api/admin/coupons/:id', (m, q, p, b) => {
    if (!adminOK()) return fail('Admin session expired — please sign in again.', 401);
    const c = S.coupons.find(x => String(x.id) === p.id);
    if (c) Object.assign(c, { code: String(b.code || c.code).toUpperCase(), type: b.type === 'flat' ? 'flat' : 'percent',
      value: Number(b.value) || 0, min_order: Number(b.minOrder) || 0, max_uses: Number(b.maxUses) || 100, active: b.active ? 1 : 0 });
    save();
    return { ok: true, coupons: S.coupons.slice().reverse() };
  });
  R('DELETE', '/api/admin/coupons/:id', (m, q, p) => {
    if (!adminOK()) return fail('Admin session expired — please sign in again.', 401);
    S.coupons = S.coupons.filter(x => String(x.id) !== p.id); save();
    return { ok: true, message: 'Coupon deleted.' };
  });

  R('GET', '/api/admin/settings', () => {
    if (!adminOK()) return fail('Admin session expired — please sign in again.', 401);
    const s = { ...S.settings }; delete s.admin_password;
    return { ok: true, settings: s };
  });
  R('PUT', '/api/admin/settings', (m, q, p, b) => {
    if (!adminOK()) return fail('Admin session expired — please sign in again.', 401);
    ['store_name', 'tagline', 'support_email', 'support_phone', 'announcement', 'free_shipping_threshold', 'shipping_fee', 'cod_fee']
      .forEach(k => { if (b[k] !== undefined) S.settings[k] = b[k]; });
    save();
    return { ok: true, message: 'Store settings saved.' };
  });
  R('POST', '/api/admin/password', (m, q, p, b) => {
    if (!adminOK()) return fail('Admin session expired — please sign in again.', 401);
    if (String(b.current || '') !== String(S.settings.admin_password)) return fail('Current password is incorrect.');
    if (String(b.next || '').length < 4) return fail('New password needs at least 4 characters.');
    S.settings.admin_password = String(b.next);
    LS.removeItem('rsm_admin_token'); save();
    return { ok: true, message: 'Password updated — please sign in again.' };
  });

  /* -------------------------------------------------------------- dispatch */
  function handle(method, path, body, query) {
    load();
    const [url, qstr] = path.split('?');
    const parts = url.split('/').filter(Boolean);
    // query can arrive in the path (fetch style) or as an object
    query = { ...Object.fromEntries(new URLSearchParams(qstr || '')), ...(query || {}) };
    for (const r of routes) {
      if (r.m !== method || r.parts.length !== parts.length) continue;
      const params = {};
      let match = true;
      for (let i = 0; i < parts.length; i++) {
        const a = r.parts[i];
        if (a.startsWith(':')) params[a.slice(1)] = decodeURIComponent(parts[i]);
        else if (a !== parts[i]) { match = false; break; }
      }
      if (!match) continue;
      const out = r.fn(method, query || {}, params, body || {});
      if (out && out.__error) {
        const err = new Error(out.__error); err.status = out.__code || 400; throw err;
      }
      return out;
    }
    const e = new Error('Unknown API route: ' + method + ' ' + url); e.status = 404; throw e;
  }

  window.Demo = { handle, reset, get state() { return load(); } };
})();

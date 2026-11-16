/* =========================================================================
   demo-backend.js — offline fallback for the static build.
   Mirrors the API in the browser: designs, orders, UPI proof, and a ZIP of
   exactly the formats chosen (assembled from the embedded per-format files).
   ========================================================================= */
(function () {
  'use strict';
  const LS = (function () {
    try { const k = '__rad'; window.localStorage.setItem(k, '1'); window.localStorage.removeItem(k); return window.localStorage; }
    catch (e) { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; }
  })();
  const KEY = 'ra_demo_v1';
  const now = () => new Date().toISOString();
  const money2 = n => (Math.round(Number(n) * 100) / 100).toFixed(2);

  /* ------------------------------------------------------- tiny zip writer */
  let CRC = null;
  function crc32(u8) {
    if (!CRC) {
      CRC = new Int32Array(256);
      for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c; }
    }
    let c = -1;
    for (let i = 0; i < u8.length; i++) c = (c >>> 8) ^ CRC[(c ^ u8[i]) & 0xFF];
    return (c ^ -1) >>> 0;
  }
  const u8 = str => { const out = new Uint8Array(str.length); for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xFF; return out; };
  const b64ToU8 = b64 => {
    const bin = atob(b64); const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };
  function zipFiles(files) {
    const parts = [], central = [];
    let offset = 0;
    for (const f of files) {
      const name = u8(f.name);
      const data = f.data;
      const crc = crc32(data);
      const local = new Uint8Array(30);
      const dv = new DataView(local.buffer);
      dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 0x0800, true);
      dv.setUint16(8, 0, true); dv.setUint16(10, 0, true); dv.setUint16(12, 0x21, true);
      dv.setUint32(14, crc, true); dv.setUint32(18, data.length, true); dv.setUint32(22, data.length, true);
      dv.setUint16(26, name.length, true); dv.setUint16(28, 0, true);
      parts.push(local, name, data);
      const cen = new Uint8Array(46); const cv = new DataView(cen.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true); cv.setUint16(10, 0, true); cv.setUint16(12, 0, true); cv.setUint16(14, 0x21, true);
      cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true);
      cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true);
      central.push(cen, name);
      offset += 30 + name.length + data.length;
    }
    const cenLen = central.reduce((s, p) => s + p.length, 0);
    const end = new Uint8Array(22); const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
    ev.setUint32(12, cenLen, true); ev.setUint32(16, offset, true);
    const all = parts.concat(central, [end]);
    const total = all.reduce((s, p) => s + p.length, 0);
    const out = new Uint8Array(total); let at = 0;
    for (const p of all) { out.set(p, at); at += p.length; }
    return out;
  }

  function freshState() {
    const seed = window.__SEED__ || { settings: {}, designs: [] };
    const designs = (seed.designs || []).map((d, i) => ({ ...d, id: i + 1, downloads: 0, active: 1, created_at: now() }));
    const settings = { ...(seed.settings || {}) };
    settings.admin_password = '252525';
    const coupons = (seed.settings.coupons || []).map((c, i) => ({
      id: i + 1, code: c.code, type: c.type, value: c.value, min_order: c.min_order || 0,
      max_uses: c.max_uses || 0, used: 0, active: 1, expires_at: c.expires_at || null, note: c.note || ''
    }));
    return { settings, designs, coupons, orders: [], tokens: {}, seq: { design: designs.length, order: 0, coupon: coupons.length }, adminSessions: {} };
  }
  let S = null;
  function load() {
    if (S) return S;
    try { S = JSON.parse(LS.getItem(KEY)); } catch { S = null; }
    if (!S || !S.designs || !S.designs.length) { S = freshState(); save(); }
    return S;
  }
  function save() { try { LS.setItem(KEY, JSON.stringify(S)); } catch {} }
  function reset() { S = freshState(); save(); }
  const fail = (msg, code) => { const e = new Error(msg); e.__code = code || 400; return e; };

  function checkCoupon(code, subtotal) {
    const raw = String(code || '').trim().toUpperCase();
    if (!raw) throw fail('Enter a coupon code.');
    const c = S.coupons.find(x => x.code.toUpperCase() === raw);
    if (!c || !c.active) throw fail('That coupon is not available.');
    if (c.expires_at && new Date(c.expires_at) < new Date()) throw fail('That coupon has expired.');
    if (c.max_uses && c.used >= c.max_uses) throw fail('That coupon has been fully claimed.');
    if (subtotal < c.min_order) throw fail(`Add ₹${(c.min_order - subtotal).toFixed(2)} more to use ${c.code}.`);
    const discount = Math.min(subtotal, Math.round((c.type === 'percent' ? subtotal * c.value / 100 : c.value) * 100) / 100);
    return { coupon: c, discount };
  }
  const cOut = c => ({ id: c.id, code: c.code, type: c.type, value: c.value, minOrder: c.min_order,
    maxUses: c.max_uses, used: c.used, active: !!c.active, expiresAt: c.expires_at, note: c.note,
    label: c.type === 'percent' ? `${c.value}% off` : `₹${c.value} off`,
    expired: !!(c.expires_at && new Date(c.expires_at) < new Date()), exhausted: !!(c.max_uses && c.used >= c.max_uses) });

  function upi(o) {
    const s = S.settings;
    const link = `upi://pay?pa=${s.upi_id}&pn=${encodeURIComponent(s.payee_name)}&am=${money2(o.amount)}&cu=INR&tn=${encodeURIComponent(o.code)}&tr=${encodeURIComponent(o.code)}`;
    return { id: s.upi_id, payee: s.payee_name, amount: money2(o.amount), currency: 'INR', link };
  }
  function linksFor(o, fresh) {
    const files = window.__FILES__ || {};
    return o.items.map(it => {
      let t = fresh ? null : Object.values(S.tokens).find(x => x.orderId === o.id && x.designId === it.designId);
      if (!t) {
        const hours = Number(S.settings.link_hours || 72);
        t = { token: 'demo' + Math.random().toString(36).slice(2) + Date.now().toString(36), orderId: o.id, designId: it.designId, formats: it.formats, expiresAt: new Date(Date.now() + hours * 3600e3).toISOString() };
        S.tokens[t.token] = t;
      }
      const set = files[it.slug] || {};
      const chosen = t.formats || [];
      const parts = [];
      for (const f of chosen) {
        const entry = set[f];
        if (entry) parts.push({ name: entry.name, data: b64ToU8(entry.data.split(',')[1]) });
      }
      parts.push({ name: 'READ ME.txt', data: u8(
        `${it.name}\n\nStitch count : ${it.stitchCount}\nFormats here : ${chosen.map(f => f.toUpperCase()).join(', ')}\n\nOpen the DST or EXP in your machine software.\nOne-person commercial licence.\n\nSandya Emb Designs\n`) });
      const blob = new Blob([zipFiles(parts)], { type: 'application/zip' });
      return {
        designId: it.designId, name: it.name, formats: chosen,
        fileName: `${String(it.slug).toUpperCase()}-${chosen.map(f => f.toUpperCase()).join('+')}.zip`,
        token: t.token, url: URL.createObjectURL(blob), expiresAt: t.expiresAt, expired: new Date(t.expiresAt) < new Date()
      };
    });
  }
  function oOut(o, opts = {}) {
    const out = {
      id: o.id, code: o.code, name: o.name, email: o.email, phone: o.phone,
      items: o.items, amount: o.amount, status: o.status, note: o.note,
      upiRef: o.upi_ref, hasProof: !!o.screenshot, createdAt: o.created_at, paidAt: o.paid_at,
      subtotal: o.subtotal ?? o.amount, discount: o.discount || 0, coupon: o.coupon_code || null,
      upi: o.status === 'awaiting' ? upi(o) : null
    };
    if (opts.withLinks && o.status === 'paid') out.downloads = linksFor(o, false);
    if (opts.admin) out.screenshotUrl = o.screenshot || null;
    return out;
  }
  const adminOK = () => { const t = LS.getItem('ra_admin_token'); return !!(t && S.adminSessions[t]); };
  const guard = () => { if (!adminOK()) throw fail('Admin session expired — sign in again.', 401); };

  const routes = [];
  const R = (m, p, fn) => routes.push({ m, parts: p.split('/').filter(Boolean), fn });

  R('GET', '/api/health', () => ({ ok: true, service: 'resham-demo' }));
  R('GET', '/api/settings', () => {
    const s = S.settings;
    return { ok: true, settings: { store_name: s.store_name, tagline: s.tagline, announcement: s.announcement,
      support_email: s.support_email, upi_id: s.upi_id, payee_name: s.payee_name,
      link_hours: Number(s.link_hours || 72), auto_approve: String(s.auto_approve) === '1' } };
  });
  R('GET', '/api/formats', () => ({ ok: true, formats: [
    { key: 'dst', label: 'DST', note: 'Tajima — most commercial machines' },
    { key: 'exp', label: 'EXP', note: 'Melco / Bernina' },
    { key: 'svg', label: 'SVG', note: 'Vector stitch paths' },
    { key: 'png', label: 'PNG', note: 'Stitch-out preview' },
    { key: 'pdf', label: 'PDF', note: 'Printable design sheet' }] }));

  R('GET', '/api/designs', (m, q) => {
    let list = S.designs.filter(d => d.active);
    if (q.featured === '1') list = list.filter(d => d.featured);
    if (q.q) { const t = q.q.toLowerCase(); list = list.filter(d => (d.name + ' ' + d.summary + ' ' + (d.tags || []).join(' ')).toLowerCase().includes(t)); }
    if (q.tag && q.tag !== 'all') list = list.filter(d => (d.tags || []).includes(q.tag));
    const sort = q.sort || 'featured';
    list.sort((a, b) => sort === 'price_asc' ? a.price - b.price : sort === 'price_desc' ? b.price - a.price
      : sort === 'stitches' ? b.stitchCount - a.stitchCount : sort === 'newest' ? b.id - a.id
      : sort === 'name' ? a.name.localeCompare(b.name) : (b.featured - a.featured) || (a.id - b.id));
    const tags = {};
    S.designs.filter(d => d.active).forEach(d => (d.tags || []).forEach(t => tags[t] = (tags[t] || 0) + 1));
    return { ok: true, designs: list, total: list.length, tags: Object.entries(tags).map(([tag, c]) => ({ tag, c })).sort((a, b) => b.c - a.c) };
  });
  R('GET', '/api/designs/:key', (m, q, p) => {
    const d = S.designs.find(x => x.active && (x.slug === p.key || String(x.id) === p.key));
    if (!d) throw fail('That design is not available.', 404);
    return { ok: true, design: d, related: S.designs.filter(x => x.active && x.id !== d.id).sort((a, b) => b.featured - a.featured).slice(0, 3) };
  });

  R('GET', '/api/coupons', () => ({ ok: true, coupons: S.coupons.filter(c => c.active).map(cOut) }));
  R('POST', '/api/coupons/validate', (m, q, p, b) => {
    const sub = Number(b.subtotal || 0);
    const r = checkCoupon(b.code, sub);
    return { ok: true, coupon: cOut(r.coupon), discount: r.discount, total: Math.max(0, sub - r.discount) };
  });

  R('POST', '/api/orders', (m, q, p, b) => {
    const items = b.items || [];
    if (!items.length) throw fail('Your bag is empty.');
    if (!String(b.name || '').trim()) throw fail('Please enter your name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email || '')) throw fail('Please enter a valid email.');
    const lines = []; let amount = 0;
    for (const raw of items) {
      const d = S.designs.find(x => x.active && (String(x.id) === String(raw.id) || x.slug === raw.slug));
      if (!d) throw fail('One of the designs is no longer for sale.');
      if (lines.some(l => l.designId === d.id)) continue;
      const allowed = (d.formats || []).map(f => f.key);
      let formats = Array.isArray(raw.formats) ? raw.formats.filter(f => allowed.includes(f)) : [];
      if (!formats.length) formats = (d.defaultFormats && d.defaultFormats.length) ? d.defaultFormats.slice() : allowed.slice();
      amount += d.price;
      lines.push({ designId: d.id, slug: d.slug, name: d.name, price: d.price, formats, stitchCount: d.stitchCount, hoop: d.hoop, preview: d.preview });
    }
    const subtotal = Math.round(amount * 100) / 100;
    let discount = 0, couponCode = null;
    if (b.coupon) {
      const r = checkCoupon(b.coupon, subtotal);
      discount = r.discount; couponCode = r.coupon.code; r.coupon.used++;
    }
    const o = {
      id: ++S.seq.order,
      code: 'SDY-' + Date.now().toString(36).toUpperCase().slice(-4) + Math.floor(Math.random() * 900 + 100),
      name: b.name.trim(), email: b.email.trim(), phone: (b.phone || '').trim(),
      items: lines, subtotal, discount, coupon_code: couponCode,
      amount: Math.max(0, Math.round((subtotal - discount) * 100) / 100), status: 'awaiting',
      upi_ref: '', screenshot: null, note: null, created_at: now(), paid_at: null
    };
    S.orders.unshift(o); save();
    return { ok: true, order: oOut(o) };
  });
  R('GET', '/api/orders/:code', (m, q, p) => {
    const o = S.orders.find(x => x.code.toUpperCase() === String(p.code).toUpperCase());
    if (!o) throw fail('No order with that code.', 404);
    return { ok: true, order: oOut(o, { withLinks: true }) };
  });
  R('POST', '/api/orders/:code/proof', (m, q, p, b) => {
    const o = S.orders.find(x => x.code.toUpperCase() === String(p.code).toUpperCase());
    if (!o) throw fail('Order not found.', 404);
    if (o.status === 'paid') return { ok: true, order: oOut(o, { withLinks: true }), message: 'Already confirmed.' };
    const shot = String(b.screenshot || '');
    if (!/^data:image\/(png|jpe?g|webp|gif);base64,/.test(shot)) throw fail('Attach a screenshot image (PNG, JPG or WebP).');
    if (shot.length < 2000) throw fail('That image looks empty — attach the payment screenshot again.');
    const auto = String(S.settings.auto_approve) === '1';
    o.screenshot = shot; o.upi_ref = String(b.ref || '').slice(0, 60);
    o.status = auto ? 'paid' : 'submitted';
    o.paid_at = auto ? now() : null;
    o.note = auto ? 'Auto-confirmed from uploaded payment proof' : 'Awaiting manual check';
    save();
    return { ok: true, autoConfirmed: auto, order: oOut(o, { withLinks: auto }),
      message: auto ? 'Payment screenshot received — order confirmed.' : 'Screenshot received. The studio will confirm shortly.' };
  });
  R('POST', '/api/orders/:code/links', (m, q, p) => {
    const o = S.orders.find(x => x.code.toUpperCase() === String(p.code).toUpperCase());
    if (!o) throw fail('Order not found.', 404);
    if (o.status !== 'paid') throw fail('This order is not confirmed yet.', 403);
    return { ok: true, downloads: linksFor(o, true) };
  });

  /* admin */
  R('POST', '/api/admin/login', (m, q, p, b) => {
    if (String(b.password || '') !== String(S.settings.admin_password || '252525')) throw fail('Wrong password. Try again.', 401);
    const t = 'adm' + Math.random().toString(36).slice(2);
    S.adminSessions[t] = true; LS.setItem('ra_admin_token', t); save();
    return { ok: true, token: t };
  });
  R('GET', '/api/admin/session', () => ({ ok: true, admin: adminOK() }));
  R('POST', '/api/admin/logout', () => { LS.removeItem('ra_admin_token'); return { ok: true }; });
  R('GET', '/api/admin/stats', () => {
    guard();
    const paid = S.orders.filter(o => o.status === 'paid');
    const revenue = paid.reduce((s, o) => s + o.amount, 0);
    const series = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      series.push({ date: key, label: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
        revenue: paid.filter(o => String(o.paid_at || '').slice(0, 10) === key).reduce((s, o) => s + o.amount, 0),
        orders: S.orders.filter(o => String(o.created_at).slice(0, 10) === key).length });
    }
    const sold = {}, fmt = {};
    paid.forEach(o => o.items.forEach(it => {
      sold[it.designId] = sold[it.designId] || { name: it.name, units: 0, revenue: 0 };
      sold[it.designId].units++; sold[it.designId].revenue += it.price;
      (it.formats || []).forEach(f => fmt[f] = (fmt[f] || 0) + 1);
    }));
    const c = s => S.orders.filter(o => o.status === s).length;
    return { ok: true, stats: {
      revenue, orders: S.orders.length, paid: paid.length, awaiting: c('awaiting'), submitted: c('submitted'), rejected: c('rejected'),
      aov: paid.length ? Math.round(revenue / paid.length) : 0,
      downloads: Object.keys(S.tokens).length, designs: S.designs.filter(d => d.active).length,
      series, topDesigns: Object.values(sold).sort((a, b) => b.units - a.units).slice(0, 5),
      coupons: paid.filter(o => o.coupon_code).reduce((acc, o) => { const u = acc.find(x => x.code === o.coupon_code); if (u) { u.n++; u.discount += o.discount || 0; } else acc.push({ code: o.coupon_code, n: 1, discount: o.discount || 0 }); return acc; }, []),
      discounted: paid.filter(o => o.coupon_code).length,
      formats: Object.entries(fmt).sort((a, b) => b[1] - a[1]).map(([key, n]) => ({ key, n })),
      recent: S.orders.slice(0, 8).map(o => oOut(o, { admin: true })) } };
  });
  R('GET', '/api/admin/orders', (m, q) => {
    guard();
    const list = q.status && q.status !== 'all' ? S.orders.filter(o => o.status === q.status) : S.orders;
    return { ok: true, orders: list.map(o => oOut(o, { admin: true, withLinks: true })) };
  });
  R('PATCH', '/api/admin/orders/:id', (m, q, p, b) => {
    guard();
    const o = S.orders.find(x => String(x.id) === String(p.id));
    if (!o) throw fail('Order not found.', 404);
    if (b.status) {
      if (!['awaiting', 'submitted', 'paid', 'rejected'].includes(b.status)) throw fail('Unknown status.');
      o.status = b.status;
      o.paid_at = b.status === 'paid' ? (o.paid_at || now()) : null;
    }
    if (b.note !== undefined) o.note = b.note;
    save();
    return { ok: true, order: oOut(o, { admin: true, withLinks: true }) };
  });
  R('GET', '/api/admin/designs', () => { guard(); return { ok: true, designs: S.designs.slice().reverse() }; });
  R('POST', '/api/admin/designs', () => { guard(); throw fail('New designs are imported with their machine files — run the import script.', 400); });
  R('PUT', '/api/admin/designs/:id', (m, q, p, b) => {
    guard();
    const d = S.designs.find(x => String(x.id) === String(p.id));
    if (!d) throw fail('Design not found.', 404);
    Object.assign(d, { name: b.name || d.name, price: Number(b.price || d.price), mrp: Number(b.mrp || d.mrp),
      summary: b.summary ?? d.summary, description: b.description ?? d.description, hoop: b.hoop ?? d.hoop,
      featured: b.featured ? 1 : 0, active: b.active === false ? 0 : 1 });
    save();
    return { ok: true, design: d };
  });
  R('DELETE', '/api/admin/designs/:id', (m, q, p) => {
    guard();
    const d = S.designs.find(x => String(x.id) === String(p.id));
    if (d) d.active = 0;
    save();
    return { ok: true, message: 'Design hidden from the store.' };
  });
  R('GET', '/api/admin/coupons', () => {
    guard();
    const usage = S.orders.filter(o => o.status === 'paid' && o.coupon_code)
      .reduce((acc, o) => { const u = acc.find(x => x.code === o.coupon_code); if (u) { u.n++; u.d += o.discount || 0; } else acc.push({ code: o.coupon_code, n: 1, d: o.discount || 0 }); return acc; }, []);
    return { ok: true, coupons: S.coupons.map(cOut), usage };
  });
  R('POST', '/api/admin/coupons', (m, q, p, b) => {
    guard();
    const code = String(b.code || '').trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,20}$/.test(code)) throw fail('Code must be 3–20 letters, numbers, - or _.');
    if (S.coupons.some(c => c.code.toUpperCase() === code)) throw fail('That code already exists.');
    if (!(Number(b.value) > 0)) throw fail('Value must be more than zero.');
    const c = { id: ++S.seq.coupon, code, type: b.type === 'flat' ? 'flat' : 'percent', value: Number(b.value),
      min_order: Number(b.minOrder || 0), max_uses: Number(b.maxUses || 0), used: 0,
      active: b.active === false ? 0 : 1, expires_at: b.expiresAt || null, note: b.note || '' };
    S.coupons.push(c); save();
    return { ok: true, coupon: cOut(c) };
  });
  R('PUT', '/api/admin/coupons/:id', (m, q, p, b) => {
    guard();
    const c = S.coupons.find(x => String(x.id) === String(p.id));
    if (!c) throw fail('Coupon not found.', 404);
    Object.assign(c, { type: b.type === 'flat' ? 'flat' : 'percent', value: Number(b.value),
      min_order: Number(b.minOrder || 0), max_uses: Number(b.maxUses || 0),
      active: b.active === false ? 0 : 1, expires_at: b.expiresAt || null, note: b.note || '' });
    save();
    return { ok: true, coupon: cOut(c) };
  });
  R('DELETE', '/api/admin/coupons/:id', (m, q, p) => {
    guard();
    S.coupons = S.coupons.filter(x => String(x.id) !== String(p.id)); save();
    return { ok: true, message: 'Coupon deleted.' };
  });

  R('GET', '/api/admin/settings', () => { guard(); const s = { ...S.settings }; delete s.admin_password; return { ok: true, settings: s }; });
  R('PUT', '/api/admin/settings', (m, q, p, b) => {
    guard();
    ['store_name', 'tagline', 'announcement', 'support_email', 'upi_id', 'payee_name', 'link_hours', 'auto_approve']
      .forEach(k => { if (b[k] !== undefined) S.settings[k] = b[k]; });
    save();
    return { ok: true, message: 'Settings saved.' };
  });
  R('POST', '/api/admin/password', (m, q, p, b) => {
    guard();
    if (String(b.current || '') !== String(S.settings.admin_password)) throw fail('Current password is incorrect.');
    if (String(b.next || '').length < 4) throw fail('New password needs at least 4 characters.');
    S.settings.admin_password = String(b.next);
    S.adminSessions = {}; LS.removeItem('ra_admin_token'); save();
    return { ok: true, message: 'Password updated.' };
  });

  function handle(method, path, body, query) {
    load();
    const [url, qstr] = path.split('?');
    const parts = url.split('/').filter(Boolean);
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
      return r.fn(method, query, params, body || {});
    }
    const e = new Error('Unknown API route: ' + method + ' ' + url); e.__code = 404; throw e;
  }

  window.Demo = { handle, reset, get state() { return load(); } };
})();

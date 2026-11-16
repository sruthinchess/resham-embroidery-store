/* =========================================================================
   admin.js — store admin panel (routes under #/admin)
   Default password: 252525 (changeable in Settings)
   ========================================================================= */
(function () {
  'use strict';

  /* localStorage can throw on file:// — fall back to memory */
  const LS = (function () {
    try { const k = '__rsm_probe'; window.localStorage.setItem(k, '1'); window.localStorage.removeItem(k); return window.localStorage; }
    catch (e) { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; }
  })();
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => '₹' + Number(n || 0).toLocaleString('en-IN');
  const dt = s => { const d = new Date(s); return isNaN(d) ? '—' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) + ', ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }); };
  const AK = 'rsm_admin_token';
  const token = () => LS.getItem(AK);
  const Store = window.Store;

  async function adminApi(path, opts = {}) {
    const method = opts.method || 'GET';
    if (Store.demo) { await new Promise(r => setTimeout(r, 80)); return window.Demo.handle(method, path, opts.body, opts.query); }
    const headers = { 'Content-Type': 'application/json', 'x-admin-token': token() || '' };
    const res = await fetch(path, { method, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const data = await res.json().catch(() => ({ ok: false, error: 'Unexpected response.' }));
    if (!res.ok || data.ok === false) { const e = new Error(data.error || 'Request failed'); e.status = res.status; throw e; }
    return data;
  }

  const MENU = [
    ['dashboard', 'Dashboard', '◍'], ['orders', 'Orders', '▤'], ['products', 'Products', '❖'],
    ['customers', 'Customers', '☺'], ['reviews', 'Reviews', '★'], ['coupons', 'Coupons', '⌗'], ['settings', 'Settings', '⚙']
  ];

  /* ------------------------------------------------------------- login view */
  function loginView(msg = '') {
    return `<div class="admin-login">
      <div class="login-card">
        <div style="text-align:center">
          <div style="width:46px;height:46px;margin:0 auto 12px;border-radius:50%;background:var(--maroon-soft);display:grid;place-items:center;color:var(--maroon);font-size:20px">✦</div>
          <span class="eyebrow">Store admin</span>
          <h1 style="margin-top:6px">${esc(Store.settings.store_name || 'Resham & Co.')}</h1>
          <p class="small muted">Enter your 6-digit store password to open the panel.</p>
        </div>
        <div class="pw-dots" id="dots">${[0, 1, 2, 3, 4, 5].map(i => `<i data-i="${i}"></i>`).join('')}</div>
        <p class="err center" id="loginErr" style="min-height:18px">${esc(msg)}</p>
        <div class="keypad" id="keypad">
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-k="${n}">${n}</button>`).join('')}
          <button data-k="clear" style="font-size:13px">Clear</button>
          <button data-k="0">0</button>
          <button data-k="enter" style="background:var(--maroon);color:#fff;border-color:var(--maroon);font-size:14px">→</button>
        </div>
        <p class="small muted center" style="margin-top:16px">Default password <b>252525</b> — change it under Settings.</p>
        <a class="btn btn-ghost btn-block btn-sm" href="#/" style="margin-top:10px">← Back to storefront</a>
      </div></div>`;
  }

  function wireLogin(rerender) {
    let buf = '';
    const paint = () => {
      $$('#dots i').forEach((d, i) => d.classList.toggle('on', i < buf.length));
    };
    const submit = async () => {
      const err = $('#loginErr');
      err.textContent = '';
      try {
        const r = await adminApi('/api/admin/login', { method: 'POST', body: { password: buf } });
        LS.setItem(AK, r.token);
        window.toast('Welcome back', 'ok');
        rerender();
      } catch (e) {
        err.textContent = e.message;
        buf = ''; paint();
      }
    };
    $$('#keypad button').forEach(b => b.onclick = () => {
      const k = b.dataset.k;
      if (k === 'clear') { buf = ''; }
      else if (k === 'enter') { submit(); return; }
      else if (buf.length < 6) buf += k;
      paint();
      if (buf.length === 6) setTimeout(submit, 180);
    });
    const onKey = e => {
      if (/^[0-9]$/.test(e.key) && buf.length < 6) { buf += e.key; paint(); if (buf.length === 6) setTimeout(submit, 180); }
      else if (e.key === 'Backspace') { buf = buf.slice(0, -1); paint(); }
      else if (e.key === 'Enter') submit();
    };
    document.addEventListener('keydown', onKey);
    window.__adminKeyOff = () => document.removeEventListener('keydown', onKey);
  }

  /* ------------------------------------------------------------------ shell */
  function shell(section) {
    return `<div class="admin">
      <aside class="side">
        <div class="brand"><span style="width:26px;height:26px;border-radius:50%;border:2px dashed #c8a24a;display:inline-block"></span>${esc(Store.settings.store_name || 'Resham')}</div>
        ${MENU.map(([k, label, ic]) => `<a href="#/admin/${k}" class="${section === k ? 'on' : ''}"><span style="width:16px;text-align:center">${ic}</span>${label}</a>`).join('')}
        <div class="sep"></div>
        <a href="#/"><span style="width:16px;text-align:center">↗</span>View store</a>
        <a href="#" id="adminOut"><span style="width:16px;text-align:center">⏻</span>Sign out</a>
        <div class="side-foot">${Store.demo ? 'Demo mode · browser storage' : 'Connected · SQLite'}</div>
      </aside>
      <main class="amain" id="adminBody"><p class="muted">Loading…</p></main>
    </div>`;
  }

  /* -------------------------------------------------------------- dashboard */
  async function sectionDashboard() {
    const { stats } = await adminApi('/api/admin/stats');
    const max = Math.max(1, ...stats.series.map(d => d.revenue));
    const bars = stats.series.map(d => `<g>
        <rect x="0" y="${140 - (d.revenue / max) * 120}" width="100%" height="${(d.revenue / max) * 120 + 1}" rx="3" fill="${d.revenue ? '#8c2f39' : '#e9dcc9'}"/>
      </g>`).join('');
    const chart = stats.revenue === 0
      ? `<div style="height:150px;display:grid;place-items:center;border:1px dashed var(--line);border-radius:12px;color:var(--ink-mute);font-size:13px">
           No revenue yet — place a test order from the storefront and it will chart here.</div>`
      : `<svg class="sparkline" viewBox="0 0 700 150" preserveAspectRatio="none">
      ${stats.series.map((d, i) => `<rect x="${i * 50 + 6}" y="${140 - (d.revenue / max) * 120}" width="38" height="${(d.revenue / max) * 120 + 1}" rx="4" fill="${d.revenue ? 'url(#gr)' : '#efe6d8'}"/>`).join('')}
      <defs><linearGradient id="gr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8c2f39"/><stop offset="1" stop-color="#c08e3e"/></linearGradient></defs>
      ${stats.series.map((d, i) => i % 2 === 0 ? `<text x="${i * 50 + 25}" y="149" font-size="9" fill="#8b7b6d" text-anchor="middle">${d.label}</text>` : '').join('')}
    </svg>`;
    return `<div class="ahead"><div><h1>Dashboard</h1><p class="muted small" style="margin:4px 0 0">Live view of ${esc(Store.settings.store_name)}</p></div>
        <div class="row"><a class="btn btn-ghost btn-sm" href="#/" target="_self">View store ↗</a>
        <button class="btn btn-primary btn-sm" id="newProdTop">+ Add product</button></div></div>
      <div class="kpis">
        <div class="kpi"><span class="lab">Revenue</span><b>${money(stats.revenue)}</b><span class="delta">${stats.liveOrders} paid orders</span></div>
        <div class="kpi"><span class="lab">Orders</span><b>${stats.orders}</b><span class="delta">${stats.byStatus.placed} awaiting packing</span></div>
        <div class="kpi"><span class="lab">Avg. order value</span><b>${money(stats.aov)}</b><span class="delta">across all live orders</span></div>
        <div class="kpi"><span class="lab">Customers</span><b>${stats.customers}</b><span class="delta">${stats.products} active products</span></div>
      </div>
      <div class="grid" style="display:grid;grid-template-columns:1.6fr 1fr;gap:16px">
        <div class="card"><div class="card-h"><h3>Revenue · last 14 days</h3><span class="tag live">live</span></div>${chart}</div>
        <div class="card"><h3>Order pipeline</h3>
          ${['placed', 'packed', 'shipped', 'delivered', 'cancelled'].map(s => {
            const n = stats.byStatus[s] || 0, pct = stats.orders ? (n / stats.orders) * 100 : 0;
            return `<div style="margin-bottom:12px"><div class="between" style="margin-bottom:4px"><span class="small">${s[0].toUpperCase() + s.slice(1)}</span><b class="small">${n}</b></div>
              <div class="bar"><i style="width:${pct}%"></i></div></div>`;
          }).join('')}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px">
        <div class="card"><div class="card-h"><h3>Top sellers</h3><a class="small link" href="#/admin/products">All products</a></div>
          ${stats.topProducts.length ? `<div class="tbl-wrap"><table class="tbl"><tbody>
            ${stats.topProducts.map(p => `<tr><td>${esc(p.name)}</td><td class="num">${p.qty} sold</td><td class="num"><b>${money(p.revenue)}</b></td></tr>`).join('')}
          </tbody></table></div>` : `<p class="muted small">No sales yet — orders will show up here.</p>`}
        </div>
        <div class="card"><div class="card-h"><h3>Low stock</h3><span class="tag ${stats.lowStockCount ? 'pending' : 'approved'}">${stats.lowStockCount} items</span></div>
          ${stats.lowStock.length ? `<div class="tbl-wrap"><table class="tbl"><tbody>
            ${stats.lowStock.map(p => `<tr><td><a href="#/admin/products" class="link">${esc(p.name)}</a></td><td class="num">${p.stock} left</td></tr>`).join('')}
          </tbody></table></div>` : `<p class="muted small">Everything is comfortably in stock.</p>`}
        </div>
      </div>
      <div class="card" style="margin-top:16px"><div class="card-h"><h3>Recent orders</h3><a class="small link" href="#/admin/orders">All orders →</a></div>
        ${ordersTable(stats.recentOrders, true)}
      </div>`;
  }

  function ordersTable(orders, compact) {
    if (!orders.length) return `<p class="muted small">No orders yet.</p>`;
    return `<div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Order</th><th>Customer</th>${compact ? '' : '<th>Items</th>'}<th>Placed</th><th>Status</th><th class="num">Total</th><th></th></tr></thead>
      <tbody>${orders.map(o => `<tr>
        <td><b>${esc(o.code)}</b></td>
        <td>${esc(o.customer.name)}<div class="small muted">${esc(o.customer.city)}</div></td>
        ${compact ? '' : `<td>${o.items.reduce((s, i) => s + i.qty, 0)}</td>`}
        <td class="small">${dt(o.createdAt)}</td>
        <td><span class="tag ${o.status}">${o.status}</span></td>
        <td class="num"><b>${money(o.total)}</b></td>
        <td><button class="btn btn-xs btn-ghost" data-order="${o.id}">Open</button></td>
      </tr>`).join('')}</tbody></table></div>`;
  }

  /* ----------------------------------------------------------------- orders */
  let orderFilter = 'all';
  async function sectionOrders() {
    const { orders } = await adminApi('/api/admin/orders' + (orderFilter !== 'all' ? '?status=' + orderFilter : ''));
    const counts = {};
    (await adminApi('/api/admin/orders')).orders.forEach(o => counts[o.status] = (counts[o.status] || 0) + 1);
    return `<div class="ahead"><div><h1>Orders</h1><p class="muted small" style="margin:4px 0 0">${orders.length} order${orders.length === 1 ? '' : 's'} ${orderFilter !== 'all' ? '· ' + orderFilter : ''}</p></div></div>
      <div class="shopbar" style="border:0;padding:0 0 14px">
        <button class="filter-chip ${orderFilter === 'all' ? 'on' : ''}" data-of="all">All</button>
        ${['placed', 'packed', 'shipped', 'delivered', 'cancelled'].map(s => `<button class="filter-chip ${orderFilter === s ? 'on' : ''}" data-of="${s}">${s} <span class="muted">${counts[s] || 0}</span></button>`).join('')}
      </div>
      <div class="card">${ordersTable(orders, false)}</div>`;
  }

  function orderModal(o) {
    const next = { placed: ['packed', 'shipped'], packed: ['shipped'], shipped: ['delivered'], delivered: [], cancelled: [] }[o.status] || [];
    return `<div class="modal" style="width:min(680px,100%)">
      <header><div><span class="eyebrow">${esc(o.code)}</span><h3 style="margin-top:2px">Order detail</h3></div>
        <button class="icon-btn" id="mClose">✕</button></header>
      <div class="between" style="margin-bottom:14px"><span class="tag ${o.status}">${o.status}</span>
        <span class="small muted">Placed ${dt(o.createdAt)}</span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div class="card" style="padding:14px"><span class="lab small muted">Ship to</span>
          <p class="small" style="margin:6px 0 0"><b>${esc(o.customer.name)}</b><br>${esc(o.customer.address)}<br>${esc(o.customer.city)}, ${esc(o.customer.state)} ${esc(o.customer.pincode)}<br>${esc(o.customer.phone)}<br>${esc(o.customer.email)}</p></div>
        <div class="card" style="padding:14px"><span class="lab small muted">Payment</span>
          <p class="small" style="margin:6px 0 0">${esc(o.paymentMethod.toUpperCase())} · ${esc(o.paymentStatus)}<br>
          Subtotal ${money(o.subtotal)}<br>${o.discount ? 'Discount −' + money(o.discount) + '<br>' : ''}Shipping ${o.shipping ? money(o.shipping) : 'Free'}<br>
          ${o.codFee ? 'COD fee ' + money(o.codFee) + '<br>' : ''}<b>Total ${money(o.total)}</b></p>
          ${o.coupon ? `<p class="small muted" style="margin:6px 0 0">Coupon ${esc(o.coupon)}</p>` : ''}</div>
      </div>
      <div class="card" style="padding:14px;margin-top:12px"><span class="lab small muted">Items</span>
        ${o.items.map(l => `<div class="between small" style="padding:6px 0;border-bottom:1px solid var(--line-soft)">
          <span>${esc(l.name)} <span class="muted">· ${esc(l.color)} · ${esc(l.size)}</span></span><span>×${l.qty} · <b>${money(l.price * l.qty)}</b></span></div>`).join('')}
      </div>
      ${o.notes ? `<p class="small muted" style="margin-top:10px">Note from customer: “${esc(o.notes)}”</p>` : ''}
      <div class="card" style="padding:14px;margin-top:12px"><span class="lab small muted">Timeline</span>
        <div class="timeline" style="margin-top:8px">
          ${o.events.map(e => `<div class="tl-item done" style="padding-bottom:10px"><div class="tl-dot">✓</div><div><b class="small">${esc(e.status)}</b><span>${dt(e.at)} · ${esc(e.note || '')}</span></div></div>`).join('')}
        </div>
      </div>
      <div class="row" style="margin-top:16px;flex-wrap:wrap">
        ${next.map(n => `<button class="btn btn-primary btn-sm" data-adv="${n}">Mark ${n}</button>`).join('')}
        ${!['delivered', 'cancelled'].includes(o.status) ? `<button class="btn btn-ghost btn-sm" data-adv="cancelled">Cancel order</button>` : ''}
        ${o.paymentStatus !== 'paid' ? `<button class="btn btn-ghost btn-sm" data-paid="1">Mark paid</button>` : ''}
      </div>
    </div>`;
  }

  /* --------------------------------------------------------------- products */
  async function sectionProducts() {
    const { products, categories } = await adminApi('/api/admin/products');
    return `<div class="ahead"><div><h1>Products</h1><p class="muted small" style="margin:4px 0 0">${products.filter(p => p.active).length} live · ${products.filter(p => !p.active).length} archived</p></div>
        <button class="btn btn-primary btn-sm" id="newProd">+ Add product</button></div>
      <div class="card"><div class="tbl-wrap"><table class="tbl">
        <thead><tr><th></th><th>Product</th><th>Category</th><th class="num">Price</th><th class="num">Stock</th><th>Status</th><th></th></tr></thead>
        <tbody>${products.map(p => `<tr>
          <td><div style="width:44px;height:52px;border-radius:8px;overflow:hidden;border:1px solid var(--line)">${window.art(p.pattern, p.palette)}</div></td>
          <td><b>${esc(p.name)}</b><div class="small muted">${esc(p.fabric || '')}</div></td>
          <td class="small">${esc(p.categoryName || '—')}</td>
          <td class="num">${money(p.price)}${p.mrp > p.price ? `<div class="small muted"><s>${money(p.mrp)}</s></div>` : ''}</td>
          <td class="num">${p.stock === 0 ? '<span class="tag cancelled">0</span>' : p.stock <= 5 ? `<span class="tag pending">${p.stock}</span>` : p.stock}</td>
          <td><span class="tag ${p.active ? 'live' : 'off'}">${p.active ? 'live' : 'archived'}</span>${p.featured ? ' <span class="tag pending">★</span>' : ''}</td>
          <td style="white-space:nowrap"><button class="btn btn-xs btn-ghost" data-edit="${p.id}">Edit</button>
            ${p.active ? `<button class="btn btn-xs btn-ghost" data-del="${p.id}">Archive</button>` : ''}</td>
        </tr>`).join('')}</tbody></table></div></div>
      <datalist id="cats">${categories.map(c => `<option value="${esc(c.name)}">`).join('')}</datalist>`;
  }

  function productForm(p, categories) {
    const pal = (p.palette && p.palette.length ? p.palette : ['#8c2f39', '#c8a24a', '#f4e7d3']);
    return `<div class="modal" style="width:min(720px,100%)">
      <header><div><span class="eyebrow">${p.id ? 'Edit' : 'New'} product</span><h3 style="margin-top:2px">${esc(p.name || 'Untitled piece')}</h3></div>
        <button class="icon-btn" id="mClose">✕</button></header>
      <form id="pForm" class="stack">
        <div class="grid-2">
          <div class="field"><label>Name</label><input class="input" name="name" value="${esc(p.name || '')}" required></div>
          <div class="field"><label>Category</label><select class="select" name="categoryId">
            ${categories.map(c => `<option value="${c.id}" ${p.categoryId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
        </div>
        <div class="grid-3">
          <div class="field"><label>Price (₹)</label><input class="input" name="price" type="number" min="1" value="${p.price || ''}" required></div>
          <div class="field"><label>MRP (₹)</label><input class="input" name="mrp" type="number" min="0" value="${p.mrp || ''}"></div>
          <div class="field"><label>Stock</label><input class="input" name="stock" type="number" min="0" value="${p.stock ?? 10}"></div>
        </div>
        <div class="grid-2">
          <div class="field"><label>Fabric</label><input class="input" name="fabric" value="${esc(p.fabric || '')}" placeholder="Mulmul cotton"></div>
          <div class="field"><label>Badge (optional)</label><input class="input" name="badge" value="${esc(p.badge || '')}" placeholder="New / Bestseller / Couture"></div>
        </div>
        <div class="grid-2">
          <div class="field"><label>Colours (comma separated)</label><input class="input" name="colors" value="${esc((p.colors || []).join(', '))}"></div>
          <div class="field"><label>Sizes (comma separated)</label><input class="input" name="sizes" value="${esc((p.sizes || []).join(', '))}"></div>
        </div>
        <div class="field"><label>Description</label><textarea class="textarea" name="description">${esc(p.description || '')}</textarea></div>
        <div class="grid-2">
          <div class="field"><label>Embroidery motif</label><select class="select" name="pattern">
            ${['floral', 'mandala', 'paisley', 'geometric', 'hoop', 'peacock', 'kantha', 'zari'].map(x => `<option value="${x}" ${p.pattern === x ? 'selected' : ''}>${x}</option>`).join('')}
          </select></div>
          <div class="field"><label>Thread palette</label>
            <div class="row">
              ${[0, 1, 2].map(i => `<input class="input" type="color" name="c${i}" value="${pal[i]}" style="padding:4px;height:42px">`).join('')}
            </div></div>
        </div>
        <div class="row" style="gap:18px">
          <label class="row small"><input type="checkbox" name="featured" ${p.featured ? 'checked' : ''}> Feature on homepage</label>
          <label class="row small"><input type="checkbox" name="active" ${p.active !== false ? 'checked' : ''}> Visible in store</label>
        </div>
        <div class="row" style="margin-top:6px"><button class="btn btn-primary">${p.id ? 'Save changes' : 'Create product'}</button>
          <button type="button" class="btn btn-ghost" id="mCancel">Cancel</button></div>
      </form></div>`;
  }

  /* -------------------------------------------------------------- customers */
  async function sectionCustomers() {
    const { customers, guests } = await adminApi('/api/admin/customers');
    return `<div class="ahead"><div><h1>Customers</h1><p class="muted small" style="margin:4px 0 0">${customers.length} registered accounts</p></div></div>
      <div class="card"><h3>Registered</h3>
        ${customers.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th class="num">Orders</th><th class="num">Spent</th><th>Joined</th></tr></thead>
        <tbody>${customers.map(c => `<tr><td><b>${esc(c.name)}</b></td><td class="small">${esc(c.email)}</td><td class="small">${esc(c.phone || '—')}</td>
          <td class="num">${c.orders}</td><td class="num"><b>${money(c.spent)}</b></td><td class="small muted">${dt(c.created_at)}</td></tr>`).join('')}</tbody></table></div>`
        : `<p class="muted small">No accounts yet — guest checkout orders still appear below.</p>`}
      </div>
      <div class="card" style="margin-top:16px"><h3>Guest checkouts</h3>
        ${guests.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th class="num">Orders</th><th class="num">Spent</th><th>Last order</th></tr></thead>
        <tbody>${guests.map(g => `<tr><td><b>${esc(g.name)}</b></td><td class="small">${esc(g.email)}</td><td class="small">${esc(g.phone || '—')}</td>
          <td class="num">${g.orders}</td><td class="num">${money(g.spent)}</td><td class="small muted">${dt(g.created_at)}</td></tr>`).join('')}</tbody></table></div>`
        : `<p class="muted small">No guest orders yet.</p>`}
      </div>`;
  }

  /* ---------------------------------------------------------------- reviews */
  async function sectionReviews() {
    const { reviews } = await adminApi('/api/admin/reviews');
    const pend = reviews.filter(r => r.status === 'pending');
    return `<div class="ahead"><div><h1>Reviews</h1><p class="muted small" style="margin:4px 0 0">${pend.length} awaiting moderation · ${reviews.length} total</p></div></div>
      ${reviews.length ? `<div class="card"><div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Product</th><th>Reviewer</th><th>Rating</th><th>Review</th><th>Status</th><th></th></tr></thead>
        <tbody>${reviews.map(r => `<tr>
          <td class="small"><b>${esc(r.product_name || '—')}</b></td>
          <td class="small">${esc(r.name)}<div class="small muted">${dt(r.created_at)}</div></td>
          <td>${'★'.repeat(r.rating)}<span class="muted">${'★'.repeat(5 - r.rating)}</span></td>
          <td class="small" style="max-width:340px">${r.title ? `<b>${esc(r.title)}</b><br>` : ''}${esc(r.body)}</td>
          <td><span class="tag ${r.status === 'approved' ? 'approved' : 'pending'}">${r.status}</span></td>
          <td style="white-space:nowrap">
            ${r.status !== 'approved' ? `<button class="btn btn-xs btn-primary" data-approve="${r.id}">Approve</button>` : `<button class="btn btn-xs btn-ghost" data-unapprove="${r.id}">Hide</button>`}
            <button class="btn btn-xs btn-ghost" data-delrev="${r.id}">Delete</button></td>
        </tr>`).join('')}</tbody></table></div></div>`
        : `<div class="card"><p class="muted small">No reviews yet.</p></div>`}`;
  }

  /* ---------------------------------------------------------------- coupons */
  async function sectionCoupons() {
    const { coupons } = await adminApi('/api/admin/coupons');
    return `<div class="ahead"><div><h1>Coupons</h1><p class="muted small" style="margin:4px 0 0">${coupons.filter(c => c.active).length} active codes</p></div>
        <button class="btn btn-primary btn-sm" id="newCoupon">+ New coupon</button></div>
      <div class="card"><div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Code</th><th>Type</th><th class="num">Value</th><th class="num">Min order</th><th class="num">Used</th><th>Status</th><th></th></tr></thead>
        <tbody>${coupons.map(c => `<tr>
          <td><b style="letter-spacing:.06em">${esc(c.code)}</b></td>
          <td class="small">${c.type === 'percent' ? 'Percent' : 'Flat'}</td>
          <td class="num">${c.type === 'percent' ? c.value + '%' : money(c.value)}</td>
          <td class="num">${money(c.min_order)}</td>
          <td class="num">${c.used} / ${c.max_uses}</td>
          <td><span class="tag ${c.active ? 'live' : 'off'}">${c.active ? 'active' : 'paused'}</span></td>
          <td style="white-space:nowrap"><button class="btn btn-xs btn-ghost" data-editc="${c.id}">Edit</button>
            <button class="btn btn-xs btn-ghost" data-delc="${c.id}">Delete</button></td>
        </tr>`).join('')}</tbody></table></div></div>`;
  }

  function couponForm(c) {
    return `<div class="modal" style="width:min(480px,100%)">
      <header><div><span class="eyebrow">${c.id ? 'Edit' : 'New'} coupon</span><h3 style="margin-top:2px">${esc(c.code || 'Code')}</h3></div><button class="icon-btn" id="mClose">✕</button></header>
      <form id="cForm" class="stack">
        <div class="field"><label>Code</label><input class="input" name="code" value="${esc(c.code || '')}" placeholder="WELCOME10" required style="text-transform:uppercase"></div>
        <div class="grid-2">
          <div class="field"><label>Type</label><select class="select" name="type">
            <option value="percent" ${c.type === 'percent' ? 'selected' : ''}>Percent off</option>
            <option value="flat" ${c.type === 'flat' ? 'selected' : ''}>Flat ₹ off</option></select></div>
          <div class="field"><label>Value</label><input class="input" name="value" type="number" min="1" value="${c.value || 10}" required></div>
        </div>
        <div class="grid-2">
          <div class="field"><label>Min order (₹)</label><input class="input" name="minOrder" type="number" min="0" value="${c.min_order ?? 0}"></div>
          <div class="field"><label>Max uses</label><input class="input" name="maxUses" type="number" min="1" value="${c.max_uses ?? 100}"></div>
        </div>
        <label class="row small"><input type="checkbox" name="active" ${c.active ? 'checked' : ''}> Active</label>
        <div class="row"><button class="btn btn-primary">${c.id ? 'Save' : 'Create'}</button><button type="button" class="btn btn-ghost" id="mCancel">Cancel</button></div>
      </form></div>`;
  }

  /* --------------------------------------------------------------- settings */
  async function sectionSettings() {
    const { settings } = await adminApi('/api/admin/settings');
    return `<div class="ahead"><div><h1>Settings</h1><p class="muted small" style="margin:4px 0 0">Store details, shipping and admin password</p></div></div>
      <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:16px;align-items:start">
        <div class="card"><h3>Storefront</h3>
          <form id="sForm" class="stack">
            <div class="grid-2">
              <div class="field"><label>Store name</label><input class="input" name="store_name" value="${esc(settings.store_name || '')}"></div>
              <div class="field"><label>Support email</label><input class="input" name="support_email" value="${esc(settings.support_email || '')}"></div>
            </div>
            <div class="grid-2">
              <div class="field"><label>Support phone</label><input class="input" name="support_phone" value="${esc(settings.support_phone || '')}"></div>
              <div class="field"><label>Tagline</label><input class="input" name="tagline" value="${esc(settings.tagline || '')}"></div>
            </div>
            <div class="field"><label>Announcement bar</label><input class="input" name="announcement" value="${esc(settings.announcement || '')}"></div>
            <div class="grid-3">
              <div class="field"><label>Free shipping above (₹)</label><input class="input" name="free_shipping_threshold" type="number" value="${settings.free_shipping_threshold || 2999}"></div>
              <div class="field"><label>Shipping fee (₹)</label><input class="input" name="shipping_fee" type="number" value="${settings.shipping_fee || 99}"></div>
              <div class="field"><label>COD fee (₹)</label><input class="input" name="cod_fee" type="number" value="${settings.cod_fee || 49}"></div>
            </div>
            <button class="btn btn-primary">Save settings</button>
          </form>
        </div>
        <div class="stack">
          <div class="card"><h3>Admin password</h3>
            <p class="small muted">The panel opens with this 6-digit code.</p>
            <form id="pwForm" class="stack">
              <div class="field"><label>Current password</label><input class="input" name="current" type="password" placeholder="••••••"></div>
              <div class="field"><label>New password</label><input class="input" name="next" type="password" placeholder="At least 4 characters"></div>
              <button class="btn btn-dark">Update password</button>
            </form>
          </div>
          <div class="card"><h3>Danger zone</h3>
            <p class="small muted">Reset the demo catalogue back to the seeded 16 pieces. Orders are cleared too.</p>
            ${Store.demo ? `<button class="btn btn-ghost btn-sm" id="resetDemo">Reset demo data</button>` : `<p class="small muted">Run <code>npm run reset</code> in the project folder to reseed.</p>`}
          </div>
        </div>
      </div>`;
  }

  /* ------------------------------------------------------------------ router */
  let section = 'dashboard';

  async function render(app, parts) {
    section = parts[0] || 'dashboard';
    if (window.__adminKeyOff) { window.__adminKeyOff(); window.__adminKeyOff = null; }

    if (!token()) { app.innerHTML = loginView(); wireLogin(() => render(app, parts)); return; }
    try {
      const s = await adminApi('/api/admin/session');
      if (!s.admin) throw new Error('expired');
    } catch (e) {
      LS.removeItem(AK);
      app.innerHTML = loginView('Session expired — sign in again.');
      wireLogin(() => render(app, parts));
      return;
    }

    app.innerHTML = shell(section);
    const body = $('#adminBody');
    $('#adminOut').onclick = async e => {
      e.preventDefault();
      try { await adminApi('/api/admin/logout', { method: 'POST' }); } catch {}
      LS.removeItem(AK);
      window.toast('Signed out of admin');
      render(app, []);
    };

    try {
      if (section === 'dashboard') body.innerHTML = await sectionDashboard();
      else if (section === 'orders') body.innerHTML = await sectionOrders();
      else if (section === 'products') body.innerHTML = await sectionProducts();
      else if (section === 'customers') body.innerHTML = await sectionCustomers();
      else if (section === 'reviews') body.innerHTML = await sectionReviews();
      else if (section === 'coupons') body.innerHTML = await sectionCoupons();
      else if (section === 'settings') body.innerHTML = await sectionSettings();
      else body.innerHTML = await sectionDashboard();
    } catch (e) {
      body.innerHTML = `<div class="card"><h3>Could not load this view</h3><p class="muted small">${esc(e.message)}</p></div>`;
      return;
    }
    wire(section, body, app, parts);
  }

  function closeModal() { const m = $('#modal'); m.classList.remove('on'); m.innerHTML = ''; }
  function openModal(html) {
    const m = $('#modal');
    m.innerHTML = html; m.classList.add('on');
    m.onclick = e => { if (e.target === m) closeModal(); };
    const c = $('#mClose'); if (c) c.onclick = closeModal;
    const x = $('#mCancel'); if (x) x.onclick = closeModal;
  }

  function wire(section, body, app, parts) {
    const rerender = () => render(app, parts);

    // order filter chips
    body.querySelectorAll('[data-of]').forEach(b => b.onclick = () => { orderFilter = b.dataset.of; rerender(); });

    // open order
    body.querySelectorAll('[data-order]').forEach(b => b.onclick = async () => {
      const all = (await adminApi('/api/admin/orders')).orders;
      const o = all.find(x => x.id === Number(b.dataset.order));
      if (!o) return;
      openModal(orderModal(o));
      $('#modal').querySelectorAll('[data-adv]').forEach(x => x.onclick = async () => {
        const status = x.dataset.adv;
        if (status === 'cancelled' && !confirm('Cancel this order? Stock returns to the shelf.')) return;
        try {
          await adminApi('/api/admin/orders/' + o.id, { method: 'PATCH', body: { status } });
          window.toast(`Order ${o.code} → ${status}`, 'ok');
          closeModal(); rerender();
        } catch (e) { window.toast(e.message, 'bad'); }
      });
      const paid = $('#modal').querySelector('[data-paid]');
      if (paid) paid.onclick = async () => {
        await adminApi('/api/admin/orders/' + o.id, { method: 'PATCH', body: { paymentStatus: 'paid' } });
        window.toast('Marked as paid', 'ok'); closeModal(); rerender();
      };
    });

    // products
    const addProd = async (p) => {
      const { categories } = await adminApi('/api/admin/products');
      openModal(productForm(p || {}, categories));
      $('#pForm').onsubmit = async e => {
        e.preventDefault();
        const f = new FormData(e.target);
        const payload = {
          name: f.get('name'), categoryId: Number(f.get('categoryId')), price: Number(f.get('price')),
          mrp: Number(f.get('mrp') || f.get('price')), stock: Number(f.get('stock')),
          fabric: f.get('fabric'), badge: f.get('badge') || null,
          colors: String(f.get('colors') || '').split(',').map(s => s.trim()).filter(Boolean),
          sizes: String(f.get('sizes') || '').split(',').map(s => s.trim()).filter(Boolean),
          description: f.get('description'), pattern: f.get('pattern'),
          palette: [f.get('c0'), f.get('c1'), f.get('c2')],
          featured: !!f.get('featured'), active: !!f.get('active')
        };
        try {
          if (p && p.id) await adminApi('/api/admin/products/' + p.id, { method: 'PUT', body: payload });
          else await adminApi('/api/admin/products', { method: 'POST', body: payload });
          window.toast(p && p.id ? 'Product updated' : 'Product created', 'ok');
          closeModal(); rerender();
        } catch (err) { window.toast(err.message, 'bad'); }
      };
    };
    const nb = $('#newProd'); if (nb) nb.onclick = () => addProd(null);
    const nbt = $('#newProdTop'); if (nbt) nbt.onclick = () => addProd(null);
    body.querySelectorAll('[data-edit]').forEach(b => b.onclick = async () => {
      const { products } = await adminApi('/api/admin/products');
      const p = products.find(x => x.id === Number(b.dataset.edit));
      addProd(p);
    });
    body.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      if (!confirm('Archive this product? It disappears from the storefront but stays in order history.')) return;
      try { await adminApi('/api/admin/products/' + b.dataset.del, { method: 'DELETE' }); window.toast('Product archived'); rerender(); }
      catch (e) { window.toast(e.message, 'bad'); }
    });

    // reviews
    body.querySelectorAll('[data-approve]').forEach(b => b.onclick = async () => {
      await adminApi('/api/admin/reviews/' + b.dataset.approve, { method: 'PATCH', body: { status: 'approved' } });
      window.toast('Review approved', 'ok'); rerender();
    });
    body.querySelectorAll('[data-unapprove]').forEach(b => b.onclick = async () => {
      await adminApi('/api/admin/reviews/' + b.dataset.unapprove, { method: 'PATCH', body: { status: 'pending' } });
      window.toast('Review hidden'); rerender();
    });
    body.querySelectorAll('[data-delrev]').forEach(b => b.onclick = async () => {
      if (!confirm('Delete this review permanently?')) return;
      await adminApi('/api/admin/reviews/' + b.dataset.delrev, { method: 'DELETE' });
      window.toast('Review deleted'); rerender();
    });

    // coupons
    const editCoupon = async (c) => {
      openModal(couponForm(c || { type: 'percent', value: 10, active: 1 }));
      $('#cForm').onsubmit = async e => {
        e.preventDefault();
        const f = new FormData(e.target);
        const payload = { code: f.get('code'), type: f.get('type'), value: Number(f.get('value')),
          minOrder: Number(f.get('minOrder')), maxUses: Number(f.get('maxUses')), active: !!f.get('active') };
        try {
          if (c && c.id) await adminApi('/api/admin/coupons/' + c.id, { method: 'PUT', body: payload });
          else await adminApi('/api/admin/coupons', { method: 'POST', body: payload });
          window.toast('Coupon saved', 'ok'); closeModal(); rerender();
        } catch (err) { window.toast(err.message, 'bad'); }
      };
    };
    const nc = $('#newCoupon'); if (nc) nc.onclick = () => editCoupon(null);
    body.querySelectorAll('[data-editc]').forEach(b => b.onclick = async () => {
      const { coupons } = await adminApi('/api/admin/coupons');
      editCoupon(coupons.find(c => c.id === Number(b.dataset.editc)));
    });
    body.querySelectorAll('[data-delc]').forEach(b => b.onclick = async () => {
      if (!confirm('Delete this coupon?')) return;
      await adminApi('/api/admin/coupons/' + b.dataset.delc, { method: 'DELETE' });
      window.toast('Coupon deleted'); rerender();
    });

    // settings
    const sf = $('#sForm');
    if (sf) sf.onsubmit = async e => {
      e.preventDefault();
      const f = new FormData(sf);
      try {
        await adminApi('/api/admin/settings', { method: 'PUT', body: {
          store_name: f.get('store_name'), support_email: f.get('support_email'), support_phone: f.get('support_phone'),
          tagline: f.get('tagline'), announcement: f.get('announcement'),
          free_shipping_threshold: Number(f.get('free_shipping_threshold')), shipping_fee: Number(f.get('shipping_fee')),
          cod_fee: Number(f.get('cod_fee'))
        } });
        const s = await adminApi('/api/settings'); Store.settings = s.settings;
        window.toast('Settings saved', 'ok'); rerender();
      } catch (err) { window.toast(err.message, 'bad'); }
    };
    const pf = $('#pwForm');
    if (pf) pf.onsubmit = async e => {
      e.preventDefault();
      const f = new FormData(pf);
      try {
        await adminApi('/api/admin/password', { method: 'POST', body: { current: f.get('current'), next: f.get('next') } });
        LS.removeItem(AK);
        window.toast('Password updated — sign in again', 'ok');
        render(app, []);
      } catch (err) { window.toast(err.message, 'bad'); }
    };
    const rd = $('#resetDemo');
    if (rd) rd.onclick = () => {
      if (!confirm('Reset all demo data (orders, products, reviews) to the seeded catalogue?')) return;
      window.Demo.reset(); window.toast('Demo data reset'); rerender();
    };
  }

  window.Admin = { render };
})();

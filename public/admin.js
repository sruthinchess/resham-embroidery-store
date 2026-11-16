/* =========================================================================
   admin.js — studio admin (#/admin). Password 252525.
   ========================================================================= */
(function () {
  'use strict';
  const LS = (function () {
    try { const k = '__raa'; window.localStorage.setItem(k, '1'); window.localStorage.removeItem(k); return window.localStorage; }
    catch (e) { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; }
  })();
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => '₹' + Number(n || 0).toLocaleString('en-IN');
  const nf = n => Number(n || 0).toLocaleString('en-IN');
  const dt = s => { const d = new Date(s); return isNaN(d) ? '—' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) + ', ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }); };
  const AK = 'ra_admin_token';
  const Store = window.Store;

  async function adminApi(path, opts = {}) {
    const method = opts.method || 'GET';
    if (Store.demo) { await new Promise(r => setTimeout(r, 70)); return window.Demo.handle(method, path, opts.body, opts.query); }
    const headers = { 'Content-Type': 'application/json', 'x-admin-token': LS.getItem(AK) || '' };
    const res = await fetch(path, { method, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const data = await res.json().catch(() => ({ ok: false, error: 'Unexpected response.' }));
    if (!res.ok || data.ok === false) throw new Error(data.error || 'Request failed');
    return data;
  }

  const MENU = [['dashboard', 'Dashboard', '◍'], ['orders', 'Orders', '▤'], ['designs', 'Designs', '❖'], ['coupons', 'Coupons', '⌗'], ['settings', 'Settings', '⚙']];

  function loginView(msg = '') {
    return `<div class="admin-login"><div class="login-card">
      <div style="text-align:center">
        <img class="brand-logo" src="${esc(Store.settings.logo_url || 'img/logo.png')}" alt="">
        <span class="eyebrow" style="justify-content:center">Studio admin</span>
        <h1 style="margin-top:8px">${esc(Store.settings.store_name)}</h1>
        <p class="small muted">Enter the 6-digit studio password.</p>
      </div>
      <div class="pw-dots" id="dots">${[0, 1, 2, 3, 4, 5].map(i => `<i data-i="${i}"></i>`).join('')}</div>
      <p class="err center" id="loginErr" style="min-height:18px">${esc(msg)}</p>
      <div class="keypad" id="keypad">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-k="${n}">${n}</button>`).join('')}
        <button data-k="clear" style="font-size:12px">Clear</button><button data-k="0">0</button>
        <button data-k="enter" style="background:var(--maroon);color:#fff;border-color:var(--maroon)">→</button>
      </div>
      <p class="small muted center" style="margin-top:14px">Default password <b>252525</b> — change it in Settings.</p>
      <a class="btn btn-ghost btn-block btn-sm" href="#/" style="margin-top:10px">← Back to the store</a>
    </div></div>`;
  }

  function wireLogin(rerender) {
    let buf = '';
    const paint = () => $$('#dots i').forEach((d, i) => d.classList.toggle('on', i < buf.length));
    const submit = async () => {
      const err = $('#loginErr'); err.textContent = '';
      try {
        const r = await adminApi('/api/admin/login', { method: 'POST', body: { password: buf } });
        LS.setItem(AK, r.token); window.toast('Welcome back', 'ok'); rerender();
      } catch (e) { err.textContent = e.message; buf = ''; paint(); }
    };
    $$('#keypad button').forEach(b => b.onclick = () => {
      const k = b.dataset.k;
      if (k === 'clear') buf = '';
      else if (k === 'enter') { submit(); return; }
      else if (buf.length < 6) buf += k;
      paint();
      if (buf.length === 6) setTimeout(submit, 160);
    });
    const onKey = e => {
      if (/^[0-9]$/.test(e.key) && buf.length < 6) { buf += e.key; paint(); if (buf.length === 6) setTimeout(submit, 160); }
      else if (e.key === 'Backspace') { buf = buf.slice(0, -1); paint(); }
      else if (e.key === 'Enter') submit();
    };
    document.addEventListener('keydown', onKey);
    window.__offKey = () => document.removeEventListener('keydown', onKey);
  }

  function shell(section) {
    return `<div class="admin">
      <aside class="side">
        <div class="brand"><img src="${esc(Store.settings.logo_mark_url || 'img/logo-mark.png')}" alt="">${esc(String(Store.settings.store_name || '').split(' ')[0])}</div>
        ${MENU.map(([k, label, ic]) => `<a href="#/admin/${k}" class="${section === k ? 'on' : ''}"><span style="width:14px;text-align:center">${ic}</span>${label}</a>`).join('')}
        <div class="sep"></div>
        <a href="#/"><span style="width:14px;text-align:center">↗</span>View store</a>
        <a href="#" id="adminOut"><span style="width:14px;text-align:center">⏻</span>Sign out</a>
        <div class="side-foot">${Store.demo ? 'Demo · browser storage' : 'Connected · SQLite'}</div>
      </aside>
      <main class="amain" id="adminBody"><p class="muted small">Loading…</p></main>
    </div>`;
  }

  async function sectionDashboard() {
    const { stats } = await adminApi('/api/admin/stats');
    const max = Math.max(1, ...stats.series.map(d => d.revenue));
    const chart = stats.revenue === 0
      ? `<div style="height:140px;display:grid;place-items:center;border:1px dashed var(--line-strong);border-radius:10px;color:var(--ink-mute);font-size:13px">No confirmed payments yet — they chart here.</div>`
      : `<svg class="sparkline" viewBox="0 0 700 140" preserveAspectRatio="none">
          ${stats.series.map((d, i) => `<rect x="${i * 50 + 8}" y="${130 - (d.revenue / max) * 110}" width="34" height="${(d.revenue / max) * 110 + 1}" rx="3" fill="${d.revenue ? 'var(--maroon)' : '#e9e2d4'}"/>`).join('')}
          ${stats.series.map((d, i) => i % 2 === 0 ? `<text x="${i * 50 + 25}" y="139" font-size="9" fill="#8c8177" text-anchor="middle">${d.label}</text>` : '').join('')}
        </svg>`;
    const fmtMax = Math.max(1, ...(stats.formats || []).map(f => f.n));
    return `<div class="ahead"><div><h1>Dashboard</h1><p class="muted small" style="margin:2px 0 0">UPI at ${esc(Store.settings.upi_id)} · auto-confirm ${Store.settings.auto_approve ? 'on' : 'off'}</p></div>
        <a class="btn btn-ghost btn-sm" href="#/">View store ↗</a></div>
      <div class="kpis">
        <div class="kpi"><span class="lab">Revenue</span><b>${money(stats.revenue)}</b><span class="delta">${stats.paid} confirmed</span></div>
        <div class="kpi"><span class="lab">Orders</span><b>${stats.orders}</b><span class="delta">${stats.awaiting} awaiting payment</span></div>
        <div class="kpi"><span class="lab">Avg. order</span><b>${money(stats.aov)}</b><span class="delta">${stats.designs} designs live</span></div>
        <div class="kpi"><span class="lab">Downloads</span><b>${stats.downloads}</b><span class="delta">${stats.submitted} proofs to review</span></div>
      </div>
      <div style="display:grid;grid-template-columns:1.5fr 1fr;gap:14px">
        <div class="card"><div class="card-h"><h3>Revenue · 14 days</h3></div>${chart}</div>
        <div class="card"><h3>Coupons</h3>
          ${(stats.coupons && stats.coupons.length)
            ? stats.coupons.map(c => `<div class="between" style="padding:5px 0;border-bottom:1px solid var(--line-soft)">
                <span class="mono small">${esc(c.code)}</span><span class="small">${c.n}× · <b>${money(c.discount || 0)}</b></span></div>`).join('')
            : `<p class="muted small">No coupon redemptions yet.</p>`}
          <div class="between" style="margin-top:10px"><span class="small muted">Orders with a coupon</span><b class="small">${stats.discounted || 0}</b></div>
        </div>
        <div class="card"><h3>Formats bought</h3>
          ${(stats.formats && stats.formats.length) ? stats.formats.map(f => `<div style="margin-bottom:11px">
            <div class="between" style="margin-bottom:4px"><span class="small">${f.key.toUpperCase()}</span><b class="mono small">${f.n}</b></div>
            <div class="bar"><i style="width:${(f.n / fmtMax) * 100}%"></i></div></div>`).join('')
        : `<p class="muted small">No format data yet.</p>`}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px">
        <div class="card"><div class="card-h"><h3>Top designs</h3><a class="small link" href="#/admin/designs">All designs</a></div>
          ${stats.topDesigns.length ? `<div class="tbl-wrap"><table class="tbl"><tbody>
            ${stats.topDesigns.map(p => `<tr><td>${esc(p.name)}</td><td class="num">${p.units}</td><td class="num"><b>${money(p.revenue)}</b></td></tr>`).join('')}
          </tbody></table></div>` : `<p class="muted small">No sales yet.</p>`}</div>
        <div class="card"><div class="card-h"><h3>Recent orders</h3><a class="small link" href="#/admin/orders">All orders →</a></div>
          ${ordersTable(stats.recent, true)}</div>
      </div>`;
  }

  function ordersTable(orders, compact) {
    if (!orders || !orders.length) return `<p class="muted small">No orders yet.</p>`;
    return `<div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Order</th><th>Buyer</th>${compact ? '' : '<th>Formats</th>'}<th>Placed</th><th>Status</th><th class="num">Amount</th><th></th></tr></thead>
      <tbody>${orders.map(o => `<tr>
        <td class="mono"><b>${esc(o.code)}</b></td>
        <td>${esc(o.name)}<div class="small muted">${esc(o.email)}</div></td>
        ${compact ? '' : `<td class="small mono">${o.items.map(i => (i.formats || []).map(f => f.toUpperCase()).join('+')).join(' ')}</td>`}
        <td class="small">${dt(o.createdAt)}</td>
        <td><span class="status-chip ${o.status}">${o.status}</span></td>
        <td class="num"><b>${money(o.amount)}</b></td>
        <td><button class="btn btn-xs btn-ghost" data-order="${o.id}">Open</button></td>
      </tr>`).join('')}</tbody></table></div>`;
  }

  let orderFilter = 'all';
  async function sectionOrders() {
    const all = (await adminApi('/api/admin/orders')).orders;
    const list = orderFilter === 'all' ? all : all.filter(o => o.status === orderFilter);
    const counts = {};
    all.forEach(o => counts[o.status] = (counts[o.status] || 0) + 1);
    return `<div class="ahead"><div><h1>Orders</h1><p class="muted small" style="margin:2px 0 0">${list.length} shown · ${all.length} total</p></div></div>
      <div class="shopbar" style="border:0;padding:0 0 12px">
        <button class="filter-chip ${orderFilter === 'all' ? 'on' : ''}" data-of="all">All ${all.length}</button>
        ${['awaiting', 'submitted', 'paid', 'rejected'].map(s => `<button class="filter-chip ${orderFilter === s ? 'on' : ''}" data-of="${s}">${s} ${counts[s] || 0}</button>`).join('')}
      </div>
      <div class="card">${ordersTable(list, false)}</div>`;
  }

  function orderModal(o) {
    return `<div class="modal" style="width:min(680px,100%)">
      <header><div><span class="eyebrow">${esc(o.code)}</span><h3 style="margin-top:2px">${esc(o.name)}</h3></div>
        <button class="icon-btn" id="mClose">✕</button></header>
      <div class="between" style="margin-bottom:12px"><span class="status-chip ${o.status}">${o.status}</span>
        <span class="small muted mono">${money(o.amount)} · ${dt(o.createdAt)}</span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="card" style="padding:13px"><span class="lab small muted">Buyer</span>
          <p class="small" style="margin:6px 0 0">${esc(o.name)}<br>${esc(o.email)}<br>${esc(o.phone || '—')}</p></div>
        <div class="card" style="padding:13px"><span class="lab small muted">Payment</span>
          <p class="small" style="margin:6px 0 0">UPI ${esc(Store.settings.upi_id)}<br>Ref: ${esc(o.upiRef || '—')}<br>${o.paidAt ? 'Paid ' + dt(o.paidAt) : 'Not paid yet'}</p></div>
      </div>
      <div class="card" style="padding:13px;margin-top:10px"><span class="lab small muted">Designs &amp; formats</span>
        ${o.items.map(i => `<div class="between small" style="padding:5px 0;border-bottom:1px solid var(--line-soft)">
          <span>${esc(i.name)}</span><span class="mono">${(i.formats || []).map(f => f.toUpperCase()).join(' · ')}</span></div>`).join('')}
      </div>
      ${o.hasProof ? `<div class="card" style="padding:13px;margin-top:10px">
          <div class="between"><span class="lab small muted">Payment screenshot</span>
            <a class="small link" href="${esc(o.screenshotUrl)}" target="_blank" rel="noopener">Open full size ↗</a></div>
          <img src="${esc(o.screenshotUrl)}" alt="Payment proof" style="width:100%;max-height:280px;object-fit:contain;margin-top:10px;border-radius:8px;border:1px solid var(--line);background:#fff">
        </div>` : `<p class="small muted" style="margin-top:10px">No screenshot uploaded yet.</p>`}
      <div class="row" style="margin-top:14px;flex-wrap:wrap">
        ${o.status !== 'paid' ? `<button class="btn btn-green btn-sm" data-set="paid">Confirm payment</button>` : ''}
        ${o.status !== 'rejected' ? `<button class="btn btn-ghost btn-sm" data-set="rejected">Reject</button>` : ''}
        ${o.status === 'rejected' ? `<button class="btn btn-ghost btn-sm" data-set="awaiting">Reset to awaiting</button>` : ''}
      </div>
    </div>`;
  }

  async function sectionCoupons() {
    const { coupons, usage } = await adminApi('/api/admin/coupons');
    const useOf = code => (usage || []).find(u => u.code === code) || { n: 0, d: 0 };
    return `<div class="ahead"><div><h1>Coupons</h1>
        <p class="muted small" style="margin:2px 0 0">${coupons.filter(c => c.active).length} active · ${coupons.reduce((s, c) => s + c.used, 0)} redemptions</p></div>
        <button class="btn btn-primary btn-sm" id="newCoupon">+ New coupon</button></div>
      <div class="card"><div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Code</th><th>Offer</th><th>Min order</th><th class="num">Used</th><th class="num">Given away</th><th>Status</th><th></th></tr></thead>
        <tbody>${coupons.map(c => {
          const u = useOf(c.code);
          const status = !c.active ? 'paused' : c.expired ? 'expired' : c.exhausted ? 'used up' : 'active';
          return `<tr>
            <td class="mono"><b>${esc(c.code)}</b>${c.note ? `<div class="small muted">${esc(c.note)}</div>` : ''}</td>
            <td>${c.type === 'percent' ? c.value + '% off' : money(c.value) + ' off'}</td>
            <td>${c.minOrder ? money(c.minOrder) : '—'}</td>
            <td class="num">${c.used}${c.maxUses ? ' / ' + c.maxUses : ''}</td>
            <td class="num">${money(u.d || 0)}</td>
            <td><span class="status-chip ${status === 'active' ? 'paid' : 'rejected'}">${status}</span></td>
            <td style="white-space:nowrap"><button class="btn btn-xs btn-ghost" data-cedit="${c.id}">Edit</button>
              <button class="btn btn-xs btn-ghost" data-cdel="${c.id}">Delete</button></td>
          </tr>`;
        }).join('')}</tbody></table></div></div>`;
  }

  function couponForm(c) {
    const d = c || {};
    return `<div class="modal" style="width:min(520px,100%)">
      <header><div><span class="eyebrow">${d.id ? 'Edit' : 'New'} coupon</span><h3 style="margin-top:2px">${esc(d.code || 'Untitled')}</h3></div>
        <button class="icon-btn" id="mClose">✕</button></header>
      <form id="cForm" class="stack">
        ${d.id ? '' : `<div class="field"><label>Code</label><input class="input mono" name="code" placeholder="SANDYA10" style="text-transform:uppercase" required></div>`}
        <div class="grid-2">
          <div class="field"><label>Type</label><select class="select" name="type">
            <option value="percent" ${d.type !== 'flat' ? 'selected' : ''}>Percent off</option>
            <option value="flat" ${d.type === 'flat' ? 'selected' : ''}>Flat ₹ off</option></select></div>
          <div class="field"><label>Value</label><input class="input" name="value" type="number" min="1" value="${d.value || ''}" required></div>
        </div>
        <div class="grid-2">
          <div class="field"><label>Min order (₹)</label><input class="input" name="minOrder" type="number" min="0" value="${d.minOrder || 0}"></div>
          <div class="field"><label>Max uses (0 = none)</label><input class="input" name="maxUses" type="number" min="0" value="${d.maxUses || 0}"></div>
        </div>
        <div class="field"><label>Expires (optional)</label><input class="input" name="expiresAt" type="date" value="${d.expiresAt ? String(d.expiresAt).slice(0, 10) : ''}"></div>
        <div class="field"><label>Note</label><input class="input" name="note" value="${esc(d.note || '')}" placeholder="10% off orders over ₹999"></div>
        <label class="row small"><input type="checkbox" name="active" ${d.active !== false ? 'checked' : ''}> Active</label>
        <div class="row"><button class="btn btn-primary">${d.id ? 'Save coupon' : 'Create coupon'}</button>
          <button type="button" class="btn btn-ghost" id="mCancel">Cancel</button></div>
      </form></div>`;
  }

  async function sectionDesigns() {
    const { designs } = await adminApi('/api/admin/designs');
    return `<div class="ahead"><div><h1>Designs</h1><p class="muted small" style="margin:2px 0 0">${designs.filter(d => d.active).length} live · ${designs.filter(d => !d.active).length} hidden</p></div>
        <span class="small muted">New packs: <code class="mono">node tools/import-designs.js &lt;folder&gt;</code></span></div>
      <div class="card"><div class="tbl-wrap"><table class="tbl">
        <thead><tr><th></th><th>Design</th><th class="num">Stitches</th><th class="num">Size</th><th class="num">Price</th><th class="num">Sold</th><th>Status</th><th></th></tr></thead>
        <tbody>${designs.map(d => `<tr>
          <td><div style="width:52px;height:52px;border-radius:8px;overflow:hidden;border:1px solid var(--line);background:#fff;padding:3px">${d.preview ? `<img src="${esc(d.preview)}" alt="" style="width:100%;height:100%;object-fit:contain">` : ''}</div></td>
          <td><b>${esc(d.name)}</b><div class="small muted">${esc(d.hoop || '')} · ${(d.formats || []).length} formats · ${nf(d.trims)} trims</div></td>
          <td class="num">${nf(d.stitchCount)}</td>
          <td class="num small">${d.widthMm}×${d.heightMm}mm</td>
          <td class="num">${money(d.price)}</td>
          <td class="num">${d.downloads}</td>
          <td><span class="status-chip ${d.active ? 'paid' : 'rejected'}">${d.active ? 'live' : 'hidden'}</span></td>
          <td style="white-space:nowrap"><button class="btn btn-xs btn-ghost" data-edit="${d.id}">Edit</button>
            ${d.active ? `<button class="btn btn-xs btn-ghost" data-del="${d.id}">Hide</button>` : ''}</td>
        </tr>`).join('')}</tbody></table></div></div>`;
  }

  function designForm(d) {
    return `<div class="modal" style="width:min(620px,100%)">
      <header><div><span class="eyebrow">Edit design</span><h3 style="margin-top:2px">${esc(d.name || '')}</h3></div>
        <button class="icon-btn" id="mClose">✕</button></header>
      <form id="dForm" class="stack">
        <div class="grid-2">
          <div class="field"><label>Name</label><input class="input" name="name" value="${esc(d.name || '')}" required></div>
          <div class="field"><label>Hoop</label><input class="input" name="hoop" value="${esc(d.hoop || '')}"></div>
        </div>
        <div class="grid-2">
          <div class="field"><label>Price (₹)</label><input class="input" name="price" type="number" min="1" value="${d.price || ''}" required></div>
          <div class="field"><label>MRP (₹)</label><input class="input" name="mrp" type="number" min="0" value="${d.mrp || ''}"></div>
        </div>
        <div class="field"><label>Summary</label><input class="input" name="summary" value="${esc(d.summary || '')}"></div>
        <div class="field"><label>Description</label><textarea class="textarea" name="description">${esc(d.description || '')}</textarea></div>
        <div class="grid-2">
          <div class="field"><label>Tags</label><input class="input" name="tags" value="${esc((d.tags || []).join(', '))}"></div>
          <div class="field"><label>Badge</label><input class="input" name="badge" value="${esc(d.badge || '')}" placeholder="New / Bestseller"></div>
        </div>
        <label class="row small"><input type="checkbox" name="featured" ${d.featured ? 'checked' : ''}> Feature on the home page</label>
        <label class="row small"><input type="checkbox" name="active" ${d.active !== false ? 'checked' : ''}> Visible in the store</label>
        <div class="row"><button class="btn btn-primary">Save changes</button>
          <button type="button" class="btn btn-ghost" id="mCancel">Cancel</button></div>
        <p class="small muted" style="margin:0">${nf(d.stitchCount)} stitches · ${d.widthMm}×${d.heightMm} mm · ${d.colorCount} colours · ${nf(d.trims)} trims · ${(d.formats || []).length} machine formats — all read from the design files.</p>
      </form></div>`;
  }

  async function sectionSettings() {
    const { settings } = await adminApi('/api/admin/settings');
    return `<div class="ahead"><div><h1>Settings</h1><p class="muted small" style="margin:2px 0 0">Payment, delivery and the studio password</p></div></div>
      <div style="display:grid;grid-template-columns:1.3fr 1fr;gap:14px;align-items:start">
        <div class="card"><h3>Payment &amp; delivery</h3>
          <form id="sForm" class="stack">
            <div class="grid-2">
              <div class="field"><label>UPI ID</label><input class="input mono" name="upi_id" value="${esc(settings.upi_id || '')}"></div>
              <div class="field"><label>Payee name</label><input class="input" name="payee_name" value="${esc(settings.payee_name || '')}"></div>
            </div>
            <div class="grid-3">
              <div class="field"><label>Price per 1,000 stitches (₹)</label><input class="input" name="price_per_1k_stitches" type="number" min="1" value="${settings.price_per_1k_stitches || 50}"></div>
              <div class="field"><label>Min price (₹)</label><input class="input" name="min_price" type="number" min="0" value="${settings.min_price || 60}"></div>
              <div class="field"><label>Max price (₹)</label><input class="input" name="max_price" type="number" min="1" value="${settings.max_price || 500}"></div>
            </div>
            <p class="small muted" style="margin:-6px 0 0">A design costs its stitches ÷ 1,000 × this rate, kept between the min and max. Re-run <code class="mono">node tools/import-designs.js &lt;pack folders&gt;</code> after changing the rate to reprice the catalogue.</p>
            <div class="grid-2">
              <div class="field"><label>Link valid (hours)</label><input class="input" name="link_hours" type="number" min="1" value="${settings.link_hours || 72}"></div>
              <div class="field"><label>Store name</label><input class="input" name="store_name" value="${esc(settings.store_name || '')}"></div>
            </div>
            <div class="field"><label>Support email</label><input class="input" name="support_email" value="${esc(settings.support_email || '')}"></div>
            <div class="field"><label>Announcement bar</label><input class="input" name="announcement" value="${esc(settings.announcement || '')}"></div>
            <label class="row small" style="align-items:flex-start;gap:9px">
              <input type="checkbox" name="auto_approve" ${String(settings.auto_approve) === '1' ? 'checked' : ''} style="margin-top:3px">
              <span><b>Auto-confirm on screenshot upload</b><br><span class="muted">Any uploaded screenshot marks the order paid and releases the files. Turn off to check each payment by hand in Orders.</span></span></label>
            <button class="btn btn-primary">Save settings</button>
          </form>
        </div>
        <div class="stack">
          <div class="card"><h3>Studio password</h3>
            <form id="pwForm" class="stack">
              <div class="field"><label>Current</label><input class="input" name="current" type="password" placeholder="••••••"></div>
              <div class="field"><label>New</label><input class="input" name="next" type="password" placeholder="At least 4 characters"></div>
              <button class="btn btn-dark">Update password</button>
            </form>
          </div>
          <div class="card"><h3>Danger zone</h3>
            <p class="small muted">Reset the demo catalogue and clear every order.</p>
            ${Store.demo ? `<button class="btn btn-ghost btn-sm" id="resetDemo">Reset demo data</button>` : `<p class="small muted">Run <code class="mono">npm run reset</code> in the project folder.</p>`}
          </div>
        </div>
      </div>`;
  }

  let section = 'dashboard';
  async function render(app, parts) {
    section = parts[0] || 'dashboard';
    if (window.__offKey) { window.__offKey(); window.__offKey = null; }
    if (!LS.getItem(AK)) { app.innerHTML = loginView(); wireLogin(() => render(app, parts)); return; }
    try { const s = await adminApi('/api/admin/session'); if (!s.admin) throw new Error('expired'); }
    catch { LS.removeItem(AK); app.innerHTML = loginView('Session expired — sign in again.'); wireLogin(() => render(app, parts)); return; }

    app.innerHTML = shell(section);
    const body = $('#adminBody');
    $('#adminOut').onclick = async e => {
      e.preventDefault();
      try { await adminApi('/api/admin/logout', { method: 'POST' }); } catch {}
      LS.removeItem(AK); window.toast('Signed out'); render(app, []);
    };
    try {
      if (section === 'dashboard') body.innerHTML = await sectionDashboard();
      else if (section === 'orders') body.innerHTML = await sectionOrders();
      else if (section === 'designs') body.innerHTML = await sectionDesigns();
      else if (section === 'coupons') body.innerHTML = await sectionCoupons();
      else if (section === 'settings') body.innerHTML = await sectionSettings();
      else body.innerHTML = await sectionDashboard();
    } catch (e) {
      body.innerHTML = `<div class="card"><h3>Could not load this view</h3><p class="muted small">${esc(e.message)}</p></div>`;
      return;
    }
    wire(body, app, parts);
  }

  function closeModal() { const m = $('#modal'); m.classList.remove('on'); m.innerHTML = ''; }
  function openModal(html) {
    const m = $('#modal');
    m.innerHTML = html; m.classList.add('on');
    m.onclick = e => { if (e.target === m) closeModal(); };
    const c = $('#mClose'); if (c) c.onclick = closeModal;
    const x = $('#mCancel'); if (x) x.onclick = closeModal;
  }

  function wire(body, app, parts) {
    const rerender = () => render(app, parts);
    body.querySelectorAll('[data-of]').forEach(b => b.onclick = () => { orderFilter = b.dataset.of; rerender(); });

    body.querySelectorAll('[data-order]').forEach(b => b.onclick = async () => {
      const { orders } = await adminApi('/api/admin/orders');
      const o = orders.find(x => x.id === Number(b.dataset.order));
      if (!o) return;
      openModal(orderModal(o));
      $('#modal').querySelectorAll('[data-set]').forEach(x => x.onclick = async () => {
        const status = x.dataset.set;
        if (status === 'rejected' && !confirm('Reject this order?')) return;
        try {
          await adminApi('/api/admin/orders/' + o.id, { method: 'PATCH', body: { status } });
          window.toast(`Order ${o.code} → ${status}`, 'ok'); closeModal(); rerender();
        } catch (e) { window.toast(e.message, 'bad'); }
      });
    });

    const addDesign = async (d) => {
      openModal(designForm(d || {}));
      $('#dForm').onsubmit = async e => {
        e.preventDefault();
        const f = new FormData(e.target);
        const payload = {
          name: f.get('name'), hoop: f.get('hoop'), price: Number(f.get('price')), mrp: Number(f.get('mrp') || f.get('price')),
          summary: f.get('summary'), description: f.get('description'), active: !!f.get('active'),
          tags: String(f.get('tags') || '').split(',').map(s => s.trim()).filter(Boolean),
          badge: f.get('badge') || null, featured: !!f.get('featured')
        };
        try {
          await adminApi('/api/admin/designs/' + d.id, { method: 'PUT', body: payload });
          window.toast(d && d.id ? 'Design saved' : 'Design created', 'ok'); closeModal(); rerender();
        } catch (err) { window.toast(err.message, 'bad'); }
      };
    };
    body.querySelectorAll('[data-edit]').forEach(b => b.onclick = async () => {
      const { designs } = await adminApi('/api/admin/designs');
      addDesign(designs.find(d => d.id === Number(b.dataset.edit)));
    });
    body.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      if (!confirm('Hide this design from the store?')) return;
      await adminApi('/api/admin/designs/' + b.dataset.del, { method: 'DELETE' });
      window.toast('Design hidden'); rerender();
    });

    const openCoupon = c => {
      openModal(couponForm(c));
      $('#cForm').onsubmit = async e => {
        e.preventDefault();
        const f = new FormData(e.target);
        const body = {
          type: f.get('type'), value: Number(f.get('value')), minOrder: Number(f.get('minOrder') || 0),
          maxUses: Number(f.get('maxUses') || 0), expiresAt: f.get('expiresAt') || null,
          note: f.get('note') || '', active: !!f.get('active')
        };
        try {
          if (c && c.id) await adminApi('/api/admin/coupons/' + c.id, { method: 'PUT', body });
          else await adminApi('/api/admin/coupons', { method: 'POST', body: { ...body, code: f.get('code') } });
          window.toast('Coupon saved', 'ok'); closeModal(); rerender();
        } catch (err) { window.toast(err.message, 'bad'); }
      };
    };
    const nc = $('#newCoupon'); if (nc) nc.onclick = () => openCoupon(null);
    body.querySelectorAll('[data-cedit]').forEach(b => b.onclick = async () => {
      const { coupons } = await adminApi('/api/admin/coupons');
      openCoupon(coupons.find(c => c.id === Number(b.dataset.cedit)));
    });
    body.querySelectorAll('[data-cdel]').forEach(b => b.onclick = async () => {
      if (!confirm('Delete this coupon?')) return;
      await adminApi('/api/admin/coupons/' + b.dataset.cdel, { method: 'DELETE' });
      window.toast('Coupon deleted'); rerender();
    });

    const sf = $('#sForm');
    if (sf) sf.onsubmit = async e => {
      e.preventDefault();
      const f = new FormData(sf);
      try {
        await adminApi('/api/admin/settings', { method: 'PUT', body: {
          upi_id: f.get('upi_id'), payee_name: f.get('payee_name'), link_hours: Number(f.get('link_hours')),
          store_name: f.get('store_name'), support_email: f.get('support_email'),
          announcement: f.get('announcement'), auto_approve: f.get('auto_approve') ? '1' : '0',
          price_per_1k_stitches: Number(f.get('price_per_1k_stitches') || 50), min_price: Number(f.get('min_price') || 60),
          max_price: Number(f.get('max_price') || 500)
        } });
        const s = await adminApi('/api/settings'); Store.settings = { ...Store.settings, ...s.settings };
        window.toast('Settings saved', 'ok'); rerender();
      } catch (err) { window.toast(err.message, 'bad'); }
    };
    const pf = $('#pwForm');
    if (pf) pf.onsubmit = async e => {
      e.preventDefault();
      const f = new FormData(pf);
      try {
        await adminApi('/api/admin/password', { method: 'POST', body: { current: f.get('current'), next: f.get('next') } });
        LS.removeItem(AK); window.toast('Password updated — sign in again', 'ok'); render(app, []);
      } catch (err) { window.toast(err.message, 'bad'); }
    };
    const rd = $('#resetDemo');
    if (rd) rd.onclick = () => { if (!confirm('Reset all demo data?')) return; window.Demo.reset(); window.toast('Demo data reset'); rerender(); };
  }

  window.Admin = { render };
})();

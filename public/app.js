/* =========================================================================
   Sandya Emb Designs — storefront
   Embroidery designs · machine-format selection · UPI QR + app deep links
   ========================================================================= */
(function () {
  'use strict';

  const LS = (function () {
    try { const k = '__ra_probe'; window.localStorage.setItem(k, '1'); window.localStorage.removeItem(k); return window.localStorage; }
    catch (e) { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; }
  })();

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => '₹' + Number(n || 0).toLocaleString('en-IN');
  const qs = o => Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const nf = n => Number(n || 0).toLocaleString('en-IN');
  const dt = s => { const d = new Date(s); return isNaN(d) ? '—' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) + ' · ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }); };

  /* ------------------------------------------------------------------ state */
  const Store = {
    settings: { store_name: 'Sandya Emb Designs', upi_id: '6301928345@fam', payee_name: 'Sandya Emb Designs', auto_approve: true, link_hours: 72 },
    designs: [], tags: [], formats: [], demo: false,
    cart: JSON.parse(LS.getItem('sd_cart') || LS.getItem('ra_cart') || '[]'),
    coupon: JSON.parse(LS.getItem('sd_coupon') || 'null'),
    wish: JSON.parse(LS.getItem('sd_wish') || '[]'),
    recent: JSON.parse(LS.getItem('sd_recent') || '[]'),
    save() {
      LS.setItem('sd_cart', JSON.stringify(this.cart));
      LS.setItem('sd_coupon', JSON.stringify(this.coupon));
      LS.setItem('sd_wish', JSON.stringify(this.wish));
      LS.setItem('sd_recent', JSON.stringify(this.recent));
      paintBadges();
    },
    get count() { return this.cart.length; },
    get subtotal() { return this.cart.reduce((s, l) => s + l.price, 0); },
    /** local estimate of the coupon — the server recomputes it when the order is created */
    totals() {
      const subtotal = this.subtotal;
      let discount = 0;
      const c = this.coupon;
      if (c) {
        const stillOk = (!c.minOrder || subtotal >= c.minOrder) && (!c.maxUses || c.used < c.maxUses);
        if (!stillOk) { this.coupon = null; this.save(); }
        else discount = Math.min(subtotal, Math.round((c.type === 'percent' ? subtotal * c.value / 100 : c.value) * 100) / 100);
      }
      return { subtotal, discount, total: Math.max(0, Math.round((subtotal - discount) * 100) / 100) };
    },
    isWished(id) { return this.wish.includes(id); },
    toggleWish(id) {
      this.wish = this.wish.includes(id) ? this.wish.filter(x => x !== id) : this.wish.concat(id);
      this.save();
      return this.wish.includes(id);
    },
    orders: JSON.parse(LS.getItem('sd_orders') || '[]'),
    rememberOrder(o) {
      if (!o || o.status !== 'paid') return;
      const entry = {
        code: o.code, email: o.email, amount: o.amount, paidAt: o.paidAt || new Date().toISOString(),
        items: (o.items || []).map(i => ({ name: i.name, formats: i.formats, preview: i.preview })),
        downloads: (o.downloads || []).map(d => ({ name: d.name, fileName: d.fileName, url: d.url }))
      };
      this.orders = [entry].concat(this.orders.filter(x => x.code !== o.code)).slice(0, 50);
      LS.setItem('sd_orders', JSON.stringify(this.orders));
    },
    pushRecent(slug) {
      this.recent = [slug].concat(this.recent.filter(x => x !== slug)).slice(0, 4);
      this.save();
    }
  };
  window.Store = Store;

  const CACHE = new Map();          // GET responses, so re-rendering a page costs nothing
  const CACHE_TTL = 30000;
  function bustCache() { CACHE.clear(); }

  async function api(path, opts = {}) {
    const method = opts.method || 'GET';
    if (method === 'GET' && !opts.fresh) {
      const hit = CACHE.get(path);
      if (hit && Date.now() - hit.at < CACHE_TTL) return hit.data;
    }
    const data = await apiFetch(path, opts, method);
    if (method === 'GET') CACHE.set(path, { at: Date.now(), data });
    else bustCache();
    return data;
  }

  async function apiFetch(path, opts, method) {
    if (Store.demo) { await new Promise(r => setTimeout(r, 40)); return window.Demo.handle(method, path, opts.body, opts.query); }
    const headers = { 'Content-Type': 'application/json' };
    if (opts.adminToken) headers['x-admin-token'] = opts.adminToken;
    let res;
    try { res = await fetch(path, { method, headers, body: opts.body ? JSON.stringify(opts.body) : undefined }); }
    catch { throw new Error('Could not reach the server. Is it running?'); }
    const data = await res.json().catch(() => ({ ok: false, error: 'Unexpected response.' }));
    if (!res.ok || data.ok === false) { const e = new Error(data.error || 'Request failed'); e.status = res.status; throw e; }
    return data;
  }
  window.api = api;

  function toast(msg, kind = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.innerHTML = `<span>${kind === 'bad' ? '✕' : '✓'}</span><span>${esc(msg)}</span>`;
    $('#toasts').appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = '.25s'; }, 3000);
    setTimeout(() => el.remove(), 3300);
  }
  window.toast = toast;

  /* ------------------------------------------------------------------ icons */
  const I = {
    search: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg>',
    bag: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 8h14l-1.4 12.2a2 2 0 0 1-2 1.8H8.4a2 2 0 0 1-2-1.8L5 8Z"/><path d="M9 8a3 3 0 0 1 6 0"/></svg>',
    user: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5S20 17 20 21"/></svg>',
    burger: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>',
    close: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 5l14 14M19 5L5 19"/></svg>',
    check: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M4 12.5l5 5L20 6.5"/></svg>',
    tick: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4"><path d="M4 12.5l5 5L20 6.5"/></svg>',
    dl: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M4 21h16"/></svg>',
    up: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 20V7"/><path d="m7 11 5-5 5 5"/><path d="M4 3h16"/></svg>',
    lock: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
    file: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"/><path d="M14 3v5h5"/></svg>',
    zap: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/></svg>',
    shield: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6Z"/><path d="m9 12 2 2 4-4"/></svg>',
    clock: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    needle: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 20 20 4"/><path d="M14 4h6v6"/></svg>',
    arrow: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    heart: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20s-7-4.6-7-9.4A4.1 4.1 0 0 1 12 7a4.1 4.1 0 0 1 7 3.6C19 15.4 12 20 12 20Z"/></svg>',
    heartOn: '<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.8"><path d="M12 20s-7-4.6-7-9.4A4.1 4.1 0 0 1 12 7a4.1 4.1 0 0 1 7 3.6C19 15.4 12 20 12 20Z"/></svg>',
    tag: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 13.5 13.5 20 4 10.5V4h6.5L20 13.5Z"/><circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none"/></svg>',
    share: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="18" cy="5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/><path d="m8.3 10.7 7.4-4.3M8.3 13.3l7.4 4.3"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1v-9.5Z"/></svg>',
    grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>'
  };

  /* -------------------------------------------------------------- UPI apps */
  const UPI_APPS = [
    { id: 'gpay', name: 'Google Pay', logo: 'gpay', scheme: 'tez://upi/pay', tint: '#4285F4' },
    { id: 'phonepe', name: 'PhonePe', logo: 'phonepe', scheme: 'phonepe://pay', tint: '#5F259F' },
    { id: 'paytm', name: 'Paytm', logo: 'paytm', scheme: 'paytmmp://pay', tint: '#00BAF2' },
    { id: 'bhim', name: 'BHIM', logo: 'bhim', scheme: 'upi://pay', tint: '#E4572E' }
  ];

  function logo(app, h = 24) {
    const L = (window.UPI_LOGOS || {})[app.logo];
    if (!L) return `<span class="mono" style="font-size:11px">${esc(app.name)}</span>`;
    return `<svg viewBox="${L.viewBox}" height="${h}" role="img" aria-label="${esc(app.name)}" preserveAspectRatio="xMidYMid meet">${L.body}</svg>`;
  }

  /** Deep-links into the chosen UPI app, falling back to the generic sheet. */
  function openUpiApp(app, upi) {
    const query = (upi.link || '').split('?')[1] || '';
    const deep = query ? `${app.scheme}?${query}` : app.scheme;
    toast(`Opening ${app.name}…`);
    try {
      const ifr = document.createElement('iframe');
      ifr.style.cssText = 'position:absolute;width:0;height:0;border:0;opacity:0';
      ifr.src = deep;
      document.body.appendChild(ifr);
      setTimeout(() => ifr.remove(), 1400);
    } catch (e) { /* ignore */ }
    // if the app did not take over, hand the user the generic UPI sheet
    setTimeout(() => {
      if (document.visibilityState === 'visible') window.location.href = upi.link;
    }, 1500);
  }
  window.openUpiApp = openUpiApp;

  /* ------------------------------------------------------------ components */
  const logoMark = () => Store.settings.logo_mark_url || 'img/logo-mark.png';
  const logoFull = () => Store.settings.logo_url || 'img/logo.png';
  const brandWords = () => {
    const parts = String(Store.settings.store_name || 'Sandya Emb Designs').split(' ');
    return { first: parts[0], rest: parts.slice(1).join(' ') };
  };

  const fmtLabel = k => (k || '').toUpperCase();

  function couponBox() {
    const c = Store.coupon;
    if (c) {
      return `<div class="coupon-on">${I.tag}<b>${esc(c.code)}</b><span>${esc(c.label || '')}</span>
        <button type="button" id="couponRemove" aria-label="Remove coupon">✕</button></div>
        <button type="button" class="offers-link" id="offersBtn">View all offers</button>`;
    }
    return `<div id="couponForm" class="coupon-form">
      <input class="input" name="code" placeholder="Coupon code" autocomplete="off" style="text-transform:uppercase">
      <button class="btn btn-dark btn-sm" type="button" id="couponApply">Apply</button>
    </div>
    <button type="button" class="offers-link" id="offersBtn">${I.tag} View all offers</button>`;
  }

  function summaryRows(showPayment) {
    const t = Store.totals();
    return `<div class="sum-row"><span>${Store.count} design${Store.count > 1 ? 's' : ''}</span><b>${money(t.subtotal)}</b></div>
      ${t.discount ? `<div class="sum-row discount"><span>Coupon ${esc(Store.coupon.code)}</span><b>− ${money(t.discount)}</b></div>` : ''}
      <div class="sum-row"><span>Delivery</span><b style="color:var(--green)">Instant</b></div>
      ${showPayment ? `<div class="sum-row"><span>Payment</span><b>UPI</b></div>` : ''}
      <div class="sum-row total"><span>To pay</span><b>${money(t.total)}</b></div>`;
  }

  function designCard(d, opts = {}) {
    return `<article class="dcard reveal${opts.noBuy ? ' linkable' : ''}">
      ${opts.noBuy ? `<a class="cardlink" href="#/design/${esc(d.slug)}" aria-label="${esc(d.name)}"></a>` : ''}
      <a class="stage" href="#/design/${esc(d.slug)}" aria-label="${esc(d.name)}">
        ${d.preview ? `<span class="shot"><img src="${esc(d.preview)}" alt="${esc(d.name)} embroidery design" loading="lazy" decoding="async" width="400" height="400"></span>` : ''}
        ${d.badge ? `<span class="pill ${d.badge === 'New' ? 'brass' : 'maroon'}">${esc(d.badge)}</span>` : ''}
        <span class="stitch-badge">${nf(d.stitchCount)} stitches</span>
        <button class="fav ${Store.isWished(d.id) ? 'on' : ''}" data-fav="${d.id}" aria-label="Save ${esc(d.name)}">${Store.isWished(d.id) ? I.heartOn : I.heart}</button>
      </a>
      <div class="body">
        <span class="meta">${d.colorCount} colour${d.colorCount > 1 ? 's' : ''} · ${nf(d.stitchCount)} stitches · ${d.sewMinutes || Math.round(d.stitchCount / 700)} min</span>
        <a href="#/design/${esc(d.slug)}"><h3>${esc(d.name)}</h3></a>
        <p class="sum">${esc((d.summary || '').slice(0, 92))}${(d.summary || '').length > 92 ? '…' : ''}</p>
        <div class="price"><b>${money(d.price)}</b><span class="per">per format</span>${d.mrp > d.price ? `<s>${money(d.mrp)}</s>` : ''}</div>
        ${opts.noBuy ? '' : `<div class="buyrow">
          <button class="btn btn-primary btn-sm" data-buy="${d.id}">Buy · ${money(d.price)}</button>
          <button class="btn btn-ghost btn-sm" data-add="${d.id}">+ Bag</button>
        </div>`}
      </div>
    </article>`;
  }

  function header(active) {
    const a = k => (active === k ? 'on' : '');
    return `<div class="announce">${esc(Store.settings.announcement)}</div>
    <header class="hdr" id="hdr"><div class="wrap hdr-in">
      <button class="icon-btn burger" id="burger" aria-label="Menu">${I.burger}</button>
      <a class="logo" href="#/" aria-label="${esc(Store.settings.store_name)}"><img class="mark" src="${esc(logoMark())}" alt="${esc(Store.settings.store_name)}"><span>${esc(brandWords().first)}<small>${esc(brandWords().rest)}</small></span></a>
      <nav class="nav">
        <a href="#/" class="${a('home')}">Home</a>
        <a href="#/designs" class="${a('designs')}">Designs</a>
        <a href="#/categories" class="${a('categories')}">Categories</a>
        <a href="#/about" class="${a('about')}">About</a>
        <a href="#/contact" class="${a('contact')}">Contact</a>
      </nav>
      <form class="searchbar" id="searchform" role="search">
        <span style="position:absolute;left:15px;top:50%;transform:translateY(-50%);color:var(--ink-mute)">${I.search}</span>
        <input name="q" placeholder="Search designs, hoops, motifs…" autocomplete="off">
      </form>
      <div class="hdr-tools">
        <a class="icon-btn" href="#/downloads" aria-label="My downloads">${I.dl}</a>
        <a class="icon-btn" href="#/saved" aria-label="Saved designs">${I.heart}<span class="dot" id="wishDot" style="background:var(--brass)">${Store.wish.length}</span></a>
        <button class="icon-btn" id="openCart" aria-label="Bag">${I.bag}<span class="dot" id="cartDot">${Store.count}</span></button>
      </div>
    </div></header>`;
  }

  function tabbar(active) {
    const item = (href, key, icon, label) => `<a href="${href}" class="${active === key ? 'on' : ''}">${icon}<span>${label}</span></a>`;
    return `<nav class="tabbar">
      ${item('#/', 'home', I.home, 'Home')}
      ${item('#/categories', 'categories', I.grid, 'Categories')}
      ${item('#/saved', 'saved', I.heart, 'Wishlist')}
      <a href="#/cart" class="${active === 'cart' ? 'on' : ''}">${I.bag}<span>Cart</span><span class="dot" id="tabDot">${Store.count}</span></a>
    </nav>`;
  }

  function footer() {
    return `<footer class="foot"><div class="wrap">
      <div class="foot-grid">
        <div>
          <a class="logo foot-logo" href="#/"><img src="${esc(logoFull())}" alt="${esc(Store.settings.store_name)}"></a>
          <p class="small" style="margin-top:12px;max-width:34ch;color:#b8b1a3">${esc(Store.settings.tagline)} Every design is digitised by hand, sold once, and delivered the moment your UPI payment is confirmed.</p>
        </div>
        <div><h4>Designs</h4><ul>
          <li><a href="#/designs?tag=floral">Floral</a></li>
          <li><a href="#/designs?tag=border">Borders</a></li>
          <li><a href="#/designs?tag=bridal">Bridal</a></li>
          <li><a href="#/designs?tag=monogram">Monograms</a></li>
          <li><a href="#/designs">Everything</a></li></ul></div>
        <div><h4>Help</h4><ul>
          <li><a href="#/downloads">My downloads</a></li>
          <li><a href="#/designs">Which format do I need?</a></li>
          <li><a href="#/designs">Licence</a></li>
          <li><a href="#/admin">Studio admin</a></li></ul></div>
        <div><h4>Payments</h4><ul>
          <li class="mono" style="font-size:12px">${esc(Store.settings.upi_id)}</li>
          <li>GPay · PhonePe · Paytm · BHIM</li>
          <li>${esc(Store.settings.support_email)}</li>
          <li>Downloads live ${Store.settings.link_hours} hours</li></ul></div>
      </div>
      <div class="foot-bot">
        <span>© ${new Date().getFullYear()} ${esc(Store.settings.store_name)}</span>
        <span>Digital files — all sales final</span>
      </div>
    </div></footer>`;
  }

  /* ------------------------------------------------------------------ views */
  async function viewHome() {
    const all = await api('/api/designs?' + qs({ sort: 'newest' }));
    const fmtCount = Math.max(5, ...all.designs.map(d => (d.formats || []).length), 0);
    return `<div class="hero"><div class="wrap hero-in solo">
      <span class="eyebrow" style="justify-content:center">Digitised by hand · India</span>
      <h1>Beautiful embroidery designs<br>for <em>every creation</em>.</h1>
      <p class="lede">Hand-digitised motifs for home and commercial machines, in ${fmtCount} machine formats. Choose what your machine reads, pay by UPI, and the files land in your downloads.</p>
      <div class="hero-cta">
        <a class="btn btn-primary" href="#/designs">Shop now ${I.arrow}</a>
        <a class="btn btn-ghost" href="#/categories">Browse categories</a>
      </div>
    </div></div>

    <section class="section"><div class="wrap">
      <div class="sec-head reveal">
        <div><span class="eyebrow">The library</span><h2>Newest designs</h2>
          <p>Each one is digitised with an underlay, a tested pull compensation and a colour sequence you can follow without guessing.</p></div>
        <a class="btn btn-ghost btn-sm" href="#/designs">All ${all.designs.length} designs ${I.arrow}</a>
      </div>
      <div class="pgrid two">${all.designs.slice(0, 8).map(d => designCard(d, { noBuy: true })).join('')}</div>
      <div class="center" style="padding:26px 0 58px"><a class="btn btn-primary" href="#/designs">See all ${all.designs.length} designs ${I.arrow}</a></div>
    </div></section>`;
  }

  const PAGE = 12;

  async function viewShop(params) {
    const data = await api('/api/designs?' + qs({ q: params.q || '', tag: params.tag || 'all', sort: params.sort || 'newest' }));
    const shown = Number(params.show || PAGE);
    const visible = data.designs.slice(0, shown);
    return `<div class="wrap">
      <div class="crumbs"><a href="#/">Home</a> / Designs</div>
      <div class="sec-head" style="margin-top:16px">
        <div><h1 style="font-size:clamp(1.7rem,3vw,2.3rem)">${params.q ? 'Search: “' + esc(params.q) + '”' : (params.tag ? params.tag[0].toUpperCase() + params.tag.slice(1) : 'All designs')}</h1>
          <p>${data.total} ${data.total === 1 ? 'design' : 'designs'} · instant download, your choice of format</p></div>
        <select class="select" id="sortSel" style="width:auto">
          ${[['newest', 'Newest first'], ['featured', 'Featured'], ['price_asc', 'Price: low to high'], ['price_desc', 'Price: high to low'], ['stitches', 'Most stitches'], ['name', 'A–Z']]
        .map(([v, l]) => `<option value="${v}" ${(params.sort || 'newest') === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>
      <div class="shopbar">
        <a class="filter-chip ${!params.tag ? 'on' : ''}" href="#/designs">All</a>
        ${data.tags.slice(0, 9).map(t => `<a class="filter-chip ${params.tag === t.tag ? 'on' : ''}" href="#/designs?tag=${encodeURIComponent(t.tag)}">${esc(t.tag)} <span class="muted">${t.c}</span></a>`).join('')}
        ${data.tags.length > 9 ? `<button class="filter-chip more" id="chipsMore">+${data.tags.length - 9} more</button>` : ''}
        ${data.tags.slice(9).map(t => `<a class="filter-chip extra hide ${params.tag === t.tag ? 'on' : ''}" href="#/designs?tag=${encodeURIComponent(t.tag)}">${esc(t.tag)} <span class="muted">${t.c}</span></a>`).join('')}
      </div>
      ${data.designs.length ? `<div class="pgrid" style="padding:26px 0 12px">${visible.map(d => designCard(d)).join('')}</div>
        ${data.designs.length > visible.length ? `<div class="center" style="padding-bottom:52px">
          <button class="btn btn-ghost" id="loadMore">Show ${Math.min(PAGE, data.designs.length - visible.length)} more of ${data.designs.length}</button>
        </div>` : '<div style="height:50px"></div>'}`
        : `<div class="empty" style="margin:26px 0 62px"><h3>Nothing here</h3><p class="muted small">Try another tag or clear the search.</p><a class="btn btn-primary" href="#/designs" style="margin-top:8px">See everything</a></div>`}
    </div>`;
  }

  async function viewDesign(slug) {
    const d = await api('/api/designs/' + encodeURIComponent(slug));
    const g = d.design;
    if (!Store.designs.some(x => x.slug === g.slug)) Store.designs.push(g);
    Store.pushRecent(g.slug);
    const keys = (g.formats || []).map(f => f.key);
    const chosen = (g.defaultFormats || []).filter(k => keys.includes(k)).slice(0, 1);
    const state = { formats: chosen.length ? chosen : keys.slice(0, 1) };

    setTimeout(() => {
      const box = $('#fmtBox');
      if (!box) return;
      const refresh = () => {
        $$('#fmtBox .fmt').forEach(b => b.classList.toggle('on', state.formats.includes(b.dataset.fmt)));
        const n = state.formats.length;
        const total = g.price * Math.max(1, n);
        $('#fmtCount').textContent = n ? `${n} format${n > 1 ? 's' : ''} · ${money(total)}` : 'Pick at least one format';
        $('#buyNow').disabled = !n;
        $('#buyNow').innerHTML = n ? `Buy now · ${money(total)}` : 'Pick a format';
        const pv = $('#pdpPrice'); if (pv) pv.textContent = money(total);
        const pn = $('#pdpPriceNote');
        if (pn) pn.textContent = n
          ? `${money(g.price)} per format × ${n} format${n > 1 ? 's' : ''}${g.pricePer1k ? ` · ${nf(g.stitchCount)} stitches at ${money(g.pricePer1k)} per 1,000` : ''}`
          : 'One price per format — pick at least one';
      };
      const showAll = $('#fmtMore');
      if (showAll) showAll.onclick = () => {
        $$('#fmtBox .fmt.extra').forEach(b => b.classList.remove('hide'));
        showAll.style.display = 'none';
      };
      box.querySelectorAll('[data-fmt]').forEach(b => b.onclick = () => {
        const f = b.dataset.fmt;
        state.formats = state.formats.includes(f) ? state.formats.filter(x => x !== f) : state.formats.concat(f);
        refresh();
      });
      $('#fmtAll').onclick = () => { state.formats = keys.slice(); $$('#fmtBox .fmt.extra').forEach(b => b.classList.remove('hide')); if ($('#fmtMore')) $('#fmtMore').style.display = 'none'; refresh(); };
      $('#fmtNone').onclick = () => { state.formats = []; refresh(); };
      refresh();
      const add = () => addToCart(g, state.formats);
      $('#addBag').onclick = add;
      const buy = () => {
        if (!state.formats.length) return toast('Pick at least one format', 'bad');
        Store.cart = [{ id: g.id, slug: g.slug, name: g.name, price: g.price * state.formats.length,
          unitPrice: g.price, preview: g.preview, formats: state.formats.slice() }];
        Store.save(); go('#/checkout');
      };
      $('#buyNow').onclick = buy;
      // gallery
      $$('.gthumb').forEach(b => b.onclick = () => {
        const main = $('#pdpMain');
        if (main && b.dataset.shot) main.src = b.dataset.shot;
        $$('.gthumb').forEach(x => x.classList.toggle('on', x === b));
      });

      // sticky bar
      const bar = $('#stickybar');
      const buybox = $('#buybox');
      if (bar && buybox && 'IntersectionObserver' in window) {
        new IntersectionObserver(([e]) => {
          bar.classList.toggle('on', !e.isIntersecting && e.boundingClientRect.top < 0);
        }, { threshold: 0 }).observe(buybox);
      }
      if (bar) {
        $('#stickyAdd').onclick = () => { add(); };
        $('#stickyBuy').onclick = buy;
      }
    }, 0);

    return `<div class="wrap">
      <div class="crumbs"><a href="#/">Home</a> / <a href="#/designs">Designs</a> / ${esc(g.name)}</div>
      <div class="pdp">
        <div>
          <div class="stage">${g.preview ? `<span class="shot"><img id="pdpMain" src="${esc(g.preview)}" alt="${esc(g.name)} embroidery design"></span>` : ''}</div>
          <div class="gal">
            <button class="gthumb on" data-shot="${esc(g.preview || '')}"><img src="${esc(g.preview || '')}" alt="artwork"></button>
            ${g.stitchPreview ? `<button class="gthumb" data-shot="${esc(g.stitchPreview)}"><img src="${esc(g.stitchPreview)}" alt="stitch preview"></button>` : ''}
          </div>
        </div>
        <div>
          <span class="eyebrow">${esc(g.hoop)} hoop · ${g.colorCount} thread colours</span>
          <h1>${esc(g.name)}</h1>
          <p class="muted" style="font-size:15px">${esc(g.summary)}</p>
          <div class="price-big"><b id="pdpPrice">${money(g.price)}</b>${g.mrp > g.price ? `<s>${money(g.mrp)}</s><span class="off">${g.discount}% off</span>` : ''}</div>
          <p class="small muted" style="margin:0" id="pdpPriceNote">${money(g.price)} per format${g.pricePer1k ? ` · ${nf(g.stitchCount)} stitches at ${money(g.pricePer1k)} per 1,000` : ''}</p>

          <div class="specs four">
            <div><span>Stitches</span><b>${nf(g.stitchCount)}</b></div>
            <div><span>Colours</span><b>${g.colorCount}</b></div>
            <div><span>Sew time</span><b>≈ ${g.sewMinutes || Math.round(g.stitchCount / 700)} min</b></div>
            <div><span>Size</span><b>${g.widthMm} × ${g.heightMm} mm</b></div>
          </div>

          <div class="threads">
            <span class="th-lab">Thread order</span>
            <div class="th-list">
              ${g.threads.map((t, i) => `<div class="th" title="${esc(t.name || '')} — ${nf(t.stitches)} stitches">
                <i style="background:${esc(t.hex)}"></i><span>${i + 1}</span><b class="mono">${nf(t.stitches)}</b></div>`).join('')}
            </div>
          </div>

          <div class="fmt-box" id="fmtBox">
            <div class="fb-head"><h3>Choose your formats</h3><span class="small mono" id="fmtCount"></span></div>
            <p class="fb-sub">Tick everything your machine or software can read — they all come in one ZIP.</p>
            <div class="fmts">
              ${g.formats.map((f, i) => `<button class="fmt ${i >= 8 ? 'extra hide' : ''}" data-fmt="${f.key}">
                <span class="box">${I.tick}</span>
                <span><b>${esc(f.label)}</b><span>${esc(f.note)}</span></span>
              </button>`).join('')}
            </div>
            ${g.formats.length > 8 ? `<button class="fmt-more" id="fmtMore">Show all ${g.formats.length} formats ↓</button>` : ''}
            <p class="small muted" style="margin:10px 0 0">We ship the five formats nearly every machine reads — PES, DST, JEF, EXP and VP3. Tick what yours takes.</p>
            <div class="fmt-links"><button id="fmtAll">Select all ${g.formats.length}</button><button id="fmtNone">Clear</button></div>
          </div>

          <div class="buybox" id="buybox">
            <button class="btn btn-primary" id="buyNow">Buy now · ${money(g.price)}</button>
            <button class="btn btn-ghost" id="addBag">+ Bag</button>
            <button class="btn btn-ghost btn-icon" id="saveBtn" aria-label="Save design" title="Save for later">${Store.isWished(g.id) ? I.heartOn : I.heart}</button>
            <button class="btn btn-ghost btn-icon" id="shareBtn" aria-label="Share" title="Copy link">${I.share}</button>
          </div>

          <div class="includes">
            <div class="inc-head">${I.file}<b>What you get</b></div>
            <ul>
              <li>All ${g.formats.length} machine formats, or only the ones you pick</li>
              <li>${nf(g.stitchCount)} stitches · ${g.colorCount} colour${g.colorCount > 1 ? 's' : ''} · ${nf(g.trims)} trims · ≈ ${g.sewMinutes || Math.round(g.stitchCount / 700)} min to sew</li>
              <li>The designer's readme with the thread order and stabiliser notes</li>
              <li>One-person commercial licence — sew it on anything you sell</li>
              <li>Download straight after payment, live for ${Store.settings.link_hours} hours</li>
            </ul>
          </div>

          <div class="trust">
            <div>${I.zap}<b>Instant delivery</b>ZIP downloads after payment</div>
            <div>${I.shield}<b>Tested stitch-out</b>Underlay + pull compensation</div>
            <div>${I.clock}<b>${Store.settings.link_hours}h link</b>Re-download any time</div>
          </div>

          <div class="accordion">
            <details open><summary>About this design</summary><p>${esc(g.description)}</p></details>
            <details><summary>Which format do I need?</summary><p><b>DST</b> — Tajima, and almost every commercial machine (Barudan, ZSK, Happy, Brother via converter). <b>EXP</b> — Melco, Bernina and Janome. Not sure? Take both, plus the PDF sheet which lists the colour sequence.</p></details>
            <details><summary>Licence</summary><p>One-person commercial licence: sew it on anything you sell, unlimited pieces. Do not resell or share the digital files.</p></details>
            <details><summary>Delivery &amp; refunds</summary><p>The ZIP is generated the moment your UPI payment is confirmed and stays downloadable for ${Store.settings.link_hours} hours. Because the file is delivered instantly, sales are final — write to ${esc(Store.settings.support_email)} if a file will not open and we will fix or refund it.</p></details>
          </div>
        </div>
      </div>

      ${d.related.length ? `<section class="section tight"><div class="sec-head"><div><h2>Also in the library</h2></div></div>
        <div class="pgrid">${d.related.map(designCard).join('')}</div></section>` : ''}

      ${recentStrip(g.slug)}

      <div class="stickybar" id="stickybar"><div class="wrap">
        <div style="flex:1">
          <div class="t">${esc(g.name)}</div>
          <div class="f">${money(g.price)} · pick formats at checkout</div>
        </div>
        <button class="btn btn-ghost btn-sm" id="stickyAdd">+ Bag</button>
        <button class="btn btn-primary btn-sm" id="stickyBuy">Buy now</button>
      </div></div>
    </div>`;
  }

  function recentStrip(currentSlug) {
    const others = Store.recent.filter(sl => sl !== currentSlug)
      .map(sl => Store.designs.find(d => d.slug === sl)).filter(Boolean).slice(0, 3);
    if (!others.length) return '';
    return `<section class="section tight"><div class="sec-head"><div><span class="eyebrow">Recently viewed</span><h2 style="font-size:1.5rem">Still thinking about these</h2></div></div>
      <div class="pgrid">${others.map(d => designCard(d)).join('')}</div></section>`;
  }

  async function viewDownloads() {
    const list = Store.orders || [];
    return `<div class="wrap">
      <div class="crumbs"><a href="#/">Home</a> / My downloads</div>
      <div class="sec-head" style="margin-top:16px">
        <div><h1 style="font-size:clamp(1.7rem,3vw,2.3rem)">My downloads</h1>
          <p>Everything you have bought in this browser — download again any time.</p></div>
      </div>
      ${list.length ? `<div class="dl-orders">${list.map(o => `
        <div class="card dl-order">
          <div class="between" style="margin-bottom:10px">
            <div><b class="mono">${esc(o.code)}</b>
              <div class="small muted">${dt(o.paidAt)} · ${money(o.amount)} · ${esc(o.email || '')}</div></div>
            <span class="status-chip paid">Paid</span>
          </div>
          <div class="dl-list">
            ${o.downloads.map((d, i) => `<div class="dl-row" data-dl="${i}">
              <div class="f-ic">${I.file}</div>
              <div><b>${esc(d.fileName)}</b><div class="fmeta">${esc(d.name)}</div></div>
              <a class="btn btn-green btn-sm" href="${esc(d.url)}" download="${esc(d.fileName)}">Download</a>
            </div>`).join('')}
          </div>
        </div>`).join('')}</div>`
      : `<div class="empty" style="margin:20px 0 62px">
          <h3>No downloads yet</h3>
          <p class="muted small">Your paid orders appear here automatically. Bought on another device?</p>
          <form id="findForm" class="row" style="justify-content:center;margin-top:12px;gap:8px;flex-wrap:wrap">
            <input class="input mono" name="code" placeholder="SDY-XXXXXX" style="max-width:220px">
            <button class="btn btn-primary btn-sm">Find my order</button>
          </form>
        </div>`}
    </div>`;
  }

  const CATEGORIES = [
    ['Floral embroidery', 'floral', 'Blossoms, sprays and vines for everyday pieces'],
    ['Bridal embroidery', 'bridal', 'Couture motifs for lehengas, veils and blouses'],
    ['Traditional designs', 'devotional', 'Devotional and folk motifs, digitised with care'],
    ['Border designs', 'border', 'Running borders and panels for dupattas and sarees'],
    ['Modern embroidery', 'geometric', 'Clean geometry for contemporary pieces'],
    ['Kids & jersey', 'kids', 'Characters and lettering for kidswear and jerseys'],
    ['Sport & club', 'sport', 'Badges, crests and numbers for team kits'],
    ['Wordmarks', 'wordmark', 'Names and logos set in stitch'],
    ['Home & cushion', 'cushion', 'Wreaths and medallions for soft furnishing']
  ];

  async function viewCategories() {
    const all = await api('/api/designs?' + qs({ sort: 'newest' }));
    const counts = {};
    all.designs.forEach(d => (d.tags || []).forEach(t => { counts[t] = (counts[t] || 0) + 1; }));
    return `<div class="wrap">
      <div class="crumbs"><a href="#/">Home</a> / Categories</div>
      <div class="sec-head" style="margin-top:16px">
        <div><span class="eyebrow">Browse</span><h1 style="font-size:clamp(1.8rem,4vw,2.6rem);margin-top:6px">Categories</h1>
          <p>${all.designs.length} designs across nine collections.</p></div>
      </div>
      <div class="catgrid">
        ${CATEGORIES.map(([name, tag, blurb]) => {
          const first = all.designs.find(d => (d.tags || []).includes(tag));
          return `<a class="catcard" href="#/designs?tag=${encodeURIComponent(tag)}">
            <div class="catpic">${first ? `<img src="${esc(first.preview)}" alt="${esc(name)}" loading="lazy" decoding="async">` : ''}</div>
            <div class="catcopy"><b>${esc(name)}</b><span>${esc(blurb)}</span>
              <em>${counts[tag] || 0} design${(counts[tag] || 0) === 1 ? '' : 's'}</em></div>
          </a>`;
        }).join('')}
      </div>
    </div>`;
  }

  async function viewAbout() {
    return `<div class="wrap narrow">
      <div class="crumbs"><a href="#/">Home</a> / About</div>
      <span class="eyebrow">The studio</span>
      <h1 style="font-size:clamp(1.9rem,4vw,2.8rem);margin:8px 0 14px">Digitised by hand, in India.</h1>
      <p class="prose">Sandya Emb Designs is a small digitising studio. Every motif in the library is drawn, sequenced and test-sewn before it is listed — an underlay first, then the pull compensation, then the colour order, so the design behaves the same on a 4×4 home hoop and a commercial head.</p>
      <p class="prose">You buy the file, not a subscription. Pick the formats your machine reads, pay by UPI, and the ZIP arrives with the stitch sequence, the thread order and the stabiliser notes inside.</p>
      <div class="statrow">
        <div><b>${Store.designs.length}</b><span>designs in the library</span></div>
        <div><b>5</b><span>machine formats</span></div>
        <div><b>72h</b><span>download window</span></div>
      </div>
      <a class="btn btn-primary" href="#/designs" style="margin-top:22px">Browse the library ${I.arrow}</a>
    </div>`;
  }

  async function viewContact() {
    return `<div class="wrap narrow">
      <div class="crumbs"><a href="#/">Home</a> / Contact</div>
      <span class="eyebrow">Say hello</span>
      <h1 style="font-size:clamp(1.9rem,4vw,2.8rem);margin:8px 0 14px">Contact the studio</h1>
      <p class="prose">Questions about a format, a custom digitisation or a bulk order — write to us and we usually reply the same day.</p>
      <div class="contactgrid">
        <div class="card"><h3>Email</h3><p class="small muted">${esc(Store.settings.support_email || 'hello@sandyaembdesigns.com')}</p></div>
        <div class="card"><h3>UPI</h3><p class="small muted mono">${esc(Store.settings.upi_id)}</p></div>
        <div class="card"><h3>Custom work</h3><p class="small muted">Send a sketch or reference — we quote per 1,000 stitches.</p></div>
      </div>
      <a class="btn btn-ghost" href="#/downloads" style="margin-top:22px">Find an order</a>
    </div>`;
  }

  async function viewSaved() {
    const list = Store.designs.filter(d => Store.wish.includes(d.id));
    return `<div class="wrap">
      <div class="crumbs"><a href="#/">Home</a> / Saved</div>
      <div class="sec-head" style="margin-top:16px">
        <div><h1 style="font-size:clamp(1.7rem,3vw,2.3rem)">Saved designs</h1>
          <p>${list.length ? `${list.length} design${list.length > 1 ? 's' : ''} kept for later` : 'Tap the heart on any design to keep it here.'}</p></div>
      </div>
      ${list.length ? `<div class="pgrid" style="padding:20px 0 62px">${list.map(d => designCard(d)).join('')}</div>`
        : `<div class="empty" style="margin:20px 0 62px"><h3>Nothing saved yet</h3><p class="muted small">Hearts are stored in this browser — no account needed.</p><a class="btn btn-primary" href="#/designs" style="margin-top:8px">Browse designs</a></div>`}
    </div>`;
  }

  async function viewCart() {
    if (!Store.cart.length) return `<div class="wrap"><div class="empty" style="margin:44px 0 70px"><h3>Your bag is empty</h3><p class="muted small">Digital designs, no shipping.</p><a class="btn btn-primary" href="#/designs" style="margin-top:8px">Browse designs</a></div></div>`;
    return `<div class="wrap">
      <div class="crumbs"><a href="#/">Home</a> / Bag</div>
      ${rail(1)}
      <div class="cart-grid">
        <div>
          <h1 style="font-size:1.8rem;margin:12px 0 4px">Your bag (${Store.count})</h1>
          <p class="muted small">Each design arrives as one ZIP containing the formats you chose.</p>
          <div>${Store.cart.map(l => `<div class="cart-line">
            <div class="pic">${l.preview ? `<img src="${esc(l.preview)}" alt="">` : ''}</div>
            <div><h4>${esc(l.name)}</h4>
              <div class="meta">${(l.formats || []).map(fmtLabel).join(' · ')}</div>
              <button class="btn btn-xs btn-ghost" data-remove="${l.id}" style="margin-top:7px">Remove</button></div>
            <b class="mono">${money(l.price)}</b>
          </div>`).join('')}</div>
          <a class="btn btn-ghost btn-sm" href="#/designs" style="margin-top:16px">← Keep browsing</a>
        </div>
        <div class="summary">
          <h3>Order summary</h3>
          ${summaryRows(true)}
          <div class="coupon-wrap">${couponBox()}</div>
          <a class="btn btn-primary btn-block" href="#/checkout" style="margin-top:14px">Continue to UPI payment ${I.arrow}</a>
          <p class="small muted center" style="margin-top:10px">${I.lock} Scan · pay · upload screenshot</p>
        </div>
      </div></div>`;
  }

  /* -------------------------------------------------------------- checkout */
  async function viewCheckout() {
    if (!Store.cart.length) { go('#/cart'); return '<div class="wrap"></div>'; }
    setTimeout(() => {
      const f = $('#coForm');
      if (!f) return;
      f.onsubmit = async e => {
        e.preventDefault();
        const v = Object.fromEntries(new FormData(f).entries());
        if (!String(v.name || '').trim()) return toast('Please enter your name.', 'bad');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email || '')) return toast('Enter a valid email address.', 'bad');
        const btn = f.querySelector('button');
        btn.disabled = true; btn.innerHTML = 'Creating your order…';
        try {
          const res = await api('/api/orders', { method: 'POST', body: {
            items: Store.cart.map(l => ({ id: l.id, formats: l.formats })), name: v.name, email: v.email,
            phone: v.phone || '', coupon: Store.coupon ? Store.coupon.code : null
          } });
          go('#/pay/' + res.order.code);
        } catch (err) {
          toast(err.message, 'bad'); btn.disabled = false; btn.innerHTML = 'Continue to UPI payment';
        }
      };
    }, 0);
    return `<div class="wrap co-wrap">
      <div class="crumbs"><a href="#/cart">Bag</a> / Checkout</div>
      ${rail(2)}
      <div class="co-grid">
        <div class="panel">
          <h3>Where should the receipt go?</h3>
          <p class="sub">No account needed — just an email so you can find your files again.</p>
          <form id="coForm" class="stack" novalidate>
            <div class="grid-2">
              <div class="field"><label>Your name</label><input class="input" name="name" placeholder="Sruthin Chess" required></div>
              <div class="field"><label>Mobile (optional)</label><input class="input" name="phone" inputmode="numeric" placeholder="10-digit"></div>
            </div>
            <div class="field"><label>Email</label><input class="input" type="email" name="email" placeholder="you@example.com" required></div>
            <div class="field">
              <label>Coupon code</label>
              ${couponBox()}
            </div>
            <button class="btn btn-primary" type="submit" style="height:54px;margin-top:6px">Continue to UPI payment ${I.arrow}</button>
            <p class="small muted" style="margin:0">By paying you accept the one-person commercial licence. Files are delivered instantly — sales are final.</p>
          </form>
        </div>
        <aside class="summary">
          <h3>${Store.count} design${Store.count > 1 ? 's' : ''}</h3>
          ${Store.cart.map(l => `<div class="mini-line">
            <div class="pic">${l.preview ? `<img src="${esc(l.preview)}" alt="">` : ''}</div>
            <div><h4>${esc(l.name)}</h4><div class="meta">${(l.formats || []).map(fmtLabel).join(' · ')}</div></div>
            <b class="mono small">${money(l.price)}</b></div>`).join('')}
          <div style="margin-top:10px">${summaryRows(false)}</div>
        </aside>
      </div></div>`;
  }

  /* ------------------------------------------------------------- pay view */
  async function viewPay(code, step) {
    const d = await api('/api/orders/' + encodeURIComponent(code));
    setTimeout(() => mountPay(d.order, step), 0);
    return `<div class="wrap co-wrap"><div class="crumbs"><a href="#/">Home</a> / Order ${esc(d.order.code)}</div><div id="payRoot"></div></div>`;
  }

  const rail = n => {
    const steps = [['Bag', 1], ['Details', 2], ['Pay by UPI', 3], ['Screenshot', 4]];
    return `<div class="co-steps">${steps.map(([label, i], idx) => {
      const cls = n > i ? 'done' : n === i ? 'on' : '';
      return `${idx ? `<div class="co-rail ${n > i ? 'fill' : ''}"></div>` : ''}
        <div class="co-step ${cls}"><i>${n > i ? '✓' : i}</i><span>${label}</span></div>`;
    }).join('')}</div>`;
  };

  function mountPay(o, step) {
    const root = $('#payRoot');
    if (!root) return;
    if (o.status === 'paid') { root.innerHTML = paidHTML(o); wirePaid(o); return; }
    if (o.status === 'submitted') { root.innerHTML = submittedHTML(o); return; }
    // once the buyer says they have paid, coming back lands on the upload step
    const paidFlag = LS.getItem('sd_paid_' + o.code) === '1';
    const wantUpload = step === 'upload' || (paidFlag && step !== 'pay');
    if (wantUpload) { root.innerHTML = uploadHTML(o); wireUpload(o); }
    else { root.innerHTML = payHTML(o); wirePay(o); }
  }

  function orderAside(o) {
    return `<aside class="summary">
      <h3>${o.items.length} design${o.items.length > 1 ? 's' : ''}</h3>
      ${o.items.map(it => `<div class="mini-line">
        <div class="pic">${it.preview ? `<img src="${esc(it.preview)}" alt="" loading="lazy" decoding="async">` : ''}</div>
        <div><h4>${esc(it.name)}</h4><div class="meta">${(it.formats || []).map(fmtLabel).join(' · ')}</div></div>
        <b class="mono small">${money(it.price)}</b></div>`).join('')}
      <div style="margin-top:10px">
        <div class="sum-row"><span>Subtotal</span><b>${money(o.subtotal || o.amount)}</b></div>
        ${o.discount ? `<div class="sum-row discount"><span>Coupon ${esc(o.coupon || '')}</span><b>− ${money(o.discount)}</b></div>` : ''}
        <div class="sum-row"><span>Delivery</span><b style="color:var(--green)">Instant</b></div>
        <div class="sum-row total"><span>To pay</span><b>${money(o.amount)}</b></div>
      </div>
    </aside>`;
  }

  /* ---- step 3: pay ---- */
  function payHTML(o) {
    const upi = o.upi || { id: Store.settings.upi_id, payee: Store.settings.payee_name, link: '', amount: String(o.amount) };
    return `${rail(3)}
      <div class="co-grid">
        <div class="panel">
          <h3>Pay ${money(o.amount)} by UPI</h3>
          <p class="sub">Order <b class="mono">${esc(o.code)}</b> · ${o.items.length} design${o.items.length > 1 ? 's' : ''} · the amount is locked to this order</p>

          <div class="apps-head"><span>Pay with an app</span><span class="line"></span></div>
          <div class="upi-apps" id="upiApps">
            ${UPI_APPS.map(a => `<button class="upi-app" data-app="${a.id}" title="Open ${esc(a.name)}">
              <span class="lg">${logo(a, 24)}</span><span class="nm">${esc(a.name)}</span></button>`).join('')}
          </div>
          <p class="pay-hint">${I.lock}<span>These open the app on your phone with the amount filled in. On a laptop, scan the QR below — or <a class="link" href="#" id="copyHint">copy the UPI ID</a>.</span></p>

          <div class="apps-head"><span>Or scan the QR</span><span class="line"></span></div>
          <div class="qr-card">
            <div class="qr-frame">${qrSvg(upi.link, 6)}</div>
            <div class="qr-side">
              <div><div class="qr-lab">Amount to pay</div><div class="qr-amt">₹${Number(o.amount).toLocaleString('en-IN')}</div></div>
              <div><div class="qr-lab">UPI ID</div>
                <div class="upi-row"><span>${esc(upi.id)}</span><button class="copy-btn" id="copyUpi">Copy</button></div></div>
              <p class="small muted" style="margin:0">${I.zap} The QR carries the amount and the order code — nothing to type.</p>
            </div>
          </div>

          <hr class="hairline" style="margin:24px 0">
          <div class="next-step">
            <div>
              <b>Paid in your UPI app?</b>
              <p class="small muted" style="margin:4px 0 0">Come back here and upload the payment screenshot — that is the last step.</p>
            </div>
            <button class="btn btn-green" id="paidBtn">I have paid · upload screenshot ${I.arrow}</button>
          </div>
          <div class="trust-row"><span>${I.lock} Secure UPI</span><span>${I.clock} Files held ${Store.settings.link_hours}h</span><span>${I.shield} Auto-verified</span></div>
        </div>
        ${orderAside(o)}
      </div>`;
  }

  /* ---- step 4: upload the screenshot ---- */
  function uploadHTML(o) {
    return `${rail(4)}
      <div class="co-grid">
        <div class="panel">
          <h3>Upload the payment screenshot</h3>
          <p class="sub">Order <b class="mono">${esc(o.code)}</b> · ${money(o.amount)} · confirmation is automatic, so your files unlock the moment the screenshot is in.</p>

          <div id="proofArea">
            <label class="upload-zone" id="dropZone" for="proofInput">
              <div class="up-ic">${I.up}</div>
              <b>Drop the screenshot here, or click to choose</b>
              <span>PNG, JPG or WebP · up to 8 MB</span>
              <input type="file" id="proofInput" accept="image/png,image/jpeg,image/webp" style="display:none">
            </label>
            <div class="field" style="margin-top:14px"><label>UPI reference / UTR (optional)</label>
              <input class="input mono" id="upiRef" placeholder="e.g. 4312 8891 0043"></div>
            <button class="btn btn-green btn-block" id="confirmPay" disabled style="margin-top:14px;height:54px">Upload &amp; confirm payment</button>
            <div class="trust-row"><span>${I.lock} Encrypted upload</span><span>${I.clock} Files held ${Store.settings.link_hours}h</span><span>${I.shield} Auto-verified</span></div>
          </div>

          <p class="small muted" style="margin-top:18px">Not paid yet? <a class="link" href="#/pay/${esc(o.code)}/pay" id="backToPay">Go back to payment</a></p>
        </div>
        ${orderAside(o)}
      </div>`;
  }

  function submittedHTML(o) {
    return `${rail(4)}
      <div class="panel" style="max-width:620px;margin:0 auto">
        <div class="ok-hero"><div class="ok-mark" style="background:#eef2f7;color:#35526e">${I.clock}</div>
          <h2>Screenshot received</h2>
          <p class="muted">Order <b class="mono">${esc(o.code)}</b> is with the studio for a quick check. Your designs unlock the moment it is approved.</p>
          <span class="status-chip submitted">Awaiting review</span></div>
        <p class="small muted center" style="margin-top:16px">Keep this page — <span class="mono">#/pay/${esc(o.code)}</span></p>
      </div>`;
  }

  function wirePay(o) {
    const upi = o.upi || { id: Store.settings.upi_id, link: '' };
    const doCopy = async () => {
      try { await navigator.clipboard.writeText(Store.settings.upi_id); toast('UPI ID copied', 'ok'); }
      catch { toast('Copy failed — select the ID manually', 'bad'); }
    };
    const copy = $('#copyUpi'); if (copy) copy.onclick = doCopy;
    const hint = $('#copyHint'); if (hint) hint.onclick = e => { e.preventDefault(); doCopy(); };
    $$('#upiApps .upi-app').forEach(b => b.onclick = () => {
      const app = UPI_APPS.find(a => a.id === b.dataset.app);
      if (app) openUpiApp(app, upi);
    });
    const paidBtn = $('#paidBtn');
    if (paidBtn) paidBtn.onclick = () => {
      LS.setItem('sd_paid_' + o.code, '1');
      go(`#/pay/${o.code}/upload`);
    };
  }

  function wireUpload(o) {
    const input = $('#proofInput');
    const zone = $('#dropZone');
    const back = $('#backToPay');
    if (back) back.onclick = () => { LS.removeItem('sd_paid_' + o.code); };
    if (!input) return;
    let file = null;
    const showPreview = f => {
      file = f;
      const url = URL.createObjectURL(f);
      const z = $('#dropZone');
      if (z) z.outerHTML = `<div class="proof-preview" id="dropZone">
        <img src="${url}" alt="Payment screenshot">
        <div><div class="fname">${esc(f.name)}</div><div class="small muted">ready to upload</div>
        <button class="btn btn-xs btn-ghost" id="rePick" style="margin-top:6px">Choose another</button></div>
      </div>`;
      const rp = $('#rePick'); if (rp) rp.onclick = () => input.click();
      const btn = $('#confirmPay'); if (btn) btn.disabled = false;
    };
    input.onchange = () => { if (input.files[0]) showPreview(input.files[0]); };
    if (zone) {
      zone.ondragover = e => { e.preventDefault(); zone.classList.add('drag'); };
      zone.ondragleave = () => zone.classList.remove('drag');
      zone.ondrop = e => {
        e.preventDefault(); zone.classList.remove('drag');
        const f = e.dataTransfer.files[0];
        if (!f) return;
        if (!/^image\//.test(f.type)) return toast('Please drop an image file.', 'bad');
        showPreview(f);
      };
    }
    const btn = $('#confirmPay');
    if (btn) btn.onclick = () => {
      if (!file) return toast('Attach the payment screenshot first.', 'bad');
      if (file.size > 8 * 1024 * 1024) return toast('Screenshot is larger than 8 MB.', 'bad');
      btn.disabled = true; btn.innerHTML = 'Checking payment…';
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const res = await api(`/api/orders/${encodeURIComponent(o.code)}/proof`, { method: 'POST', body: { screenshot: reader.result, ref: ($('#upiRef') || {}).value || '' } });
          LS.removeItem('sd_paid_' + o.code);
          if (res.autoConfirmed) {
            Store.cart = []; Store.coupon = null; Store.save();
            toast('Payment confirmed — your files are downloading', 'ok');
            mountPay({ ...o, ...res.order, status: 'paid' });
          } else {
            toast(res.message || 'Screenshot received', 'ok');
            mountPay({ ...o, status: 'submitted' });
          }
        } catch (err) { toast(err.message, 'bad'); btn.disabled = false; btn.innerHTML = 'Upload &amp; confirm payment'; }
      };
      reader.onerror = () => { toast('Could not read that file.', 'bad'); btn.disabled = false; };
      reader.readAsDataURL(file);
    };
  }

  /* ------------------------------------------------------------ paid view */
  function paidHTML(o) {
    const links = o.downloads || [];
    return `<div class="panel" style="max-width:700px;margin:0 auto">
      <div class="ok-hero">
        <div class="ok-mark">${I.check}</div>
        <span class="status-chip paid">Payment confirmed</span>
        <h2 style="margin-top:12px">Your designs are ready</h2>
        <p class="muted">Order <b class="mono">${esc(o.code)}</b> · ${money(o.amount)}${o.discount ? ` <span class="small">(saved ${money(o.discount)} with ${esc(o.coupon || 'coupon')})</span>` : ''} · ${dt(o.paidAt)}<br>
        Each ZIP holds exactly the formats you chose. Downloads start on their own and land in your browser's Downloads folder.</p>
      </div>
      <div class="dl-list" id="dlList">
        ${links.map((l, i) => `<div class="dl-row" data-dl="${i}">
          <div class="f-ic">${I.file}</div>
          <div><b>${esc(l.fileName)}</b><div class="fmeta">${esc(l.name)} · ${(l.formats || []).map(fmtLabel).join(' + ')}</div>
            <div class="progress"><i></i></div></div>
          <a class="btn btn-green btn-sm" href="${esc(l.url)}" download="${esc(l.fileName)}">Download</a>
        </div>`).join('')}
      </div>
      <div class="dl-note">${I.dl}<span>Your browser may ask to allow multiple downloads — click <b>Allow</b>. Links stay live for ${Store.settings.link_hours} hours; reopen this page any time to download again.</span></div>
      <div class="row" style="margin-top:16px;flex-wrap:wrap">
        <button class="btn btn-primary" id="dlAll">Download all again ${I.dl}</button>
        <a class="btn btn-ghost" href="#/designs">Keep browsing</a>
      </div>
      <p class="small muted center" style="margin-top:14px">Bookmark this page: <span class="mono">#/pay/${esc(o.code)}</span> · receipt sent to ${esc(o.email || 'your email')}</p>
    </div>`;
  }

  function wirePaid(o) {
    Store.rememberOrder(o);
    const links = o.downloads || [];
    links.forEach((l, i) => setTimeout(() => triggerDownload(l, i), 400 + i * 900));
    const all = $('#dlAll');
    if (all) all.onclick = () => {
      links.forEach((l, i) => setTimeout(() => triggerDownload(l, i), i * 700));
      toast(`Downloading ${links.length} file${links.length > 1 ? 's' : ''}`, 'ok');
    };
    $$('[data-dl]').forEach(row => {
      const a = row.querySelector('a');
      if (a) a.onclick = () => setTimeout(() => markReady(row), 400);
    });
  }

  function markReady(row) {
    if (!row) return;
    row.classList.add('ready');
    const bar = row.querySelector('.progress > i'); if (bar) bar.style.width = '100%';
    const ic = row.querySelector('.f-ic'); if (ic) ic.innerHTML = I.check;
  }

  function triggerDownload(link, index) {
    try {
      const a = document.createElement('a');
      a.href = link.url; a.download = link.fileName; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
      markReady($(`[data-dl="${index}"]`));
    } catch (e) { console.warn('download', e); }
  }
  window.triggerDownload = triggerDownload;

  /* -------------------------------------------------------------- lookup */
  async function viewOrderLookup(params) {
    if (params.code) return viewPay(params.code);
    return `<div class="wrap" style="max-width:600px;padding:44px 26px 80px">
      <div class="panel">
        <span class="eyebrow">Find my order</span>
        <h1 style="font-size:1.7rem;margin:10px 0 6px">Re-download a design</h1>
        <p class="muted small">Enter the order code from your receipt — it looks like RSM-4F2A91.</p>
        <form id="findForm" class="stack" style="margin-top:14px">
          <div class="field"><label>Order code</label><input class="input mono" name="code" placeholder="RSM-XXXXXX" style="text-transform:uppercase"></div>
          <button class="btn btn-primary">Open my order ${I.arrow}</button>
        </form>
        <p class="small muted" style="margin:14px 0 0">Lost the code? Write to ${esc(Store.settings.support_email)} with the UPI reference and we will resend it.</p>
      </div>
    </div>`;
  }

  /* --------------------------------------------------------- interactions */
  function addToCart(d, formats) {
    if (Store.cart.some(l => l.id === d.id)) { toast('Already in your bag'); return; }
    const keys = (d.formats || []).map(f => f.key);
    const pick = (formats && formats.length ? formats : (d.defaultFormats && d.defaultFormats.length ? d.defaultFormats : keys.slice(0, 1)));
    Store.cart.push({ id: d.id, slug: d.slug, name: d.name, price: d.price * pick.length, unitPrice: d.price, preview: d.preview, formats: pick });
    Store.save(); toast(`${d.name} added`, 'ok'); openDrawer();
  }
  window.addToCart = addToCart;

  function paintBadges() {
    const dot = $('#cartDot');
    if (dot) { dot.textContent = Store.count; dot.style.display = Store.count ? 'grid' : 'none'; }
    const w = $('#wishDot');
    if (w) { w.textContent = Store.wish.length; w.style.display = Store.wish.length ? 'grid' : 'none'; }
  }

  function openDrawer() {
    const dr = $('#drawer');
    dr.innerHTML = `<header><h3>Your bag (${Store.count})</h3><button class="icon-btn" id="closeDrawer">${I.close}</button></header>
      <div class="items">${Store.cart.length ? Store.cart.map(l => `<div class="mini-line">
          <div class="pic">${l.preview ? `<img src="${esc(l.preview)}" alt="">` : ''}</div>
          <div><h4>${esc(l.name)}</h4><div class="meta">${(l.formats || []).map(fmtLabel).join(' · ')}</div>
            <button class="btn btn-xs btn-ghost" data-drem="${l.id}" style="margin-top:5px">Remove</button></div>
          <b class="mono small">${money(l.price)}</b></div>`).join('')
        : `<div style="text-align:center;padding:44px 8px"><p class="muted">Nothing in the bag yet.</p><a class="btn btn-primary btn-sm" href="#/designs" data-close>Browse designs</a></div>`}</div>
      ${Store.cart.length ? `<footer>
        <div class="between" style="margin-bottom:10px"><span class="muted small">Total</span><b class="mono">${money(Store.subtotal)}</b></div>
        <a class="btn btn-primary btn-block" href="#/checkout" data-close>Pay by UPI</a></footer>` : ''}`;
    dr.classList.add('on'); $('#scrim').classList.add('on'); document.body.classList.add('locked');
    $('#closeDrawer').onclick = closeDrawer;
    dr.querySelectorAll('[data-close]').forEach(a => a.addEventListener('click', closeDrawer));
    dr.querySelectorAll('[data-drem]').forEach(b => b.onclick = () => {
      Store.cart = Store.cart.filter(l => l.id !== Number(b.dataset.drem)); Store.save(); openDrawer();
    });
  }
  function closeDrawer() {
    const d = $('#drawer'); if (d) d.classList.remove('on');
    const s = $('#scrim'); if (s) s.classList.remove('on');
    document.body.classList.remove('locked');
  }
  window.closeDrawer = closeDrawer;

  /* ----------------------------------------------------------------- QR */
  function qrSvg(text, cell = 6) {
    if (typeof window.qrcode !== 'function') return '<div class="small muted">QR unavailable</div>';
    try {
      const qr = window.qrcode(0, 'M');
      qr.addData(text); qr.make();
      return qr.createSvgTag({ cellSize: cell, margin: 2, scalable: true });
    } catch { return '<div class="small muted">QR unavailable</div>'; }
  }

  /* --------------------------------------------------------------- router */
  /* Real URLs: /designs, /design/peony-bloom, /pay/SDY-XXXX — not #/designs.
     BASE is injected by the page ('/' on the server, the repo path on Pages). */
  const BASE = (window.__BASE__ || '/').replace(/\/?$/, '/');
  const HASH_MODE = location.protocol === 'file:';

  function currentPath() {
    if (HASH_MODE) return location.hash.replace(/^#\/?/, '');
    let p = location.pathname || '/';
    if (p.startsWith(BASE)) p = p.slice(BASE.length);
    else p = p.replace(/^\//, '');
    return p.replace(/\/+$/, '');
  }

  function parseHash() {
    const raw = currentPath();
    const [p, q] = raw.split('?');
    const search = HASH_MODE ? q : (q || location.search.replace(/^\?/, ''));
    return { parts: (p || '').split('/').filter(Boolean), params: Object.fromEntries(new URLSearchParams(search || '')) };
  }

  function go(path, replace) {
    const clean = String(path).replace(/^#?\/*/, '');
    if (HASH_MODE) {
      if (location.hash === '#/' + clean) return;
      location.hash = '#/' + clean;
      return;
    }
    const url = BASE + clean;
    if (location.pathname + location.search === url) return;
    history[replace ? 'replaceState' : 'pushState']({}, '', url);
    render();
  }
  window.go = go;

  /* internal links keep their #/ href, but the address bar shows a clean URL */
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href^="#/"]');
    if (!a || a.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    e.preventDefault();
    go(a.getAttribute('href').slice(2));
  });


  function reveals() {
    const els = $$('.reveal');
    if (!('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('in')); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e, i) => {
        if (e.isIntersecting) {
          setTimeout(() => e.target.classList.add('in'), i * 60);
          io.unobserve(e.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: .08 });
    els.forEach(e => io.observe(e));
  }

  function progress(on) {
    let bar = document.getElementById('routebar');
    if (on) {
      if (!bar) {
        bar = document.createElement('div');
        bar.id = 'routebar';
        document.body.appendChild(bar);
      }
      bar.style.opacity = '1';
      bar.style.width = '0%';
      requestAnimationFrame(() => { bar.style.width = '72%'; });
    } else if (bar) {
      bar.style.width = '100%';
      setTimeout(() => { bar.style.opacity = '0'; }, 220);
      setTimeout(() => { bar.style.width = '0%'; }, 520);
    }
  }

  async function render() {
    progress(true);
    const { parts, params } = parseHash();
    const app = $('#app');
    const seg = parts[0] || 'home';
    if (seg === 'admin' && window.Admin) { window.Admin.render(app, parts.slice(1)); return; }

    let view = '', active = seg;
    try {
      if (seg === 'home') view = await viewHome();
      else if (seg === 'designs') view = await viewShop(params);
      else if (seg === 'd' || seg === 'design') view = await viewDesign(parts[1]);
      else if (seg === 'cart') view = await viewCart();
      else if (seg === 'saved') { view = await viewSaved(); active = 'saved'; }
      else if (seg === 'downloads') { view = await viewDownloads(); active = 'downloads'; }
      else if (seg === 'categories') { view = await viewCategories(); active = 'categories'; }
      else if (seg === 'about') { view = await viewAbout(); active = 'about'; }
      else if (seg === 'contact') { view = await viewContact(); active = 'contact'; }
      else if (seg === 'checkout') view = await viewCheckout();
      else if (seg === 'pay') view = await viewPay(parts[1], parts[2]);
      else if (seg === 'order') { view = await viewOrderLookup({ ...params, code: parts[1] }); active = 'order'; }
      else view = `<div class="wrap"><div class="empty" style="margin:50px 0"><h3>Page not found</h3><a class="btn btn-primary" href="#/" style="margin-top:8px">Go home</a></div></div>`;
    } catch (e) {
      view = `<div class="wrap"><div class="empty" style="margin:50px 0"><h3>Something went wrong</h3><p class="muted small">${esc(e.message)}</p><a class="btn btn-primary" href="#/" style="margin-top:8px">Back home</a></div></div>`;
    }

    app.innerHTML = header(active) + `<main class="page">${view}</main>` + footer() + tabbar(active);
    progress(false);
    closeDrawer();
    paintBadges();
    wireGlobal();
    reveals();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function wireGlobal() {
    const s = $('#searchform');
    if (s) s.onsubmit = e => {
      e.preventDefault();
      const q = new FormData(s).get('q').trim();
      go(q ? `#/designs?q=${encodeURIComponent(q)}` : '#/designs');
    };
    const oc = $('#openCart'); if (oc) oc.onclick = openDrawer;
    const bg = $('#burger');
    if (bg) bg.onclick = () => {
      const m = $('#modal');
      m.innerHTML = `<div class="modal"><header><h3>Menu</h3><button class="icon-btn" id="mClose">${I.close}</button></header>
        <div class="stack">
          <a class="btn btn-ghost btn-block" href="#/">Home</a>
          <a class="btn btn-ghost btn-block" href="#/designs">All designs</a>
          <a class="btn btn-ghost btn-block" href="#/downloads">My downloads</a>
          <a class="btn btn-ghost btn-block" href="#/saved">Saved designs</a>
        </div></div>`;
      m.classList.add('on');
      $('#mClose').onclick = () => m.classList.remove('on');
      m.querySelectorAll('a').forEach(a => a.onclick = () => m.classList.remove('on'));
    };
    // save / wishlist
    $$('[data-fav]').forEach(b => b.onclick = e => {
      e.preventDefault(); e.stopPropagation();
      const id = Number(b.dataset.fav);
      const on = Store.toggleWish(id);
      b.classList.toggle('on', on);
      b.innerHTML = on ? I.heartOn : I.heart;
      toast(on ? 'Saved to your list' : 'Removed from saved', on ? 'ok' : '');
      if (parseHash().parts[0] === 'saved') render();
    });
    const saveBtn = $('#saveBtn');
    if (saveBtn) saveBtn.onclick = () => {
      const d = Store.designs.find(x => x.slug === parseHash().parts[1]);
      if (!d) return;
      const on = Store.toggleWish(d.id);
      saveBtn.innerHTML = on ? I.heartOn : I.heart;
      saveBtn.style.color = on ? 'var(--maroon)' : '';
      toast(on ? 'Saved to your list' : 'Removed from saved', on ? 'ok' : '');
    };
    const shareBtn = $('#shareBtn');
    if (shareBtn) shareBtn.onclick = async () => {
      try { await navigator.clipboard.writeText(location.href); toast('Link copied', 'ok'); }
      catch { toast('Copy the address bar to share', 'bad'); }
    };

    // offers sheet — the codes on offer, like any shopping app
    const offersBtn = $('#offersBtn');
    if (offersBtn) offersBtn.onclick = async () => {
      const m = $('#modal');
      m.innerHTML = `<div class="modal"><header><div><span class="eyebrow">Offers</span><h3 style="margin-top:2px">Coupon codes</h3></div>
        <button class="icon-btn" id="mClose">✕</button></header>
        <p class="small muted" style="margin:0 0 12px">Tap a code to apply it to this order.</p>
        <div id="offerList" class="offer-list"><p class="small muted">Loading…</p></div></div>`;
      m.classList.add('on');
      $('#mClose').onclick = () => m.classList.remove('on');
      try {
        const r = await api('/api/coupons');
        const sub = Store.subtotal;
        $('#offerList').innerHTML = r.coupons.map(c => {
          const usable = sub >= (c.minOrder || 0);
          return `<div class="offer ${usable ? '' : 'off'}">
            <div class="offer-code mono">${esc(c.code)}</div>
            <div class="offer-copy"><b>${esc(c.note || c.label)}</b>
              <span class="small muted">${c.type === 'percent' ? `${c.value}% off` : `₹${c.value} off`}${c.minOrder ? ` · min ${money(c.minOrder)}` : ''}${c.maxUses ? ` · ${Math.max(0, c.maxUses - c.used)} left` : ''}</span></div>
            <button class="btn btn-xs ${usable ? 'btn-primary' : 'btn-ghost'}" data-apply="${esc(c.code)}" ${usable ? '' : 'disabled'}>${usable ? 'Apply' : 'Add more'}</button>
          </div>`;
        }).join('') || '<p class="small muted">No codes live right now.</p>';
        $$('[data-apply]').forEach(b => b.onclick = async () => {
          try {
            const res = await api('/api/coupons/validate', { method: 'POST', body: { code: b.dataset.apply, subtotal: Store.subtotal } });
            Store.coupon = { ...res.coupon, discount: res.discount };
            Store.save();
            m.classList.remove('on');
            toast(`${res.coupon.code} applied — you saved ${money(res.discount)}`, 'ok');
            render();
          } catch (err) { toast(err.message, 'bad'); }
        });
      } catch (e) { $('#offerList').innerHTML = `<p class="small muted">${esc(e.message)}</p>`; }
    };

    // coupon
    const cf = $('#couponForm');
    const applyCoupon = async () => {
      const input = cf && cf.querySelector('[name=code]');
      const code = (input ? input.value : '').trim();
      if (!code) return toast('Enter a coupon code', 'bad');
      try {
        const r = await api('/api/coupons/validate', { method: 'POST', body: { code, subtotal: Store.subtotal } });
        Store.coupon = { ...r.coupon, discount: r.discount };
        Store.save();
        toast(`${r.coupon.code} applied — you saved ${money(r.discount)}`, 'ok');
        render();
      } catch (err) { toast(err.message, 'bad'); }
    };
    if (cf) {
      const btn = $('#couponApply');
      if (btn) btn.onclick = applyCoupon;
      const input = cf.querySelector('[name=code]');
      if (input) input.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); applyCoupon(); } };
    }
    const cr = $('#couponRemove');
    if (cr) cr.onclick = () => { Store.coupon = null; Store.save(); toast('Coupon removed'); render(); };

    // welcome coupon
    const welcomeApply = $('#welcomeApply');
    if (welcomeApply) welcomeApply.onclick = async () => {
      if (!Store.cart.length) { toast('Add a design first, then apply WELCOME', 'bad'); go('#/designs'); return; }
      try {
        const r = await api('/api/coupons/validate', { method: 'POST', body: { code: 'WELCOME', subtotal: Store.subtotal } });
        Store.coupon = { ...r.coupon, discount: r.discount }; Store.save();
        toast(`WELCOME applied — ${money(r.discount)} off`, 'ok');
        go('#/cart');
      } catch (err) { toast(err.message, 'bad'); }
    };
    const welcomeClose = $('#welcomeClose');
    if (welcomeClose) welcomeClose.onclick = () => { LS.setItem('sd_welcome_off', '1'); render(); };

    // bundle
    const bundleAdd = $('#bundleAdd');
    if (bundleAdd) bundleAdd.onclick = async () => {
      Store.designs.forEach(d => {
        if (!Store.cart.some(l => l.id === d.id)) {
          Store.cart.push({ id: d.id, slug: d.slug, name: d.name, price: d.price, preview: d.preview,
            formats: d.defaultFormats && d.defaultFormats.length ? d.defaultFormats : (d.formats || []).map(f => f.key).slice(0, 2) });
        }
      });
      Store.save();
      try {
        const r = await api('/api/coupons/validate', { method: 'POST', body: { code: 'SET25', subtotal: Store.subtotal } });
        Store.coupon = { ...r.coupon, discount: r.discount };
        Store.save();
        toast(`Bundle added — ${money(r.discount)} off with SET25`, 'ok');
      } catch (err) { toast('Bundle added to your bag', 'ok'); }
      go('#/cart');
    };

    const chipsMore = $('#chipsMore');
    if (chipsMore) chipsMore.onclick = () => {
      $$('.filter-chip.extra').forEach(c => c.classList.remove('hide'));
      chipsMore.remove();
    };

    const loadMore = $('#loadMore');
    if (loadMore) loadMore.onclick = () => {
      const { params } = parseHash();
      go('#/designs?' + qs({ ...params, show: Number(params.show || PAGE) + PAGE }));
    };

    const sortSel = $('#sortSel');
    if (sortSel) sortSel.onchange = () => { const { params } = parseHash(); go('#/designs?' + qs({ ...params, sort: sortSel.value })); };
    const ff = $('#findForm');
    if (ff) ff.onsubmit = e => {
      e.preventDefault();
      const code = new FormData(ff).get('code').trim().toUpperCase();
      if (!code) return toast('Enter your order code', 'bad');
      go('#/pay/' + encodeURIComponent(code));
    };
    $$('[data-add]').forEach(b => b.onclick = async e => {
      e.preventDefault(); e.stopPropagation();
      const d = await findDesign(Number(b.dataset.add));
      if (d) addToCart(d);
    });
    $$('[data-buy]').forEach(b => b.onclick = async e => {
      e.preventDefault(); e.stopPropagation();
      const d = await findDesign(Number(b.dataset.buy));
      if (!d) return;
      const one = (d.defaultFormats && d.defaultFormats.length ? d.defaultFormats : (d.formats || []).map(f => f.key)).slice(0, 1);
      Store.cart = [{ id: d.id, slug: d.slug, name: d.name, price: d.price * one.length, unitPrice: d.price, preview: d.preview, formats: one }];
      Store.save(); go('#/checkout');
    });
    $$('[data-remove]').forEach(b => b.onclick = () => {
      Store.cart = Store.cart.filter(l => l.id !== Number(b.dataset.remove)); Store.save(); render();
    });
  }

  async function findDesign(id) {
    const d = Store.designs.find(x => x.id === id);
    if (d) return d;
    try { const r = await api('/api/designs/' + id); return r.design; } catch { toast('Could not load that design', 'bad'); return null; }
  }

  /* ------------------------------------------------------------------ boot */
  async function boot() {
    try { const r = await fetch('/api/health', { cache: 'no-store' }); if (!r.ok) throw 0; }
    catch { Store.demo = true; }
    if (Store.demo) {
      const b = document.createElement('div');
      b.className = 'mode-badge';
      b.textContent = 'Demo · data in this browser';
      b.title = 'Static demo: PES and DST are included here. Run npm start for the full store with all five formats and a real database.';
      document.body.appendChild(b);
    }
    try {
      const [s, p, f] = await Promise.all([api('/api/settings'), api('/api/designs?' + qs({})), api('/api/formats')]);
      Store.settings = { ...Store.settings, ...s.settings };
      Store.designs = p.designs; Store.tags = p.tags || [];
      Store.formats = f.formats || [];
    } catch (e) { console.warn(e); }

    window.addEventListener('hashchange', render);
    window.addEventListener('popstate', render);
    window.addEventListener('scroll', () => {
      const h = $('#hdr'); if (h) h.classList.toggle('scrolled', window.scrollY > 8);
    }, { passive: true });
    $('#scrim').onclick = () => { closeDrawer(); $('#modal').classList.remove('on'); };
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeDrawer(); $('#modal').classList.remove('on'); } });
    await render();
  }

  window.Router = { render, parseHash };
  document.addEventListener('DOMContentLoaded', boot);
})();

/* =========================================================================
   Resham Atelier — storefront
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
    settings: { store_name: 'Resham Atelier', upi_id: '6301928345@fam', payee_name: 'Resham Atelier', auto_approve: true, link_hours: 72 },
    designs: [], tags: [], formats: [], demo: false,
    cart: JSON.parse(LS.getItem('ra_cart') || '[]'),
    save() { LS.setItem('ra_cart', JSON.stringify(this.cart)); paintBadges(); },
    get count() { return this.cart.length; },
    get subtotal() { return this.cart.reduce((s, l) => s + l.price, 0); }
  };
  window.Store = Store;

  async function api(path, opts = {}) {
    const method = opts.method || 'GET';
    if (Store.demo) { await new Promise(r => setTimeout(r, 80)); return window.Demo.handle(method, path, opts.body, opts.query); }
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
    arrow: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'
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
  const LOGO = `<svg class="mark" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="20" cy="20" r="17.5" fill="none" stroke="#7E2B33" stroke-width="1.6"/>
    <circle cx="20" cy="20" r="12" fill="none" stroke="#B4884B" stroke-width="1.2" stroke-dasharray="3 3"/>
    <g fill="#7E2B33"><circle cx="20" cy="8" r="2"/><circle cx="28" cy="14" r="2"/><circle cx="28" cy="26" r="2"/><circle cx="20" cy="32" r="2"/><circle cx="12" cy="26" r="2"/><circle cx="12" cy="14" r="2"/></g>
    <circle cx="20" cy="20" r="3.4" fill="#B4884B"/>
  </svg>`;

  const fmtLabel = k => (k || '').toUpperCase();

  function designCard(d) {
    return `<article class="dcard reveal">
      <a class="stage" href="#/d/${esc(d.slug)}" aria-label="${esc(d.name)}">
        ${d.preview ? `<img src="${esc(d.preview)}" alt="${esc(d.name)} stitch preview" loading="lazy">` : ''}
        ${d.badge ? `<span class="pill ${d.badge === 'New' ? 'brass' : 'maroon'}">${esc(d.badge)}</span>` : ''}
        <span class="stitch-badge">${nf(d.stitchCount)} stitches</span>
      </a>
      <div class="body">
        <span class="meta">${esc(d.hoop)} · ${d.colorCount} colour${d.colorCount > 1 ? 's' : ''} · ${(d.formats || []).length} formats</span>
        <a href="#/d/${esc(d.slug)}"><h3>${esc(d.name)}</h3></a>
        <p class="sum">${esc((d.summary || '').slice(0, 92))}${(d.summary || '').length > 92 ? '…' : ''}</p>
        <div class="price"><b>${money(d.price)}</b>${d.mrp > d.price ? `<s>${money(d.mrp)}</s><span class="off">${d.discount}% off</span>` : ''}</div>
        <div class="buyrow">
          <button class="btn btn-primary btn-sm" data-buy="${d.id}">Buy · ${money(d.price)}</button>
          <button class="btn btn-ghost btn-sm" data-add="${d.id}">+ Bag</button>
        </div>
      </div>
    </article>`;
  }

  function header(active) {
    const a = k => (active === k ? 'on' : '');
    return `<div class="announce">${esc(Store.settings.announcement)}</div>
    <header class="hdr" id="hdr"><div class="wrap hdr-in">
      <button class="icon-btn burger" id="burger" aria-label="Menu">${I.burger}</button>
      <a class="logo" href="#/">${LOGO}<span>${esc(Store.settings.store_name)}<small>Embroidery designs</small></span></a>
      <nav class="nav">
        <a href="#/designs" class="${a('designs')}">All designs</a>
        <a href="#/designs?tag=floral" class="${a('floral')}">Floral</a>
        <a href="#/designs?tag=border" class="${a('border')}">Borders</a>
        <a href="#/designs?tag=bridal" class="${a('bridal')}">Bridal</a>
        <a href="#/order" class="${a('order')}">My order</a>
      </nav>
      <form class="searchbar" id="searchform" role="search">
        <span style="position:absolute;left:15px;top:50%;transform:translateY(-50%);color:var(--ink-mute)">${I.search}</span>
        <input name="q" placeholder="Search designs, hoops, motifs…" autocomplete="off">
      </form>
      <div class="hdr-tools">
        <a class="icon-btn" href="#/order" aria-label="Find my order">${I.user}</a>
        <button class="icon-btn" id="openCart" aria-label="Bag">${I.bag}<span class="dot" id="cartDot">${Store.count}</span></button>
      </div>
    </div></header>`;
  }

  function footer() {
    return `<footer class="foot"><div class="wrap">
      <div class="foot-grid">
        <div>
          <a class="logo" href="#/">${LOGO}<span>${esc(Store.settings.store_name)}<small>Embroidery designs</small></span></a>
          <p class="small" style="margin-top:12px;max-width:34ch;color:#b8b1a3">${esc(Store.settings.tagline)} Every design is digitised by hand, sold once, and delivered the moment your UPI payment is confirmed.</p>
        </div>
        <div><h4>Designs</h4><ul>
          <li><a href="#/designs?tag=floral">Floral</a></li>
          <li><a href="#/designs?tag=border">Borders</a></li>
          <li><a href="#/designs?tag=bridal">Bridal</a></li>
          <li><a href="#/designs?tag=monogram">Monograms</a></li>
          <li><a href="#/designs">Everything</a></li></ul></div>
        <div><h4>Help</h4><ul>
          <li><a href="#/order">Find my order</a></li>
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
    const [feat, all] = await Promise.all([
      api('/api/designs?' + qs({ featured: '1' })),
      api('/api/designs?' + qs({}))
    ]);
    const hero = feat.designs[0] || all.designs[0];
    const stitches = all.designs.reduce((s, d) => s + d.stitchCount, 0);
    return `<div class="hero"><div class="wrap hero-in">
      <div>
        <span class="eyebrow">Digitised by hand · India</span>
        <h1>Embroidery designs,<br>ready for <em>your machine</em>.</h1>
        <p class="lede">Hand-digitised designs for commercial and home machines, in 24 machine formats. Pick PES, DST, JEF, EXP or any of the others at checkout — you get exactly the files you choose, in one ZIP, the moment your UPI payment clears.</p>
        <div class="hero-cta">
          <a class="btn btn-primary" href="#/designs">Browse ${all.designs.length} designs ${I.arrow}</a>
          <a class="btn btn-ghost" href="#/order">I already paid — get my files</a>
        </div>
        <div class="hero-stats">
          <div><b>${all.designs.length} designs</b><span>in the library</span></div>
          <div><b>${nf(stitches)}</b><span>stitches digitised</span></div>
          <div><b>24 formats</b><span>PES · DST · JEF · EXP · VP3 · XXX…</span></div>
        </div>
      </div>
      <div class="hero-art">
        <div class="stitch-stage">${hero && hero.preview ? `<img src="${esc(hero.preview)}" alt="${esc(hero.name)}">` : ''}</div>
        <div class="hero-tag t1">${I.needle}<div>Machine ready<small>DST &amp; EXP</small></div></div>
        <div class="hero-tag t2">${I.zap}<div>Instant download<small>UPI · auto-confirmed</small></div></div>
      </div>
    </div></div>

    <div class="marq"><div class="marq-in">
      ${['PES · Brother', 'DST · Tajima', 'JEF · Janome', 'EXP · Melco', 'VP3 · Pfaff', 'HUS · Viking', 'XXX · Singer', 'SEW · Janome',
      'PES · Brother', 'DST · Tajima', 'JEF · Janome', 'EXP · Melco', 'VP3 · Pfaff', 'HUS · Viking', 'XXX · Singer', 'SEW · Janome']
        .map(t => `<span>${t}</span>`).join('')}
    </div></div>

    <section class="section"><div class="wrap">
      <div class="sec-head reveal">
        <div><span class="eyebrow">The library</span><h2>Designs that sew out clean</h2>
          <p>Each one is digitised with an underlay, a tested pull compensation and a colour sequence you can follow without guessing.</p></div>
        <a class="btn btn-ghost btn-sm" href="#/designs">All ${all.designs.length} designs ${I.arrow}</a>
      </div>
      <div class="pgrid">${all.designs.slice(0, 6).map(designCard).join('')}</div>
    </div></section>

    <section class="section tight" style="background:var(--paper);border-top:1px solid var(--line);border-bottom:1px solid var(--line)">
      <div class="wrap">
        <div class="sec-head reveal"><div><span class="eyebrow">How it works</span><h2>Pick a format, pay by UPI, sew</h2></div></div>
        <div class="grid-3">
          <div class="card reveal" style="background:var(--canvas)"><span class="eyebrow plain" style="color:var(--maroon)">01</span>
            <h3 style="margin:8px 0 6px">Choose your formats</h3>
            <p class="small muted">Tick what your machine reads — PES for Brother, DST for Tajima, JEF for Janome, and twenty more. They arrive together in one ZIP.</p></div>
          <div class="card reveal" style="background:var(--canvas)"><span class="eyebrow plain" style="color:var(--maroon)">02</span>
            <h3 style="margin:8px 0 6px">Pay by UPI</h3>
            <p class="small muted">Scan the QR or tap your UPI app — the amount and order code travel inside the link, so nothing is typed by hand.</p></div>
          <div class="card reveal" style="background:var(--canvas)"><span class="eyebrow plain" style="color:var(--maroon)">03</span>
            <h3 style="margin:8px 0 6px">Upload the screenshot</h3>
            <p class="small muted">Drop in the payment confirmation and the ZIP downloads itself — straight to your Downloads folder.</p></div>
        </div>
      </div>
    </section>

    <section class="section"><div class="wrap">
      <div class="sec-head reveal"><div><span class="eyebrow">Studio picks</span><h2>Where most people start</h2></div></div>
      <div class="pgrid">${feat.designs.map(designCard).join('')}</div>
    </div></section>`;
  }

  async function viewShop(params) {
    const data = await api('/api/designs?' + qs({ q: params.q || '', tag: params.tag || 'all', sort: params.sort || 'featured' }));
    return `<div class="wrap">
      <div class="crumbs"><a href="#/">Home</a> / Designs</div>
      <div class="sec-head" style="margin-top:16px">
        <div><h1 style="font-size:clamp(1.7rem,3vw,2.3rem)">${params.q ? 'Search: “' + esc(params.q) + '”' : (params.tag ? params.tag[0].toUpperCase() + params.tag.slice(1) : 'All designs')}</h1>
          <p>${data.total} ${data.total === 1 ? 'design' : 'designs'} · instant download, your choice of format</p></div>
        <select class="select" id="sortSel" style="width:auto">
          ${[['featured', 'Featured'], ['newest', 'Newest'], ['price_asc', 'Price: low to high'], ['price_desc', 'Price: high to low'], ['stitches', 'Most stitches'], ['name', 'A–Z']]
        .map(([v, l]) => `<option value="${v}" ${(params.sort || 'featured') === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>
      <div class="shopbar">
        <a class="filter-chip ${!params.tag ? 'on' : ''}" href="#/designs">All</a>
        ${data.tags.map(t => `<a class="filter-chip ${params.tag === t.tag ? 'on' : ''}" href="#/designs?tag=${encodeURIComponent(t.tag)}">${esc(t.tag)} <span class="muted">${t.c}</span></a>`).join('')}
      </div>
      ${data.designs.length ? `<div class="pgrid" style="padding:26px 0 62px">${data.designs.map(designCard).join('')}</div>`
        : `<div class="empty" style="margin:26px 0 62px"><h3>Nothing here</h3><p class="muted small">Try another tag or clear the search.</p><a class="btn btn-primary" href="#/designs" style="margin-top:8px">See everything</a></div>`}
    </div>`;
  }

  async function viewDesign(slug) {
    const d = await api('/api/designs/' + encodeURIComponent(slug));
    const g = d.design;
    const keys = (g.formats || []).map(f => f.key);
    const chosen = (g.defaultFormats || []).filter(k => keys.includes(k));
    const state = { formats: chosen.length ? chosen : keys.slice(0, 2) };

    setTimeout(() => {
      const box = $('#fmtBox');
      if (!box) return;
      const refresh = () => {
        $$('#fmtBox .fmt').forEach(b => b.classList.toggle('on', state.formats.includes(b.dataset.fmt)));
        const n = state.formats.length;
        $('#fmtCount').textContent = n ? `${n} format${n > 1 ? 's' : ''} · ${n} file${n > 1 ? 's' : ''} in one ZIP` : 'Pick at least one format';
        $('#buyNow').disabled = !n;
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
      $('#buyNow').onclick = () => {
        Store.cart = [{ id: g.id, slug: g.slug, name: g.name, price: g.price, preview: g.preview, formats: state.formats.slice() }];
        Store.save(); location.hash = '#/checkout';
      };
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
        $('#stickyBuy').onclick = () => {
          Store.cart = [{ id: g.id, slug: g.slug, name: g.name, price: g.price, preview: g.preview, formats: state.formats.slice() }];
          Store.save(); location.hash = '#/checkout';
        };
      }
    }, 0);

    return `<div class="wrap">
      <div class="crumbs"><a href="#/">Home</a> / <a href="#/designs">Designs</a> / ${esc(g.name)}</div>
      <div class="pdp">
        <div class="stage">${g.preview ? `<img src="${esc(g.preview)}" alt="${esc(g.name)} stitch preview">` : ''}</div>
        <div>
          <span class="eyebrow">${esc(g.hoop)} hoop · ${g.colorCount} thread colours</span>
          <h1>${esc(g.name)}</h1>
          <p class="muted" style="font-size:15px">${esc(g.summary)}</p>
          <div class="price-big"><b>${money(g.price)}</b>${g.mrp > g.price ? `<s>${money(g.mrp)}</s><span class="off">${g.discount}% off</span>` : ''}</div>
          <p class="small muted" style="margin:0">One-time payment · commercial licence · no subscription</p>

          <div class="specs">
            <div><span>Stitches</span><b>${nf(g.stitchCount)}</b></div>
            <div><span>Size</span><b>${g.widthMm} × ${g.heightMm} mm</b></div>
            <div><span>Trims</span><b>${nf(g.trims)}</b></div>
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
            <div class="fmt-links"><button id="fmtAll">Select all ${g.formats.length}</button><button id="fmtNone">Clear</button></div>
          </div>

          <div class="buybox" id="buybox">
            <button class="btn btn-primary" id="buyNow">Buy now · ${money(g.price)}</button>
            <button class="btn btn-ghost" id="addBag">+ Bag</button>
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

  async function viewCart() {
    if (!Store.cart.length) return `<div class="wrap"><div class="empty" style="margin:44px 0 70px"><h3>Your bag is empty</h3><p class="muted small">Digital designs, no shipping.</p><a class="btn btn-primary" href="#/designs" style="margin-top:8px">Browse designs</a></div></div>`;
    return `<div class="wrap">
      <div class="crumbs"><a href="#/">Home</a> / Bag</div>
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
          <div class="sum-row"><span>${Store.count} design${Store.count > 1 ? 's' : ''}</span><b>${money(Store.subtotal)}</b></div>
          <div class="sum-row"><span>Delivery</span><b style="color:var(--green)">Instant</b></div>
          <div class="sum-row"><span>Payment</span><b>UPI</b></div>
          <div class="sum-row total"><span>To pay</span><b>${money(Store.subtotal)}</b></div>
          <a class="btn btn-primary btn-block" href="#/checkout" style="margin-top:14px">Continue to UPI payment ${I.arrow}</a>
          <p class="small muted center" style="margin-top:10px">${I.lock} Scan · pay · upload screenshot</p>
        </div>
      </div></div>`;
  }

  /* -------------------------------------------------------------- checkout */
  async function viewCheckout() {
    if (!Store.cart.length) { location.hash = '#/cart'; return '<div class="wrap"></div>'; }
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
            items: Store.cart.map(l => ({ id: l.id, formats: l.formats })), name: v.name, email: v.email, phone: v.phone || ''
          } });
          location.hash = '#/pay/' + res.order.code;
        } catch (err) {
          toast(err.message, 'bad'); btn.disabled = false; btn.innerHTML = 'Continue to UPI payment';
        }
      };
    }, 0);
    return `<div class="wrap co-wrap">
      <div class="crumbs"><a href="#/cart">Bag</a> / Checkout</div>
      <div class="co-steps">
        <div class="co-step done"><i>✓</i><span>Bag</span></div><div class="co-rail fill"></div>
        <div class="co-step on"><i>2</i><span>Details</span></div><div class="co-rail"></div>
        <div class="co-step"><i>3</i><span>Pay by UPI</span></div>
      </div>
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
          <div class="sum-row" style="margin-top:10px"><span>Subtotal</span><b>${money(Store.subtotal)}</b></div>
          <div class="sum-row"><span>Delivery</span><b style="color:var(--green)">Instant</b></div>
          <div class="sum-row total"><span>To pay</span><b>${money(Store.subtotal)}</b></div>
        </aside>
      </div></div>`;
  }

  /* ------------------------------------------------------------- pay view */
  async function viewPay(code) {
    const d = await api('/api/orders/' + encodeURIComponent(code));
    setTimeout(() => mountPay(d.order), 0);
    return `<div class="wrap co-wrap"><div class="crumbs"><a href="#/">Home</a> / Order ${esc(d.order.code)}</div><div id="payRoot"></div></div>`;
  }

  function mountPay(o) {
    const root = $('#payRoot');
    if (!root) return;
    if (o.status === 'paid') { root.innerHTML = paidHTML(o); wirePaid(o); return; }
    if (o.status === 'submitted') {
      root.innerHTML = `<div class="panel" style="max-width:600px;margin:0 auto">
        <div class="ok-hero"><div class="ok-mark" style="background:#eef2f7;color:#35526e">${I.clock}</div>
          <h2>Screenshot received</h2>
          <p class="muted">Order <b class="mono">${esc(o.code)}</b> is with the studio for a quick check. Your designs unlock the moment it is approved.</p>
          <span class="status-chip submitted">Awaiting review</span></div>
        <p class="small muted center" style="margin-top:16px">Keep this page — <span class="mono">#/pay/${esc(o.code)}</span></p></div>`;
      return;
    }
    const upi = o.upi || { id: Store.settings.upi_id, payee: Store.settings.payee_name, link: '', amount: String(o.amount) };
    root.innerHTML = `<div class="co-steps">
        <div class="co-step done"><i>✓</i><span>Bag</span></div><div class="co-rail fill"></div>
        <div class="co-step done"><i>✓</i><span>Details</span></div><div class="co-rail fill"></div>
        <div class="co-step on"><i>3</i><span>Pay by UPI</span></div>
      </div>
      <div class="co-grid">
        <div class="panel">
          <h3>Pay ${money(o.amount)} by UPI</h3>
          <p class="sub">Order <b class="mono">${esc(o.code)}</b> · ${o.items.length} design${o.items.length > 1 ? 's' : ''} · amount locked to this order</p>

          <div class="qr-card">
            <div class="qr-frame">${qrSvg(upi.link, 6)}</div>
            <div class="qr-side">
              <div><div class="qr-lab">Amount to pay</div><div class="qr-amt">₹${Number(o.amount).toLocaleString('en-IN')}</div></div>
              <div><div class="qr-lab">UPI ID</div>
                <div class="upi-row"><span>${esc(upi.id)}</span><button class="copy-btn" id="copyUpi">Copy</button></div></div>
              <p class="small muted" style="margin:0">${I.zap} The QR carries the amount and the order code — nothing to type.</p>
            </div>
          </div>

          <div class="apps-head"><span>Or pay with</span><span class="line"></span></div>
          <div class="upi-apps" id="upiApps">
            ${UPI_APPS.map(a => `<button class="upi-app" data-app="${a.id}" title="Open ${esc(a.name)}">
              <span class="lg">${logo(a, 24)}</span><span class="nm">${esc(a.name)}</span></button>`).join('')}
          </div>
          <p class="pay-hint">${I.lock}<span>These open the app on your phone with the amount filled in. On a laptop, scan the QR instead — or <a class="link" href="#" id="copyHint">copy the UPI ID</a>.</span></p>

          <hr class="hairline" style="margin:24px 0">
          <h3 style="font-size:1.06rem">Then upload the payment screenshot</h3>
          <p class="sub">Confirmation is automatic — the ZIP unlocks the moment the screenshot is in.</p>

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
        </div>
        <aside class="summary">
          <h3>${o.items.length} design${o.items.length > 1 ? 's' : ''}</h3>
          ${o.items.map(it => `<div class="mini-line">
            <div class="pic">${it.preview ? `<img src="${esc(it.preview)}" alt="">` : ''}</div>
            <div><h4>${esc(it.name)}</h4><div class="meta">${(it.formats || []).map(fmtLabel).join(' · ')}</div></div>
            <b class="mono small">${money(it.price)}</b></div>`).join('')}
          <div class="sum-row" style="margin-top:10px"><span>Subtotal</span><b>${money(o.amount)}</b></div>
          <div class="sum-row"><span>Delivery</span><b style="color:var(--green)">Instant</b></div>
          <div class="sum-row total"><span>To pay</span><b>${money(o.amount)}</b></div>
        </aside>
      </div>`;
    wirePay(o, upi);
  }

  function wirePay(o, upi) {
    const copy = $('#copyUpi');
    const doCopy = async () => {
      try { await navigator.clipboard.writeText(Store.settings.upi_id); toast('UPI ID copied', 'ok'); }
      catch { toast('Copy failed — select the ID manually', 'bad'); }
    };
    if (copy) copy.onclick = doCopy;
    const hint = $('#copyHint'); if (hint) hint.onclick = e => { e.preventDefault(); doCopy(); };

    $$('#upiApps .upi-app').forEach(b => b.onclick = () => {
      const app = UPI_APPS.find(a => a.id === b.dataset.app);
      if (app) openUpiApp(app, upi);
    });

    const input = $('#proofInput');
    const zone = $('#dropZone');
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
          if (res.autoConfirmed) {
            Store.cart = []; Store.save();
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
        <p class="muted">Order <b class="mono">${esc(o.code)}</b> · ${money(o.amount)} · ${dt(o.paidAt)}<br>
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
    const pick = (formats && formats.length ? formats : (d.defaultFormats && d.defaultFormats.length ? d.defaultFormats : keys.slice(0, 2)));
    Store.cart.push({ id: d.id, slug: d.slug, name: d.name, price: d.price, preview: d.preview, formats: pick });
    Store.save(); toast(`${d.name} added`, 'ok'); openDrawer();
  }
  window.addToCart = addToCart;

  function paintBadges() {
    const dot = $('#cartDot');
    if (dot) { dot.textContent = Store.count; dot.style.display = Store.count ? 'grid' : 'none'; }
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
  function parseHash() {
    const raw = location.hash.replace(/^#\/?/, '');
    const [p, q] = raw.split('?');
    return { parts: p.split('/').filter(Boolean), params: Object.fromEntries(new URLSearchParams(q || '')) };
  }

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

  async function render() {
    const { parts, params } = parseHash();
    const app = $('#app');
    const seg = parts[0] || 'home';
    if (seg === 'admin' && window.Admin) { window.Admin.render(app, parts.slice(1)); return; }

    let view = '', active = seg;
    try {
      if (seg === 'home') view = await viewHome();
      else if (seg === 'designs') view = await viewShop(params);
      else if (seg === 'd') view = await viewDesign(parts[1]);
      else if (seg === 'cart') view = await viewCart();
      else if (seg === 'checkout') view = await viewCheckout();
      else if (seg === 'pay') view = await viewPay(parts[1]);
      else if (seg === 'order') { view = await viewOrderLookup({ ...params, code: parts[1] }); active = 'order'; }
      else view = `<div class="wrap"><div class="empty" style="margin:50px 0"><h3>Page not found</h3><a class="btn btn-primary" href="#/" style="margin-top:8px">Go home</a></div></div>`;
    } catch (e) {
      view = `<div class="wrap"><div class="empty" style="margin:50px 0"><h3>Something went wrong</h3><p class="muted small">${esc(e.message)}</p><a class="btn btn-primary" href="#/" style="margin-top:8px">Back home</a></div></div>`;
    }

    app.innerHTML = header(active) + `<main class="page">${view}</main>` + footer();
    closeDrawer();
    paintBadges();
    wireGlobal();
    reveals();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function wireGlobal() {
    const s = $('#searchform');
    if (s) s.onsubmit = e => { e.preventDefault(); const q = new FormData(s).get('q').trim(); location.hash = q ? `#/designs?q=${encodeURIComponent(q)}` : '#/designs'; };
    const oc = $('#openCart'); if (oc) oc.onclick = openDrawer;
    const bg = $('#burger');
    if (bg) bg.onclick = () => {
      const m = $('#modal');
      m.innerHTML = `<div class="modal"><header><h3>Menu</h3><button class="icon-btn" id="mClose">${I.close}</button></header>
        <div class="stack">
          <a class="btn btn-ghost btn-block" href="#/designs">All designs</a>
          ${(Store.tags || []).slice(0, 5).map(t => `<a class="btn btn-ghost btn-block" href="#/designs?tag=${encodeURIComponent(t.tag)}">${esc(t.tag)}</a>`).join('')}
          <a class="btn btn-ghost btn-block" href="#/order">Find my order</a>
        </div></div>`;
      m.classList.add('on');
      $('#mClose').onclick = () => m.classList.remove('on');
      m.querySelectorAll('a').forEach(a => a.onclick = () => m.classList.remove('on'));
    };
    const sortSel = $('#sortSel');
    if (sortSel) sortSel.onchange = () => { const { params } = parseHash(); location.hash = '#/designs?' + qs({ ...params, sort: sortSel.value }); };
    const ff = $('#findForm');
    if (ff) ff.onsubmit = e => {
      e.preventDefault();
      const code = new FormData(ff).get('code').trim().toUpperCase();
      if (!code) return toast('Enter your order code', 'bad');
      location.hash = '#/pay/' + encodeURIComponent(code);
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
      Store.cart = [{ id: d.id, slug: d.slug, name: d.name, price: d.price, preview: d.preview,
        formats: (d.defaultFormats && d.defaultFormats.length ? d.defaultFormats : (d.formats || []).map(f => f.key).slice(0, 2)) }];
      Store.save(); location.hash = '#/checkout';
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
      b.title = 'Run npm start to use the real server and database.';
      document.body.appendChild(b);
    }
    try {
      const [s, p, f] = await Promise.all([api('/api/settings'), api('/api/designs?' + qs({})), api('/api/formats')]);
      Store.settings = { ...Store.settings, ...s.settings };
      Store.designs = p.designs; Store.tags = p.tags || [];
      Store.formats = f.formats || [];
    } catch (e) { console.warn(e); }

    window.addEventListener('hashchange', render);
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

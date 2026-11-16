/* =========================================================================
   Resham & Co. — storefront app
   Hash router + hand-rolled rendering. Talks to /api, falls back to Demo.
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
  const qs = o => Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const dateFmt = s => { const d = new Date(s); return isNaN(d) ? '—' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) + ' · ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }); };

  /* ------------------------------------------------------------------ state */
  const Store = {
    settings: { store_name: 'Resham & Co.', free_shipping_threshold: 2999, shipping_fee: 99, cod_fee: 49, announcement: '' },
    categories: [], products: [], user: null, demo: false,
    cart: JSON.parse(LS.getItem('rsm_cart') || '[]'),
    wishlist: JSON.parse(LS.getItem('rsm_wish') || '[]'),
    coupon: JSON.parse(LS.getItem('rsm_coupon') || 'null'),
    save() {
      LS.setItem('rsm_cart', JSON.stringify(this.cart));
      LS.setItem('rsm_wish', JSON.stringify(this.wishlist));
      LS.setItem('rsm_coupon', JSON.stringify(this.coupon));
      paintBadges();
    },
    get count() { return this.cart.reduce((s, l) => s + l.qty, 0); },
    get subtotal() { return this.cart.reduce((s, l) => s + l.price * l.qty, 0); }
  };
  window.Store = Store;

  const tokenKey = 'rsm_token';
  const token = () => LS.getItem(tokenKey);

  /* -------------------------------------------------------------------- api */
  async function api(path, opts = {}) {
    const method = opts.method || 'GET';
    if (Store.demo) {
      await new Promise(r => setTimeout(r, 90));
      return window.Demo.handle(method, path, opts.body, opts.query);
    }
    const headers = { 'Content-Type': 'application/json' };
    if (token()) headers.Authorization = 'Bearer ' + token();
    if (opts.adminToken) headers['x-admin-token'] = opts.adminToken;
    let res;
    try {
      res = await fetch(path, { method, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    } catch (e) {
      throw new Error('Could not reach the server. Is it running?');
    }
    const data = await res.json().catch(() => ({ ok: false, error: 'Unexpected response from server.' }));
    if (!res.ok || data.ok === false) {
      const err = new Error(data.error || 'Request failed');
      err.status = res.status;
      throw err;
    }
    return data;
  }
  window.api = api;

  /* ------------------------------------------------------------------ toast */
  function toast(msg, kind = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.innerHTML = `<span>${kind === 'bad' ? '✕' : '✓'}</span><span>${esc(msg)}</span>`;
    $('#toasts').appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(8px)'; el.style.transition = '.25s'; }, 2600);
    setTimeout(() => el.remove(), 2950);
  }
  window.toast = toast;

  /* ------------------------------------------------------- embroidered art */
  function art(pattern, palette, variant = 0) {
    const p = palette && palette.length >= 3 ? palette : ['#8c2f39', '#c8a24a', '#f4e7d3'];
    const [ink, gold, cloth] = p;
    const uid = 'a' + Math.random().toString(36).slice(2, 8);
    const dash = '6 5';
    const S_ = (d, c, w = 2.4, da = dash) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-dasharray="${da}" stroke-linecap="round" stroke-linejoin="round"/>`;
    const flower = (cx, cy, r, petals, c1, c2) => {
      let s = '';
      for (let i = 0; i < petals; i++) {
        const a = (360 / petals) * i + variant * 12;
        s += `<ellipse cx="${cx}" cy="${cy - r * 0.55}" rx="${r * 0.3}" ry="${r * 0.55}" fill="${c1}" opacity=".92" transform="rotate(${a} ${cx} ${cy})"/>`;
        s += `<ellipse cx="${cx}" cy="${cy - r * 0.55}" rx="${r * 0.16}" ry="${r * 0.36}" fill="none" stroke="${c2}" stroke-width="1.1" stroke-dasharray="3 3" transform="rotate(${a} ${cx} ${cy})"/>`;
      }
      return s + `<circle cx="${cx}" cy="${cy}" r="${r * 0.17}" fill="${c2}"/>`;
    };
    const leaf = (cx, cy, r, rot, c) => `<g transform="rotate(${rot} ${cx} ${cy})"><path d="M${cx} ${cy - r} Q${cx + r * 0.55} ${cy} ${cx} ${cy + r} Q${cx - r * 0.55} ${cy} ${cx} ${cy - r}Z" fill="${c}" opacity=".9"/>${S_(`M${cx} ${cy - r + 3} L${cx} ${cy + r - 3}`, 'rgba(255,255,255,.55)', 1, '4 4')}</g>`;

    let inner = '';
    if (pattern === 'mandala') {
      inner += `<circle cx="200" cy="250" r="150" fill="none" stroke="${ink}" stroke-width="1.4" stroke-dasharray="4 6" opacity=".5"/>`;
      for (let i = 0; i < 12; i++) inner += flower(200 + Math.cos(i * Math.PI / 6) * 105, 250 + Math.sin(i * Math.PI / 6) * 105, 26, 5, ink, gold);
      inner += flower(200, 250, 62, 8, gold, ink);
      inner += `<circle cx="200" cy="250" r="88" fill="none" stroke="${gold}" stroke-width="2" stroke-dasharray="${dash}"/>`;
      inner += `<circle cx="200" cy="250" r="140" fill="none" stroke="${ink}" stroke-width="1.6" stroke-dasharray="${dash}" opacity=".7"/>`;
    } else if (pattern === 'paisley') {
      const boteh = (x, y, s, rot) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">
        <path d="M0 60 C-46 34 -46 -34 0 -58 C46 -34 40 22 12 40 C-6 50 -18 34 -12 20" fill="none" stroke="${ink}" stroke-width="2.6" stroke-dasharray="5 4" stroke-linecap="round"/>
        <path d="M0 44 C-30 24 -30 -24 0 -42 C30 -24 26 14 8 28" fill="${gold}" opacity=".35"/>
        ${S_('M-4 8 q14 -12 24 -2', ink, 1.6, '3 3')}</g>`;
      for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++)
        inner += boteh(120 + c * 160 + (r % 2 ? 40 : 0), 120 + r * 135, 0.9 + (variant * 0.05), (r + c) % 2 ? 12 : -12);
    } else if (pattern === 'geometric') {
      for (let y = 0; y < 6; y++) for (let x = 0; x < 5; x++) {
        const cx = 40 + x * 82, cy = 50 + y * 82;
        inner += `<path d="M${cx} ${cy - 34} L${cx + 34} ${cy} L${cx} ${cy + 34} L${cx - 34} ${cy}Z" fill="none" stroke="${x % 2 === y % 2 ? ink : gold}" stroke-width="2" stroke-dasharray="5 4"/>`;
        inner += `<circle cx="${cx}" cy="${cy}" r="7" fill="${gold}" opacity=".8"/><circle cx="${cx}" cy="${cy}" r="3" fill="${cloth}"/>`;
      }
      inner += `<rect x="14" y="14" width="372" height="472" fill="none" stroke="${ink}" stroke-width="2" stroke-dasharray="8 6" opacity=".55"/>`;
    } else if (pattern === 'hoop') {
      inner += `<circle cx="200" cy="250" r="165" fill="${cloth}" stroke="${gold}" stroke-width="9"/>`;
      inner += `<circle cx="200" cy="250" r="152" fill="none" stroke="${ink}" stroke-width="1.4" stroke-dasharray="3 5" opacity=".55"/>`;
      inner += `<path d="M200 355 L200 190" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>`;
      inner += leaf(200, 240, 62, 0, ink) + leaf(200, 300, 52, 0, ink);
      for (let i = 0; i < 5; i++) {
        const y = 200 + i * 24;
        inner += `<path d="M200 ${y} L${168 - i * 3} ${y + 16}" stroke="${gold}" stroke-width="1.8" stroke-dasharray="4 4"/><path d="M200 ${y} L${232 + i * 3} ${y + 16}" stroke="${gold}" stroke-width="1.8" stroke-dasharray="4 4"/>`;
      }
      inner += flower(200, 172, 34, 6, gold, ink);
      inner += `<rect x="184" y="70" width="32" height="18" rx="5" fill="${gold}" opacity=".85"/>`;
    } else if (pattern === 'peacock') {
      const bird = (x, y, flip) => `<g transform="translate(${x} ${y}) scale(${flip ? -1 : 1} 1)">
        <path d="M0 0 C40 -30 96 -18 116 26 C96 44 44 50 8 30 C-10 20 -12 6 0 0Z" fill="${ink}" opacity=".92"/>
        <path d="M6 6 C46 -14 90 -6 108 24" fill="none" stroke="${gold}" stroke-width="2.4" stroke-dasharray="5 4"/>
        <circle cx="112" cy="22" r="5" fill="${cloth}"/><circle cx="112" cy="22" r="2" fill="${gold}"/>
        <path d="M14 -4 C2 -26 -14 -30 -26 -18" fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>
        <circle cx="-27" cy="-18" r="4.5" fill="${gold}"/>
        ${[0, 1, 2, 3].map(i => `<path d="M${20 + i * 20} ${34} q10 16 0 30" fill="none" stroke="${gold}" stroke-width="2" stroke-dasharray="4 4"/>`).join('')}
      </g>`;
      inner += bird(40, 170, false) + bird(360, 320, true);
      inner += flower(200, 250, 44, 6, gold, ink);
      inner += `<circle cx="200" cy="250" r="120" fill="none" stroke="${ink}" stroke-width="1.6" stroke-dasharray="4 6" opacity=".5"/>`;
    } else if (pattern === 'kantha') {
      for (let i = 0; i < 26; i++) {
        const y = 20 + i * 18;
        inner += `<path d="M0 ${y} Q100 ${y - 6 + (i % 3) * 4} 200 ${y} T400 ${y}" fill="none" stroke="${i % 4 === 0 ? ink : gold}" stroke-width="${i % 4 === 0 ? 2.2 : 1.4}" stroke-dasharray="${i % 4 === 0 ? '7 5' : '5 6'}" opacity="${i % 4 === 0 ? .85 : .5}"/>`;
      }
      inner += `<rect x="18" y="18" width="364" height="464" fill="none" stroke="${ink}" stroke-width="2.6" stroke-dasharray="9 6"/>`;
      inner += flower(200, 250, 60, 8, ink, cloth);
    } else if (pattern === 'zari') {
      for (let i = 0; i < 22; i++) {
        const x = 12 + i * 18;
        inner += `<path d="M${x} 0 V500" stroke="${i % 3 === 0 ? gold : ink}" stroke-width="${i % 3 === 0 ? 2 : 1}" stroke-dasharray="${i % 3 === 0 ? '6 5' : '4 7'}" opacity="${i % 3 === 0 ? .8 : .4}"/>`;
      }
      inner += `<path d="M0 400 L100 300 L200 400 L300 300 L400 400" fill="none" stroke="${gold}" stroke-width="3" stroke-dasharray="8 5"/>`;
      inner += `<path d="M0 430 L100 330 L200 430 L300 330 L400 430" fill="none" stroke="${gold}" stroke-width="1.6" stroke-dasharray="5 5" opacity=".7"/>`;
      for (let i = 0; i < 40; i++) inner += `<circle cx="${20 + (i * 37) % 380}" cy="${40 + (i * 91) % 420}" r="${2 + (i % 3)}" fill="${cloth}" opacity=".85"/><circle cx="${20 + (i * 37) % 380}" cy="${40 + (i * 91) % 420}" r="1" fill="${gold}"/>`;
      inner += flower(200, 200, 52, 6, gold, ink);
    } else { /* floral */
      inner += `<path d="M60 480 C120 380 90 320 150 250 C200 190 170 130 230 70" fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round" stroke-dasharray="7 5"/>`;
      const spots = [[95, 400], [140, 330], [175, 250], [215, 170], [265, 110]];
      spots.forEach(([x, y], i) => {
        inner += leaf(x, y, 34, i % 2 ? 42 : -42, ink);
        inner += flower(x + (i % 2 ? 46 : -46), y - 10, 26 + (i % 3) * 5, 5, i % 2 ? gold : ink, i % 2 ? ink : gold);
      });
      inner += `<rect x="16" y="16" width="368" height="468" fill="none" stroke="${gold}" stroke-width="2" stroke-dasharray="7 6" opacity=".65"/>`;
    }

    return `<svg viewBox="0 0 400 500" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" role="img">
      <defs>
        <pattern id="${uid}w" width="6" height="6" patternUnits="userSpaceOnUse">
          <path d="M0 0H6M0 3H6" stroke="rgba(0,0,0,.045)" stroke-width=".8"/>
          <path d="M0 0V6M3 0V6" stroke="rgba(0,0,0,.03)" stroke-width=".8"/>
        </pattern>
        <radialGradient id="${uid}g" cx="48%" cy="38%" r="72%">
          <stop offset="0" stop-color="#ffffff" stop-opacity=".5"/>
          <stop offset=".65" stop-color="#ffffff" stop-opacity=".05"/>
          <stop offset="1" stop-color="#241c17" stop-opacity=".14"/>
        </radialGradient>
      </defs>
      <rect width="400" height="500" fill="${cloth}"/>
      <rect width="400" height="500" fill="url(#${uid}w)"/>
      ${inner}
      <rect width="400" height="500" fill="url(#${uid}g)"/>
    </svg>`;
  }
  window.art = art;

  /* ------------------------------------------------------------- components */
  const LOGO = `<svg class="mark" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="20" cy="20" r="17" fill="none" stroke="#8c2f39" stroke-width="2.2" stroke-dasharray="5 4"/>
      <circle cx="20" cy="20" r="10" fill="none" stroke="#b8873b" stroke-width="1.6" stroke-dasharray="3 3"/>
      <circle cx="20" cy="20" r="3.2" fill="#8c2f39"/>
      <path d="M20 3v5M20 32v5M3 20h5M32 20h5" stroke="#8c2f39" stroke-width="2" stroke-linecap="round"/>
    </svg>`;

  const ICON = {
    search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    cart: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 7h12l-1.4 12.1a2 2 0 0 1-2 1.9H9.4a2 2 0 0 1-2-1.9L6 7Z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>',
    user: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5S20 17 20 21"/></svg>',
    heart: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 20s-7-4.4-7-9.4A4.1 4.1 0 0 1 12 7.6 4.1 4.1 0 0 1 19 10.6C19 15.6 12 20 12 20Z"/></svg>',
    star: '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="m12 2 2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8Z"/></svg>',
    burger: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>',
    close: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 5l14 14M19 5L5 19"/></svg>',
    truck: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M2 7h11v9H2zM13 10h5l3 3v3h-8z"/><circle cx="6" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/></svg>',
    needle: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 20 20 4M14 4h6v6"/></svg>',
    shield: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6Z"/></svg>'
  };

  const CAT_ICON = {
    drape: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 3h14l-2 18H7L5 3Z"/><path d="M5 8h14M9 3v18M15 3v18"/></svg>',
    shirt: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M8 3 4 6l2 4 2-1v12h8V9l2 1 2-4-4-3-2 2h-4L8 3Z"/></svg>',
    scarf: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 8c3-3 6 3 9 0s6 3 9 0"/><path d="M3 13c3-3 6 3 9 0s6 3 9 0"/><path d="M3 18c3-3 6 3 9 0s6 3 9 0"/></svg>',
    crown: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 8l4 4 5-7 5 7 4-4v11H3V8Z"/></svg>',
    hoop: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/></svg>',
    home: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 11 12 4l8 7v9H4v-9Z"/><path d="M9 20v-6h6v6"/></svg>',
    bag: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 8h14l-1.5 13h-11L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
    star: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="m12 3 2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 18.3 5.9 21.6l1.4-6.8L2.2 10.1l6.9-.8L12 3Z"/></svg>',
    needle: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 20 20 4"/><path d="M14 4h6v6"/><circle cx="7" cy="17" r="1.4"/></svg>'
  };

  const stars = (rating, count) => `<span class="stars">${ICON.star}<b style="color:var(--ink);font-weight:600">${Number(rating || 0).toFixed(1)}</b>${count ? `<span class="muted">(${count})</span>` : ''}</span>`;

  function productCard(p) {
    const wished = Store.wishlist.includes(p.id);
    return `<article class="pcard" data-slug="${esc(p.slug)}">
      <a class="thumb" href="#/product/${esc(p.slug)}" aria-label="${esc(p.name)}">
        ${art(p.pattern, p.palette)}
        ${p.badge ? `<span class="pill ${p.badge === 'New' ? 'sage' : 'gold'}">${esc(p.badge)}</span>` : (p.discount > 0 ? `<span class="pill">${p.discount}% off</span>` : '')}
        ${p.lowStock ? `<span class="pill maroon" style="top:auto;bottom:10px;left:10px">Only ${p.stock} left</span>` : ''}
      </a>
      <button class="heart ${wished ? 'on' : ''}" data-wish="${p.id}" aria-label="Save to wishlist">${ICON.heart}</button>
      <div class="body">
        <span class="cat-line">${esc(p.categoryName || '')}</span>
        <a href="#/product/${esc(p.slug)}"><h3>${esc(p.name)}</h3></a>
        ${stars(p.rating, p.ratingCount)}
        <div class="price"><b>${money(p.price)}</b>${p.mrp > p.price ? `<s>${money(p.mrp)}</s><span class="off">${p.discount}% off</span>` : ''}</div>
        <div class="buyrow">
          <button class="btn btn-primary btn-sm btn-block" data-add="${p.id}">Add to bag</button>
        </div>
      </div>
    </article>`;
  }

  function header(active) {
    const a = k => (active === k ? 'on' : '');
    return `<div class="announce">${esc(Store.settings.announcement || 'Hand-stitched in India · Free shipping above ₹2,999')}</div>
    <header class="hdr">
      <div class="wrap hdr-in">
        <button class="icon-btn burger" id="burger" aria-label="Menu">${ICON.burger}</button>
        <a class="logo" href="#/">${LOGO}<span>${esc(Store.settings.store_name || 'Resham & Co.')}<small>Hand embroidery</small></span></a>
        <nav class="nav">
          <a href="#/shop" class="${a('shop')}">Shop all</a>
          <a href="#/shop?cat=hoop-art" class="${a('hoop')}">Hoop art</a>
          <a href="#/shop?cat=home" class="${a('home')}">Home</a>
          <a href="#/shop?cat=kits" class="${a('kits')}">DIY kits</a>
          <a href="#/orders" class="${a('track')}">Track order</a>
        </nav>
        <form class="searchbar" id="searchform" role="search">
          <span style="position:absolute;left:13px;top:50%;transform:translateY(-50%);color:var(--ink-mute)">${ICON.search}</span>
          <input name="q" placeholder="Search sarees, hoop art, kits…" autocomplete="off">
        </form>
        <div class="hdr-tools">
          <a class="icon-btn" href="#/account" aria-label="Account">${ICON.user}</a>
          <button class="icon-btn" id="openCart" aria-label="Bag">${ICON.cart}<span class="dot" id="cartDot">${Store.count}</span></button>
        </div>
      </div>
    </header>`;
  }

  function footer() {
    return `<footer class="foot">
      <div class="wrap">
        <div class="foot-grid">
          <div>
            <a class="logo" href="#/">${LOGO}<span>${esc(Store.settings.store_name)}<small>Hand embroidery</small></span></a>
            <p class="small" style="margin-top:14px;max-width:34ch;color:#c8bba9">${esc(Store.settings.tagline || 'Hand-embroidered heirlooms, stitched slowly.')} Every piece is made in small batches by karigars in Bhuj, Lucknow, Srinagar and Kolkata.</p>
            <div class="news">
              <input placeholder="Email for studio notes" aria-label="Email">
              <button class="btn btn-primary btn-sm" onclick="toast('You are on the list — first note arrives Friday.','ok')">Join</button>
            </div>
          </div>
          <div><h4>Shop</h4><ul>
            <li><a href="#/shop?cat=sarees">Sarees</a></li><li><a href="#/shop?cat=kurtis">Kurtis</a></li>
            <li><a href="#/shop?cat=dupattas">Dupattas</a></li><li><a href="#/shop?cat=hoop-art">Hoop art</a></li>
            <li><a href="#/shop?cat=home">Home</a></li><li><a href="#/shop?cat=kits">DIY kits</a></li></ul></div>
          <div><h4>Help</h4><ul>
            <li><a href="#/orders">Track your order</a></li><li><a href="#/account">Sign in / Register</a></li>
            <li><a href="#/shop">Shipping &amp; returns</a></li><li><a href="#/shop">Care guide</a></li>
            <li><a href="#/admin">Store admin</a></li></ul></div>
          <div><h4>Studio</h4><ul>
            <li>${esc(Store.settings.support_email || 'care@resham.co')}</li>
            <li>${esc(Store.settings.support_phone || '+91 98450 11223')}</li>
            <li>Mon–Sat · 10am–6pm IST</li>
            <li>14 Lodhi Colony, New Delhi</li></ul></div>
        </div>
        <div class="foot-bot">
          <span>© ${new Date().getFullYear()} ${esc(Store.settings.store_name)}. All rights reserved.</span>
          <span>Made with thread, needle and a lot of patience.</span>
        </div>
      </div>
    </footer>`;
  }

  /* ------------------------------------------------------------------ views */
  async function viewHome() {
    const [feat, all] = await Promise.all([
      api('/api/products?' + qs({ featured: '1', limit: 4 })),
      api('/api/products?' + qs({ limit: 8, sort: 'rating' }))
    ]);
    const cats = Store.categories;
    return `<div class="hero"><div class="wrap hero-in">
        <div>
          <span class="eyebrow">Est. 2014 · Bhuj · Lucknow · Srinagar</span>
          <h1>Heirlooms, <em>stitched</em> one thread at a time.</h1>
          <p class="lede">Hand embroidery from four Indian craft clusters — chikankari, phulkari, aari and zardozi — made in small batches, never on a machine.</p>
          <div class="hero-cta">
            <a class="btn btn-primary" href="#/shop">Shop the collection</a>
            <a class="btn btn-ghost" href="#/shop?cat=hoop-art">Hoop art under ₹2,000</a>
          </div>
          <div class="hero-stats">
            <div><b>42 hrs</b><span>Average per saree</span></div>
            <div><b>118</b><span>In-house karigars</span></div>
            <div><b>4.8 ★</b><span>From 1,240 reviews</span></div>
            <div><b>7-day</b><span>Easy returns</span></div>
          </div>
        </div>
        <div class="hero-art">
          <div class="frame">${art('mandala', ['#8c2f39', '#c8a24a', '#f7ecdc'])}</div>
          <div class="tag t1">${ICON.needle}<div>Hand-stitched<small>no machine work</small></div></div>
          <div class="tag t2">${ICON.truck}<div>Free delivery<small>above ₹2,999</small></div></div>
        </div>
      </div></div>

      <div class="marq"><div class="marq-in">
        ${['Chikankari · Lucknow', 'Phulkari · Punjab', 'Aari · Srinagar', 'Zardozi · Bhopal', 'Kantha · Shantiniketan', 'Bandhani · Kutch',
      'Chikankari · Lucknow', 'Phulkari · Punjab', 'Aari · Srinagar', 'Zardozi · Bhopal', 'Kantha · Shantiniketan', 'Bandhani · Kutch']
        .map(t => `<span>${t}</span>`).join('')}
      </div></div>

      <section class="section tight"><div class="wrap">
        <div class="cats">
          ${cats.slice(0, 6).map(c => `<a class="cat" href="#/shop?cat=${esc(c.slug)}">
            <div class="ic">${CAT_ICON[c.icon] || CAT_ICON.hoop}</div><b>${esc(c.name)}</b><span>${c.count} ${c.count === 1 ? 'piece' : 'pieces'}</span></a>`).join('')}
        </div>
      </div></section>

      <section class="section"><div class="wrap">
        <div class="sec-head">
          <div><span class="eyebrow">The studio shelf</span><h2>Pieces we are proud of</h2>
            <p>Small-batch work, each one signed off by the karigar who stitched it.</p></div>
          <a class="btn btn-ghost btn-sm" href="#/shop">View all ${all.total || ''} pieces →</a>
        </div>
        <div class="pgrid">${feat.products.map(productCard).join('')}</div>
      </div></section>

      <section class="section tight" style="background:var(--cream-2);border-top:1px solid var(--line);border-bottom:1px solid var(--line)">
        <div class="wrap">
          <div class="sec-head"><div><span class="eyebrow">Why Resham</span><h2>Slow cloth, fair work</h2></div></div>
          <div class="grid-3">
            <div class="card"><div class="ic" style="color:var(--maroon)">${ICON.needle}</div><h3 style="margin:8px 0 6px">Stitched, not printed</h3><p class="small muted">Every motif is drawn on cloth and worked by hand. No digital prints, no machine embroidery, no shortcuts.</p></div>
            <div class="card"><div class="ic" style="color:var(--maroon)">${ICON.shield}</div><h3 style="margin:8px 0 6px">Karigars on our rolls</h3><p class="small muted">118 artisans are paid monthly, not per piece, so a slow stitch never means a thin wage.</p></div>
            <div class="card"><div class="ic" style="color:var(--maroon)">${ICON.truck}</div><h3 style="margin:8px 0 6px">Wrapped in muslin</h3><p class="small muted">Each order ships in a reusable muslin pouch with a card naming the maker and the hours spent.</p></div>
          </div>
        </div>
      </section>

      <section class="section"><div class="wrap">
        <div class="sec-head"><div><span class="eyebrow">Highest rated</span><h2>Loved by our customers</h2></div></div>
        <div class="pgrid">${all.products.slice(0, 4).map(productCard).join('')}</div>
      </div></section>

      <section class="section tight"><div class="wrap">
        <div class="sec-head"><div><span class="eyebrow">From the guest book</span><h2>What people say</h2></div></div>
        <div class="rgrid">
          ${[['Ananya R.', 'Meera saree', 'The pallu work is finer than anything I have bought in a store. It arrived in muslin with a note from the karigar.'],
        ['Ritika S.', 'Chikankari kurti', 'Genuinely breathable mulmul, and the jaali work does not itch at all. Bought a second one in white.'],
        ['Kavya N.', 'Monstera hoop', 'Smaller than I expected but better for it. The fishbone stitch on the leaf is really neat.']]
        .map(([n, p, t]) => `<div class="review"><div class="stars">${ICON.star.repeat(5)}</div><h4>${esc(p)}</h4><p>“${esc(t)}”</p><div class="who">${esc(n)} · Verified buyer</div></div>`).join('')}
        </div>
      </div></section>`;
  }

  async function viewShop(params) {
    const q = { category: params.cat || 'all', q: params.q || '', sort: params.sort || 'featured', limit: 48 };
    const data = await api('/api/products?' + qs(q));
    const cats = Store.categories;
    return `<div class="wrap">
      <div class="crumbs"><a href="#/">Home</a> / Shop ${params.cat ? '/ ' + esc(cats.find(c => c.slug === params.cat)?.name || '') : ''}</div>
      <div class="sec-head" style="margin-top:18px">
        <div><h1 style="font-size:clamp(1.7rem,3vw,2.4rem)">${params.q ? 'Search: “' + esc(params.q) + '”' : (cats.find(c => c.slug === params.cat)?.name || 'All pieces')}</h1>
          <p>${data.total} hand-stitched ${data.total === 1 ? 'piece' : 'pieces'}${params.q ? '' : ' · ready to ship'}</p></div>
        <div class="row">
          <select class="select" id="sortSel" style="width:auto">
            ${[['featured', 'Featured'], ['newest', 'Newest'], ['price_asc', 'Price: low to high'], ['price_desc', 'Price: high to low'], ['rating', 'Top rated'], ['name', 'A–Z']]
        .map(([v, l]) => `<option value="${v}" ${q.sort === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="shopbar">
        <a class="filter-chip ${!params.cat ? 'on' : ''}" href="#/shop">All</a>
        ${cats.map(c => `<a class="filter-chip ${params.cat === c.slug ? 'on' : ''}" href="#/shop?cat=${esc(c.slug)}">${esc(c.name)} <span class="muted">${c.count}</span></a>`).join('')}
      </div>
      ${data.products.length ? `<div class="pgrid" style="padding:26px 0 60px">${data.products.map(productCard).join('')}</div>`
        : `<div class="empty" style="margin:26px 0 60px"><h3>Nothing here yet</h3><p class="muted">Try another category, or clear the search.</p><a class="btn btn-primary" href="#/shop">Browse everything</a></div>`}
    </div>`;
  }

  async function viewProduct(slug) {
    const d = await api('/api/products/' + encodeURIComponent(slug));
    const p = d.product;
    const wished = Store.wishlist.includes(p.id);
    const st = { size: p.sizes[0] || 'One Size', color: p.colors[0] || 'Natural', qty: 1 };
    const body = `<div class="wrap">
      <div class="crumbs"><a href="#/">Home</a> / <a href="#/shop?cat=${esc(p.category)}">${esc(p.categoryName)}</a> / ${esc(p.name)}</div>
      <div class="pdp">
        <div class="gallery">
          <div class="stage" id="stage">${art(p.pattern, p.palette, 0)}</div>
          <div class="thumbs">
            ${[0, 1, 2].map(i => `<button class="${i === 0 ? 'on' : ''}" data-thumb="${i}">${art(p.pattern, p.palette, i)}</button>`).join('')}
          </div>
        </div>
        <div>
          <span class="eyebrow">${esc(p.categoryName)}${p.badge ? ' · ' + esc(p.badge) : ''}</span>
          <h1 style="margin:8px 0 10px">${esc(p.name)}</h1>
          <div class="row" style="gap:14px">${stars(p.rating, p.ratingCount)}<span class="muted small">${p.ratingCount} reviews</span>
            ${p.stock > 0 ? `<span class="tag ${p.stock <= 5 ? 'pending' : 'approved'}">${p.stock <= 5 ? 'Only ' + p.stock + ' left' : 'In stock'}</span>` : `<span class="tag cancelled">Sold out</span>`}</div>
          <div class="price-big"><b>${money(p.price)}</b>${p.mrp > p.price ? `<s>${money(p.mrp)}</s><span class="off">Save ${money(p.mrp - p.price)}</span>` : ''}</div>
          <p class="muted small">Inclusive of all taxes · ${esc(p.fabric || '')}</p>
          <div class="opts">
            ${p.sizes.length ? `<div class="opt-row"><span class="lab">Size</span><div class="chips" id="sizes">${p.sizes.map((s, i) => `<button class="chip ${i === 0 ? 'on' : ''}" data-size="${esc(s)}">${esc(s)}</button>`).join('')}</div></div>` : ''}
            ${p.colors.length ? `<div class="opt-row"><span class="lab">Colour</span><div class="chips" id="colors">${p.colors.map((c, i) => `<button class="chip ${i === 0 ? 'on' : ''}" data-color="${esc(c)}">${esc(c)}</button>`).join('')}</div></div>` : ''}
            <div class="opt-row"><span class="lab">Quantity</span>
              <div class="qty"><button data-q="-1">−</button><span id="qtyVal">1</span><button data-q="1">+</button></div>
            </div>
          </div>
          <div class="buybar">
            <button class="btn btn-primary" id="addBtn" ${p.stock ? '' : 'disabled'}>Add to bag · ${money(p.price)}</button>
            <button class="btn btn-dark" id="buyBtn" ${p.stock ? '' : 'disabled'}>Buy now</button>
            <button class="btn btn-ghost" id="wishBtn">${ICON.heart} <span>${wished ? 'Saved' : 'Save'}</span></button>
          </div>
          <div class="trust">
            <div>${ICON.truck}<b>Free shipping</b>on orders above ₹${Number(Store.settings.free_shipping_threshold || 2999).toLocaleString('en-IN')}</div>
            <div>${ICON.shield}<b>7-day returns</b>unworn, with tags</div>
            <div>${ICON.needle}<b>Made by hand</b>${esc(p.fabric || 'Hand embroidered')}</div>
          </div>
          <div class="accordion">
            <details open><summary>Description</summary><p>${esc(p.description)}</p></details>
            <details><summary>Fabric &amp; care</summary><p>${esc(p.fabric || 'Handloom cotton')}. Dry clean only. Store folded in the muslin pouch provided, away from direct sun. Iron on the reverse with a thin cloth.</p></details>
            <details><summary>Shipping</summary><p>Dispatched in 2 working days. Delivery in 3–6 days across India, 7–12 days international. Tracking is emailed as soon as the parcel leaves the studio.</p></details>
            <details><summary>Returns</summary><p>7 days from delivery on unworn pieces with tags intact. Made-to-order and bridal pieces are final sale. Raise a return from your account or write to ${esc(Store.settings.support_email || 'care@resham.co')}.</p></details>
          </div>
        </div>
      </div>

      <section class="section">
        <div class="sec-head"><div><span class="eyebrow">Guest book</span><h2>Reviews (${d.reviews.length})</h2></div>
          <button class="btn btn-ghost btn-sm" id="writeReview">Write a review</button></div>
        ${d.reviews.length ? `<div class="rgrid">${d.reviews.map(r => `<div class="review">
            <div class="stars">${ICON.star.repeat(r.rating)}<span style="color:var(--line)">${ICON.star.repeat(5 - r.rating)}</span></div>
            <h4 style="margin-top:6px">${esc(r.title || 'Review')}</h4><p>“${esc(r.body)}”</p>
            <div class="who">${esc(r.name)} · ${dateFmt(r.created_at)}</div></div>`).join('')}</div>`
        : `<div class="empty"><h3>No reviews yet</h3><p class="muted">Be the first to write one — it appears after a quick check.</p></div>`}
      </section>

      ${d.related.length ? `<section class="section tight"><div class="sec-head"><div><h2>You may also like</h2></div></div>
        <div class="pgrid">${d.related.map(productCard).join('')}</div></section>` : ''}
    </div>`;

    // wire interactions after paint
    setTimeout(() => {
      const stage = $('#stage');
      $$('[data-thumb]').forEach(b => b.onclick = () => {
        $$('[data-thumb]').forEach(x => x.classList.remove('on')); b.classList.add('on');
        stage.innerHTML = art(p.pattern, p.palette, Number(b.dataset.thumb));
      });
      $$('#sizes .chip').forEach(b => b.onclick = () => { $$('#sizes .chip').forEach(x => x.classList.remove('on')); b.classList.add('on'); st.size = b.dataset.size; });
      $$('#colors .chip').forEach(b => b.onclick = () => { $$('#colors .chip').forEach(x => x.classList.remove('on')); b.classList.add('on'); st.color = b.dataset.color; });
      $$('[data-q]').forEach(b => b.onclick = () => {
        st.qty = Math.max(1, Math.min(p.stock || 1, st.qty + Number(b.dataset.q)));
        $('#qtyVal').textContent = st.qty;
      });
      const add = () => { addToCart(p, st.qty, st.size, st.color); };
      $('#addBtn').onclick = add;
      $('#buyBtn').onclick = () => { add(); location.hash = '#/checkout'; };
      $('#wishBtn').onclick = () => { toggleWish(p.id); $('#wishBtn').innerHTML = `${ICON.heart} <span>${Store.wishlist.includes(p.id) ? 'Saved' : 'Save'}</span>`; };
      $('#writeReview').onclick = () => reviewModal(p);
    }, 0);
    return body;
  }

  function cartTotals(discount = 0) {
    const sub = Store.subtotal;
    const threshold = Number(Store.settings.free_shipping_threshold || 2999);
    const shipping = Store.cart.length === 0 || sub - discount >= threshold ? 0 : Number(Store.settings.shipping_fee || 99);
    return { sub, discount, shipping, total: Math.max(0, sub - discount + shipping), threshold };
  }

  async function viewCart() {
    if (!Store.cart.length) {
      return `<div class="wrap"><div class="empty" style="margin:50px 0 80px">
        <h3>Your bag is empty</h3><p class="muted">Nothing stitched into it yet.</p>
        <a class="btn btn-primary" href="#/shop" style="margin-top:10px">Start with the collection</a></div></div>`;
    }
    let coupon = Store.coupon;
    let discount = 0;
    if (coupon) {
      try { const r = await api('/api/coupons/validate', { method: 'POST', body: { code: coupon.code, subtotal: Store.subtotal } }); discount = r.discount; }
      catch (e) { coupon = null; Store.coupon = null; Store.save(); }
    }
    const t = cartTotals(discount);
    return `<div class="wrap">
      <div class="crumbs"><a href="#/">Home</a> / Bag</div>
      <div class="cart-grid">
        <div>
          <h1 style="font-size:1.9rem;margin:10px 0 4px">Your bag (${Store.count})</h1>
          <p class="muted small">Reserved for 60 minutes. Hand-stitched pieces are one or two of a kind.</p>
          <div id="lines">${Store.cart.map(lineRow).join('')}</div>
          <a class="btn btn-ghost btn-sm" href="#/shop" style="margin-top:18px">← Continue shopping</a>
        </div>
        <div class="summary">
          <h3>Order summary</h3>
          <div class="coupon-row">
            <input class="input" id="couponInput" placeholder="Coupon code" value="${coupon ? esc(coupon.code) : ''}">
            <button class="btn btn-ghost btn-sm" id="applyCoupon">${coupon ? 'Remove' : 'Apply'}</button>
          </div>
          ${coupon ? `<p class="small" style="color:var(--ok)">${esc(coupon.code)} applied — you saved ${money(discount)}</p>` : `<p class="small muted">Try WELCOME10 on your first order.</p>`}
          <div class="sum-row"><span>Subtotal</span><b>${money(t.sub)}</b></div>
          ${t.discount ? `<div class="sum-row" style="color:var(--ok)"><span>Coupon discount</span><b>− ${money(t.discount)}</b></div>` : ''}
          <div class="sum-row"><span>Shipping</span><b>${t.shipping ? money(t.shipping) : 'Free'}</b></div>
          ${t.sub - t.discount < t.threshold ? `<p class="small muted">Add ${money(t.threshold - (t.sub - t.discount))} more for free shipping.</p>` : ''}
          <div class="sum-row total"><span>Total</span><span>${money(t.total)}</span></div>
          <a class="btn btn-primary btn-block" href="#/checkout" style="margin-top:14px">Proceed to checkout</a>
          <p class="small muted center" style="margin-top:10px">Secure checkout · UPI, cards, netbanking &amp; COD</p>
        </div>
      </div></div>`;
  }

  function lineRow(l) {
    return `<div class="cart-line" data-line="${l.id}|${esc(l.size)}|${esc(l.color)}">
      <a class="pic" href="#/product/${esc(l.slug)}">${art(l.pattern, l.palette)}</a>
      <div>
        <a href="#/product/${esc(l.slug)}"><h4>${esc(l.name)}</h4></a>
        <div class="meta">${esc(l.color)} · ${esc(l.size)}</div>
        <div class="row" style="margin-top:8px">
          <div class="qty"><button data-step="-1">−</button><span>${l.qty}</span><button data-step="1">+</button></div>
          <button class="btn btn-xs btn-ghost" data-remove>Remove</button>
        </div>
      </div>
      <div style="text-align:right"><b>${money(l.price * l.qty)}</b>
        ${l.mrp > l.price ? `<div class="small muted"><s>${money(l.mrp * l.qty)}</s></div>` : ''}</div>
    </div>`;
  }

  /* ------------------------------------------------------ payment studio */
  const CO = { step: 1, method: 'upi', bank: '', upiApp: 'gpay', upi: '', card: { number: '', name: '', exp: '', cvv: '' }, addr: null };
  const fmtCard = v => v.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
  const fmtExp = v => { const d = v.replace(/\D/g, '').slice(0, 4); return d.length > 2 ? d.slice(0, 2) + '/' + d.slice(2) : d; };
  const cardBrand = n => {
    n = String(n).replace(/\s/g, '');
    if (/^4/.test(n)) return 'VISA';
    if (/^5[1-5]/.test(n) || /^2[2-7]/.test(n)) return 'MASTERCARD';
    if (/^6/.test(n)) return 'RUPAY';
    if (/^3[47]/.test(n)) return 'AMEX';
    return 'CARD';
  };
  const PAY_IC = {
    upi: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M7 4 17 12 7 20"/><path d="M3 8l6 4-6 4"/></svg>',
    card: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19"/></svg>',
    netbanking: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 10 12 4l9 6"/><path d="M5 10v9h14v-9"/><path d="M9 19v-5h6v5"/></svg>',
    cod: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/></svg>',
    lock: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>'
  };
  const METHODS = [
    { id: 'upi', name: 'UPI', desc: 'GPay · PhonePe · Paytm' },
    { id: 'card', name: 'Card', desc: 'Visa · Mastercard · RuPay' },
    { id: 'netbanking', name: 'Net banking', desc: 'All major Indian banks' },
    { id: 'cod', name: 'Cash on delivery', desc: 'Pay the courier at the door' }
  ];
  const UPI_APPS = [['gpay', 'GPay', 'G'], ['phonepe', 'PhonePe', 'P'], ['paytm', 'Paytm', 'T'], ['bhim', 'BHIM', 'B']];
  const BANKS = ['HDFC Bank', 'ICICI Bank', 'State Bank of India', 'Axis Bank', 'Kotak Mahindra', 'Yes Bank'];

  function coTotals(discount) {
    const t = cartTotals(discount || 0);
    const cod = CO.method === 'cod' ? Number(Store.settings.cod_fee || 49) : 0;
    return { ...t, cod, due: t.total + cod };
  }

  function receiptHTML(t) {
    return `<div class="receipt-top">
        <h4>Your order · ${Store.count} item${Store.count > 1 ? 's' : ''}</h4>
        ${Store.cart.map(l => `<div class="r-item">
          <div class="pic">${art(l.pattern, l.palette)}</div>
          <div><b>${esc(l.name)}</b><span>${esc(l.color)} · ${esc(l.size)} · ×${l.qty}</span></div>
          <em>${money(l.price * l.qty)}</em></div>`).join('')}
      </div>
      <div class="receipt-bot">
        <div class="r-line"><span>Subtotal</span><b>${money(t.sub)}</b></div>
        ${t.discount ? `<div class="r-line" style="color:var(--ok)"><span>Coupon ${esc(Store.coupon?.code || '')}</span><b>− ${money(t.discount)}</b></div>` : ''}
        <div class="r-line"><span>Shipping</span><b>${t.shipping ? money(t.shipping) : 'Free'}</b></div>
        ${t.cod ? `<div class="r-line"><span>COD handling</span><b>${money(t.cod)}</b></div>` : ''}
        <div class="r-line due"><span>${CO.method === 'cod' ? 'Due on delivery' : 'Total due'}</span><b>${money(t.due)}</b></div>
        <div class="r-stamp">Sandbox · no real money moves</div>
      </div>`;
  }

  function stepsHTML() {
    const st = CO.step;
    const bagDone = true, delDone = st > 1, payOn = st > 1;
    return `<div class="co-steps">
      <div class="co-step done"><i>✓</i><span>Bag</span></div>
      <div class="co-rail fill"></div>
      <div class="co-step ${delDone ? 'done' : 'on'}"><i>${delDone ? '✓' : '2'}</i><span>Delivery</span></div>
      <div class="co-rail ${payOn ? 'fill' : ''}"></div>
      <div class="co-step ${payOn ? 'on' : ''}"><i>3</i><span>Payment</span></div>
    </div>`;
  }

  function addressHTML() {
    const a = CO.addr || {};
    const u = Store.user || {};
    const v = k => esc(a[k] || (k === 'name' ? u.name : k === 'email' ? u.email : k === 'phone' ? u.phone : '') || '');
    return `<h3>Where should it go?</h3>
      <p class="sub">${Store.user ? 'Signed in as ' + esc(Store.user.email) : 'Checking out as a guest — <a class="link" href="#/account">sign in</a> to save this address.'}</p>
      <form id="coForm" class="stack" novalidate>
        <div class="grid-2">
          <div class="field"><label>Full name</label><input class="input" name="name" value="${v('name')}" placeholder="As on the parcel" required></div>
          <div class="field"><label>Mobile</label><input class="input" name="phone" value="${v('phone')}" inputmode="numeric" maxlength="10" placeholder="10-digit number" required></div>
        </div>
        <div class="field"><label>Email</label><input class="input" type="email" name="email" value="${v('email')}" placeholder="For the receipt and tracking" required></div>
        <div class="field"><label>Address</label><textarea class="textarea" name="address" placeholder="Flat / house, street, landmark" required>${v('address')}</textarea></div>
        <div class="grid-3">
          <div class="field"><label>City</label><input class="input" name="city" value="${v('city')}" required></div>
          <div class="field"><label>State</label><input class="input" name="state" value="${v('state')}" required></div>
          <div class="field"><label>PIN code</label><input class="input" name="pincode" value="${v('pincode')}" inputmode="numeric" maxlength="6" required></div>
        </div>
        <div class="field"><label>Note for the studio (optional)</label><input class="input" name="notes" value="${esc(a.notes || '')}" placeholder="Gift wrap, delivery instructions…"></div>
        <button class="btn btn-primary paybtn" type="submit">Continue to payment →</button>
        <p class="secure-row">${PAY_IC.lock} Prices and stock re-checked on the server</p>
      </form>`;
  }

  function cardPanel() {
    return `<div class="cardv" id="cardv">
        <div class="cardv-inner">
          <div class="cardv-face">
            <div class="cv-top"><div class="cv-chip"></div><div class="cv-brand" id="cvBrand">${cardBrand(CO.card.number)}</div></div>
            <div class="cv-num" id="cvNum">${esc(CO.card.number || '•••• •••• •••• ••••')}</div>
            <div class="cv-bot">
              <div><span class="cv-lab">Card holder</span><div class="cv-val" id="cvName">${esc(CO.card.name || 'Your name')}</div></div>
              <div><span class="cv-lab">Expires</span><div class="cv-val" id="cvExp">${esc(CO.card.exp || 'MM/YY')}</div></div>
            </div>
          </div>
          <div class="cardv-face cardv-back">
            <div class="cv-stripe"></div>
            <div class="cv-cvv-lab">CVV</div>
            <div class="cv-cvv" id="cvCvv">${esc(CO.card.cvv || '•••')}</div>
            <div style="margin-top:auto;font-size:8.5px;letter-spacing:.2em;opacity:.5;padding:0 22px 20px">RESHAM &amp; CO. · SECURE CARD</div>
          </div>
        </div>
      </div>
      <div class="stack">
        <div class="field"><label>Card number</label>
          <input class="input" id="cNum" inputmode="numeric" autocomplete="cc-number" value="${esc(CO.card.number)}" placeholder="4111 1111 1111 1111" style="font-family:var(--mono);letter-spacing:.08em"></div>
        <div class="field"><label>Name on card</label><input class="input" id="cName" autocomplete="cc-name" value="${esc(CO.card.name)}" placeholder="SRUTHIN CHESS" style="text-transform:uppercase"></div>
        <div class="grid-2">
          <div class="field"><label>Expiry</label><input class="input" id="cExp" inputmode="numeric" autocomplete="cc-exp" value="${esc(CO.card.exp)}" placeholder="MM/YY" style="font-family:var(--mono)"></div>
          <div class="field"><label>CVV</label><input class="input" id="cCvv" inputmode="numeric" maxlength="4" value="${esc(CO.card.cvv)}" placeholder="•••" style="font-family:var(--mono)"></div>
        </div>
      </div>`;
  }

  function upiPanel() {
    return `<div class="upi-apps">${UPI_APPS.map(([id, name, ch]) => `<button class="upi-app ${CO.upiApp === id ? 'on' : ''}" data-upiapp="${id}"><span class="sq">${ch}</span>${name}</button>`).join('')}</div>
      <div class="field"><label>UPI ID</label>
        <input class="input" id="upiId" value="${esc(CO.upi)}" placeholder="yourname@okhdfcbank" autocomplete="off" style="font-family:var(--mono)"></div>
      <div class="upi-note" style="margin-top:14px">
        <span>${PAY_IC.lock}</span>
        <span>A collect request for <b>${money(coTotals(0).due)}</b> goes to your UPI app. Approve it there and the order is confirmed — nothing is charged in this sandbox.</span>
      </div>`;
  }

  function bankPanel() {
    return `<div class="field" style="margin-bottom:12px"><label>Choose your bank</label></div>
      <div class="banks" id="banks">${BANKS.map(b => `<button class="bank ${CO.bank === b ? 'on' : ''}" data-bank="${esc(b)}">${esc(b)}</button>`).join('')}</div>
      <p class="small muted" style="margin-top:14px">You will be taken to your bank's secure page to authorise ${money(coTotals(0).due)}.</p>`;
  }

  function codPanel() {
    const t = coTotals(0);
    return `<div class="upi-note" style="background:var(--sage-soft);border-color:rgba(95,115,85,.25);color:#3d4c36">
        <span>${PAY_IC.cod}</span>
        <span>Keep <b>${money(t.due)}</b> ready for the courier. A handling fee of ${money(t.cod)} is included. Cash and UPI-on-delivery both work.</span>
      </div>
      <p class="small muted" style="margin-top:14px">Our courier partner carries a card machine for orders above ₹5,000.</p>`;
  }

  function paymentHTML() {
    const t = coTotals(0);
    const panels = { upi: upiPanel, card: cardPanel, netbanking: bankPanel, cod: codPanel };
    const label = CO.method === 'cod' ? `Place order · ${money(t.due)}` : `Pay ${money(t.due)} securely`;
    return `<h3>Payment</h3>
      <p class="sub">Delivering to ${esc(CO.addr?.name || '')} · ${esc(CO.addr?.city || '')} ${esc(CO.addr?.pincode || '')} — <a class="link" href="#" id="coEdit">edit</a></p>
      <div class="paygrid" id="payOpts">
        ${METHODS.map(m => `<button class="paytile ${CO.method === m.id ? 'on' : ''}" data-method="${m.id}">
            <span class="t-ic">${PAY_IC[m.id]}</span>
            <b>${m.name}</b><span>${m.desc}${m.id === 'cod' ? ' · +' + money(Number(Store.settings.cod_fee || 49)) : ''}</span>
          </button>`).join('')}
      </div>
      <div id="payPanel">${panels[CO.method]()}</div>
      <button class="btn btn-primary btn-block paybtn" id="payBtn">${PAY_IC.lock} ${label}</button>
      <button class="btn btn-ghost btn-block btn-sm" id="coBack" style="margin-top:10px">← Back to delivery</button>
      <p class="secure-row">${PAY_IC.lock} 256-bit encryption · sandbox mode</p>`;
  }

  async function viewCheckout() {
    if (!Store.cart.length) { location.hash = '#/cart'; return '<div class="wrap"></div>'; }
    let discount = 0;
    if (Store.coupon) {
      try { const r = await api('/api/coupons/validate', { method: 'POST', body: { code: Store.coupon.code, subtotal: Store.subtotal } }); discount = r.discount; } catch {}
    }
    CO.discount = discount;
    const t = coTotals(discount);
    setTimeout(() => mountCheckout(), 0);
    return `<div class="wrap co-wrap">
      <div class="crumbs"><a href="#/cart">Bag</a> / Checkout</div>
      <div id="coSteps">${stepsHTML()}</div>
      <div class="co-grid">
        <div class="panel" id="coStage"></div>
        <aside class="receipt" id="coReceipt">${receiptHTML(t)}</aside>
      </div>
    </div>`;
  }

  function mountCheckout() {
    const stage = $('#coStage');
    if (!stage) return;
    const t = coTotals(CO.discount);
    $('#coSteps').innerHTML = stepsHTML();
    $('#coReceipt').innerHTML = receiptHTML(t);
    stage.innerHTML = CO.step === 1 ? addressHTML() : paymentHTML();

    if (CO.step === 1) {
      $('#coForm').onsubmit = e => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.target).entries());
        for (const k of ['name', 'email', 'phone', 'address', 'city', 'state', 'pincode']) {
          if (!String(f[k] || '').trim()) return toast(`Please fill in your ${k === 'phone' ? 'mobile number' : k}.`, 'bad');
        }
        if (!/^\d{10}$/.test(String(f.phone).replace(/\D/g, '').slice(-10))) return toast('Enter a valid 10-digit mobile number.', 'bad');
        if (!/^\d{6}$/.test(String(f.pincode).trim())) return toast('Enter a valid 6-digit PIN code.', 'bad');
        CO.addr = f; CO.step = 2;
        mountCheckout();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      };
      return;
    }

    // ---- step 2 wiring
    $$('#payOpts .paytile').forEach(b => b.onclick = () => { CO.method = b.dataset.method; mountCheckout(); });
    const edit = $('#coEdit'); if (edit) edit.onclick = e => { e.preventDefault(); CO.step = 1; mountCheckout(); };
    const back = $('#coBack'); if (back) back.onclick = () => { CO.step = 1; mountCheckout(); };

    $$('[data-upiapp]').forEach(b => b.onclick = () => { CO.upiApp = b.dataset.upiapp; mountCheckout(); });
    const upi = $('#upiId'); if (upi) upi.oninput = () => { CO.upi = upi.value; };
    $$('[data-bank]').forEach(b => b.onclick = () => { CO.bank = b.dataset.bank; mountCheckout(); });

    // card preview: live fields + tilt
    const cv = $('#cardv');
    if (cv) {
      const set = (id, v) => { const el = $('#' + id); if (el) el.textContent = v; };
      const num = $('#cNum'), nm = $('#cName'), ex = $('#cExp'), cvc = $('#cCvv');
      num.oninput = () => { num.value = fmtCard(num.value); CO.card.number = num.value; set('cvNum', num.value || '•••• •••• •••• ••••'); set('cvBrand', cardBrand(num.value)); };
      nm.oninput = () => { CO.card.name = nm.value; set('cvName', nm.value || 'Your name'); };
      ex.oninput = () => { ex.value = fmtExp(ex.value); CO.card.exp = ex.value; set('cvExp', ex.value || 'MM/YY'); };
      cvc.oninput = () => { cvc.value = cvc.value.replace(/\D/g, '').slice(0, 4); CO.card.cvv = cvc.value; set('cvCvv', cvc.value || '•••'); };
      cvc.onfocus = () => cv.classList.add('flip');
      cvc.onblur = () => cv.classList.remove('flip');
      cv.onmousemove = e => {
        const r = cv.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - .5, py = (e.clientY - r.top) / r.height - .5;
        cv.querySelector('.cardv-inner').style.transform =
          cv.classList.contains('flip') ? 'rotateY(180deg)' : `rotateY(${px * 14}deg) rotateX(${-py * 12}deg) translateZ(0)`;
      };
      cv.onmouseleave = () => { cv.querySelector('.cardv-inner').style.transform = cv.classList.contains('flip') ? 'rotateY(180deg)' : ''; };
    }

    $('#payBtn').onclick = () => payNow(t);
  }

  function payNow(t) {
    if (CO.method === 'card') {
      if (CO.card.number.replace(/\s/g, '').length !== 16) return toast('Enter the 16-digit card number.', 'bad');
      if (!CO.card.name.trim()) return toast('Enter the name on the card.', 'bad');
      const m = /^(\d{2})\/(\d{2})$/.exec(CO.card.exp);
      if (!m) return toast('Expiry should be MM/YY.', 'bad');
      const mm = Number(m[1]), yy = Number('20' + m[2]);
      if (mm < 1 || mm > 12) return toast('Expiry month is not valid.', 'bad');
      if (new Date(yy, mm, 1) < new Date()) return toast('That card has expired.', 'bad');
      if (CO.card.cvv.length < 3) return toast('Enter the 3-digit CVV.', 'bad');
    }
    if (CO.method === 'upi' && !/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(CO.upi.trim())) {
      return toast('Enter a valid UPI ID, like yourname@okhdfcbank.', 'bad');
    }
    if (CO.method === 'netbanking' && !CO.bank) return toast('Choose your bank to continue.', 'bad');

    const btn = $('#payBtn');
    btn.classList.add('processing');
    btn.innerHTML = `<span class="spinner"></span> ${CO.method === 'cod' ? 'Placing your order…' : 'Authorising payment…'}`;
    setTimeout(async () => {
      try {
        const res = await api('/api/orders', { method: 'POST', body: {
          items: Store.cart.map(l => ({ id: l.id, qty: l.qty, size: l.size, color: l.color })),
          customer: CO.addr, paymentMethod: CO.method,
          couponCode: Store.coupon ? Store.coupon.code : null, notes: CO.addr.notes || ''
        } });
        Store.cart = []; Store.coupon = null; Store.save();
        CO.step = 1; CO.addr = null;
        location.hash = '#/order/' + res.order.code;
        toast(CO.method === 'cod' ? 'Order placed — pay on delivery' : 'Payment authorised · order confirmed', 'ok');
      } catch (err) {
        toast(err.message, 'bad');
        btn.classList.remove('processing');
        mountCheckout();
      }
    }, 1100);
  }

  async function viewOrder(code) {
    const d = await api('/api/orders/track/' + encodeURIComponent(code));
    const o = d.order;
    const steps = [['placed', 'Order placed'], ['packed', 'Packed in muslin'], ['shipped', 'Handed to courier'], ['delivered', 'Delivered']];
    const idx = o.status === 'cancelled' ? -1 : steps.findIndex(s => s[0] === o.status);
    return `<div class="wrap"><div class="crumbs"><a href="#/">Home</a> / Order ${esc(o.code)}</div>
      <div class="co-grid">
        <div class="panel">
          <span class="eyebrow">${o.status === 'cancelled' ? 'Order cancelled' : 'Thank you'}</span>
          <h1 style="font-size:1.8rem;margin:8px 0">${o.status === 'cancelled' ? 'This order was cancelled' : 'Your order is confirmed'}</h1>
          <p class="muted">Order <b>${esc(o.code)}</b> · ${dateFmt(o.createdAt)}</p>
          <div class="timeline" style="margin-top:22px">
            ${o.status === 'cancelled'
        ? `<div class="tl-item done"><div class="tl-dot">✕</div><div><b>Cancelled</b><span>${dateFmt(o.updatedAt)}</span></div></div>`
        : steps.map((s, i) => `<div class="tl-item ${i <= idx ? 'done' : ''}"><div class="tl-dot">${i <= idx ? '✓' : i + 1}</div>
              <div><b>${s[1]}</b><span>${i <= idx ? (o.events.find(e => e.status === s[0]) ? dateFmt(o.events.find(e => e.status === s[0]).at) : 'Done') : 'Pending'}</span></div></div>`).join('')}
          </div>
          <hr class="stitch" style="margin:18px 0">
          <h3 style="font-size:15px">Items</h3>
          ${o.items.map(l => `<div class="mini-line" style="grid-template-columns:48px 1fr auto">
            <div class="pic" style="width:48px;height:56px">${art(l.pattern, l.palette)}</div>
            <div><h4>${esc(l.name)}</h4><div class="meta">${esc(l.color)} · ${esc(l.size)} · ×${l.qty}</div></div>
            <b class="small">${money(l.price * l.qty)}</b></div>`).join('')}
          ${['placed', 'packed'].includes(o.status) ? `<button class="btn btn-ghost btn-sm" id="cancelOrder" style="margin-top:16px">Cancel this order</button>` : ''}
        </div>
        <div class="summary">
          <h3>Summary</h3>
          <div class="sum-row"><span>Subtotal</span><b>${money(o.subtotal)}</b></div>
          ${o.discount ? `<div class="sum-row" style="color:var(--ok)"><span>Discount ${esc(o.coupon || '')}</span><b>− ${money(o.discount)}</b></div>` : ''}
          <div class="sum-row"><span>Shipping</span><b>${o.shipping ? money(o.shipping) : 'Free'}</b></div>
          ${o.codFee ? `<div class="sum-row"><span>COD fee</span><b>${money(o.codFee)}</b></div>` : ''}
          <div class="sum-row total"><span>Total</span><span>${money(o.total)}</span></div>
          <hr class="stitch" style="margin:16px 0">
          <p class="small muted" style="margin:0"><b style="color:var(--ink)">Delivering to</b><br>${esc(o.customer.name)}<br>${esc(o.customer.address)}<br>${esc(o.customer.city)}, ${esc(o.customer.state)} ${esc(o.customer.pincode)}<br>${esc(o.customer.phone)}</p>
          <p class="small muted" style="margin-top:12px">Payment: ${esc(o.paymentMethod.toUpperCase())} · ${esc(o.paymentStatus)}</p>
          <a class="btn btn-ghost btn-block btn-sm" href="#/shop" style="margin-top:14px">Continue shopping</a>
        </div>
      </div></div>`;
  }

  async function viewTrack() {
    return `<div class="wrap" style="max-width:640px;padding:50px 24px 90px">
      <div class="panel">
        <span class="eyebrow">Order tracking</span>
        <h1 style="font-size:1.8rem;margin:8px 0 6px">Where is my parcel?</h1>
        <p class="muted small">Enter the order code from your confirmation email — it looks like RSM-8K3F21.</p>
        <form id="trackForm" class="row" style="margin-top:16px">
          <input class="input" name="code" placeholder="RSM-XXXXXX" style="flex:1">
          <button class="btn btn-primary">Track</button>
        </form>
        <div id="trackOut" style="margin-top:18px"></div>
      </div>
    </div>`;
  }

  async function viewAccount() {
    if (Store.user) {
      const d = await api('/api/orders/mine');
      return `<div class="wrap"><div class="crumbs"><a href="#/">Home</a> / Account</div>
        <div class="cart-grid">
          <div>
            <h1 style="font-size:1.9rem;margin:14px 0 4px">Hello, ${esc(Store.user.name.split(' ')[0])}</h1>
            <p class="muted small">${esc(Store.user.email)}${Store.user.phone ? ' · ' + esc(Store.user.phone) : ''}</p>
            <h3 style="margin:26px 0 10px">Your orders (${d.orders.length})</h3>
            ${d.orders.length ? d.orders.map(o => `<div class="panel" style="padding:16px;margin-bottom:12px">
              <div class="between"><div><b>${esc(o.code)}</b><div class="small muted">${dateFmt(o.createdAt)} · ${o.items.length} item${o.items.length > 1 ? 's' : ''}</div></div>
              <div style="text-align:right"><span class="tag ${o.status}">${o.status}</span><div class="small" style="margin-top:4px"><b>${money(o.total)}</b></div></div></div>
              <div class="row" style="margin-top:10px"><a class="btn btn-xs btn-ghost" href="#/order/${esc(o.code)}">View order</a></div>
            </div>`).join('') : `<div class="empty" style="padding:40px"><h3>No orders yet</h3><p class="muted small">Your first heirloom is waiting.</p><a class="btn btn-primary btn-sm" href="#/shop">Shop now</a></div>`}
          </div>
          <div class="summary">
            <h3>Account</h3>
            <p class="small muted">Wishlist: ${Store.wishlist.length} saved piece${Store.wishlist.length === 1 ? '' : 's'}</p>
            <a class="btn btn-ghost btn-block btn-sm" href="#/wishlist">View wishlist</a>
            <button class="btn btn-outline btn-block btn-sm" id="signOut" style="margin-top:8px">Sign out</button>
            <hr class="stitch" style="margin:18px 0">
            <p class="small muted">Need help? Write to ${esc(Store.settings.support_email || 'care@resham.co')} — we reply within a working day.</p>
          </div>
        </div></div>`;
    }
    return `<div class="wrap" style="max-width:460px;padding:50px 24px 90px">
      <div class="panel">
        <div class="row" style="gap:6px;margin-bottom:16px">
          <button class="btn btn-sm ${'login'}" id="tabLogin" style="flex:1;background:var(--ink);color:#fff">Sign in</button>
          <button class="btn btn-sm btn-ghost" id="tabReg" style="flex:1">Create account</button>
        </div>
        <form id="loginForm" class="stack">
          <div class="field"><label>Email</label><input class="input" name="email" type="email" required></div>
          <div class="field"><label>Password</label><input class="input" name="password" type="password" required></div>
          <button class="btn btn-primary btn-block">Sign in</button>
          <p class="small muted center">New here? <a class="link" href="#" id="toReg">Create an account</a></p>
        </form>
        <form id="regForm" class="stack hide">
          <div class="field"><label>Name</label><input class="input" name="name" required></div>
          <div class="field"><label>Email</label><input class="input" name="email" type="email" required></div>
          <div class="field"><label>Phone</label><input class="input" name="phone" placeholder="Optional"></div>
          <div class="field"><label>Password</label><input class="input" name="password" type="password" minlength="6" required></div>
          <button class="btn btn-primary btn-block">Create account</button>
        </form>
      </div></div>`;
  }

  async function viewWishlist() {
    const all = await api('/api/products?' + qs({ limit: 100, includeOut: '1' }));
    const items = all.products.filter(p => Store.wishlist.includes(p.id));
    return `<div class="wrap"><div class="crumbs"><a href="#/">Home</a> / Wishlist</div>
      <div class="sec-head" style="margin-top:16px"><div><h1 style="font-size:1.9rem">Wishlist</h1><p class="muted">${items.length} saved piece${items.length === 1 ? '' : 's'}</p></div></div>
      ${items.length ? `<div class="pgrid" style="padding-bottom:60px">${items.map(productCard).join('')}</div>`
        : `<div class="empty" style="margin-bottom:60px"><h3>Nothing saved yet</h3><p class="muted">Tap the heart on any piece to keep it here.</p><a class="btn btn-primary" href="#/shop">Browse the collection</a></div>`}
    </div>`;
  }

  /* ------------------------------------------------------------- interactions */
  function addToCart(p, qty = 1, size, color) {
    size = size || (p.sizes && p.sizes[0]) || 'One Size';
    color = color || (p.colors && p.colors[0]) || 'Natural';
    const found = Store.cart.find(l => l.id === p.id && l.size === size && l.color === color);
    if (found) found.qty = Math.min(20, found.qty + qty);
    else Store.cart.push({ id: p.id, slug: p.slug, name: p.name, price: p.price, mrp: p.mrp, qty, size, color, pattern: p.pattern, palette: p.palette, stock: p.stock });
    Store.save();
    toast(`${p.name} added to your bag`, 'ok');
    openDrawer();
  }
  window.addToCart = addToCart;

  function toggleWish(id) {
    const i = Store.wishlist.indexOf(id);
    if (i >= 0) { Store.wishlist.splice(i, 1); toast('Removed from wishlist'); }
    else { Store.wishlist.push(id); toast('Saved to wishlist', 'ok'); }
    Store.save();
  }

  function paintBadges() {
    const dot = $('#cartDot');
    if (dot) { dot.textContent = Store.count; dot.style.display = Store.count ? 'grid' : 'none'; }
  }

  function openDrawer() {
    const d = $('#drawer');
    const t = cartTotals(0);
    d.innerHTML = `<header><h3 style="font-size:17px">Your bag (${Store.count})</h3>
        <button class="icon-btn" id="closeDrawer">${ICON.close}</button></header>
      <div class="items">${Store.cart.length ? Store.cart.map(l => `<div class="mini-line">
          <a class="pic" href="#/product/${esc(l.slug)}" data-close>${art(l.pattern, l.palette)}</a>
          <div><h4>${esc(l.name)}</h4><div class="meta">${esc(l.color)} · ${esc(l.size)}</div>
            <div class="row" style="margin-top:6px">
              <div class="qty" style="transform:scale(.9);transform-origin:left"><button data-dstep="-1" data-k="${l.id}|${esc(l.size)}|${esc(l.color)}">−</button><span>${l.qty}</span><button data-dstep="1" data-k="${l.id}|${esc(l.size)}|${esc(l.color)}">+</button></div>
              <button class="btn btn-xs btn-ghost" data-drem="${l.id}|${esc(l.size)}|${esc(l.color)}">Remove</button>
            </div></div>
          <b class="small">${money(l.price * l.qty)}</b></div>`).join('')
        : `<div style="text-align:center;padding:50px 10px"><p class="muted">Your bag is empty.</p><a class="btn btn-primary btn-sm" href="#/shop" data-close>Shop the collection</a></div>`}</div>
      ${Store.cart.length ? `<footer>
        <div class="between" style="margin-bottom:6px"><span class="muted small">Subtotal</span><b>${money(t.sub)}</b></div>
        <p class="small muted" style="margin-bottom:12px">${t.sub >= t.threshold ? '✓ Free shipping unlocked' : `Add ${money(t.threshold - t.sub)} for free shipping`}</p>
        <a class="btn btn-primary btn-block" href="#/checkout" data-close>Checkout</a>
        <a class="btn btn-ghost btn-block btn-sm" href="#/cart" data-close style="margin-top:8px">View bag</a>
      </footer>` : ''}`;
    d.classList.add('on'); $('#scrim').classList.add('on'); document.body.classList.add('locked');
    d.querySelectorAll('[data-close]').forEach(a => a.addEventListener('click', closeDrawer));
    $('#closeDrawer').onclick = closeDrawer;
    d.querySelectorAll('[data-dstep]').forEach(b => b.onclick = () => {
      const [id, size, color] = b.dataset.k.split('|');
      const line = Store.cart.find(l => String(l.id) === id && l.size === size && l.color === color);
      if (line) line.qty = Math.max(1, line.qty + Number(b.dataset.dstep));
      Store.save(); openDrawer();
    });
    d.querySelectorAll('[data-drem]').forEach(b => b.onclick = () => {
      const [id, size, color] = b.dataset.drem.split('|');
      Store.cart = Store.cart.filter(l => !(String(l.id) === id && l.size === size && l.color === color));
      Store.save(); openDrawer();
    });
  }
  function closeDrawer() {
    $('#drawer').classList.remove('on'); $('#scrim').classList.remove('on'); document.body.classList.remove('locked');
  }
  window.closeDrawer = closeDrawer;

  function reviewModal(p) {
    const m = $('#modal');
    m.innerHTML = `<div class="modal"><header><h3>Review ${esc(p.name)}</h3><button class="icon-btn" id="mClose">${ICON.close}</button></header>
      <form id="revForm" class="stack">
        <div class="field"><label>Rating</label><div class="chips" id="rateChips">${[1, 2, 3, 4, 5].map(i => `<button type="button" class="chip ${i === 5 ? 'on' : ''}" data-r="${i}">${i} ★</button>`).join('')}</div></div>
        <div class="field"><label>Title</label><input class="input" name="title" placeholder="Sum it up in a line"></div>
        <div class="field"><label>Your review</label><textarea class="textarea" name="body" placeholder="How is the stitching, the fabric, the fit?" required></textarea></div>
        ${Store.user ? '' : `<div class="field"><label>Your name</label><input class="input" name="name" placeholder="Name shown with the review"></div>`}
        <button class="btn btn-primary">Submit review</button>
        <p class="small muted">Reviews are checked by the studio before they go live.</p>
      </form></div>`;
    m.classList.add('on');
    let rating = 5;
    $('#mClose').onclick = () => m.classList.remove('on');
    m.onclick = e => { if (e.target === m) m.classList.remove('on'); };
    $$('#rateChips .chip').forEach(b => b.onclick = () => {
      $$('#rateChips .chip').forEach(x => x.classList.remove('on')); b.classList.add('on'); rating = Number(b.dataset.r);
    });
    $('#revForm').onsubmit = async e => {
      e.preventDefault();
      const f = new FormData(e.target);
      try {
        await api(`/api/products/${p.id}/reviews`, { method: 'POST', body: { rating, title: f.get('title'), body: f.get('body'), name: f.get('name') } });
        m.classList.remove('on'); toast('Thanks — your review is in the queue.', 'ok');
      } catch (err) { toast(err.message, 'bad'); }
    };
  }

  /* --------------------------------------------------------------- router */
  function parseHash() {
    const raw = location.hash.replace(/^#\/?/, '');
    const [pathPart, queryPart] = raw.split('?');
    const parts = pathPart.split('/').filter(Boolean);
    const params = Object.fromEntries(new URLSearchParams(queryPart || ''));
    return { parts, params };
  }

  async function render() {
    const { parts, params } = parseHash();
    const app = $('#app');
    const seg = parts[0] || 'home';

    // admin gets its own chrome
    if (seg === 'admin' && window.Admin) {
      window.Admin.render(app, parts.slice(1));
      return;
    }

    let view = '', active = seg;
    try {
      if (seg === 'home') view = await viewHome();
      else if (seg === 'shop') view = await viewShop(params);
      else if (seg === 'product') view = await viewProduct(parts[1]);
      else if (seg === 'cart') { view = await viewCart(); active = 'cart'; }
      else if (seg === 'checkout') view = await viewCheckout();
      else if (seg === 'order') view = await viewOrder(parts[1]);
      else if (seg === 'orders') view = await viewTrack();
      else if (seg === 'account') view = await viewAccount();
      else if (seg === 'wishlist') view = await viewWishlist();
      else view = `<div class="wrap"><div class="empty" style="margin:60px 0"><h3>Page not found</h3><a class="btn btn-primary" href="#/">Go home</a></div></div>`;
    } catch (e) {
      view = `<div class="wrap"><div class="empty" style="margin:60px 0"><h3>Something went wrong</h3><p class="muted">${esc(e.message)}</p><a class="btn btn-primary" href="#/">Back to home</a></div></div>`;
    }

    app.innerHTML = header(active) + `<main>${view}</main>` + footer();
    paintBadges();
    wireGlobal();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function wireGlobal() {
    const s = $('#searchform');
    if (s) s.onsubmit = e => { e.preventDefault(); const q = new FormData(s).get('q').trim(); location.hash = q ? `#/shop?q=${encodeURIComponent(q)}` : '#/shop'; };
    const oc = $('#openCart'); if (oc) oc.onclick = openDrawer;
    const bg = $('#burger');
    if (bg) bg.onclick = () => {
      const m = $('#modal');
      m.innerHTML = `<div class="modal"><header><h3>Menu</h3><button class="icon-btn" id="mClose">${ICON.close}</button></header>
        <div class="stack">
          <a class="btn btn-ghost btn-block" href="#/shop">Shop all</a>
          ${Store.categories.map(c => `<a class="btn btn-ghost btn-block" href="#/shop?cat=${esc(c.slug)}">${esc(c.name)}</a>`).join('')}
          <a class="btn btn-ghost btn-block" href="#/orders">Track order</a>
          <a class="btn btn-ghost btn-block" href="#/account">Account</a>
          <a class="btn btn-ghost btn-block" href="#/wishlist">Wishlist</a>
        </div></div>`;
      m.classList.add('on');
      $('#mClose').onclick = () => m.classList.remove('on');
      m.querySelectorAll('a').forEach(a => a.onclick = () => m.classList.remove('on'));
    };
    const sortSel = $('#sortSel');
    if (sortSel) sortSel.onchange = () => {
      const { params } = parseHash();
      location.hash = '#/shop?' + qs({ ...params, sort: sortSel.value });
    };
    const signOut = $('#signOut');
    if (signOut) signOut.onclick = async () => {
      try { await api('/api/auth/logout', { method: 'POST' }); } catch {}
      LS.removeItem(tokenKey); Store.user = null; toast('Signed out'); location.hash = '#/';
    };
    // cart page wiring
    const lines = $('#lines');
    if (lines) {
      lines.querySelectorAll('[data-line]').forEach(row => {
        const [id, size, color] = row.dataset.line.split('|');
        const line = Store.cart.find(l => String(l.id) === id && l.size === size && l.color === color);
        row.querySelectorAll('[data-step]').forEach(b => b.onclick = () => {
          line.qty = Math.max(1, Math.min(20, line.qty + Number(b.dataset.step)));
          Store.save(); render();
        });
        const rm = row.querySelector('[data-remove]');
        if (rm) rm.onclick = () => { Store.cart = Store.cart.filter(l => l !== line); Store.save(); toast('Removed from bag'); render(); };
      });
    }
    const applyCoupon = $('#applyCoupon');
    if (applyCoupon) applyCoupon.onclick = async () => {
      if (Store.coupon) { Store.coupon = null; Store.save(); toast('Coupon removed'); render(); return; }
      const code = ($('#couponInput').value || '').trim();
      if (!code) return toast('Enter a coupon code', 'bad');
      try {
        const r = await api('/api/coupons/validate', { method: 'POST', body: { code, subtotal: Store.subtotal } });
        Store.coupon = { code: r.code, discount: r.discount }; Store.save();
        toast(`${r.code} applied — you saved ${money(r.discount)}`, 'ok'); render();
      } catch (e) { toast(e.message, 'bad'); }
    };
    // account forms
    const lf = $('#loginForm'), rf = $('#regForm');
    if (lf) {
      const swap = toReg => {
        lf.classList.toggle('hide', toReg); rf.classList.toggle('hide', !toReg);
        $('#tabLogin').style.cssText = toReg ? '' : 'flex:1;background:var(--ink);color:#fff';
        $('#tabLogin').className = 'btn btn-sm ' + (toReg ? 'btn-ghost' : '');
        $('#tabReg').style.cssText = toReg ? 'flex:1;background:var(--ink);color:#fff' : 'flex:1';
        $('#tabReg').className = 'btn btn-sm ' + (toReg ? '' : 'btn-ghost');
      };
      $('#tabLogin').onclick = () => swap(false);
      $('#tabReg').onclick = () => swap(true);
      const toReg = $('#toReg'); if (toReg) toReg.onclick = e => { e.preventDefault(); swap(true); };
      lf.onsubmit = async e => {
        e.preventDefault(); const f = new FormData(lf);
        try {
          const r = await api('/api/auth/login', { method: 'POST', body: { email: f.get('email'), password: f.get('password') } });
          LS.setItem(tokenKey, r.token); Store.user = r.user; toast(`Welcome back, ${r.user.name.split(' ')[0]}`, 'ok'); render();
        } catch (err) { toast(err.message, 'bad'); }
      };
      rf.onsubmit = async e => {
        e.preventDefault(); const f = new FormData(rf);
        try {
          const r = await api('/api/auth/register', { method: 'POST', body: { name: f.get('name'), email: f.get('email'), phone: f.get('phone'), password: f.get('password') } });
          LS.setItem(tokenKey, r.token); Store.user = r.user; toast('Account created', 'ok'); render();
        } catch (err) { toast(err.message, 'bad'); }
      };
    }
    // tracking
    const tf = $('#trackForm');
    if (tf) tf.onsubmit = async e => {
      e.preventDefault();
      const code = new FormData(tf).get('code').trim().toUpperCase();
      const out = $('#trackOut');
      out.innerHTML = '<p class="small muted">Looking it up…</p>';
      try { const d = await api('/api/orders/track/' + encodeURIComponent(code)); location.hash = '#/order/' + d.order.code; }
      catch (err) { out.innerHTML = `<p class="err">${esc(err.message)}</p>`; }
    };
    // cancel order
    const cancel = $('#cancelOrder');
    if (cancel) cancel.onclick = async () => {
      if (!confirm('Cancel this order? Stock is returned to the studio shelf.')) return;
      const code = location.hash.split('/').pop();
      try { await api(`/api/orders/${encodeURIComponent(code)}/cancel`, { method: 'POST', body: { reason: 'Changed my mind' } }); toast('Order cancelled'); render(); }
      catch (e) { toast(e.message, 'bad'); }
    };
    // product cards
    $$('[data-add]').forEach(b => b.onclick = async e => {
      e.preventDefault(); e.stopPropagation();
      const id = Number(b.dataset.add);
      let p = Store.products.find(x => x.id === id);
      if (!p) {
        try { const d = await api('/api/products/' + id); p = d.product; } catch { return toast('Could not add that piece', 'bad'); }
      }
      addToCart(p, 1);
    });
    $$('[data-wish]').forEach(b => b.onclick = e => {
      e.preventDefault(); e.stopPropagation();
      toggleWish(Number(b.dataset.wish));
      b.classList.toggle('on');
    });
  }

  /* ------------------------------------------------------------------ boot */
  async function boot() {
    // is a real API behind us?
    try {
      const r = await fetch('/api/health', { cache: 'no-store' });
      if (!r.ok) throw new Error('no api');
    } catch (e) {
      Store.demo = true;
    }
    if (Store.demo) {
      const badge = document.createElement('div');
      badge.className = 'mode-badge';
      badge.textContent = 'Demo mode · data saved in this browser';
      badge.title = 'Start the Node server (npm start) to use the real database.';
      document.body.appendChild(badge);
    }
    try {
      const [s, c] = await Promise.all([api('/api/settings'), api('/api/categories')]);
      Store.settings = s.settings; Store.categories = c.categories;
    } catch (e) { console.warn(e); }
    if (token()) {
      try { const me = await api('/api/auth/me'); Store.user = me.user; } catch { LS.removeItem(tokenKey); }
    }
    try { const all = await api('/api/products?' + qs({ limit: 100, includeOut: '1' })); Store.products = all.products; } catch {}
    window.addEventListener('hashchange', render);
    $('#scrim').onclick = () => { closeDrawer(); $('#modal').classList.remove('on'); };
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeDrawer(); $('#modal').classList.remove('on'); } });
    await render();
  }

  window.Router = { render, parseHash };
  document.addEventListener('DOMContentLoaded', boot);
})();

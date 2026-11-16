# Sandya Emb Designs — embroidery designs, sold as files

A store for **real machine embroidery designs**. Each product is a finished pack
with **24 machine formats**; buyers tick the ones their machine reads, pay by
UPI, upload the payment screenshot, and the ZIP — containing exactly those files
— downloads itself.

The house logo (the embroidered "Sandya / Emb Designs" lockup) is used in the
header, the footer, the admin panel and as the favicon — see `public/img/`.

```
Storefront  →  http://localhost:3000
Admin       →  http://localhost:3000/#/admin      password: 252525
UPI ID      →  6301928345@fam  (change in Admin → Settings)
```

---

## Quick start

```bash
npm install
npm start            # seeds the catalogue, serves on :3000
```

```bash
npm run reset        # wipe designs + orders and re-seed
node tools/import-designs.js <pack-folder>   # add or replace design packs
npm run build        # rebuild the single-file static bundle (docs/index.html)
PORT=8080 npm start
```

---

## The catalogue is real design files

Four packs ship with the store — **Floral Spray** (5,805 stitches, 5 colours,
366 trims), **Blue Blossom** (5,074 · 3 · 33), **Magnolia Branch** (5,632 · 5 ·
247) and **Silhouette 10** (3,111 · 1 · 10) — each in 24 machine formats:

```
PES DST JEF EXP VP3 HUS XXX SEW PEC DSB DSZ ZXY EMD GT
INB NEW JPX PCD PCM PCQ PCS STX TAP TBF U01
```

Every number on a product page is read from the files, not typed by hand:
`tools/import-designs.js` parses each `.DST` with `src/dst.js` and cross-checks
the stitch count against the designer's readme — all four match exactly
(5,805 / 5,074 / 5,632 / 3,111).

**Adding a pack:** drop the folder (one sub-folder per design, each with its
formats, a `*-stitch-preview.png` and a `README.txt`) and run:

```bash
node tools/import-designs.js /path/to/pack
npm run reset
```

It copies the formats into `src/designs/<slug>/`, the artwork into
`public/img/<slug>.png`, the stitch-out into `public/img/<slug>-stitch.png`
(both downscaled and palette-optimised by `tools/prepare-images.py`), and
rewrites `src/data/designs.json`. Product cards use the artwork; the design page
shows both, artwork first, stitch-out as the second shot. Set prices in the
`PRICES` map at the top of the script.

A download is built at request time by `src/pack.js`: the chosen format files
plus the designer's readme, zipped. Nothing is generated or faked — if a format
is not in the pack, it is not offered.

## How checkout works

1. **Design page** — stitch count, size, thread colours, and a format picker
   (DST + EXP preselected; "select all" / "clear").
2. **Checkout** — name and email only, no account.
3. **UPI page** — a QR generated in the browser from
   `upi://pay?pa=6301928345@fam&pn=…&am=749.00&cu=INR&tn=RSM-XXXXXX`, the UPI ID
   with a copy button, and **four app buttons with their official logos**
   (Google Pay, PhonePe, Paytm, BHIM) that deep-link into the app:

   | App | Scheme |
   |---|---|
   | Google Pay | `tez://upi/pay?…` |
   | PhonePe | `phonepe://pay?…` |
   | Paytm | `paytmmp://pay?…` |
   | BHIM | `upi://pay?…` (generic sheet) |

   Each carries the amount and order code. If the app does not take over within
   1.5 s the page falls back to the generic `upi://` sheet.
4. **Screenshot upload** — drag-drop, PNG/JPG/WebP up to 8 MB, optional UTR.
5. **Auto-confirm** — the order flips to paid and signed, expiring download
   tokens are minted.
6. **Download** — one ZIP per design, named
   `MUGHAL-BLOOM-DST+PDF.zip`, triggered automatically.

### The honest limits

- **Auto-confirmation trusts the upload.** No bank or UPI API is called, so
  nobody checks the money arrived — any image would pass. Admin → Settings has
  an **auto-confirm switch**; turn it off and orders wait in `submitted` for you
  to check the screenshot in Orders. For real verification, wire a
  Razorpay/Cashfree webhook or the PSP's transaction-status API.
- **The browser chooses the folder.** A page cannot write to an arbitrary path;
  the file goes wherever downloads go (usually `~/Downloads`). Chrome may ask to
  "allow multiple downloads" when an order has more than one design.
- **Logos are trademarks** of their owners, embedded from Wikimedia Commons to
  label payment methods. Replace them with your own licensed assets before
  commercial use.

---

## Admin (`#/admin`, password `252525`)

Dashboard (revenue, orders, AOV, downloads, 14-day chart, **which formats sell**,
top designs), Orders (filter by status, view the payment screenshot at full size,
confirm/reject), Designs (create/edit/hide — stitch count, size and preview are
regenerated from the motif on save), Settings (UPI ID, payee name, link lifetime,
announcement, auto-confirm, password).

## Project layout

```
├── server.js               API: designs, orders, proof upload, ZIP downloads
├── src/
│   ├── embroidery.js       geometry engine + DST/EXP/SVG/PNG/PDF/ZIP writers
│   ├── db.js               SQLite schema (designs, orders, download_tokens)
│   ├── seed.js             seeds settings + catalogue, computes real geometry
│   └── data/designs.json   the catalogue (8 designs)
├── public/
│   ├── app.js              storefront, format picker, UPI page, auto-download
│   ├── admin.js            admin panel
│   ├── demo-backend.js     offline fallback (browser ZIP writer)
│   ├── upi-logos.js        embedded official app marks
│   ├── vendor/qrcode.js    QR encoder (MIT, Kazuhiko Arase)
│   └── styles.css          design system
├── tools/build-assets.js   builds catalogue + per-format files for the static build
├── api/index.js            Vercel function entry
├── vercel.json             rewrites + bundled files
└── docs/index.html         single-file build (GitHub Pages)
```

## API

| Method | Route | Notes |
|---|---|---|
| GET | `/api/settings` · `/api/formats` | public config |
| GET | `/api/designs` | `?q=&tag=&sort=&featured=1` |
| GET | `/api/designs/:slugOrId` | design + related |
| POST | `/api/orders` | `{items:[{slug, formats[]}], name, email}` |
| GET | `/api/orders/:code` | status + links when paid |
| POST | `/api/orders/:code/proof` | `{screenshot: dataURL, ref}` |
| POST | `/api/orders/:code/links` | fresh links |
| GET | `/api/download/:token` | generates and streams the ZIP |
| POST | `/api/admin/login` | `{password}` → admin token |
| GET | `/api/admin/stats` | dashboard aggregates |
| GET/PATCH | `/api/admin/orders[/:id]` | list / change status |
| GET | `/api/admin/screenshot/:code` | payment proof (admin only) |
| GET/POST/PUT/DELETE | `/api/admin/designs[/:id]` | design CRUD |
| GET/PUT | `/api/admin/settings` · POST `/api/admin/password` | config |

## Deploying

### Vercel (serverless)

The repo ships `api/index.js` and `vercel.json` — import the repo, framework
preset *Other*, deploy. No environment variables needed.

Two things to know: Vercel's filesystem is read-only apart from `/tmp`, so the app
detects `VERCEL` and puts the SQLite file and screenshots in `/tmp` — data
survives while an instance is warm and is lost when it recycles. Downloads are
generated on the fly, so product files need no storage at all. For real orders,
host where there is a disk (Render, Railway, Fly, a VPS) and set
`DATA_DIR=/var/data`.

Node is pinned to `22.x` and `better-sqlite3` to `^12.11.1`, which ships prebuilt
binaries for Node 22–26 (older pins fail to compile on Node 26).

## Tests

- **49 API checks** — catalogue, tag filter, order maths, format filtering,
  proof upload, auto-confirm, ZIP contents, expired links (410), admin CRUD,
  settings and password rotation.
- **86 UI checks** — storefront, format picker (preselection, select-all, clear),
  checkout, QR, four app buttons with logos, upload, auto-confirm, downloads,
  admin — run against both the live API and the static build.
- **15 browser checks** — the QR on the page screenshotted and decoded back to
  the exact UPI link; all four app deep links inspected in the DOM; the ZIP
  confirmed **on disk in the Downloads folder** (`FLORAL-SPRAY-PES+DST.zip`) and
  opened with pyembroidery: the DST inside carries 6,539 records / 4 colour
  changes, the PES 5 threads.

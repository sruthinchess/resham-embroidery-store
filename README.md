# Resham Atelier — embroidery designs, sold as files

A store for **machine embroidery designs**. Buyers pick the machine format they
need (DST, EXP, SVG, PNG, PDF), pay by UPI, upload the payment screenshot, and
the ZIP is generated on the fly and downloads itself — containing exactly the
formats they chose.

```
Storefront  →  http://localhost:3000
Admin       →  http://localhost:3000/#/admin      password: 252525
UPI ID      →  6301928345@fam  (change in Admin → Settings)
```

---

## Quick start

```bash
npm install
npm start            # seeds 8 designs, serves on :3000
```

```bash
npm run reset        # wipe designs + orders and re-seed
npm run build        # rebuild the single-file static bundle (docs/index.html)
PORT=8080 npm start
```

---

## The formats are real files, not placeholders

Every download is generated at request time by `src/embroidery.js`:

| Format | What it is |
|---|---|
| **DST** | Tajima binary — 512-byte ASCII header + 3-byte records (jump, colour change, end), y-axis flipped as the format requires |
| **EXP** | Melco binary — 2 bytes per stitch, `0x80`-prefixed jump/colour commands, long moves split into jump runs |
| **SVG** | Vector stitch paths, one path per thread colour |
| **PNG** | Rasterised stitch-out, drawn stitch by stitch |
| **PDF** | Printable design sheet: stitch count, size, colour sequence, licence |

Stitch data comes from a small geometry engine (`src/embroidery.js`) — each
design is a motif (`petalRing`, `medallion`, `paisley`, `border`, `wreath`,
`vine`, `dots`) sampled into 0.6 mm stitches, with satin fills where a digitizer
would lay them. **The stitch count, size in mm and preview on the page are
computed from the same stitches that go into the files**, so they always match.

Both binaries were verified against [pyembroidery](https://github.com/EmbroidePy/pyembroidery)
as an independent reference: every record's absolute position reads back
identical to the source, with the right colour changes and bounds.

---

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
  confirmed **on disk in the Downloads folder**, containing exactly the chosen
  formats, and its DST parsed by pyembroidery (3,532 stitches, 12 colour changes).

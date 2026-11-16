# Resham & Co. — Full-Stack Embroidery Store

A complete online store for hand-embroidered clothing and home linen, with a
premium checkout and a password-protected admin panel. Storefront and admin are
one dependency-light Node app: **Express + SQLite (better-sqlite3) + vanilla JS SPA**.

**Live demo (static build, no server needed):**
<https://sruthinchess.github.io/resham-embroidery-store/>

```
Storefront   →  http://localhost:3000
Admin panel  →  http://localhost:3000/#/admin      password: 252525
```

---

## Quick start

```bash
git clone https://github.com/sruthinchess/resham-embroidery-store.git
cd resham-embroidery-store
npm install          # express + better-sqlite3
npm start            # seeds the catalogue on first run, then serves on :3000
```

The database file is created at `data/resham.db` and seeded with 16 products,
9 categories, 3 coupons and a few reviews, so the store is browsable immediately.

```bash
npm run dev          # same, with --watch reload
npm run reset        # wipe catalogue + orders and re-seed from src/data/seed.json
PORT=8080 npm start  # run on another port
```

**Admin password: `252525`** — change it in Admin → Settings → Admin password
(stored as a scrypt hash, never in plain text).

---

## What's included

### Storefront
- **Home** — editorial hero with a stitched mandala, craft-cluster marquee,
  category tiles, featured pieces, why-us strip, top-rated shelf, testimonials,
  newsletter.
- **Shop** — category filters, search, six sort orders, out-of-stock handling.
- **Product page** — three motif variants, size & colour pickers, quantity
  stepper, wishlist, related products, care/shipping accordions, reviews with a
  moderated review form.
- **Bag** — slide-over drawer plus a full cart page, quantity edits, coupon
  field, free-shipping progress.
- **Account** — register, sign in, profile, order history, wishlist.
- **Order confirmation & tracking** — order code (`RSM-XXXXX`), 4-step timeline,
  cancellation while the order is still `placed`/`packed`.

### Payment studio (checkout)
A two-step checkout — delivery, then a dedicated payment surface:

- **Step rail** with hairlines and a gold fill animation (Bag → Delivery → Payment).
- **Four method tiles** — UPI, Card, Net banking, Cash on delivery — each with
  its own panel that swaps in place.
- **Card panel** — a live 3-D card that tilts with the cursor, updates as you
  type (number formatting, brand detection for Visa / Mastercard / RuPay / Amex)
  and flips to the CVV side on focus. Client-side expiry and CVV validation.
- **UPI panel** — app chips (GPay / PhonePe / Paytm / BHIM), UPI-ID validation
  and a collect-request note showing the exact amount.
- **Net banking** — bank chips with a selected state.
- **COD** — fee-aware copy and a due-on-delivery total.
- **Receipt** — a perforated receipt card on the right that recalculates
  shipping, coupon, COD handling and the amount due as you switch methods.
- Authorising state with a spinner, then the order is placed.

> Payments are **simulated** — nothing is charged. The receipt is stamped
> "sandbox · no real money moves" so it is never mistaken for a live gateway.
> The README section *Customising* says where to drop in Razorpay or Stripe.

### Admin panel (`#/admin`)
- **6-digit keypad login** (password `252525`) with a session token.
- **Dashboard** — revenue, orders, AOV, customers, 14-day revenue chart, order
  pipeline, top sellers, low stock, recent orders.
- **Orders** — filter by status, open any order for address, payment, items and
  the event timeline; advance status, cancel (returns stock), mark paid.
- **Products** — create, edit, archive; price/MRP/stock, fabric, badge, colours,
  sizes, description, embroidery motif and thread palette (the artwork
  regenerates from motif + palette), featured flag, visibility.
- **Customers** — registered accounts with order count and lifetime spend, plus
  guest checkouts grouped by email.
- **Reviews** — approve / hide / delete; approving recalculates the rating.
- **Coupons** — percent or flat, minimum order, usage cap, pause.
- **Settings** — store name, tagline, announcement, support details, free-shipping
  threshold, shipping and COD fees, admin password change.

### Under the hood
- Server-side pricing, coupon and stock checks — the client cannot set a total.
- scrypt password hashing, random session tokens, admin routes behind a separate
  `x-admin-token` session.
- Stock decremented on order, restored on cancellation; soft-deletes keep order
  history intact.
- No image assets: every product visual is a procedurally generated SVG
  "stitched" motif (8 patterns × per-product thread palette).
- Responsive to 390px; no external fonts, CDNs or trackers.

---

## Project structure

```
embroidery-store/
├── server.js                 Express app + full REST API
├── src/
│   ├── db.js                 SQLite schema, password helpers
│   ├── seed.js               idempotent seeder (npm run seed / --force)
│   └── data/seed.json        catalogue: products, categories, coupons, reviews
├── public/
│   ├── index.html            app shell
│   ├── styles.css            design system (storefront + admin)
│   ├── app.js                storefront SPA, hash router, SVG art engine
│   ├── admin.js              admin panel
│   └── demo-backend.js       offline fallback used by the static build
├── docs/index.html           static build served by GitHub Pages
└── data/resham.db            created on first run (git-ignored)
```

## API reference

| Method | Route | Notes |
|---|---|---|
| GET | `/api/health` | liveness |
| GET | `/api/settings` | public store settings |
| GET | `/api/categories` | with product counts |
| GET | `/api/products` | `?category=&q=&sort=&featured=1&page=&limit=` |
| GET | `/api/products/:slugOrId` | product + related + approved reviews |
| POST | `/api/products/:id/reviews` | rating 1–5, queued as `pending` |
| POST | `/api/auth/register` \| `/api/auth/login` | returns `{token, user}` |
| GET | `/api/auth/me` · POST `/api/auth/logout` | bearer token |
| POST | `/api/coupons/validate` | `{code, subtotal}` |
| POST | `/api/orders` | guest or signed-in; server recomputes totals |
| GET | `/api/orders/mine` | signed-in order history |
| GET | `/api/orders/track/:code` | public tracking |
| POST | `/api/orders/:code/cancel` | only while placed/packed |
| POST | `/api/admin/login` | `{password}` → admin token |
| GET | `/api/admin/stats` | dashboard aggregates |
| GET/POST/PUT/DELETE | `/api/admin/products[/:id]` | catalogue CRUD |
| GET/PATCH | `/api/admin/orders[/:id]` | list, filter, status, payment |
| GET | `/api/admin/customers` | accounts + guests |
| GET/PATCH/DELETE | `/api/admin/reviews[/:id]` | moderation |
| GET/POST/PUT/DELETE | `/api/admin/coupons[/:id]` | coupon CRUD |
| GET/PUT | `/api/admin/settings` | store settings |
| POST | `/api/admin/password` | `{current, next}` |

Admin routes need the header `x-admin-token: <token>`.

## Database

`settings · categories · products · users · sessions · reviews · coupons ·
orders · order_events`

Orders store a JSON snapshot of their line items, so a later price change never
rewrites history. `order_events` is the append-only timeline shown to customers
and staff.

## Customising

- **Brand palette** — `:root` at the top of `public/styles.css` (`--maroon`,
  `--gold`, `--cream`, `--ink` …).
- **Catalogue** — edit `src/data/seed.json` then `npm run reset`, or use the
  admin panel.
- **New embroidery motifs** — add a branch to `art()` in `public/app.js` and list
  it in the motif dropdown in `public/admin.js`.
- **Real payments** — checkout is simulated. Replace the `POST /api/orders`
  handler body with a gateway call (Razorpay/Stripe), return the gateway order id
  and set `payment_status` from the webhook.

## Deploying the Node app

### Vercel (serverless)

The repo ships a function entrypoint (`api/index.js`) and `vercel.json`, so it deploys as-is:

1. **vercel.com → Add New → Project → import this repo.** Framework preset: *Other*.
2. Leave the build settings alone — `vercel-build` is a no-op and the API is a single function.
3. Deploy. No environment variables are needed to boot.

`vercel.json` rewrites every path to the function and includes `public/` in the
bundle, so the SPA, the API and the product files are all served by that one function.

**Two things to know before you rely on it:**

- **Storage is ephemeral.** Vercel's filesystem is read-only apart from `/tmp`, so the app
  detects `VERCEL` and puts the database in `/tmp`. Data survives while an instance is
  warm and disappears when it recycles — fine for a demo, not for real orders.
- **Node 22 is pinned** in `engines` and `better-sqlite3` is `^12.11.1`, which ships a prebuilt
  binary for every Node from 22 to 26. Older pins compile from source and fail on Node 26 with
  `v8::Object has no member named 'GetPrototype'`.

**For real use**, host the app where it has a disk — Render, Railway, Fly.io or a VPS — and
point `DATA_DIR` at a persistent volume:

```bash
DATA_DIR=/var/data npm start
```

Or swap SQLite for Postgres/Neon/Supabase: the queries all live in `server.js` and `src/db.js`,
so only those two files change.

## Static build & deployment

`docs/index.html` is a single-file build of the same UI with the API swapped for
an in-browser demo backend (localStorage) — that is what GitHub Pages serves, so
the store and the admin panel are clickable without any server. Data resets from
Admin → Settings → Danger zone.

Regenerate it after changing the storefront:

```bash
python3 build-preview.py     # writes Embroidery-Store-Preview.html + docs/index.html
```

The Node app itself needs a host that runs Node (Render, Railway, Fly.io, a VPS).
`npm start` is the only command required; set `PORT` and keep `data/` on a
persistent volume.

## Security notes before going live

- Serve over HTTPS and prefer `httpOnly` cookies over localStorage bearer tokens.
- Add rate limiting on `/api/auth/login` and `/api/admin/login`.
- Move the admin password to an environment variable and rotate it.
- Back up `data/resham.db` (WAL mode: copy `.db`, `-wal` and `-shm`).

## Tests

The API was exercised end to end (68 checks: catalogue, auth, coupons, order
maths, stock, cancellation, admin CRUD, moderation, password rotation) and the
UI with a headless DOM (128 checks across the live API and the static build:
routing, cart, coupon, payment studio, order placement, tracking, admin login
and every admin section).

'use strict';
/**
 * Resham & Co. — database layer (better-sqlite3)
 * Creates the schema on first run and exposes small helpers used by server.js
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'resham.db');

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  icon TEXT,
  description TEXT
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category_id INTEGER REFERENCES categories(id),
  price REAL NOT NULL,
  mrp REAL NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  fabric TEXT,
  colors TEXT DEFAULT '[]',
  sizes TEXT DEFAULT '[]',
  pattern TEXT DEFAULT 'floral',
  palette TEXT DEFAULT '[]',
  rating REAL DEFAULT 0,
  rating_count INTEGER DEFAULT 0,
  featured INTEGER DEFAULT 0,
  badge TEXT,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'user',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  user_id INTEGER,
  name TEXT NOT NULL,
  rating INTEGER NOT NULL,
  title TEXT,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS coupons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL DEFAULT 'percent',
  value REAL NOT NULL,
  min_order REAL DEFAULT 0,
  max_uses INTEGER DEFAULT 1000,
  used INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  expires_at TEXT
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  user_id INTEGER,
  name TEXT, email TEXT, phone TEXT,
  address TEXT, city TEXT, state TEXT, pincode TEXT,
  items TEXT NOT NULL,
  subtotal REAL NOT NULL,
  discount REAL DEFAULT 0,
  shipping REAL DEFAULT 0,
  cod_fee REAL DEFAULT 0,
  total REAL NOT NULL,
  coupon_code TEXT,
  payment_method TEXT DEFAULT 'cod',
  payment_status TEXT DEFAULT 'pending',
  status TEXT DEFAULT 'placed',
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_code ON orders(code);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);
`);

/* ---------- password hashing ---------- */
function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { hash, salt };
}
function verifyPassword(password, hash, salt) {
  try {
    const candidate = crypto.scryptSync(String(password), salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(hash, 'hex'));
  } catch {
    return false;
  }
}
function token() {
  return crypto.randomBytes(24).toString('hex');
}

/* ---------- settings helpers ---------- */
function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}
function setSetting(key, value) {
  db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .run(key, String(value));
}
function settingsMap() {
  const out = {};
  for (const r of db.prepare('SELECT key,value FROM settings').all()) out[r.key] = r.value;
  return out;
}

module.exports = { db, DB_FILE, DATA_DIR, hashPassword, verifyPassword, token, getSetting, setSetting, settingsMap };

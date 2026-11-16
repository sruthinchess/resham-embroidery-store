'use strict';
/**
 * Database layer — better-sqlite3.
 * Storage location is env-driven so the same code runs on a laptop and on a
 * serverless host (where only /tmp is writable).
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const PROJECT_DATA = path.join(__dirname, '..', 'data');
const SERVERLESS = !!(process.env.VERCEL || process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DATA_DIR = process.env.DATA_DIR || (SERVERLESS ? path.join('/tmp', 'resham-designs') : PROJECT_DATA);
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
try {
  for (const d of [DATA_DIR, UPLOAD_DIR]) fs.mkdirSync(d, { recursive: true });
} catch (e) {
  throw new Error(`Cannot write to the data directory (${DATA_DIR}): ${e.message}. Set DATA_DIR to a writable path.`);
}
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'designs.db');

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS designs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'pack',
  dir TEXT,
  preview_img TEXT,
  stitch_img TEXT,
  price REAL NOT NULL,
  mrp REAL NOT NULL,
  summary TEXT,
  description TEXT,
  hoop TEXT,
  stitch_count INTEGER DEFAULT 0,
  width_mm REAL DEFAULT 0,
  height_mm REAL DEFAULT 0,
  color_count INTEGER DEFAULT 0,
  trims INTEGER DEFAULT 0,
  threads TEXT DEFAULT '[]',
  formats TEXT DEFAULT '[]',
  default_formats TEXT DEFAULT '[]',
  tags TEXT DEFAULT '[]',
  featured INTEGER DEFAULT 0,
  badge TEXT,
  downloads INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT, email TEXT, phone TEXT,
  items TEXT NOT NULL,
  amount REAL NOT NULL,
  upi_ref TEXT,
  screenshot TEXT,
  status TEXT NOT NULL DEFAULT 'awaiting',
  note TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  paid_at TEXT
);
CREATE TABLE IF NOT EXISTS download_tokens (
  token TEXT PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  design_id INTEGER,
  formats TEXT DEFAULT '[]',
  expires_at TEXT,
  hits INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS admin_sessions (token TEXT PRIMARY KEY, created_at TEXT DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS idx_orders_code ON orders(code);
CREATE INDEX IF NOT EXISTS idx_tokens_order ON download_tokens(order_id);
`);

function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  return { hash: crypto.scryptSync(String(password), salt, 64).toString('hex'), salt };
}
function verifyPassword(password, hash, salt) {
  try {
    const c = crypto.scryptSync(String(password), salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(c, 'hex'), Buffer.from(hash, 'hex'));
  } catch { return false; }
}
const token = () => crypto.randomBytes(24).toString('hex');
const getSetting = (k, d = null) => { const r = db.prepare('SELECT value FROM settings WHERE key=?').get(k); return r ? r.value : d; };
const setSetting = (k, v) => db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, String(v));
const settingsMap = () => { const o = {}; for (const r of db.prepare('SELECT key,value FROM settings').all()) o[r.key] = r.value; return o; };

module.exports = { db, DB_FILE, DATA_DIR, UPLOAD_DIR, hashPassword, verifyPassword, token, getSetting, setSetting, settingsMap };

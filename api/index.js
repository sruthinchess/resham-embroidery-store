'use strict';
/**
 * Vercel / Netlify serverless entrypoint.
 *
 * The Express app is the request handler, but on a serverless host anything can
 * go wrong at cold start — a native module missing, a read-only filesystem, the
 * catalogue file not bundled. When that happens we must not answer with
 * "This page is unavailable": we fall back to the static build in docs/, which
 * runs entirely in the browser.
 */
const fs = require('fs');
const path = require('path');

let app = null;
let bootError = null;

try {
  app = require('../server.js');
} catch (e) {
  bootError = e;
  console.error('[serverless] express app failed to boot:', e && e.message);
}

const STATIC = path.join(__dirname, '..', 'docs', 'index.html');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

function serveStatic(req, res) {
  let rel = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\/+/, '');
  if (!rel || rel === 'index.html') rel = 'index.html';
  let file = path.join(__dirname, '..', 'docs', rel);
  if (!file.startsWith(path.join(__dirname, '..', 'docs'))) file = STATIC;
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    // deep links (/designs, /design/peony-bloom) all land on the app shell
    file = STATIC;
  }
  const ext = path.extname(file).toLowerCase();
  const body = fs.readFileSync(file);
  res.statusCode = 200;
  res.setHeader('Content-Type', TYPES[ext] || 'application/octet-stream');
  res.setHeader('Cache-Control', ext === '.html' ? 'no-cache' : 'public, max-age=3600');
  res.end(body);
}

module.exports = (req, res) => {
  if (!app) return serveStatic(req, res);
  try {
    return app(req, res);
  } catch (e) {
    console.error('[serverless] request failed:', e && e.message);
    if (!res.headersSent) serveStatic(req, res);
  }
};

module.exports.serveStatic = serveStatic;
module.exports.bootError = bootError;

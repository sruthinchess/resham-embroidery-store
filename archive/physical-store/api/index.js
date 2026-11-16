'use strict';
/**
 * Vercel / Netlify serverless entrypoint.
 * The Express app is exported as the request handler; every route (API and SPA)
 * is rewritten to it by vercel.json.
 */
module.exports = require('../server.js');

'use strict';

const { getAuthMode } = require('../auth/authConfig');

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
// Auth ops that bootstrap or end a session are exempt
const EXEMPT   = ['/auth/login', '/auth/refresh', '/auth/logout'];

function csrfProtection(req, res, next) {
  if (process.env.CSRF_PROTECTION !== 'true') return next();
  if (getAuthMode() !== 'multi') return next();
  if (!MUTATING.has(req.method)) return next();
  if (EXEMPT.some((p) => req.path === p || req.path.startsWith(`${p}/`))) return next();

  const csrfCookie = req.cookies?.sap_csrf || '';
  const csrfHeader = req.headers['x-csrf-token'] || '';

  if (!csrfCookie || !csrfHeader) {
    return res.status(403).json({ error: 'CSRF token missing', hint: 'Send X-CSRF-Token header matching sap_csrf cookie' });
  }
  if (csrfCookie !== csrfHeader) {
    return res.status(403).json({ error: 'CSRF token mismatch' });
  }
  next();
}

module.exports = { csrfProtection };

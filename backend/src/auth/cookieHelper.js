'use strict';

const REFRESH_PATH = '/api/auth/refresh';
const REFRESH_TTL_MS = 7 * 24 * 3600 * 1000;
const CSRF_TTL_MS    = 24 * 3600 * 1000;

function buildCookieString(name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (opts.path)     parts.push(`Path=${opts.path}`);
  if (opts.maxAge)   parts.push(`Max-Age=${Math.floor(opts.maxAge / 1000)}`);
  if (opts.httpOnly) parts.push('HttpOnly');
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
  return parts.join('; ');
}

function setRefreshCookie(res, token) {
  res.append('Set-Cookie', buildCookieString('sap_refresh', token, {
    path: REFRESH_PATH, maxAge: REFRESH_TTL_MS, httpOnly: true, sameSite: 'Strict',
  }));
}

function clearRefreshCookie(res) {
  res.append('Set-Cookie', `sap_refresh=; Path=${REFRESH_PATH}; Max-Age=0; HttpOnly; SameSite=Strict`);
}

function setCsrfCookie(res, token) {
  // NOT HttpOnly — must be readable by JS
  res.append('Set-Cookie', buildCookieString('sap_csrf', token, {
    path: '/', maxAge: CSRF_TTL_MS, sameSite: 'Strict',
  }));
}

function clearCsrfCookie(res) {
  res.append('Set-Cookie', 'sap_csrf=; Path=/; Max-Age=0; SameSite=Strict');
}

function parseCookies(req) {
  const cookies = {};
  const header = req.headers.cookie || '';
  header.split(';').forEach((part) => {
    const eq = part.indexOf('=');
    if (eq === -1) return;
    const key = part.slice(0, eq).trim();
    try { cookies[key] = decodeURIComponent(part.slice(eq + 1).trim()); }
    catch { cookies[key] = part.slice(eq + 1).trim(); }
  });
  return cookies;
}

module.exports = { setRefreshCookie, clearRefreshCookie, setCsrfCookie, clearCsrfCookie, parseCookies };

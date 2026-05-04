'use strict';

const { getAuthMode } = require('../auth/authConfig');

const WINDOW_MS  = () => parseInt(process.env.LOGIN_RATE_LIMIT_WINDOW_MS || '900000', 10);
const MAX_LOGIN  = () => parseInt(process.env.LOGIN_RATE_LIMIT_MAX || '10', 10);
const MAX_REFRESH = () => parseInt(process.env.REFRESH_RATE_LIMIT_MAX || '30', 10);

const loginBuckets   = new Map();
const refreshBuckets = new Map();

function ipKey(req) {
  return req.headers['x-forwarded-for'] || req.ip || 'unknown';
}

function checkBucket(map, key, max, windowMs, res) {
  const now = Date.now();
  let b = map.get(key);
  if (!b || now > b.resetAt) {
    b = { count: 0, resetAt: now + windowMs };
    map.set(key, b);
  }
  b.count++;
  if (b.count > max) {
    const retryAfter = Math.ceil((b.resetAt - now) / 1000);
    res.status(429).json({ error: 'Too many attempts', retryAfter });
    return false;
  }
  return true;
}

function loginRateLimit(req, res, next) {
  if (getAuthMode() !== 'multi') return next();
  if (!checkBucket(loginBuckets, ipKey(req), MAX_LOGIN(), WINDOW_MS(), res)) return;
  next();
}

function refreshRateLimit(req, res, next) {
  if (getAuthMode() !== 'multi') return next();
  if (!checkBucket(refreshBuckets, ipKey(req), MAX_REFRESH(), WINDOW_MS(), res)) return;
  next();
}

function resetBuckets() { loginBuckets.clear(); refreshBuckets.clear(); }

module.exports = { loginRateLimit, refreshRateLimit, resetBuckets };

'use strict';

const { getAuthMode } = require('../auth/authConfig');

const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '200', 10);

const buckets = new Map();

function getKey(req) {
  if (req.user?.workspaceId) return `ws:${req.user.workspaceId}`;
  return `ip:${req.ip || 'unknown'}`;
}

function rateLimiter(req, res, next) {
  if (getAuthMode() !== 'multi') return next();

  const key = getKey(req);
  const now = Date.now();
  let bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(key, bucket);
  }

  bucket.count++;

  if (bucket.count > MAX_REQUESTS) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      retryAfter: Math.ceil((bucket.resetAt - now) / 1000),
    });
  }

  next();
}

function resetBuckets() { buckets.clear(); }

module.exports = { rateLimiter, resetBuckets };

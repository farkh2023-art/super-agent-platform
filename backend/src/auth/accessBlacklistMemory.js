'use strict';

const crypto = require('crypto');

// Map<jti_hash, { expiresAt: string }>
const _store = new Map();

function hashJti(jti) {
  return crypto.createHash('sha256').update(jti).digest('hex');
}

function add(jti, expiresAt) {
  if (!jti) return;
  const h = hashJti(jti);
  _store.set(h, { expiresAt: expiresAt || new Date(Date.now() + 900000).toISOString() });
}

function has(jti) {
  if (!jti) return false;
  const h = hashJti(jti);
  const entry = _store.get(h);
  if (!entry) return false;
  if (new Date(entry.expiresAt) < new Date()) {
    _store.delete(h);
    return false;
  }
  return true;
}

function removeExpired() {
  const now = new Date();
  let removed = 0;
  for (const [k, v] of _store) {
    if (new Date(v.expiresAt) < now) { _store.delete(k); removed++; }
  }
  return removed;
}

function count() { return _store.size; }
function clear() { _store.clear(); }

module.exports = { add, has, removeExpired, count, clear };

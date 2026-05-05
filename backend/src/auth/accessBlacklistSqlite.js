'use strict';

const crypto = require('crypto');
const authDb = require('./authDb');

function hashJti(jti) {
  return crypto.createHash('sha256').update(jti).digest('hex');
}

function db() {
  return authDb.getAuthDb();
}

function add(jti, expiresAt, metadata = {}) {
  if (!jti) return;
  const d = db();
  if (!d) return;
  const h = hashJti(jti);
  const now = new Date().toISOString();
  const exp = expiresAt || new Date(Date.now() + 900000).toISOString();
  try {
    d.prepare(`
      INSERT OR REPLACE INTO auth_jti_blacklist
        (jti_hash, user_id, expires_at, revoked_at, reason, metadata_json, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, NULL)
    `).run(h, metadata.userId || null, exp, now, metadata.reason || null, metadata ? JSON.stringify(metadata) : null);
  } catch { /* non-blocking */ }
}

function has(jti) {
  if (!jti) return false;
  const d = db();
  if (!d) return false;
  const h = hashJti(jti);
  try {
    const row = d.prepare('SELECT expires_at FROM auth_jti_blacklist WHERE jti_hash = ?').get(h);
    if (!row) return false;
    if (new Date(row.expires_at) < new Date()) return false;
    return true;
  } catch { return false; }
}

function removeExpired() {
  const d = db();
  if (!d) return 0;
  try {
    const info = d.prepare('DELETE FROM auth_jti_blacklist WHERE expires_at < ?').run(new Date().toISOString());
    return info.changes;
  } catch { return 0; }
}

function count() {
  const d = db();
  if (!d) return 0;
  try {
    return d.prepare('SELECT COUNT(*) AS n FROM auth_jti_blacklist').get().n;
  } catch { return 0; }
}

function clear() {
  const d = db();
  if (!d) return;
  try { d.prepare('DELETE FROM auth_jti_blacklist').run(); } catch { /* non-blocking */ }
}

module.exports = { add, has, removeExpired, count, clear, hashJti };

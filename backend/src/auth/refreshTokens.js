'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const authDb = require('./authDb');

const REFRESH_TTL_MS = 7 * 24 * 3600 * 1000;

// Tokens are always stored as SHA-256 hashes — raw token never persisted.
function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function storePath() {
  const base = process.env.DATA_DIR
    ? path.resolve(__dirname, '..', '..', process.env.DATA_DIR)
    : path.resolve(__dirname, '..', '..', 'data');
  return path.join(base, 'refresh-tokens.json');
}

function read() {
  try {
    const p = storePath();
    if (!fs.existsSync(p)) return [];
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch { return []; }
}

function write(tokens) {
  const p = storePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(tokens, null, 2), 'utf8');
}

function issueRefreshToken(userId, meta = {}) {
  const id = crypto.randomUUID();
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS).toISOString();
  const createdAt = new Date().toISOString();
  const ipAddress = meta.ipAddress || null;
  const userAgent = meta.userAgent || null;

  const db = authDb.getAuthDb();
  if (db) {
    // Prune expired/revoked entries, then insert
    db.prepare(`DELETE FROM auth_refresh_tokens WHERE expires_at < ? OR revoked_at IS NOT NULL`).run(createdAt);
    db.prepare(`INSERT INTO auth_refresh_tokens (id, token_hash, user_id, expires_at, revoked_at, created_at, ip_address, user_agent, last_used_at) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)`).run(id, tokenHash, userId, expiresAt, createdAt, ipAddress, userAgent, createdAt);
  } else {
    const tokens = read();
    const cutoff = new Date();
    const pruned = tokens.filter((t) => !t.revokedAt && new Date(t.expiresAt) > cutoff);
    pruned.push({ id, tokenHash, userId, expiresAt, revokedAt: null, createdAt, ipAddress, userAgent, lastUsedAt: createdAt });
    write(pruned);
  }
  return token;
}

function verifyRefreshToken(candidate) {
  if (!candidate || typeof candidate !== 'string') return null;
  const h = hashToken(candidate);
  const now = new Date().toISOString();

  const db = authDb.getAuthDb();
  if (db) {
    const row = db.prepare(`SELECT id, user_id, expires_at, revoked_at, created_at FROM auth_refresh_tokens WHERE token_hash = ?`).get(h);
    if (!row || row.revoked_at) return null;
    if (new Date(row.expires_at) < new Date()) return null;
    db.prepare(`UPDATE auth_refresh_tokens SET last_used_at = ? WHERE id = ?`).run(now, row.id);
    return { id: row.id, userId: row.user_id, expiresAt: row.expires_at, createdAt: row.created_at };
  }

  const tokens = read();
  // Support new format (tokenHash) and old format (token) for backward compat
  const entry = tokens.find((t) => t.tokenHash === h || t.token === candidate);
  if (!entry) return null;
  if (entry.revokedAt) return null;
  if (new Date(entry.expiresAt) < new Date()) return null;
  entry.lastUsedAt = now;
  write(tokens);
  return entry;
}

function revokeRefreshToken(token) {
  if (!token) return;
  const h = hashToken(token);

  const db = authDb.getAuthDb();
  if (db) {
    db.prepare(`UPDATE auth_refresh_tokens SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL`).run(new Date().toISOString(), h);
    return;
  }

  const tokens = read();
  const entry = tokens.find((t) => t.tokenHash === h || t.token === token);
  if (entry && !entry.revokedAt) {
    entry.revokedAt = new Date().toISOString();
    write(tokens);
  }
}

function revokeAllForUser(userId) {
  const db = authDb.getAuthDb();
  if (db) {
    db.prepare(`UPDATE auth_refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`).run(new Date().toISOString(), userId);
    return;
  }

  const tokens = read();
  let changed = false;
  tokens.forEach((t) => {
    if (t.userId === userId && !t.revokedAt) {
      t.revokedAt = new Date().toISOString();
      changed = true;
    }
  });
  if (changed) write(tokens);
}

// Returns active sessions for display — never exposes raw tokens or hashes.
// options: { filterUserId, active, limit, offset }
function listActiveSessions(filterUserId = null, options = {}) {
  const now = new Date();
  const limit = Math.max(1, Math.min(parseInt(options.limit || 50, 10), 500));
  const offset = Math.max(0, parseInt(options.offset || 0, 10));
  const activeOnly = options.active !== 'false' && options.active !== false;

  const db = authDb.getAuthDb();
  if (db) {
    let base = `FROM auth_refresh_tokens WHERE 1=1`;
    const params = [];
    if (activeOnly) { base += ` AND revoked_at IS NULL AND expires_at > ?`; params.push(now.toISOString()); }
    else { base += ` AND expires_at > ?`; params.push(now.toISOString()); }
    if (filterUserId) { base += ` AND user_id = ?`; params.push(filterUserId); }

    const total = db.prepare(`SELECT COUNT(*) AS n ${base}`).get(...params).n;
    const rows = db.prepare(`SELECT id, user_id AS userId, expires_at AS expiresAt, created_at AS createdAt, ip_address AS ipAddress, user_agent AS userAgent, last_used_at AS lastUsedAt ${base} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
    return { items: rows, total, limit, offset, hasMore: offset + rows.length < total };
  }

  const tokens = read();
  let filtered = tokens.filter((t) => new Date(t.expiresAt) > now);
  if (activeOnly) filtered = filtered.filter((t) => !t.revokedAt);
  if (filterUserId) filtered = filtered.filter((t) => t.userId === filterUserId);
  filtered = filtered.map(({ id, userId, expiresAt, createdAt, ipAddress, userAgent, lastUsedAt }) =>
    ({ id, userId, expiresAt, createdAt, ipAddress: ipAddress || null, userAgent: userAgent || null, lastUsedAt: lastUsedAt || null }));
  filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const total = filtered.length;
  const items = filtered.slice(offset, offset + limit);
  return { items, total, limit, offset, hasMore: offset + items.length < total };
}

function revokeSessionById(sessionId) {
  const db = authDb.getAuthDb();
  if (db) {
    const info = db.prepare(`UPDATE auth_refresh_tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL`).run(new Date().toISOString(), sessionId);
    return info.changes > 0;
  }

  const tokens = read();
  const entry = tokens.find((t) => t.id === sessionId);
  if (!entry || entry.revokedAt) return false;
  entry.revokedAt = new Date().toISOString();
  write(tokens);
  return true;
}

function cleanupExpiredTokens() {
  const cutoff = new Date().toISOString();
  const db = authDb.getAuthDb();
  if (db) {
    const info = db.prepare(`DELETE FROM auth_refresh_tokens WHERE expires_at < ? OR revoked_at IS NOT NULL`).run(cutoff);
    return { deleted: info.changes };
  }

  const tokens = read();
  const cutoffDate = new Date();
  const kept = tokens.filter((t) => !t.revokedAt && new Date(t.expiresAt) > cutoffDate);
  const deleted = tokens.length - kept.length;
  if (deleted > 0) write(kept);
  return { deleted };
}

module.exports = {
  issueRefreshToken,
  verifyRefreshToken,
  revokeRefreshToken,
  revokeAllForUser,
  listActiveSessions,
  revokeSessionById,
  cleanupExpiredTokens,
  hashToken,
};

'use strict';

const fs = require('fs');
const path = require('path');
const authDb = require('./authDb');
const { cleanupExpiredTokens, hashToken } = require('./refreshTokens');
const { cleanupOldAuditEntries } = require('../middleware/auditLog');

// ── Cleanup ───────────────────────────────────────────────────────────────────

function runCleanup(options = {}) {
  const tokens = cleanupExpiredTokens();
  const audit = cleanupOldAuditEntries(options.auditRetentionDays);
  return { tokens, audit, runAt: new Date().toISOString() };
}

// ── JSON → SQLite migration ───────────────────────────────────────────────────

function migrateJsonToSqlite() {
  const db = authDb.getAuthDb();
  if (!db) return { skipped: true, reason: 'AUTH_SQLITE not enabled' };

  const results = { users: 0, tokens: 0, auditEntries: 0, workspaces: 0 };
  const dataBase = process.env.DATA_DIR
    ? path.resolve(__dirname, '..', '..', process.env.DATA_DIR)
    : path.resolve(__dirname, '..', '..', 'data');

  // Migrate users
  const usersFile = path.join(dataBase, 'users.json');
  if (fs.existsSync(usersFile) && db.prepare('SELECT COUNT(*) AS n FROM auth_users').get().n === 0) {
    try {
      const users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
      const stmt = db.prepare(`INSERT OR IGNORE INTO auth_users (id, username, password_hash, role, workspace_id, disabled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
      db.transaction(() => {
        for (const u of users) {
          stmt.run(u.id, u.username, u.passwordHash || u.password_hash, u.role || 'user', u.workspaceId || u.workspace_id || null, u.disabled ? 1 : 0, u.createdAt || u.created_at || new Date().toISOString());
          results.users++;
        }
      })();
    } catch { /* non-blocking */ }
  }

  // Migrate refresh tokens (re-hash raw tokens if needed)
  const rtFile = path.join(dataBase, 'refresh-tokens.json');
  if (fs.existsSync(rtFile) && db.prepare('SELECT COUNT(*) AS n FROM auth_refresh_tokens').get().n === 0) {
    try {
      const tokens = JSON.parse(fs.readFileSync(rtFile, 'utf8'));
      const stmt = db.prepare(`INSERT OR IGNORE INTO auth_refresh_tokens (id, token_hash, user_id, expires_at, revoked_at, created_at) VALUES (?, ?, ?, ?, ?, ?)`);
      const { randomUUID } = require('crypto');
      db.transaction(() => {
        for (const t of tokens) {
          // Old entries have raw `token`, new ones have `tokenHash`
          const tokenHash = t.tokenHash || hashToken(t.token || '');
          if (!tokenHash) continue;
          stmt.run(t.id || randomUUID(), tokenHash, t.userId || t.user_id, t.expiresAt || t.expires_at, t.revokedAt || t.revoked_at || null, t.createdAt || t.created_at || new Date().toISOString());
          results.tokens++;
        }
      })();
    } catch { /* non-blocking */ }
  }

  // Migrate audit log
  const auditFile = path.join(dataBase, 'audit-log.json');
  if (fs.existsSync(auditFile) && db.prepare('SELECT COUNT(*) AS n FROM auth_audit_log').get().n === 0) {
    try {
      const entries = JSON.parse(fs.readFileSync(auditFile, 'utf8'));
      const stmt = db.prepare(`INSERT OR IGNORE INTO auth_audit_log (id, user_id, username, workspace_id, method, path, status_code, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      db.transaction(() => {
        for (const e of entries) {
          stmt.run(e.id, e.userId || e.user_id || null, e.username || null, e.workspaceId || e.workspace_id || null, e.method, e.path, e.statusCode || e.status_code, e.durationMs || e.duration_ms || 0, e.createdAt || e.created_at);
          results.auditEntries++;
        }
      })();
    } catch { /* non-blocking */ }
  }

  // Migrate workspaces
  const wsFile = path.join(dataBase, 'workspaces.json');
  if (fs.existsSync(wsFile) && db.prepare('SELECT COUNT(*) AS n FROM auth_workspaces').get().n === 0) {
    try {
      const workspaces = JSON.parse(fs.readFileSync(wsFile, 'utf8'));
      const stmt = db.prepare(`INSERT OR IGNORE INTO auth_workspaces (id, name, owner_id, limits_json, created_at) VALUES (?, ?, ?, ?, ?)`);
      db.transaction(() => {
        for (const w of workspaces) {
          stmt.run(w.id, w.name, w.ownerId || w.owner_id || null, JSON.stringify(w.limits || {}), w.createdAt || w.created_at || new Date().toISOString());
          results.workspaces++;
        }
      })();
    } catch { /* non-blocking */ }
  }

  return { migrated: true, results };
}

module.exports = { runCleanup, migrateJsonToSqlite };

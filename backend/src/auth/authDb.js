'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const AUTH_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS auth_users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  workspace_id TEXT,
  disabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_art_token_hash ON auth_refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_art_user_id ON auth_refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_art_expires_at ON auth_refresh_tokens(expires_at);

CREATE TABLE IF NOT EXISTS auth_audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  username TEXT,
  workspace_id TEXT,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status_code INTEGER,
  duration_ms INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_aal_created_at ON auth_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_aal_username ON auth_audit_log(username);
CREATE INDEX IF NOT EXISTS idx_aal_user_id ON auth_audit_log(user_id);

CREATE TABLE IF NOT EXISTS auth_workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id TEXT,
  limits_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

let _db = null;
let _dbPath = null;

function resolveAuthDbPath() {
  const base = process.env.DATA_DIR
    ? path.resolve(__dirname, '..', '..', process.env.DATA_DIR)
    : path.resolve(__dirname, '..', '..', 'data');
  return path.join(base, 'auth.sqlite');
}

function isAuthSqliteEnabled() {
  if (process.env.AUTH_SQLITE === 'false') return false;
  if (process.env.AUTH_SQLITE === 'true') return true;
  const mode = (process.env.STORAGE_MODE || 'json').toLowerCase();
  return mode === 'sqlite' || mode === 'hybrid';
}

function getAuthDb() {
  if (!isAuthSqliteEnabled()) return null;
  const dbPath = resolveAuthDbPath();
  if (_db && _dbPath === dbPath) return _db;
  if (_db) { try { _db.close(); } catch {} }
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(AUTH_SCHEMA_SQL);
  _db = db;
  _dbPath = dbPath;
  return db;
}

function closeAuthDb() {
  if (_db) {
    try { _db.close(); } catch {}
    _db = null;
    _dbPath = null;
  }
}

function isAvailable() {
  if (!isAuthSqliteEnabled()) return false;
  try { getAuthDb(); return true; } catch { return false; }
}

module.exports = { getAuthDb, closeAuthDb, isAvailable, isAuthSqliteEnabled, resolveAuthDbPath, AUTH_SCHEMA_SQL };

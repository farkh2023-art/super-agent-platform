'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { SCHEMA_SQL } = require('./schema');

let cached = null;
let cachedPath = null;

function resolveDbPath(dbPath = process.env.SQLITE_DB_PATH) {
  const configured = dbPath || path.resolve(__dirname, '..', '..', 'data', 'super-agent-platform.sqlite');
  if (path.isAbsolute(configured)) return configured;
  const cwdPath = path.resolve(process.cwd(), configured);
  if (configured.startsWith('backend') || fs.existsSync(path.dirname(cwdPath))) return cwdPath;
  return path.resolve(__dirname, '..', '..', configured);
}

function getWalEnabled(db) {
  try {
    return String(db.pragma('journal_mode', { simple: true })).toLowerCase() === 'wal';
  } catch {
    return false;
  }
}

function ensureColumn(db, table, name, definition) {
  try {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
    if (!columns.includes(name)) db.prepare(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`).run();
  } catch {
    // Schema creation handles fresh databases; incompatible old files surface on actual use.
  }
}

function ensureCompatibleSchema(db) {
  ensureColumn(db, 'storage_events', 'severity', 'TEXT');
  ensureColumn(db, 'storage_events', 'message', 'TEXT');
  ensureColumn(db, 'storage_events', 'created_at', 'TEXT');
  ensureColumn(db, 'storage_events', 'metadata_json', 'TEXT');
}

function openDatabase(options = {}) {
  const dbPath = resolveDbPath(options.dbPath);
  if (cached && cachedPath === dbPath) return cached;
  if (cached) closeDatabase();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  if (String(process.env.SQLITE_ENABLE_WAL || 'true').toLowerCase() === 'true') {
    db.pragma('journal_mode = WAL');
  }
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  ensureCompatibleSchema(db);
  cached = db;
  cachedPath = dbPath;
  return db;
}

function closeDatabase() {
  if (cached) {
    cached.close();
    cached = null;
    cachedPath = null;
  }
}

function getSqliteStatus() {
  const dbPath = resolveDbPath();
  const exists = fs.existsSync(dbPath);
  if (!exists && String(process.env.STORAGE_MODE || 'json').toLowerCase() === 'json') {
    return {
      enabled: false,
      connected: false,
      dbPath,
      exists,
      wal: false,
    };
  }
  try {
    const db = openDatabase();
    return {
      enabled: true,
      connected: true,
      dbPath,
      exists,
      wal: getWalEnabled(db),
    };
  } catch (err) {
    return {
      enabled: false,
      connected: false,
      dbPath,
      exists,
      wal: false,
      error: err.message,
    };
  }
}

module.exports = {
  resolveDbPath,
  openDatabase,
  closeDatabase,
  getSqliteStatus,
};

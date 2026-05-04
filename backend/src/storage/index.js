'use strict';

const fs = require('fs');
const path = require('path');
const jsonStore = require('./jsonStore');
const sqliteStore = require('./sqliteStore');
const hybridStore = require('./hybridStore');
const { getSqliteStatus, resolveDbPath } = require('./sqlite');
const { COLLECTIONS } = require('./schema');
const events = require('./storageEvents');
const validationReports = require('./validationReports');

function mode() {
  const value = String(process.env.STORAGE_MODE || 'json').toLowerCase();
  return ['json', 'sqlite', 'hybrid'].includes(value) ? value : 'json';
}

function adapter() {
  if (mode() === 'sqlite') return sqliteStore;
  if (mode() === 'hybrid') return hybridStore;
  return jsonStore;
}

function list(collection, options) {
  return adapter().list(collection, options);
}

function get(collection, id) {
  return adapter().get(collection, id);
}

function create(collection, item) {
  return adapter().create(collection, item);
}

function update(collection, id, patch) {
  return adapter().update(collection, id, patch);
}

function remove(collection, id) {
  return adapter().remove(collection, id);
}

function clear(collection) {
  return adapter().clear(collection);
}

function search(collection, predicate) {
  return adapter().search(collection, predicate);
}

function count(collection) {
  return adapter().count(collection);
}

function readRecord(name) {
  return adapter().readRecord ? adapter().readRecord(name) : jsonStore.readRecord(name);
}

function writeRecord(name, data) {
  return adapter().writeRecord ? adapter().writeRecord(name, data) : jsonStore.writeRecord(name, data);
}

function safeDbPath(dbPath) {
  if (!dbPath) return null;
  const normalized = dbPath.replace(/\\/g, '/');
  const marker = '/backend/data/';
  if (normalized.includes(marker)) return 'backend/data/*.sqlite';
  return path.basename(dbPath).replace(/\.sqlite$/i, '*.sqlite');
}

function collectionStatus(collection) {
  let jsonCount = 0;
  let sqliteCount = 0;
  let sqliteError = null;
  try { jsonCount = jsonStore.count(collection); } catch { jsonCount = 0; }
  try { sqliteCount = sqliteStore.count(collection); } catch (err) { sqliteError = err.message; }
  return {
    jsonCount,
    sqliteCount,
    inSync: sqliteError ? false : jsonCount === sqliteCount,
    sqliteError,
  };
}

function getStorageStatus() {
  const currentMode = mode();
  const sqlite = getSqliteStatus();
  const collections = {};
  for (const collection of COLLECTIONS) collections[collection] = collectionStatus(collection);
  const warnings = [];
  const dbPath = resolveDbPath();
  if (currentMode === 'json' && fs.existsSync(dbPath)) warnings.push('STORAGE_MODE=json while a SQLite database exists.');
  const lastValidationAt = events.latestEventAt(['validation_completed', 'validation_failed']);
  if (currentMode === 'sqlite' && !lastValidationAt) warnings.push('STORAGE_MODE=sqlite without a recorded validation event.');
  return {
    mode: currentMode,
    readPreference: process.env.SQLITE_READ_PREFERENCE === 'sqlite' ? 'sqlite' : 'json',
    doubleWrite: String(process.env.SQLITE_DOUBLE_WRITE || 'false').toLowerCase() === 'true',
    sqlite: {
      enabled: sqlite.enabled,
      connected: sqlite.connected,
      wal: sqlite.wal,
      dbPathSafe: safeDbPath(sqlite.dbPath),
      exists: sqlite.exists,
      error: sqlite.error,
    },
    collections,
    lastSyncCheckAt: new Date().toISOString(),
    lastMigrationAt: events.latestEventAt(['migration_completed']),
    lastValidationAt,
    lastValidationReport: (() => { try { const r = validationReports.listValidationReports(); return r[0] || null; } catch { return null; } })(),
    warnings,
    admin: {
      enabled: String(process.env.STORAGE_ADMIN_ENABLED || 'true').toLowerCase() === 'true',
      allowMutations: String(process.env.STORAGE_ADMIN_ALLOW_MUTATIONS || 'false').toLowerCase() === 'true',
      requireConfirmation: String(process.env.STORAGE_ADMIN_REQUIRE_CONFIRMATION || 'true').toLowerCase() === 'true',
    },
  };
}

module.exports = {
  DATA_DIR: jsonStore.DATA_DIR,
  list,
  get,
  create,
  update,
  remove,
  clear,
  search,
  count,
  readRecord,
  writeRecord,
  getStorageStatus,
  findAll: list,
  findById: get,
};

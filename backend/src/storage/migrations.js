'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jsonStore = require('./jsonStore');
const sqliteStore = require('./sqliteStore');
const { openDatabase, resolveDbPath } = require('./sqlite');
const { COLLECTIONS } = require('./schema');
const events = require('./storageEvents');

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function backupJsonData() {
  const source = jsonStore.DATA_DIR;
  const target = path.resolve(__dirname, '..', '..', 'migration-backups', `json-${nowStamp()}`);
  fs.mkdirSync(target, { recursive: true });
  if (!fs.existsSync(source)) return target;
  for (const name of fs.readdirSync(source)) {
    if (!name.endsWith('.json')) continue;
    fs.copyFileSync(path.join(source, name), path.join(target, name));
  }
  return target;
}

function collectionSummary(collection) {
  const items = jsonStore.list(collection);
  return { collection, count: items.length, ids: items.map((item) => item.id).filter(Boolean) };
}

function migrateJsonToSqlite(options = {}) {
  const started = Date.now();
  const dryRun = options.dryRun === true;
  const backup = options.backup === true || String(process.env.SQLITE_MIGRATION_BACKUP || 'true').toLowerCase() === 'true';
  const summary = {
    dryRun,
    dbPath: resolveDbPath(options.dbPath),
    collections: [],
    errors: [],
    warnings: [],
    backupPath: null,
    durationMs: 0,
  };

  events.createEvent({ type: dryRun ? 'migration_dry_run_started' : 'migration_started', severity: 'info', message: 'Storage migration requested' });
  if (!dryRun && backup) summary.backupPath = backupJsonData();
  if (!dryRun) openDatabase({ dbPath: options.dbPath });

  for (const collection of COLLECTIONS) {
    const items = jsonStore.list(collection);
    summary.collections.push({ collection, count: items.length });
    if (dryRun) continue;
    if (options.force === true) sqliteStore.clear(collection);
    for (const item of items) {
      try { sqliteStore.upsert(collection, item); }
      catch (err) { summary.errors.push({ collection, id: item.id, error: err.message }); }
    }
  }

  summary.durationMs = Date.now() - started;
  events.createEvent({
    type: dryRun ? 'migration_dry_run_completed' : 'migration_completed',
    severity: summary.errors.length ? 'warning' : 'info',
    message: dryRun ? 'Storage migration dry-run completed' : 'Storage migration completed',
    metadata: { collections: summary.collections, errors: summary.errors.length, durationMs: summary.durationMs },
  });
  return summary;
}

function checksumItem(item) {
  return crypto.createHash('sha256').update(JSON.stringify(item || {})).digest('hex');
}

function validateSqliteMigration(options = {}) {
  const started = Date.now();
  const result = {
    success: true,
    dbPath: resolveDbPath(options.dbPath),
    collections: {},
    errors: [],
    durationMs: 0,
  };

  try { openDatabase({ dbPath: options.dbPath }); }
  catch (err) {
    result.success = false;
    result.errors.push({ error: err.message });
    return result;
  }

  for (const collection of COLLECTIONS) {
    const jsonItems = jsonStore.list(collection);
    let sqliteItems = [];
    try { sqliteItems = sqliteStore.list(collection); }
    catch (err) {
      result.success = false;
      result.errors.push({ collection, error: err.message });
      continue;
    }
    const jsonIds = new Set(jsonItems.map((item) => item.id).filter(Boolean));
    const sqliteIds = new Set(sqliteItems.map((item) => item.id).filter(Boolean));
    const missingInSqlite = [...jsonIds].filter((id) => !sqliteIds.has(id));
    const extraInSqlite = [...sqliteIds].filter((id) => !jsonIds.has(id));
    const sampleSize = Math.max(0, parseInt(options.sampleSize || '10', 10));
    const checksumMismatches = [];
    for (const item of jsonItems.slice(0, sampleSize)) {
      const other = sqliteItems.find((candidate) => candidate.id === item.id);
      if (other && checksumItem(item) !== checksumItem(other)) checksumMismatches.push(item.id);
    }
    const inSync = jsonItems.length === sqliteItems.length && missingInSqlite.length === 0 && extraInSqlite.length === 0 && checksumMismatches.length === 0;
    if (!inSync) result.success = false;
    result.collections[collection] = {
      jsonCount: jsonItems.length,
      sqliteCount: sqliteItems.length,
      missingInSqlite,
      extraInSqlite,
      checksumMismatches,
      inSync,
    };
  }

  result.durationMs = Date.now() - started;
  events.createEvent({
    type: result.success ? 'validation_completed' : 'validation_failed',
    severity: result.success ? 'info' : 'warning',
    message: result.success ? 'SQLite migration validation passed' : 'SQLite migration validation found differences',
    metadata: { durationMs: result.durationMs },
  });
  return result;
}

function rollbackSqliteToJson(options = {}) {
  const dryRun = options.dryRun === true;
  const backupPath = backupJsonData();
  const result = { dryRun, backupPath, restored: {}, errors: [] };
  events.createEvent({ type: 'rollback_requested', severity: 'warning', message: 'Storage rollback requested' });
  if (options.fromBackup) return { ...result, message: 'Backup rollback requires selecting a backup path manually.' };

  for (const collection of COLLECTIONS) {
    try {
      const items = sqliteStore.list(collection);
      result.restored[collection] = items.length;
      if (!dryRun) jsonStore.writeCollection(collection, items);
    } catch (err) {
      result.errors.push({ collection, error: err.message });
    }
  }
  return result;
}

module.exports = {
  collectionSummary,
  migrateJsonToSqlite,
  validateSqliteMigration,
  rollbackSqliteToJson,
  backupJsonData,
};

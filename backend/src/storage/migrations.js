'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jsonStore = require('./jsonStore');
const sqliteStore = require('./sqliteStore');
const { openDatabase, resolveDbPath } = require('./sqlite');
const { COLLECTIONS } = require('./schema');
const events = require('./storageEvents');
const validationReports = require('./validationReports');

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
  try {
    result.reportFilename = validationReports.saveValidationReport(result);
  } catch { /* non-blocking */ }
  return result;
}

function compareIdByIdAllCollections() {
  const summary = { collections: {}, desynced: [] };
  for (const collection of COLLECTIONS) {
    const jsonItems = jsonStore.list(collection);
    let sqliteItems = [];
    let error = null;
    try { sqliteItems = sqliteStore.list(collection); } catch (err) { error = err.message; }
    const jsonMap = new Map(jsonItems.map((i) => [i.id, i]).filter(([id]) => id));
    const sqlMap = new Map(sqliteItems.map((i) => [i.id, i]).filter(([id]) => id));
    const missingInSqlite = [...jsonMap.keys()].filter((id) => !sqlMap.has(id));
    const extraInSqlite = [...sqlMap.keys()].filter((id) => !jsonMap.has(id));
    const checksumMismatches = [];
    for (const [id, item] of jsonMap) {
      const other = sqlMap.get(id);
      if (other && checksumItem(item) !== checksumItem(other)) checksumMismatches.push(id);
    }
    const inSync = !error && missingInSqlite.length === 0 && extraInSqlite.length === 0 && checksumMismatches.length === 0;
    summary.collections[collection] = { jsonCount: jsonItems.length, sqliteCount: sqliteItems.length, missingInSqlite, extraInSqlite, checksumMismatches, inSync, error };
    if (!inSync) summary.desynced.push(collection);
  }
  summary.allInSync = summary.desynced.length === 0;
  return summary;
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

function getMigrationReadinessGate() {
  const { getSqliteStatus } = require('./sqlite');
  const sqlite = getSqliteStatus();
  const blockers = [];
  const warnings = [];

  if (!sqlite.exists) blockers.push('SQLite database does not exist — run dry-run then migration first');
  if (sqlite.exists && !sqlite.connected) blockers.push('SQLite database cannot be opened');

  let totalJson = 0;
  let totalSqlite = 0;
  for (const collection of COLLECTIONS) {
    const jc = jsonStore.count ? jsonStore.count(collection) : jsonStore.list(collection).length;
    let sc = 0;
    try { sc = sqliteStore.count ? sqliteStore.count(collection) : sqliteStore.list(collection).length; } catch { /* db may not exist */ }
    totalJson += jc;
    totalSqlite += sc;
    if (jc > 0 && sc < jc) warnings.push(`Collection '${collection}': ${jc - sc} item(s) missing in SQLite`);
  }

  const lastValidationAt = events.latestEventAt(['validation_completed']);
  if (!lastValidationAt) warnings.push('No successful validation recorded — run validation before switching');
  const lastMigrationAt = events.latestEventAt(['migration_completed']);
  if (!lastMigrationAt) warnings.push('No completed migration recorded — run migration before switching');

  return {
    ready: blockers.length === 0,
    blockers,
    warnings,
    lastValidationAt,
    lastMigrationAt,
    totalJson,
    totalSqlite,
    sqlite: { exists: sqlite.exists, connected: sqlite.connected, wal: sqlite.wal },
  };
}

module.exports = {
  collectionSummary,
  migrateJsonToSqlite,
  validateSqliteMigration,
  rollbackSqliteToJson,
  backupJsonData,
  compareIdByIdAllCollections,
  getMigrationReadinessGate,
};

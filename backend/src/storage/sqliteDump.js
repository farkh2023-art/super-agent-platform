'use strict';

const fs = require('fs');
const path = require('path');
const sqliteStore = require('./sqliteStore');
const { openDatabase, resolveDbPath } = require('./sqlite');
const { COLLECTIONS } = require('./schema');
const { sanitizeValue } = require('./storageEvents');

function dumpsDir() {
  return path.resolve(__dirname, '..', '..', 'data', 'sqlite-dumps');
}

function createSqliteDump(options = {}) {
  const dbPath = resolveDbPath(options.dbPath);
  if (!fs.existsSync(dbPath)) {
    const err = new Error('SQLite database unavailable');
    err.code = 'SQLITE_UNAVAILABLE';
    throw err;
  }
  openDatabase({ dbPath: options.dbPath });
  const dump = {
    exportedAt: new Date().toISOString(),
    dbPathSafe: 'backend/data/*.sqlite',
    vectorsIncluded: false,
    collections: {},
  };

  for (const collection of COLLECTIONS) {
    dump.collections[collection] = sqliteStore.list(collection).map((item) => sanitizeValue(item));
  }

  const db = openDatabase({ dbPath: options.dbPath });
  dump.storageEvents = db.prepare(`
    SELECT id, type, collection, severity, message, created_at AS createdAt, metadata_json AS metadataJson
    FROM storage_events ORDER BY created_at DESC LIMIT 100
  `).all().map((row) => ({
    id: row.id,
    type: row.type,
    collection: row.collection,
    severity: row.severity,
    message: row.message,
    createdAt: row.createdAt,
    metadata: row.metadataJson ? sanitizeValue(JSON.parse(row.metadataJson)) : {},
  }));

  const dir = options.outputDir || dumpsDir();
  fs.mkdirSync(dir, { recursive: true });
  const filename = `sqlite-dump-${new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '-')}.json`;
  const outPath = path.join(dir, filename);
  fs.writeFileSync(outPath, JSON.stringify(dump, null, 2), 'utf8');
  return {
    path: outPath,
    filename,
    dbPath,
    dump,
  };
}

module.exports = { createSqliteDump, dumpsDir };

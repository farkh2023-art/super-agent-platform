'use strict';

const crypto = require('crypto');
const fs = require('fs');
const jsonStore = require('./jsonStore');
const sqliteStore = require('./sqliteStore');
const { COLLECTIONS } = require('./schema');
const { openDatabase, resolveDbPath } = require('./sqlite');
const events = require('./storageEvents');

const VOLATILE_KEYS = new Set(['lastSyncCheckAt']);

function normalizeForChecksum(value) {
  if (Array.isArray(value)) return value.map(normalizeForChecksum);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, key) => {
      if (!VOLATILE_KEYS.has(key)) acc[key] = normalizeForChecksum(value[key]);
      return acc;
    }, {});
  }
  return value;
}

function hashItems(items) {
  const normalized = items
    .map(normalizeForChecksum)
    .sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

function computeJsonCollectionChecksum(collection) {
  const items = jsonStore.list(collection);
  return { checksum: hashItems(items), count: items.length };
}

function computeSqliteCollectionChecksum(collection) {
  try {
    if (!fs.existsSync(resolveDbPath())) {
      return { checksum: null, count: 0, available: false, error: 'SQLite database unavailable' };
    }
    openDatabase();
    const items = sqliteStore.list(collection);
    return { checksum: hashItems(items), count: items.length, available: true };
  } catch (err) {
    return { checksum: null, count: 0, available: false, error: err.message };
  }
}

function compareCollectionChecksums(collection) {
  const json = computeJsonCollectionChecksum(collection);
  const sqlite = computeSqliteCollectionChecksum(collection);
  const match = sqlite.available && json.checksum === sqlite.checksum && json.count === sqlite.count;
  if (sqlite.available && !match) {
    events.createEvent({ type: 'checksum_mismatch', collection, severity: 'warning', message: `Checksum mismatch for ${collection}` });
  }
  return {
    jsonChecksum: json.checksum,
    sqliteChecksum: sqlite.checksum,
    match,
    available: sqlite.available,
    jsonCount: json.count,
    sqliteCount: sqlite.count,
    error: sqlite.error,
  };
}

function compareAllCollectionChecksums() {
  const collections = {};
  let matching = 0;
  let mismatching = 0;
  for (const collection of COLLECTIONS) {
    const row = compareCollectionChecksums(collection);
    collections[collection] = row;
    if (row.match) matching++;
    else mismatching++;
  }
  return {
    collections,
    summary: {
      totalCollections: COLLECTIONS.length,
      matching,
      mismatching,
    },
  };
}

function generateChecksumReportMarkdown(result) {
  const now = new Date().toISOString();
  const { summary, collections } = result;
  const rows = Object.entries(collections).map(([name, row]) => {
    const match = row.match ? '✓' : '✗';
    const avail = row.available ? row.sqliteCount : 'N/A';
    return `| ${name} | ${row.jsonCount} | ${avail} | ${match} |`;
  });
  return [
    '# SQLite Checksum Report',
    '',
    `Generated at: ${now}`,
    '',
    '## Summary',
    '',
    `- Total collections: ${summary.totalCollections}`,
    `- Matching: ${summary.matching}`,
    `- Mismatching: ${summary.mismatching}`,
    '',
    '## Collections',
    '',
    '| Collection | JSON count | SQLite count | Match |',
    '|---|---|---|---|',
    ...rows,
  ].join('\n');
}

function detectAndAlertDesyncs() {
  const result = compareAllCollectionChecksums();
  const alerts = [];
  for (const [collection, row] of Object.entries(result.collections)) {
    if (row.available && !row.match) {
      alerts.push({ collection, jsonCount: row.jsonCount, sqliteCount: row.sqliteCount });
    }
  }
  return { checked: result.summary.totalCollections, desynced: alerts.length, alerts };
}

module.exports = {
  normalizeForChecksum,
  computeJsonCollectionChecksum,
  computeSqliteCollectionChecksum,
  compareCollectionChecksums,
  compareAllCollectionChecksums,
  generateChecksumReportMarkdown,
  detectAndAlertDesyncs,
};

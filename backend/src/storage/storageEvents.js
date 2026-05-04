'use strict';

const crypto = require('crypto');
const jsonStore = require('./jsonStore');
const { openDatabase } = require('./sqlite');

const SENSITIVE = /(sk-ant-[A-Za-z0-9_-]+|sk-[A-Za-z0-9_-]+|Bearer\s+[A-Za-z0-9._-]+|API_KEY\s*[:=]\s*[^,\s}]+)/gi;

function limit() {
  return Math.max(1, parseInt(process.env.STORAGE_SYNC_HISTORY_LIMIT || '100', 10));
}

function sanitizeValue(value) {
  if (typeof value === 'string') return value.replace(SENSITIVE, '[REDACTED]');
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      if (/secret|token|password|api.?key/i.test(key)) out[key] = '[REDACTED]';
      else out[key] = sanitizeValue(val);
    }
    return out;
  }
  return value;
}

function sqliteAvailable() {
  try {
    const dbPath = require('./sqlite').resolveDbPath();
    if (!require('fs').existsSync(dbPath) && String(process.env.STORAGE_MODE || 'json').toLowerCase() === 'json') return false;
    openDatabase();
    return true;
  } catch {
    return false;
  }
}

function createEvent({ type, collection = null, severity = 'info', message = '', metadata = {} }) {
  const event = {
    id: crypto.randomUUID(),
    type: String(type || 'storage_event').slice(0, 80),
    collection: collection ? String(collection).slice(0, 80) : null,
    severity: ['info', 'warning', 'error'].includes(severity) ? severity : 'info',
    message: sanitizeValue(String(message || '')).slice(0, 500),
    createdAt: new Date().toISOString(),
    metadata: sanitizeValue(metadata || {}),
  };

  if (sqliteAvailable()) {
    openDatabase().prepare(`
      INSERT INTO storage_events (id, type, collection, severity, message, created_at, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(event.id, event.type, event.collection, event.severity, event.message, event.createdAt, JSON.stringify(event.metadata));
  } else {
    const events = jsonStore.readCollection('storage_events');
    events.push(event);
    jsonStore.writeCollection('storage_events', events.slice(-limit()));
  }

  return event;
}

function listEvents(options = {}) {
  const max = Math.max(1, Math.min(parseInt(options.limit || limit(), 10), 500));
  if (sqliteAvailable()) {
    return openDatabase().prepare(`
      SELECT id, type, collection, severity, message, created_at AS createdAt, metadata_json AS metadataJson
      FROM storage_events ORDER BY created_at DESC LIMIT ?
    `).all(max).map((row) => ({
      id: row.id,
      type: row.type,
      collection: row.collection,
      severity: row.severity,
      message: row.message,
      createdAt: row.createdAt,
      metadata: row.metadataJson ? JSON.parse(row.metadataJson) : {},
    }));
  }
  return jsonStore.readCollection('storage_events').slice(-max).reverse();
}

function clearEvents() {
  if (sqliteAvailable()) {
    openDatabase().prepare('DELETE FROM storage_events').run();
  }
  jsonStore.writeCollection('storage_events', []);
  return { cleared: true };
}

function latestEventAt(types) {
  const set = new Set(Array.isArray(types) ? types : [types]);
  const event = listEvents({ limit: limit() }).find((item) => set.has(item.type));
  return event ? event.createdAt : null;
}

module.exports = {
  sanitizeValue,
  createEvent,
  listEvents,
  clearEvents,
  latestEventAt,
};

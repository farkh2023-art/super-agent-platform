'use strict';

const jsonStore = require('./jsonStore');
const sqliteStore = require('./sqliteStore');
const events = require('./storageEvents');

function readPreference() {
  return process.env.SQLITE_READ_PREFERENCE === 'sqlite' ? 'sqlite' : 'json';
}

function doubleWriteEnabled() {
  return String(process.env.SQLITE_DOUBLE_WRITE || 'false').toLowerCase() === 'true';
}

function readOp(method, collection, ...args) {
  if (readPreference() === 'sqlite') {
    try {
      return sqliteStore[method](collection, ...args);
    } catch (err) {
      events.createEvent({
        type: 'sqlite_read_failed',
        collection,
        severity: 'warning',
        message: err.message,
      });
    }
  }
  return jsonStore[method](collection, ...args);
}

function writeOp(method, collection, ...args) {
  const result = jsonStore[method](collection, ...args);
  if (doubleWriteEnabled()) {
    try {
      if (method === 'create') sqliteStore.create(collection, args[0]);
      else sqliteStore[method](collection, ...args);
    } catch (err) {
      events.createEvent({
        type: 'double_write_failed',
        collection,
        severity: 'error',
        message: err.message,
      });
      console.warn(`SQLite double-write failed for ${collection}: ${err.message}`);
    }
  }
  return result;
}

module.exports = {
  list: (collection) => readOp('list', collection),
  get: (collection, id) => readOp('get', collection, id),
  create: (collection, item) => writeOp('create', collection, item),
  update: (collection, id, patch) => writeOp('update', collection, id, patch),
  remove: (collection, id) => writeOp('remove', collection, id),
  clear: (collection) => writeOp('clear', collection),
  search: (collection, predicate) => readOp('search', collection, predicate),
  count: (collection) => readOp('count', collection),
  readRecord: (name) => (readPreference() === 'sqlite' ? sqliteStore.readRecord(name) : jsonStore.readRecord(name)),
  writeRecord: (name, data) => {
    jsonStore.writeRecord(name, data);
    if (doubleWriteEnabled()) {
      try { sqliteStore.writeRecord(name, data); } catch (err) {
        events.createEvent({ type: 'double_write_failed', collection: name, severity: 'error', message: err.message });
      }
    }
  },
};

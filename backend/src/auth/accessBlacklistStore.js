'use strict';

const memoryStore = require('./accessBlacklistMemory');
const sqliteStore = require('./accessBlacklistSqlite');
const authDb = require('./authDb');

let _store = null;

function resolveStore() {
  const mode = (process.env.ACCESS_BLACKLIST_STORE || 'auto').toLowerCase();
  if (mode === 'memory') return memoryStore;
  if (mode === 'sqlite') return sqliteStore;
  // auto: use SQLite if available, otherwise memory
  if (authDb.isAvailable()) return sqliteStore;
  return memoryStore;
}

function getStore() {
  if (!_store) _store = resolveStore();
  return _store;
}

// Reset store selection (used in tests after env changes)
function resetStore() {
  _store = null;
}

module.exports = { getStore, resetStore };

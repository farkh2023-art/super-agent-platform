'use strict';

// Delegates to abstract store (memory or SQLite), selected by ACCESS_BLACKLIST_STORE env var.
// API is backward-compatible with the previous in-memory implementation.
const blacklistStore = require('./accessBlacklistStore');

function blacklistToken(jti, expiresAt, metadata) {
  if (!jti) return;
  blacklistStore.getStore().add(jti, expiresAt, metadata);
}

function isBlacklisted(jti) {
  return jti ? blacklistStore.getStore().has(jti) : false;
}

function size() { return blacklistStore.getStore().count(); }

function clear() { blacklistStore.getStore().clear(); }

module.exports = { blacklistToken, isBlacklisted, size, clear };

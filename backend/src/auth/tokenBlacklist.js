'use strict';

// In-memory blacklist of revoked JTI values.
// Cleared on server restart — acceptable because access tokens are short-lived.
const _blacklist = new Set();

function blacklistToken(jti) {
  if (jti) _blacklist.add(jti);
}

function isBlacklisted(jti) {
  return jti ? _blacklist.has(jti) : false;
}

function size() { return _blacklist.size; }

function clear() { _blacklist.clear(); }

module.exports = { blacklistToken, isBlacklisted, size, clear };

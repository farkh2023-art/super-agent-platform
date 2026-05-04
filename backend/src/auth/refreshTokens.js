'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const REFRESH_TTL_MS = 7 * 24 * 3600 * 1000;

function storePath() {
  const base = process.env.DATA_DIR
    ? path.resolve(__dirname, '..', '..', process.env.DATA_DIR)
    : path.resolve(__dirname, '..', '..', 'data');
  return path.join(base, 'refresh-tokens.json');
}

function read() {
  try {
    const p = storePath();
    if (!fs.existsSync(p)) return [];
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch { return []; }
}

function write(tokens) {
  const p = storePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(tokens, null, 2), 'utf8');
}

function issueRefreshToken(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS).toISOString();
  const tokens = read();
  // Prune old revoked/expired entries (keep list lean)
  const cutoff = new Date();
  const pruned = tokens.filter((t) => !t.revokedAt && new Date(t.expiresAt) > cutoff);
  pruned.push({ token, userId, expiresAt, revokedAt: null });
  write(pruned);
  return token;
}

function verifyRefreshToken(candidate) {
  if (!candidate || typeof candidate !== 'string') return null;
  const tokens = read();
  const entry = tokens.find((t) => t.token === candidate);
  if (!entry) return null;
  if (entry.revokedAt) return null;
  if (new Date(entry.expiresAt) < new Date()) return null;
  return entry;
}

function revokeRefreshToken(token) {
  if (!token) return;
  const tokens = read();
  const entry = tokens.find((t) => t.token === token);
  if (entry && !entry.revokedAt) {
    entry.revokedAt = new Date().toISOString();
    write(tokens);
  }
}

function revokeAllForUser(userId) {
  const tokens = read();
  let changed = false;
  tokens.forEach((t) => {
    if (t.userId === userId && !t.revokedAt) {
      t.revokedAt = new Date().toISOString();
      changed = true;
    }
  });
  if (changed) write(tokens);
}

module.exports = { issueRefreshToken, verifyRefreshToken, revokeRefreshToken, revokeAllForUser };

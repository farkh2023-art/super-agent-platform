'use strict';

const { cleanupExpiredTokens } = require('./refreshTokens');
const { cleanupOldAuditEntries } = require('../middleware/auditLog');
const blacklistStore = require('./accessBlacklistStore');

let _running = false;
let _lastResult = null;
let _interval = null;

async function runCleanup(options = {}) {
  if (_running) return { skipped: true, reason: 'already running' };
  _running = true;
  const start = Date.now();
  try {
    const sessions = cleanupExpiredTokens();
    const jtiRemoved = blacklistStore.getStore().removeExpired();
    const audit = options.skipAudit ? { deleted: 0 } : cleanupOldAuditEntries(options.auditRetentionDays);
    const sessionsRemoved = sessions.deleted || 0;
    const auditRemoved = audit.deleted || 0;
    const result = {
      success: true,
      sessionsRemoved,
      jtiRemoved: jtiRemoved || 0,
      auditRemoved,
      durationMs: Date.now() - start,
      runAt: new Date().toISOString(),
      // legacy fields for backward compat with phase6e tests
      tokens: { deleted: sessionsRemoved },
      audit: { deleted: auditRemoved },
    };
    _lastResult = result;
    return result;
  } catch (err) {
    const result = { success: false, error: err.message, durationMs: Date.now() - start };
    _lastResult = result;
    return result;
  } finally {
    _running = false;
  }
}

function getStatus() {
  return {
    running: _running,
    autoEnabled: process.env.AUTH_CLEANUP_ENABLED === 'true',
    intervalMs: parseInt(process.env.AUTH_CLEANUP_INTERVAL_MS || '21600000', 10),
    lastResult: _lastResult,
  };
}

function startAutoCleanup() {
  if (process.env.AUTH_CLEANUP_ENABLED !== 'true') return;
  const intervalMs = parseInt(process.env.AUTH_CLEANUP_INTERVAL_MS || '21600000', 10);
  if (_interval) clearInterval(_interval);
  _interval = setInterval(() => { runCleanup({ skipAudit: false }).catch(() => {}); }, intervalMs);
  _interval.unref();
}

function stopAutoCleanup() {
  if (_interval) { clearInterval(_interval); _interval = null; }
}

module.exports = { runCleanup, getStatus, startAutoCleanup, stopAutoCleanup };

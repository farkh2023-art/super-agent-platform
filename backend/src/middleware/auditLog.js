'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getAuthMode } = require('../auth/authConfig');
const { sanitizeValue } = require('../storage/storageEvents');

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SKIP_PATHS = ['/auth/login', '/auth/register'];
const MAX_ENTRIES = 1000;

function logPath() {
  const base = process.env.DATA_DIR
    ? path.resolve(__dirname, '..', '..', process.env.DATA_DIR)
    : path.resolve(__dirname, '..', '..', 'data');
  return path.join(base, 'audit-log.json');
}

function appendEntry(entry) {
  try {
    const p = logPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    let log = [];
    if (fs.existsSync(p)) {
      try { log = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { log = []; }
    }
    log.push(entry);
    if (log.length > MAX_ENTRIES) log = log.slice(-MAX_ENTRIES);
    fs.writeFileSync(p, JSON.stringify(log, null, 2), 'utf8');
  } catch { /* non-blocking */ }
}

function auditLog(req, res, next) {
  if (getAuthMode() !== 'multi') return next();
  if (!MUTATING.has(req.method)) return next();
  if (SKIP_PATHS.some((p) => req.path.startsWith(p))) return next();

  const start = Date.now();
  const origEnd = res.end.bind(res);
  res.end = function (...args) {
    origEnd(...args);
    appendEntry(sanitizeValue({
      id: crypto.randomUUID(),
      userId: req.user?.id || null,
      username: req.user?.username || null,
      workspaceId: req.user?.workspaceId || null,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Date.now() - start,
      createdAt: new Date().toISOString(),
    }));
  };
  next();
}

function listAuditLog(options = {}) {
  try {
    const p = logPath();
    if (!fs.existsSync(p)) return [];
    let log = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (options.username) log = log.filter((e) => e.username === options.username);
    if (options.method)   log = log.filter((e) => e.method === String(options.method).toUpperCase());
    if (options.from)     log = log.filter((e) => new Date(e.createdAt) >= new Date(options.from));
    if (options.to)       log = log.filter((e) => new Date(e.createdAt) <= new Date(options.to + 'T23:59:59Z'));
    const max = Math.max(1, Math.min(parseInt(options.limit || 100, 10), 500));
    return log.slice(-max).reverse();
  } catch { return []; }
}

module.exports = { auditLog, listAuditLog, logPath };

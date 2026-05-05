'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getAuthMode } = require('../auth/authConfig');
const { sanitizeValue } = require('../storage/storageEvents');
const authDb = require('../auth/authDb');

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SKIP_PATHS = ['/auth/login', '/auth/register'];
const MAX_ENTRIES = 1000;
const AUDIT_RETENTION_DAYS = 90;

function logPath() {
  const base = process.env.DATA_DIR
    ? path.resolve(__dirname, '..', '..', process.env.DATA_DIR)
    : path.resolve(__dirname, '..', '..', 'data');
  return path.join(base, 'audit-log.json');
}

function safeUserAgent(ua) {
  if (!ua || typeof ua !== 'string') return null;
  // Truncate to avoid storing excessively long strings
  return ua.slice(0, 256);
}

function safeIp(req) {
  const xff = req.headers && req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim().slice(0, 64);
  return (req.ip || req.connection?.remoteAddress || null);
}

function appendEntry(entry) {
  const db = authDb.getAuthDb();
  if (db) {
    try {
      db.prepare(`INSERT INTO auth_audit_log (id, user_id, username, workspace_id, method, path, status_code, duration_ms, created_at, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        entry.id, entry.userId, entry.username, entry.workspaceId,
        entry.method, entry.path, entry.statusCode, entry.durationMs, entry.createdAt,
        entry.ipAddress || null, entry.userAgent || null,
      );
    } catch { /* non-blocking */ }
    return;
  }

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
  const captureIp = String(process.env.AUDIT_CAPTURE_IP || 'true').toLowerCase() !== 'false';
  const captureUa = String(process.env.AUDIT_CAPTURE_USER_AGENT || 'true').toLowerCase() !== 'false';
  const ipAddress = captureIp ? safeIp(req) : null;
  const userAgent = captureUa ? safeUserAgent(req.headers?.['user-agent']) : null;

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
      ipAddress,
      userAgent,
    }));
  };
  next();
}

function listAuditLog(options = {}) {
  const limit = Math.max(1, Math.min(parseInt(options.limit || 100, 10), 500));
  const offset = Math.max(0, parseInt(options.offset || 0, 10));
  const db = authDb.getAuthDb();

  if (db) {
    let base = `FROM auth_audit_log WHERE 1=1`;
    const params = [];
    if (options.username)   { base += ` AND username = ?`;        params.push(options.username); }
    if (options.method)     { base += ` AND method = ?`;          params.push(String(options.method).toUpperCase()); }
    if (options.action)     { base += ` AND path LIKE ?`;         params.push(`%${options.action}%`); }
    if (options.from)       { base += ` AND created_at >= ?`;     params.push(options.from); }
    if (options.to)         { base += ` AND created_at <= ?`;     params.push(options.to + 'T23:59:59Z'); }
    if (options.statusCode) { base += ` AND status_code = ?`;     params.push(parseInt(options.statusCode, 10)); }
    if (options.ip)         { base += ` AND ip_address = ?`;      params.push(options.ip); }
    if (options.userAgent)  { base += ` AND user_agent LIKE ?`;   params.push(`%${options.userAgent}%`); }

    const total = db.prepare(`SELECT COUNT(*) AS n ${base}`).get(...params).n;
    const sel = `SELECT id, user_id AS userId, username, workspace_id AS workspaceId, method, path, status_code AS statusCode, duration_ms AS durationMs, created_at AS createdAt, ip_address AS ipAddress, user_agent AS userAgent ${base} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    const items = db.prepare(sel).all(...params, limit, offset);
    return { items, total, limit, offset, hasMore: offset + items.length < total };
  }

  try {
    const p = logPath();
    if (!fs.existsSync(p)) return { items: [], total: 0, limit, offset, hasMore: false };
    let log = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (options.username)   log = log.filter((e) => e.username === options.username);
    if (options.method)     log = log.filter((e) => e.method === String(options.method).toUpperCase());
    if (options.action)     log = log.filter((e) => e.path && e.path.includes(options.action));
    if (options.from)       log = log.filter((e) => new Date(e.createdAt) >= new Date(options.from));
    if (options.to)         log = log.filter((e) => new Date(e.createdAt) <= new Date(options.to + 'T23:59:59Z'));
    if (options.statusCode) log = log.filter((e) => e.statusCode === parseInt(options.statusCode, 10));
    if (options.ip)         log = log.filter((e) => e.ipAddress === options.ip);
    if (options.userAgent)  log = log.filter((e) => e.userAgent && e.userAgent.includes(options.userAgent));
    log = log.slice().reverse();
    const total = log.length;
    const items = log.slice(offset, offset + limit);
    return { items, total, limit, offset, hasMore: offset + items.length < total };
  } catch { return { items: [], total: 0, limit, offset, hasMore: false }; }
}

function cleanupOldAuditEntries(retentionDays = AUDIT_RETENTION_DAYS) {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 3600 * 1000).toISOString();
  const db = authDb.getAuthDb();

  if (db) {
    const info = db.prepare(`DELETE FROM auth_audit_log WHERE created_at < ?`).run(cutoff);
    return { deleted: info.changes };
  }

  try {
    const p = logPath();
    if (!fs.existsSync(p)) return { deleted: 0 };
    const log = JSON.parse(fs.readFileSync(p, 'utf8'));
    const kept = log.filter((e) => new Date(e.createdAt) >= new Date(cutoff));
    const deleted = log.length - kept.length;
    if (deleted > 0) fs.writeFileSync(p, JSON.stringify(kept, null, 2), 'utf8');
    return { deleted };
  } catch { return { deleted: 0 }; }
}

module.exports = { auditLog, listAuditLog, logPath, cleanupOldAuditEntries };

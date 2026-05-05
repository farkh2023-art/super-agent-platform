'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const storage = require('../storage');

const router = express.Router();

// Fields to strip from settings to prevent secret leakage
const { computeMetrics } = require('./metrics');
const { listChunks } = require('../memory/retriever');
const embeddingStore = require('../memory/embeddingStore');
const evaluator = require('../memory/evaluator');
const storageEvents = require('../storage/storageEvents');
const { createSqliteDump, dumpsDir } = require('../storage/sqliteDump');
const { reportsDir: validationReportsDir } = require('../storage/validationReports');
const authDb = require('../auth/authDb');
const { reportsDir: adminReportsDir } = require('../reports/adminReport');

const SENSITIVE_FIELDS = ['anthropicApiKey', 'openaiApiKey', 'password', 'token', 'secret'];

function sanitize(obj) {
  const copy = { ...obj };
  for (const field of SENSITIVE_FIELDS) delete copy[field];
  return copy;
}

function buildAuthSummary() {
  const db = authDb.getAuthDb();
  const now = new Date().toISOString();
  if (!db) {
    return { usersCount: 0, activeSessionsCount: 0, revokedSessionsCount: 0, auditEventsCount: 0, blacklistCount: 0, generatedAt: now, note: 'SQLite not enabled' };
  }
  const usersCount = db.prepare('SELECT COUNT(*) AS n FROM auth_users WHERE disabled = 0').get().n;
  const activeSessionsCount = db.prepare('SELECT COUNT(*) AS n FROM auth_refresh_tokens WHERE revoked_at IS NULL AND expires_at > ?').get(now).n;
  const revokedSessionsCount = db.prepare('SELECT COUNT(*) AS n FROM auth_refresh_tokens WHERE revoked_at IS NOT NULL').get().n;
  const auditEventsCount = db.prepare('SELECT COUNT(*) AS n FROM auth_audit_log').get().n;
  let blacklistCount = 0;
  try { blacklistCount = db.prepare('SELECT COUNT(*) AS n FROM auth_jti_blacklist').get().n; } catch {}
  return { usersCount, activeSessionsCount, revokedSessionsCount, auditEventsCount, blacklistCount, generatedAt: now };
}

// GET /api/backup/download
router.get('/download', (req, res) => {
  const dataDir = storage.DATA_DIR;
  const ts = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
  const filename = `superagent_backup_${ts}.zip`;

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const archive = archiver('zip', { zlib: { level: 6 } });

  archive.on('warning', (err) => {
    if (err.code !== 'ENOENT') console.warn('Backup warning:', err);
  });
  archive.on('error', (err) => {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  });

  archive.pipe(res);

  // Manifest
  const includeAuthDb = String(process.env.BACKUP_INCLUDE_AUTH_DB || 'false').toLowerCase() === 'true';
  const includeAuthSummary = String(process.env.BACKUP_INCLUDE_AUTH_SUMMARY || 'true').toLowerCase() === 'true';

  const manifest = {
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    note: 'No API keys are stored in this backup.',
    embeddingsIncluded: false,
    sqliteDumpIncluded: String(process.env.BACKUP_INCLUDE_SQLITE_DUMP || 'true').toLowerCase() === 'true',
    sqliteRawIncluded: String(process.env.BACKUP_INCLUDE_SQLITE_DB || 'false').toLowerCase() === 'true',
    authDbIncluded: includeAuthDb,
    authSummaryIncluded: includeAuthSummary,
    validationReportsIncluded: true,
    collections: ['tasks', 'executions', 'artifacts', 'workflows', 'workflow_runs', 'schedules', 'alert_rules', 'notifications', 'memory', 'memory_eval_queries', 'memory_evaluation_reports', 'storage_events', 'metrics'],
  };
  archive.append(Buffer.from(JSON.stringify(manifest, null, 2)), { name: 'manifest.json' });
  archive.append(Buffer.from('false'), { name: 'embeddingsIncluded_false.txt' });

  // Collections — read via storage to get live data, sanitize settings
  const collections = ['tasks', 'executions', 'artifacts', 'workflows', 'workflow_runs', 'schedules', 'alert_rules', 'notifications'];
  for (const col of collections) {
    const data = storage.findAll(col);
    archive.append(Buffer.from(JSON.stringify(data, null, 2)), { name: `${col}.json` });
  }

  // Settings (sanitized)
  const settings = sanitize(storage.readRecord('settings'));
  archive.append(Buffer.from(JSON.stringify(settings, null, 2)), { name: 'settings.json' });

  // Memory chunks (strip embeddings – large float arrays; content already sanitized at index time)
  const memoryChunks = listChunks().map(({ embedding, ...c }) => c);
  archive.append(Buffer.from(JSON.stringify(memoryChunks, null, 2)), { name: 'memory.json' });
  const embeddingMetadata = { ...embeddingStore.readStore().metadata, embeddingsIncluded: false };
  archive.append(Buffer.from(JSON.stringify(embeddingMetadata, null, 2)), { name: 'memory_embeddings_metadata.json' });

  const evalQueries = evaluator.readEvalQueries();
  archive.append(Buffer.from(JSON.stringify(evalQueries, null, 2)), { name: 'memory_eval_queries.json' });
  const reportsDir = evaluator.reportsDir();
  if (fs.existsSync(reportsDir)) {
    const reports = fs.readdirSync(reportsDir)
      .filter((name) => /^rag-evaluation-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\.md$/.test(name))
      .sort()
      .slice(-5);
    for (const report of reports) {
      archive.file(path.join(reportsDir, report), { name: `memory_evaluation_reports/${report}` });
    }
  }

  archive.append(Buffer.from(JSON.stringify({ events: storageEvents.listEvents({ limit: 100 }) }, null, 2)), { name: 'storage_events.json' });

  if (String(process.env.BACKUP_INCLUDE_SQLITE_DUMP || 'true').toLowerCase() === 'true') {
    try {
      const dump = createSqliteDump();
      archive.append(Buffer.from(JSON.stringify(dump.dump, null, 2)), { name: `sqlite/${dump.filename}` });
    } catch (err) {
      archive.append(Buffer.from(JSON.stringify({ unavailable: true, error: err.message }, null, 2)), { name: 'sqlite/dump_unavailable.json' });
    }
  }

  if (String(process.env.BACKUP_INCLUDE_SQLITE_DB || 'false').toLowerCase() === 'true') {
    try {
      const dbPath = require('../storage/sqlite').resolveDbPath();
      if (fs.existsSync(dbPath)) archive.file(dbPath, { name: 'sqlite/super-agent-platform.sqlite' });
    } catch {}
  }

  // Auth summary (no secrets: no password_hash, no token hashes, no raw tokens)
  if (includeAuthSummary) {
    try {
      const summary = buildAuthSummary();
      archive.append(Buffer.from(JSON.stringify(summary, null, 2)), { name: 'auth/auth_summary.json' });
    } catch (err) {
      archive.append(Buffer.from(JSON.stringify({ unavailable: true, error: err.message }, null, 2)), { name: 'auth/auth_summary.json' });
    }
  }

  // auth.sqlite — only if explicitly requested (documents security risk)
  if (includeAuthDb) {
    try {
      const authDbPath = authDb.resolveAuthDbPath();
      if (fs.existsSync(authDbPath)) {
        archive.file(authDbPath, { name: 'auth/auth.sqlite' });
        archive.append(Buffer.from('WARNING: auth.sqlite contains hashed credentials and session data. Keep this backup secure.\n'), { name: 'auth/AUTH_DB_SECURITY_WARNING.txt' });
      }
    } catch {}
  }

  if (fs.existsSync(dumpsDir())) {
    const reports = fs.readdirSync(dumpsDir()).filter((name) => /^sqlite-dump-.*\.json$/.test(name)).sort().slice(-3);
    for (const report of reports) archive.file(path.join(dumpsDir(), report), { name: `sqlite/recent/${report}` });
  }

  // Validation reports (last 5, no secrets — already sanitized at write time)
  const vDir = validationReportsDir();
  if (fs.existsSync(vDir)) {
    const vReports = fs.readdirSync(vDir)
      .filter((name) => /^validation-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\.json$/.test(name))
      .sort()
      .slice(-5);
    for (const report of vReports) {
      archive.file(path.join(vDir, report), { name: `validation-reports/${report}` });
    }
  }

  // Last admin reports (JSON only, no secrets)
  const aDir = adminReportsDir();
  if (fs.existsSync(aDir)) {
    const adminReports = fs.readdirSync(aDir)
      .filter((f) => /^admin-report-.*\.json$/.test(f))
      .sort()
      .slice(-3);
    for (const f of adminReports) {
      archive.file(path.join(aDir, f), { name: `admin-reports/${f}` });
    }
  }

  // Metrics snapshot (computed, no secrets)
  const metrics = computeMetrics();
  archive.append(Buffer.from(JSON.stringify(metrics, null, 2)), { name: 'metrics.json' });

  // JSONL logs (if they exist)
  const logsDir = path.join(dataDir, 'logs');
  if (fs.existsSync(logsDir)) {
    archive.directory(logsDir, 'logs');
  }

  archive.finalize();
});

module.exports = router;

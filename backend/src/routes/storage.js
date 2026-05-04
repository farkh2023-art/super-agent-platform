'use strict';

const express = require('express');
const storage = require('../storage');
const checksums = require('../storage/checksums');
const events = require('../storage/storageEvents');
const migrations = require('../storage/migrations');
const { createSqliteDump } = require('../storage/sqliteDump');
const { getSqliteStatus } = require('../storage/sqlite');
const validationReports = require('../storage/validationReports');

const router = express.Router();
const CONFIRMATION = 'I_UNDERSTAND_STORAGE_RISK';

function adminEnabled(req, res, next) {
  if (String(process.env.STORAGE_ADMIN_ENABLED || 'true').toLowerCase() === 'false') {
    return res.status(403).json({ success: false, error: 'STORAGE_ADMIN_ENABLED is false' });
  }
  next();
}

function mutationsAllowed(req, res, next) {
  if (String(process.env.STORAGE_ADMIN_ALLOW_MUTATIONS || 'false').toLowerCase() !== 'true') {
    return res.status(403).json({ success: false, error: 'STORAGE_ADMIN_ALLOW_MUTATIONS is false' });
  }
  if (String(process.env.STORAGE_ADMIN_REQUIRE_CONFIRMATION || 'true').toLowerCase() === 'true'
      && req.body?.confirmation !== CONFIRMATION) {
    return res.status(400).json({ success: false, error: `confirmation must equal ${CONFIRMATION}` });
  }
  next();
}

router.use(adminEnabled);

router.get('/status', (req, res) => {
  res.json(storage.getStorageStatus());
});

router.get('/checksums', (req, res) => {
  res.json(checksums.compareAllCollectionChecksums());
});

router.get('/events', (req, res) => {
  res.json({ events: events.listEvents({ limit: req.query.limit }) });
});

router.delete('/events', (req, res) => {
  if (!process.env.API_KEY) return res.status(403).json({ success: false, error: 'API_KEY required to clear storage events' });
  res.json(events.clearEvents());
});

router.post('/migration/dry-run', (req, res) => {
  try {
    const result = migrations.migrateJsonToSqlite({ dryRun: true, dbPath: req.body?.dbPath });
    res.json({ success: result.errors.length === 0, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/migration/validate', (req, res) => {
  try {
    const result = migrations.validateSqliteMigration({
      dbPath: req.body?.dbPath,
      sampleSize: req.body?.sampleSize || process.env.STORAGE_CHECKSUM_SAMPLE_SIZE || 100,
    });
    if (req.body?.checksums === true) result.checksums = checksums.compareAllCollectionChecksums();
    res.status(result.success ? 200 : 409).json(result);
  } catch (err) {
    events.createEvent({ type: 'validation_failed', severity: 'error', message: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/sqlite/export-dump', (req, res) => {
  try {
    const result = createSqliteDump({ dbPath: req.body?.dbPath });
    events.createEvent({ type: 'sqlite_dump_exported', severity: 'info', message: 'SQLite logical dump exported', metadata: { filename: result.filename } });
    res.json({ success: true, filename: result.filename, path: result.path, downloadUrl: null });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/sqlite/readiness', (req, res) => {
  const status = getSqliteStatus();
  const ready = status.connected && status.exists;
  const checks = {
    exists: status.exists,
    connected: status.connected,
    wal: status.wal,
    error: status.error || null,
  };
  res.status(ready ? 200 : 503).json({ ready, checks, dbPathSafe: 'backend/data/*.sqlite' });
});

router.get('/checksums/report.md', (req, res) => {
  const result = checksums.compareAllCollectionChecksums();
  const md = checksums.generateChecksumReportMarkdown(result);
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="checksum-report-${new Date().toISOString().slice(0, 10)}.md"`);
  res.send(md);
});

router.get('/checksums/desync-alerts', (req, res) => {
  const result = checksums.detectAndAlertDesyncs();
  if (result.desynced > 0) {
    events.createEvent({
      type: 'desync_detected',
      severity: 'warning',
      message: `Desync detected in ${result.desynced} collection(s)`,
      metadata: { collections: result.alerts.map((a) => a.collection) },
    });
  }
  res.json(result);
});

router.get('/compare-ids', (req, res) => {
  try {
    const result = migrations.compareIdByIdAllCollections();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/validation-reports', (req, res) => {
  try {
    res.json({ reports: validationReports.listValidationReports() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/validation-reports/:filename', (req, res) => {
  try {
    const report = validationReports.loadValidationReport(req.params.filename);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.filename}"`);
    res.send(JSON.stringify(report, null, 2));
  } catch (err) {
    if (err.code === 'INVALID_FILENAME') return res.status(400).json({ success: false, error: 'Invalid filename' });
    if (err.code === 'NOT_FOUND') return res.status(404).json({ success: false, error: 'Report not found' });
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/migration/run', mutationsAllowed, (req, res) => {
  try {
    const result = migrations.migrateJsonToSqlite({ dryRun: false, backup: true, dbPath: req.body?.dbPath });
    res.json({ success: result.errors.length === 0, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/rollback', mutationsAllowed, (req, res) => {
  try {
    const result = migrations.rollbackSqliteToJson({
      dryRun: req.body?.dryRun === true,
      fromBackup: req.body?.fromBackup === true,
      fromSqlite: req.body?.fromSqlite !== false,
    });
    res.json({ success: result.errors.length === 0, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

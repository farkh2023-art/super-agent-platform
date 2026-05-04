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

const SENSITIVE_FIELDS = ['anthropicApiKey', 'openaiApiKey', 'password', 'token', 'secret'];

function sanitize(obj) {
  const copy = { ...obj };
  for (const field of SENSITIVE_FIELDS) delete copy[field];
  return copy;
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
  const manifest = {
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    note: 'No API keys are stored in this backup.',
    collections: ['tasks', 'executions', 'artifacts', 'workflows', 'workflow_runs', 'schedules', 'memory', 'metrics'],
  };
  archive.append(Buffer.from(JSON.stringify(manifest, null, 2)), { name: 'manifest.json' });

  // Collections — read via storage to get live data, sanitize settings
  const collections = ['tasks', 'executions', 'artifacts', 'workflows', 'workflow_runs', 'schedules'];
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

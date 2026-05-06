'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { writeRuntimeConfig } = require('../storage/runtimeConfig');
const updateMonitor = require('../monitoring/updateMonitor');

const router = express.Router();

function getDataDir() {
  return process.env.DATA_DIR
    ? path.resolve(__dirname, '..', '..', process.env.DATA_DIR)
    : path.resolve(__dirname, '..', '..', 'data');
}

function readHistory() {
  try {
    const p = path.join(getDataDir(), 'update-history.json');
    if (!fs.existsSync(p)) return [];

    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
    const history = Array.isArray(parsed) ? parsed : Array.isArray(parsed.history) ? parsed.history : [];

    return history
      .map((entry) => {
        const copy = { ...entry };
        delete copy.zipPath;
        delete copy.installDir;
        delete copy.path;
        return copy;
      })
      .sort((a, b) => {
        const left = Date.parse(a.installedAt || a.date || a.timestamp || 0);
        const right = Date.parse(b.installedAt || b.date || b.timestamp || 0);
        return right - left;
      })
      .slice(0, 50);
  } catch {
    return [];
  }
}

// GET /api/update/check
router.get('/check', async (req, res) => {
  try {
    return res.json(await updateMonitor.runOnce({ notify: false }));
  } catch (err) {
    return res.json({
      status: 'ERROR',
      latestVersion: null,
      updateAvailable: false,
      downloadUrl: null,
      releaseNotes: null,
      feedAvailable: Boolean(process.env.UPDATE_FEED_URL),
      feedError: err.message,
    });
  }
});

// GET /api/update/monitor/status
router.get('/monitor/status', (req, res) => {
  res.json(updateMonitor.getStatus());
});

// POST /api/update/check-now
router.post('/check-now', async (req, res) => {
  try {
    res.json(await updateMonitor.runOnce());
  } catch (err) {
    res.status(500).json({ status: 'ERROR', updateAvailable: false, error: err.message });
  }
});

// GET /api/update/history
router.get('/history', (req, res) => {
  res.json({ history: readHistory() });
});

// POST /api/update/dismiss
router.post('/dismiss', (req, res) => {
  const version = String(req.body?.version || '').trim();
  if (!version) return res.status(400).json({ error: 'version is required' });
  writeRuntimeConfig({ dismissedUpdateVersion: version });
  res.json({ dismissed: version });
});

module.exports = router;

'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { readRuntimeConfig, writeRuntimeConfig } = require('../storage/runtimeConfig');
const { isNewer } = require('../utils/semver');

const router = express.Router();

const VERSION_FILE = path.resolve(__dirname, '..', '..', '..', 'VERSION');

function getDataDir() {
  return process.env.DATA_DIR
    ? path.resolve(__dirname, '..', '..', process.env.DATA_DIR)
    : path.resolve(__dirname, '..', '..', 'data');
}

function readCurrentVersion() {
  try {
    if (fs.existsSync(VERSION_FILE)) return fs.readFileSync(VERSION_FILE, 'utf8').trim();
  } catch {}
  return '0.0.0';
}

function readHistory() {
  try {
    const p = path.join(getDataDir(), 'update-history.json');
    if (!fs.existsSync(p)) return [];
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return [];
  }
}

// GET /api/update/check
router.get('/check', async (req, res) => {
  const currentVersion = readCurrentVersion();
  const feedUrl = process.env.UPDATE_FEED_URL;
  const cfg = readRuntimeConfig();
  const dismissedVersion = cfg.dismissedUpdateVersion || null;

  if (!feedUrl) {
    return res.json({
      currentVersion,
      latestVersion: null,
      updateAvailable: false,
      downloadUrl: null,
      releaseNotes: null,
      dismissedVersion,
      feedAvailable: false,
    });
  }

  // Only allow http/https — reject file:// and other schemes
  let parsedUrl;
  try {
    parsedUrl = new URL(feedUrl);
    if (!['https:', 'http:'].includes(parsedUrl.protocol)) throw new Error('protocol');
  } catch {
    return res.status(500).json({ error: 'UPDATE_FEED_URL must be a valid http/https URL' });
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let manifest;
    try {
      const resp = await fetch(feedUrl, { signal: controller.signal });
      if (!resp.ok) throw new Error(`Feed HTTP ${resp.status}`);
      manifest = await resp.json();
    } finally {
      clearTimeout(timer);
    }

    const latestVersion = String(manifest.version || '');
    const updateAvailable =
      isNewer(currentVersion, latestVersion) && latestVersion !== dismissedVersion;

    return res.json({
      currentVersion,
      latestVersion,
      updateAvailable,
      downloadUrl: manifest.downloadUrl || null,
      releaseNotes: manifest.releaseNotes || null,
      dismissedVersion,
      feedAvailable: true,
    });
  } catch (err) {
    return res.json({
      currentVersion,
      latestVersion: null,
      updateAvailable: false,
      downloadUrl: null,
      releaseNotes: null,
      dismissedVersion,
      feedAvailable: true,
      feedError: err.name === 'AbortError' ? 'timeout' : err.message,
    });
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

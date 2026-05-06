'use strict';

const fs = require('fs');
const path = require('path');
const { readRuntimeConfig } = require('../storage/runtimeConfig');
const { isNewer } = require('../utils/semver');
const { notify } = require('../notifications/wsNotifications');

const VERSION_FILE = path.resolve(__dirname, '..', '..', '..', 'VERSION');
const DEFAULT_INTERVAL_MS = 3600000;

let timer = null;
let lastCheckAt = null;
let lastResult = null;
let lastNotifiedVersion = null;

function isEnabled(value = process.env.UPDATE_MONITOR_ENABLED) {
  return String(value || '').toLowerCase() === 'true';
}

function getIntervalMs(value = process.env.UPDATE_MONITOR_INTERVAL_MS) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INTERVAL_MS;
}

function readCurrentVersion() {
  try {
    if (fs.existsSync(VERSION_FILE)) return fs.readFileSync(VERSION_FILE, 'utf8').trim();
  } catch {}
  return '0.0.0';
}

function localResult(currentVersion, dismissedVersion) {
  return {
    status: 'NO_FEED',
    currentVersion,
    latestVersion: null,
    updateAvailable: false,
    downloadUrl: null,
    releaseNotes: null,
    dismissedVersion,
    feedAvailable: false,
  };
}

async function feedResult(feedUrl, currentVersion, dismissedVersion) {
  let parsedUrl;
  try {
    parsedUrl = new URL(feedUrl);
    if (!['https:', 'http:'].includes(parsedUrl.protocol)) throw new Error('protocol');
  } catch {
    return {
      status: 'ERROR',
      currentVersion,
      latestVersion: null,
      updateAvailable: false,
      downloadUrl: null,
      releaseNotes: null,
      dismissedVersion,
      feedAvailable: true,
      feedError: 'UPDATE_FEED_URL must be a valid http/https URL',
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let manifest;
    try {
      const response = await fetch(parsedUrl.href, { signal: controller.signal });
      if (!response.ok) throw new Error(`Feed HTTP ${response.status}`);
      manifest = await response.json();
    } finally {
      clearTimeout(timeout);
    }

    const latestVersion = String(manifest.version || '');
    const updateAvailable =
      isNewer(currentVersion, latestVersion) && latestVersion !== dismissedVersion;

    return {
      status: updateAvailable ? 'UPDATE_AVAILABLE' : 'UP_TO_DATE',
      currentVersion,
      latestVersion,
      updateAvailable,
      downloadUrl: manifest.downloadUrl || null,
      releaseNotes: manifest.releaseNotes || null,
      dismissedVersion,
      feedAvailable: true,
    };
  } catch (err) {
    return {
      status: 'ERROR',
      currentVersion,
      latestVersion: null,
      updateAvailable: false,
      downloadUrl: null,
      releaseNotes: null,
      dismissedVersion,
      feedAvailable: true,
      feedError: err.name === 'AbortError' ? 'timeout' : err.message,
    };
  }
}

function notifyIfNeeded(result, options = {}) {
  if (options.notify === false) return;
  if (!result.updateAvailable || !result.latestVersion) return;
  if (result.latestVersion === lastNotifiedVersion) return;

  lastNotifiedVersion = result.latestVersion;
  notify.updateAvailable({
    currentVersion: result.currentVersion,
    latestVersion: result.latestVersion,
    downloadUrl: result.downloadUrl || null,
    releaseNotes: result.releaseNotes || null,
  });
}

async function runOnce(options = {}) {
  const currentVersion = readCurrentVersion();
  const cfg = readRuntimeConfig();
  const dismissedVersion = cfg.dismissedUpdateVersion || null;
  const feedUrl = options.feedUrl || process.env.UPDATE_FEED_URL;

  lastCheckAt = new Date().toISOString();
  lastResult = feedUrl
    ? await feedResult(feedUrl, currentVersion, dismissedVersion)
    : localResult(currentVersion, dismissedVersion);

  notifyIfNeeded(lastResult, options);
  return lastResult;
}

function start(options = {}) {
  if (!isEnabled(options.enabled)) return getStatus();
  if (timer) return getStatus();

  timer = setInterval(() => {
    runOnce().catch((err) => {
      lastCheckAt = new Date().toISOString();
      lastResult = { status: 'ERROR', updateAvailable: false, feedError: err.message };
    });
  }, getIntervalMs(options.intervalMs));

  if (typeof timer.unref === 'function') timer.unref();
  runOnce().catch(() => {});
  return getStatus();
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  return getStatus();
}

function getStatus() {
  return {
    enabled: isEnabled(),
    running: Boolean(timer),
    lastCheckAt,
    lastResult,
    lastNotifiedVersion,
  };
}

module.exports = {
  start,
  stop,
  runOnce,
  getStatus,
};

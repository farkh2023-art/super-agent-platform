'use strict';

const fs = require('fs');
const path = require('path');

function configPath() {
  const base = process.env.DATA_DIR
    ? path.resolve(__dirname, '..', '..', process.env.DATA_DIR)
    : path.resolve(__dirname, '..', '..', 'data');
  return path.join(base, 'storage-runtime.json');
}

function readRuntimeConfig() {
  try {
    const p = configPath();
    if (!fs.existsSync(p)) return {};
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return {};
  }
}

function writeRuntimeConfig(updates) {
  const current = readRuntimeConfig();
  const next = { ...current, ...updates, updatedAt: new Date().toISOString() };
  const p = configPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function getStorageMode() {
  const cfg = readRuntimeConfig();
  if (cfg.storageMode && ['json', 'sqlite', 'hybrid'].includes(cfg.storageMode)) return cfg.storageMode;
  const env = String(process.env.STORAGE_MODE || 'json').toLowerCase();
  return ['json', 'sqlite', 'hybrid'].includes(env) ? env : 'json';
}

function setStorageMode(mode) {
  if (!['json', 'sqlite', 'hybrid'].includes(mode)) {
    throw Object.assign(new Error(`Invalid storage mode: ${mode}`), { code: 'INVALID_MODE' });
  }
  return writeRuntimeConfig({ storageMode: mode });
}

function getDoubleWrite() {
  const cfg = readRuntimeConfig();
  if ('doubleWrite' in cfg) return Boolean(cfg.doubleWrite);
  return String(process.env.SQLITE_DOUBLE_WRITE || 'false').toLowerCase() === 'true';
}

function setDoubleWrite(enabled) {
  return writeRuntimeConfig({ doubleWrite: Boolean(enabled) });
}

module.exports = { configPath, readRuntimeConfig, writeRuntimeConfig, getStorageMode, setStorageMode, getDoubleWrite, setDoubleWrite };

'use strict';

const fs = require('fs');
const path = require('path');

function configPath() {
  const base = process.env.DATA_DIR
    ? path.resolve(__dirname, '..', '..', process.env.DATA_DIR)
    : path.resolve(__dirname, '..', '..', 'data');
  return path.join(base, 'auth-runtime.json');
}

function getAuthMode() {
  try {
    const p = configPath();
    if (fs.existsSync(p)) {
      const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (cfg.mode && ['single', 'multi'].includes(cfg.mode)) return cfg.mode;
    }
  } catch { /* ignore */ }
  const env = String(process.env.AUTH_MODE || 'single').toLowerCase();
  return env === 'multi' ? 'multi' : 'single';
}

function setAuthMode(mode) {
  if (!['single', 'multi'].includes(mode)) throw Object.assign(new Error('Invalid auth mode'), { code: 'INVALID_MODE' });
  const p = configPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ mode, updatedAt: new Date().toISOString() }, null, 2), 'utf8');
}

module.exports = { getAuthMode, setAuthMode, configPath };

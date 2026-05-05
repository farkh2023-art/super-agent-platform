'use strict';

const fs = require('fs');
const path = require('path');
const authDb = require('./authDb');

function configPath() {
  const base = process.env.DATA_DIR
    ? path.resolve(__dirname, '..', '..', process.env.DATA_DIR)
    : path.resolve(__dirname, '..', '..', 'data');
  return path.join(base, 'auth-runtime.json');
}

function getAuthMode() {
  const db = authDb.getAuthDb();
  if (db) {
    const row = db.prepare('SELECT value FROM auth_config WHERE key = ?').get('auth_mode');
    if (row && ['single', 'multi'].includes(row.value)) return row.value;
  } else {
    try {
      const p = configPath();
      if (fs.existsSync(p)) {
        const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (cfg.mode && ['single', 'multi'].includes(cfg.mode)) return cfg.mode;
      }
    } catch { /* ignore */ }
  }
  const env = String(process.env.AUTH_MODE || 'single').toLowerCase();
  return env === 'multi' ? 'multi' : 'single';
}

function setAuthMode(mode) {
  if (!['single', 'multi'].includes(mode)) throw Object.assign(new Error('Invalid auth mode'), { code: 'INVALID_MODE' });
  const now = new Date().toISOString();

  const db = authDb.getAuthDb();
  if (db) {
    db.prepare(`INSERT INTO auth_config (key, value, updated_at) VALUES ('auth_mode', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).run(mode, now);
    return;
  }

  const p = configPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ mode, updatedAt: now }, null, 2), 'utf8');
}

module.exports = { getAuthMode, setAuthMode, configPath };

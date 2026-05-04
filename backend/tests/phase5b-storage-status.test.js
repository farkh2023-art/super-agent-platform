'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');

function setupEnv() {
  jest.resetModules();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sap-5b-status-'));
  process.env.DATA_DIR = dir;
  process.env.STORAGE_MODE = 'json';
  process.env.SQLITE_DB_PATH = path.join(dir, 'missing.sqlite');
  process.env.STORAGE_ADMIN_ENABLED = 'true';
  process.env.STORAGE_ADMIN_ALLOW_MUTATIONS = 'false';
  delete process.env.API_KEY;
  return dir;
}

describe('Phase 5B storage status', () => {
  test('GET /api/storage/status returns advanced status and handles absent SQLite', async () => {
    const dir = setupEnv();
    fs.writeFileSync(path.join(dir, 'executions.json'), JSON.stringify([{ id: 'e1', task: 'test' }]), 'utf8');
    const { app } = require('../src/server');

    const res = await request(app).get('/api/storage/status').expect(200);
    expect(res.body.mode).toBe('json');
    expect(res.body.readPreference).toBe('json');
    expect(res.body.doubleWrite).toBe(false);
    expect(res.body.sqlite.connected).toBe(false);
    expect(res.body.sqlite.dbPathSafe).toContain('*.sqlite');
    expect(res.body.collections.executions.jsonCount).toBe(1);
    expect(res.body.collections.executions.sqliteCount).toBe(0);
    expect(Array.isArray(res.body.warnings)).toBe(true);
  });
});

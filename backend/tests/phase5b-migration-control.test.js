'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');

function setupEnv() {
  jest.resetModules();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sap-5b-control-'));
  process.env.DATA_DIR = dir;
  process.env.STORAGE_MODE = 'json';
  process.env.SQLITE_DB_PATH = path.join(dir, 'control.sqlite');
  process.env.STORAGE_ADMIN_ENABLED = 'true';
  process.env.STORAGE_ADMIN_ALLOW_MUTATIONS = 'false';
  delete process.env.API_KEY;
  fs.writeFileSync(path.join(dir, 'tasks.json'), JSON.stringify([{ id: 't1', task: 'migrate' }]), 'utf8');
  return dir;
}

describe('Phase 5B migration control API', () => {
  test('dry-run API does not create SQLite database', async () => {
    const dir = setupEnv();
    const { app } = require('../src/server');
    const res = await request(app).post('/api/storage/migration/dry-run').send({}).expect(200);
    expect(res.body.dryRun).toBe(true);
    expect(res.body.collections.some((c) => c.collection === 'tasks' && c.count === 1)).toBe(true);
    expect(fs.existsSync(path.join(dir, 'control.sqlite'))).toBe(false);
  });

  test('validate API and export dump API work after migration', async () => {
    setupEnv();
    const { migrateJsonToSqlite } = require('../src/storage/migrations');
    migrateJsonToSqlite({ dryRun: false, backup: false });
    const { app } = require('../src/server');

    const validation = await request(app).post('/api/storage/migration/validate').send({ checksums: true, sampleSize: 10 }).expect(200);
    expect(validation.body.success).toBe(true);
    expect(validation.body.checksums.summary.totalCollections).toBeGreaterThan(0);

    const dump = await request(app).post('/api/storage/sqlite/export-dump').send({}).expect(200);
    expect(dump.body.success).toBe(true);
    expect(dump.body.filename).toMatch(/^sqlite-dump-/);
  });

  test('real migration and rollback are refused by default', async () => {
    setupEnv();
    const { app } = require('../src/server');
    await request(app).post('/api/storage/migration/run').send({ confirmation: 'I_UNDERSTAND_STORAGE_RISK' }).expect(403);
    await request(app).post('/api/storage/rollback').send({ confirmation: 'I_UNDERSTAND_STORAGE_RISK' }).expect(403);
  });

  test('checksums endpoint returns a collection summary', async () => {
    setupEnv();
    const { app } = require('../src/server');
    const res = await request(app).get('/api/storage/checksums').expect(200);
    expect(res.body.summary.totalCollections).toBeGreaterThan(0);
    expect(res.body.collections.tasks.jsonCount).toBe(1);
  });

  test('events endpoint returns an events array', async () => {
    setupEnv();
    const { app } = require('../src/server');
    const res = await request(app).get('/api/storage/events').expect(200);
    expect(Array.isArray(res.body.events)).toBe(true);
  });
});

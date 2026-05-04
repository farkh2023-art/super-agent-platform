'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');

function setupEnv() {
  jest.resetModules();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sap-5b-security-'));
  process.env.DATA_DIR = dir;
  process.env.STORAGE_MODE = 'json';
  process.env.SQLITE_DB_PATH = path.join(dir, 'security.sqlite');
  process.env.STORAGE_ADMIN_ENABLED = 'true';
  process.env.STORAGE_ADMIN_ALLOW_MUTATIONS = 'true';
  process.env.STORAGE_ADMIN_REQUIRE_CONFIRMATION = 'true';
  delete process.env.API_KEY;
  fs.writeFileSync(path.join(dir, 'tasks.json'), JSON.stringify([{ id: 't1', task: 'do not leak sk-test-secret' }]), 'utf8');
  return dir;
}

describe('Phase 5B security controls', () => {
  test('confirmation is mandatory when mutations are enabled', async () => {
    setupEnv();
    const { app } = require('../src/server');
    await request(app).post('/api/storage/migration/run').send({ confirmation: 'WRONG' }).expect(400);
  });

  test('SQLite dump does not expose known secret patterns', async () => {
    setupEnv();
    const { migrateJsonToSqlite } = require('../src/storage/migrations');
    const { createSqliteDump } = require('../src/storage/sqliteDump');
    migrateJsonToSqlite({ dryRun: false, backup: false });
    const dump = createSqliteDump();
    const text = JSON.stringify(dump.dump);
    expect(text).not.toContain('sk-test-secret');
    expect(text).toContain('[REDACTED]');
    expect(text).toContain('"vectorsIncluded":false');
  });

  test('backup includes storage admin artifacts without env secrets', async () => {
    setupEnv();
    const { migrateJsonToSqlite } = require('../src/storage/migrations');
    migrateJsonToSqlite({ dryRun: false, backup: false });
    const { app } = require('../src/server');
    const res = await request(app).get('/api/backup/download').buffer(true).parse((response, fn) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => fn(null, Buffer.concat(chunks)));
    });
    const text = res.body.toString('latin1');
    expect(res.status).toBe(200);
    expect(text).toContain('storage_events.json');
    expect(text).toContain('sqlite/');
    expect(text).not.toContain('ANTHROPIC_API_KEY=');
    expect(text).not.toContain('OPENAI_API_KEY=');
  });
});

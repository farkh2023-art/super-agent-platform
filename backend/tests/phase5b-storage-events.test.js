'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');

function setupEnv() {
  jest.resetModules();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sap-5b-events-'));
  process.env.DATA_DIR = dir;
  process.env.STORAGE_MODE = 'json';
  process.env.SQLITE_DB_PATH = path.join(dir, 'events.sqlite');
  process.env.STORAGE_SYNC_HISTORY_LIMIT = '5';
  process.env.STORAGE_ADMIN_ENABLED = 'true';
  process.env.STORAGE_ADMIN_ALLOW_MUTATIONS = 'false';
  delete process.env.API_KEY;
  return dir;
}

describe('Phase 5B storage events', () => {
  test('events are sanitized and listed', async () => {
    setupEnv();
    const events = require('../src/storage/storageEvents');
    events.createEvent({
      type: 'double_write_failed',
      severity: 'error',
      message: 'failed with sk-test-secret and Bearer abc.def',
      metadata: { apiKey: 'sk-ant-secret' },
    });
    const listed = events.listEvents();
    expect(listed).toHaveLength(1);
    expect(JSON.stringify(listed)).not.toContain('sk-test-secret');
    expect(JSON.stringify(listed)).not.toContain('sk-ant-secret');
  });

  test('DELETE /api/storage/events requires API_KEY configuration', async () => {
    setupEnv();
    const { app } = require('../src/server');
    await request(app).delete('/api/storage/events').expect(403);
  });
});

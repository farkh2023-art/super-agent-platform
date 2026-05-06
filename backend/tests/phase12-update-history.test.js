'use strict';

process.env.DATA_DIR = './data-test-update-history';
process.env.AI_PROVIDER = 'mock';
delete process.env.API_KEY;
delete process.env.UPDATE_FEED_URL;
delete process.env.UPDATE_MONITOR_ENABLED;
delete process.env.CSRF_PROTECTION;

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { app } = require('../src/server');

const dataDir = path.resolve(__dirname, '..', 'data-test-update-history');

afterAll(() => {
  try {
    require('../src/monitoring/updateMonitor').stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {}
});

function expectNoSecrets(body) {
  const text = JSON.stringify(body);
  expect(text).not.toMatch(/github_pat/i);
  expect(text).not.toMatch(/\bsk-[A-Za-z0-9_-]+/);
  expect(text).not.toMatch(/password/i);
}

describe('Phase 12 update monitor HTTP routes', () => {
  test('GET /api/update/monitor/status returns enabled and running', async () => {
    const res = await request(app).get('/api/update/monitor/status');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('enabled');
    expect(res.body).toHaveProperty('running');
    expectNoSecrets(res.body);
  });

  test('POST /api/update/check-now returns a clean status', async () => {
    const res = await request(app).post('/api/update/check-now').send({});

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('updateAvailable');
    expect(res.body.updateAvailable).toBe(false);
    expectNoSecrets(res.body);
  });

  test('GET /api/update/history returns a sanitized array', async () => {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(
      path.join(dataDir, 'update-history.json'),
      JSON.stringify({
        history: [
          {
            version: '1.0.0',
            installedAt: '2026-01-01T00:00:00.000Z',
            zipPath: 'C:\\Users\\Example\\package.zip',
            installDir: 'C:\\Users\\Example\\app',
          },
        ],
      }),
    );

    const res = await request(app).get('/api/update/history');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.history)).toBe(true);
    expect(JSON.stringify(res.body.history)).not.toContain('C:\\Users');
    expectNoSecrets(res.body);
  });

  test('unknown update routes remain 404', async () => {
    const res = await request(app).get('/api/update/does-not-exist');

    expect(res.status).toBe(404);
  });
});

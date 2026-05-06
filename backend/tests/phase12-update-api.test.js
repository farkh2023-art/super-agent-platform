'use strict';

process.env.DATA_DIR = './data-test-update';
process.env.AI_PROVIDER = 'mock';
delete process.env.API_KEY;
delete process.env.UPDATE_FEED_URL;
delete process.env.CSRF_PROTECTION;

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { app } = require('../src/server');

afterAll(() => {
  try {
    const dir = path.resolve(__dirname, '..', 'data-test-update');
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}
});

describe('GET /api/update/check', () => {
  test('returns 200 with currentVersion from VERSION file', async () => {
    const res = await request(app).get('/api/update/check');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('currentVersion');
    expect(typeof res.body.currentVersion).toBe('string');
    expect(res.body.currentVersion.length).toBeGreaterThan(0);
  });

  test('returns updateAvailable: false when no feed URL configured', async () => {
    const res = await request(app).get('/api/update/check');
    expect(res.status).toBe(200);
    expect(res.body.updateAvailable).toBe(false);
    expect(res.body.feedAvailable).toBe(false);
    expect(res.body.latestVersion).toBeNull();
  });

  test('response shape has all expected fields', async () => {
    const res = await request(app).get('/api/update/check');
    expect(res.status).toBe(200);
    const keys = ['currentVersion', 'latestVersion', 'updateAvailable', 'downloadUrl', 'releaseNotes', 'feedAvailable'];
    for (const k of keys) expect(res.body).toHaveProperty(k);
  });
});

describe('GET /api/update/history', () => {
  test('returns 200 with empty history when no file exists', async () => {
    const res = await request(app).get('/api/update/history');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('history');
    expect(Array.isArray(res.body.history)).toBe(true);
  });
});

describe('POST /api/update/dismiss', () => {
  test('dismisses a version and returns it', async () => {
    const res = await request(app)
      .post('/api/update/dismiss')
      .send({ version: 'v3.0.0-phase-12' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(200);
    expect(res.body.dismissed).toBe('v3.0.0-phase-12');
  });

  test('dismissed version appears in next check', async () => {
    await request(app)
      .post('/api/update/dismiss')
      .send({ version: 'v99.0.0' })
      .set('Content-Type', 'application/json');

    const res = await request(app).get('/api/update/check');
    expect(res.status).toBe(200);
    expect(res.body.dismissedVersion).toBe('v99.0.0');
  });

  test('returns 400 when version is missing', async () => {
    const res = await request(app)
      .post('/api/update/dismiss')
      .send({})
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('returns 400 when version is empty string', async () => {
    const res = await request(app)
      .post('/api/update/dismiss')
      .send({ version: '' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
  });
});

describe('Unknown routes under /api/update', () => {
  test('GET /api/update/nonexistent returns 404', async () => {
    const res = await request(app).get('/api/update/nonexistent');
    expect(res.status).toBe(404);
  });
});

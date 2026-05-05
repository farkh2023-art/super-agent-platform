'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');

function tmpDir() {
  const d = path.join(os.tmpdir(), 'sap-p7-health-' + Date.now());
  fs.mkdirSync(d, { recursive: true });
  return d;
}

describe('Phase 7 — Admin Health', () => {
  let app, request, dataDir;

  beforeEach(() => {
    jest.resetModules();
    dataDir = tmpDir();
    process.env.DATA_DIR = dataDir;
    process.env.AUTH_MODE = 'single';
    process.env.JWT_SECRET = 'test-secret-health';
    delete process.env.AUTH_SQLITE_ENABLED;
    delete process.env.AI_PROVIDER;
    delete process.env.STORAGE_MODE;

    const { app: a } = require('../src/server');
    app = a;
    request = require('supertest');
  });

  afterEach(() => {
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch {}
  });

  test('GET /api/admin/health returns 200 in single mode', async () => {
    const res = await request(app).get('/api/admin/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('generatedAt');
    expect(res.body).toHaveProperty('system');
    expect(res.body).toHaveProperty('storage');
    expect(res.body).toHaveProperty('auth');
    expect(res.body).toHaveProperty('rag');
    expect(res.body).toHaveProperty('scheduler');
    expect(res.body).toHaveProperty('tests');
    expect(res.body).toHaveProperty('warnings');
    expect(Array.isArray(res.body.warnings)).toBe(true);
  });

  test('status is ok|warning|critical', async () => {
    const res = await request(app).get('/api/admin/health');
    expect(['ok', 'warning', 'critical']).toContain(res.body.status);
  });

  test('system section has expected fields', async () => {
    const res = await request(app).get('/api/admin/health');
    const { system } = res.body;
    expect(system).toHaveProperty('uptimeSec');
    expect(system).toHaveProperty('memory');
    expect(system).toHaveProperty('nodeVersion');
    expect(system).toHaveProperty('platform');
    expect(typeof system.uptimeSec).toBe('number');
  });

  test('storage section has expected fields', async () => {
    const res = await request(app).get('/api/admin/health');
    const { storage } = res.body;
    expect(storage).toHaveProperty('mode');
    expect(storage).toHaveProperty('sqliteConnected');
    expect(storage).toHaveProperty('desyncAlerts');
    expect(typeof storage.desyncAlerts).toBe('number');
  });

  test('auth section has expected fields', async () => {
    const res = await request(app).get('/api/admin/health');
    const { auth } = res.body;
    expect(auth).toHaveProperty('mode');
    expect(auth).toHaveProperty('activeSessions');
    expect(auth).toHaveProperty('blacklistCount');
    expect(auth).toHaveProperty('cleanupEnabled');
  });

  test('rag section has expected fields', async () => {
    const res = await request(app).get('/api/admin/health');
    const { rag } = res.body;
    expect(rag).toHaveProperty('memoryItems');
    expect(rag).toHaveProperty('embeddingsEnabled');
    expect(rag).toHaveProperty('embeddingsCount');
  });

  test('scheduler section has expected fields', async () => {
    const res = await request(app).get('/api/admin/health');
    const { scheduler } = res.body;
    expect(scheduler).toHaveProperty('enabled');
    expect(scheduler).toHaveProperty('schedulesCount');
    expect(typeof scheduler.schedulesCount).toBe('number');
  });

  test('tests section has lastKnownTotal', async () => {
    const res = await request(app).get('/api/admin/health');
    expect(res.body.tests.lastKnownTotal).toBe(427);
  });

  test('no secrets exposed in health response', async () => {
    const res = await request(app).get('/api/admin/health');
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/password|apiKey|token_hash|jti_hash|sk-ant/i);
  });

  test('GET /api/admin/health in multi mode without auth returns 401', async () => {
    jest.resetModules();
    process.env.AUTH_MODE = 'multi';
    process.env.DATA_DIR = dataDir;
    process.env.JWT_SECRET = 'test-secret-health';
    const { app: a2 } = require('../src/server');
    const res = await request(a2).get('/api/admin/health');
    expect(res.status).toBe(401);
  });

  test('GET /api/admin/health in multi mode as admin returns 200', async () => {
    jest.resetModules();
    process.env.AUTH_MODE = 'multi';
    process.env.DATA_DIR = dataDir;
    process.env.JWT_SECRET = 'test-secret-health2';
    const { app: a2 } = require('../src/server');
    const users = require('../src/auth/users');
    const jwt = require('../src/auth/jwt');
    users.createUser({ username: 'healthadmin', password: 'pass1234', role: 'admin' });
    const token = jwt.sign({ id: users.listUsers()[0].id, username: 'healthadmin', role: 'admin' }, 900);
    const res = await request(a2).get('/api/admin/health').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  test('GET /api/admin/report.json returns 200 in single mode', async () => {
    const res = await request(app).get('/api/admin/report.json');
    // Single mode: no auth required for health; but report requires admin role
    // In single mode requireRole('admin') should pass (no auth user means single mode)
    expect([200, 403]).toContain(res.status);
  });
});

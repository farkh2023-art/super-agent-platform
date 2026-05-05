'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');

function tmpDir() {
  const d = path.join(os.tmpdir(), 'sap-p7-sec-' + Date.now());
  fs.mkdirSync(d, { recursive: true });
  return d;
}

describe('Phase 7 — Security', () => {
  let app, request, dataDir;

  beforeEach(() => {
    jest.resetModules();
    dataDir = tmpDir();
    process.env.DATA_DIR = dataDir;
    process.env.AUTH_MODE = 'multi';
    process.env.JWT_SECRET = 'test-secret-sec';
    delete process.env.AUTH_SQLITE_ENABLED;
    const { app: a } = require('../src/server');
    app = a;
    request = require('supertest');
  });

  afterEach(() => {
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch {}
  });

  function getAdminToken() {
    const users = require('../src/auth/users');
    const jwt = require('../src/auth/jwt');
    const ws = require('../src/auth/workspaces');
    const wsId = ws.getOrCreate('default').id;
    let user;
    try { user = users.createUser({ username: 'sec_admin', password: 'pass1234', role: 'admin', workspaceId: wsId }); }
    catch { user = users.findByUsername('sec_admin'); }
    return jwt.sign({ id: user.id, username: user.username, role: 'admin', workspaceId: wsId }, 900);
  }

  function getUserToken() {
    const users = require('../src/auth/users');
    const jwt = require('../src/auth/jwt');
    const ws = require('../src/auth/workspaces');
    const wsId = ws.getOrCreate('default').id;
    let user;
    try { user = users.createUser({ username: 'sec_user', password: 'pass1234', role: 'user', workspaceId: wsId }); }
    catch { user = users.findByUsername('sec_user'); }
    return jwt.sign({ id: user.id, username: user.username, role: 'user', workspaceId: wsId }, 900);
  }

  describe('Admin endpoints require authentication', () => {
    test('GET /api/admin/health without token returns 401', async () => {
      const res = await request(app).get('/api/admin/health');
      expect(res.status).toBe(401);
    });

    test('GET /api/admin/report.json without token returns 401', async () => {
      const res = await request(app).get('/api/admin/report.json');
      expect(res.status).toBe(401);
    });

    test('GET /api/admin/report.md without token returns 401', async () => {
      const res = await request(app).get('/api/admin/report.md');
      expect(res.status).toBe(401);
    });

    test('GET /api/auth/audit-log/export.csv without token returns 401', async () => {
      const res = await request(app).get('/api/auth/audit-log/export.csv');
      expect(res.status).toBe(401);
    });
  });

  describe('Non-admin cannot access admin endpoints', () => {
    test('GET /api/admin/health as user returns 403', async () => {
      const token = getUserToken();
      const res = await request(app).get('/api/admin/health').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    });

    test('GET /api/admin/report.json as user returns 403', async () => {
      const token = getUserToken();
      const res = await request(app).get('/api/admin/report.json').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    });

    test('GET /api/auth/audit-log/export.csv as user returns 403', async () => {
      const token = getUserToken();
      const res = await request(app).get('/api/auth/audit-log/export.csv').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    });
  });

  describe('Rate limiting revoke-all', () => {
    test('revokeAllRateLimit middleware is exported', () => {
      const { revokeAllRateLimit } = require('../src/middleware/authRateLimiter');
      expect(typeof revokeAllRateLimit).toBe('function');
    });

    test('POST /api/auth/sessions/revoke-all rate limits after threshold', async () => {
      jest.resetModules();
      process.env.AUTH_MODE = 'multi';
      process.env.DATA_DIR = dataDir;
      process.env.JWT_SECRET = 'test-secret-rl';
      process.env.REVOKE_ALL_RATE_LIMIT_MAX = '2';
      process.env.REVOKE_ALL_RATE_LIMIT_WINDOW_MS = '60000';
      const { app: a2 } = require('../src/server');
      const users = require('../src/auth/users');
      const jwt = require('../src/auth/jwt');
      const ws = require('../src/auth/workspaces');
      const wsId = ws.getOrCreate('default').id;
      const user = users.createUser({ username: 'rl_user', password: 'pass1234', role: 'admin', workspaceId: wsId });
      const token = jwt.sign({ id: user.id, username: user.username, role: 'admin', workspaceId: wsId }, 900);

      let lastStatus;
      for (let i = 0; i < 4; i++) {
        const res = await request(a2).post('/api/auth/sessions/revoke-all').set('Authorization', `Bearer ${token}`).send({});
        lastStatus = res.status;
      }
      expect(lastStatus).toBe(429);
      delete process.env.REVOKE_ALL_RATE_LIMIT_MAX;
      delete process.env.REVOKE_ALL_RATE_LIMIT_WINDOW_MS;
    });
  });

  describe('Health response does not expose secrets', () => {
    test('admin health has no secret fields', async () => {
      const token = getAdminToken();
      const res = await request(app).get('/api/admin/health').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      const body = JSON.stringify(res.body);
      expect(body).not.toMatch(/password|apiKey|sk-ant|token_hash|jti_hash/i);
    });

    test('admin report.json has no secret fields', async () => {
      const token = getAdminToken();
      const res = await request(app).get('/api/admin/report.json').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      const body = JSON.stringify(res.body);
      expect(body).not.toMatch(/password|apiKey|sk-ant|token_hash|jti_hash/i);
    });
  });
});

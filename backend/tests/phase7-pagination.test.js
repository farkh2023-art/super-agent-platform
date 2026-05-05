'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');

function tmpDir() {
  const d = path.join(os.tmpdir(), 'sap-p7-pag-' + Date.now());
  fs.mkdirSync(d, { recursive: true });
  return d;
}

describe('Phase 7 — Pagination', () => {
  let app, request, dataDir;

  beforeEach(() => {
    jest.resetModules();
    dataDir = tmpDir();
    process.env.DATA_DIR = dataDir;
    process.env.AUTH_MODE = 'multi';
    process.env.JWT_SECRET = 'test-secret-pag';
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
    try { user = users.createUser({ username: 'admin_pag', password: 'pass1234', role: 'admin', workspaceId: wsId }); }
    catch { user = users.findByUsername('admin_pag'); }
    return jwt.sign({ id: user.id, username: user.username, role: 'admin', workspaceId: wsId }, 900);
  }

  describe('Sessions pagination', () => {
    test('GET /api/auth/sessions returns paginated format', async () => {
      const token = getAdminToken();
      const res = await request(app).get('/api/auth/sessions').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('total');
      expect(res.body).toHaveProperty('limit');
      expect(res.body).toHaveProperty('offset');
      expect(res.body).toHaveProperty('hasMore');
      expect(Array.isArray(res.body.items)).toBe(true);
      // backward compat
      expect(res.body).toHaveProperty('sessions');
    });

    test('GET /api/auth/sessions with limit=1', async () => {
      const token = getAdminToken();
      const res = await request(app).get('/api/auth/sessions?limit=1').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.limit).toBe(1);
      expect(Array.isArray(res.body.items)).toBe(true);
    });

    test('GET /api/auth/sessions with offset=0', async () => {
      const token = getAdminToken();
      const res = await request(app).get('/api/auth/sessions?offset=0').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.offset).toBe(0);
    });

    test('GET /api/auth/sessions filters by userId (admin only)', async () => {
      const token = getAdminToken();
      const res = await request(app).get('/api/auth/sessions?userId=nonexistent').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(0);
    });

    test('listActiveSessions returns paginated object', () => {
      const { listActiveSessions } = require('../src/auth/refreshTokens');
      const result = listActiveSessions(null, { limit: 10, offset: 0 });
      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('hasMore');
      expect(Array.isArray(result.items)).toBe(true);
    });
  });

  describe('Audit log pagination', () => {
    test('GET /api/auth/audit-log returns paginated format', async () => {
      const token = getAdminToken();
      const res = await request(app).get('/api/auth/audit-log').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('total');
      expect(res.body).toHaveProperty('limit');
      expect(res.body).toHaveProperty('offset');
      expect(res.body).toHaveProperty('hasMore');
      // backward compat
      expect(res.body).toHaveProperty('entries');
    });

    test('GET /api/auth/audit-log with limit=5', async () => {
      const token = getAdminToken();
      const res = await request(app).get('/api/auth/audit-log?limit=5').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.limit).toBe(5);
    });

    test('GET /api/auth/audit-log with statusCode filter', async () => {
      const token = getAdminToken();
      const res = await request(app).get('/api/auth/audit-log?statusCode=200').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.items)).toBe(true);
    });

    test('GET /api/auth/audit-log with action filter', async () => {
      const token = getAdminToken();
      const res = await request(app).get('/api/auth/audit-log?action=login').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.items)).toBe(true);
    });

    test('listAuditLog returns paginated object', () => {
      const { listAuditLog } = require('../src/middleware/auditLog');
      const result = listAuditLog({ limit: 10, offset: 0 });
      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('hasMore');
      expect(Array.isArray(result.items)).toBe(true);
    });

    test('listAuditLog supports ip filter', () => {
      const { listAuditLog } = require('../src/middleware/auditLog');
      const result = listAuditLog({ ip: '127.0.0.1' });
      expect(Array.isArray(result.items)).toBe(true);
    });

    test('listAuditLog supports userAgent filter', () => {
      const { listAuditLog } = require('../src/middleware/auditLog');
      const result = listAuditLog({ userAgent: 'Mozilla' });
      expect(Array.isArray(result.items)).toBe(true);
    });
  });

  describe('last_used_at update on refresh', () => {
    test('verifyRefreshToken updates last_used_at (JSON store)', () => {
      const { issueRefreshToken, verifyRefreshToken } = require('../src/auth/refreshTokens');
      const token = issueRefreshToken('user-refresh-1', {});
      const before = Date.now();
      const entry = verifyRefreshToken(token);
      expect(entry).toBeTruthy();
      // For JSON store, verify lastUsedAt is set
      const { listActiveSessions } = require('../src/auth/refreshTokens');
      const result = listActiveSessions('user-refresh-1');
      const session = result.items.find((s) => s.id === entry.id);
      if (session) {
        expect(session.lastUsedAt).toBeTruthy();
        expect(new Date(session.lastUsedAt).getTime()).toBeGreaterThanOrEqual(before - 100);
      }
    });
  });
});

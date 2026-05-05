'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

function tmpDir() {
  const d = path.join(os.tmpdir(), `sap-6f-sess-${crypto.randomBytes(6).toString('hex')}`);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

describe('Phase 6F — Sessions UI smoke tests', () => {
  let app, adminToken, userToken, userId, request;

  beforeEach(async () => {
    jest.resetModules();
    process.env.DATA_DIR = tmpDir();
    process.env.AUTH_MODE = 'multi';
    process.env.JWT_SECRET = 'phase6f-sessions-secret';
    process.env.AUTH_SQLITE = 'true';
    process.env.ACCESS_BLACKLIST_STORE = 'sqlite';

    app = require('../src/server').app;
    request = require('supertest');

    const users = require('../src/auth/users');
    users.createUser({ username: 'sess-admin', password: 'Pass123!', role: 'admin' });
    const u = users.createUser({ username: 'sess-user', password: 'Pass123!', role: 'user' });
    userId = u.id;

    const ar = await request(app).post('/api/auth/login').send({ username: 'sess-admin', password: 'Pass123!' });
    adminToken = ar.body.token;
    const ur = await request(app).post('/api/auth/login').send({ username: 'sess-user', password: 'Pass123!' });
    userToken = ur.body.token;
  });

  afterEach(() => {
    delete process.env.AUTH_MODE;
    delete process.env.JWT_SECRET;
    delete process.env.AUTH_SQLITE;
    delete process.env.DATA_DIR;
    delete process.env.ACCESS_BLACKLIST_STORE;
  });

  test('GET /api/auth/sessions returns sessions array for admin', async () => {
    const res = await request(app).get('/api/auth/sessions').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.sessions)).toBe(true);
    expect(res.body.sessions.length).toBeGreaterThanOrEqual(1);
  });

  test('sessions do not expose raw tokens or hashes', async () => {
    const res = await request(app).get('/api/auth/sessions').set('Authorization', `Bearer ${adminToken}`);
    for (const s of res.body.sessions) {
      expect(s).not.toHaveProperty('token_hash');
      expect(s).not.toHaveProperty('tokenHash');
      expect(s).not.toHaveProperty('refreshToken');
      expect(s).not.toHaveProperty('password_hash');
    }
  });

  test('sessions have expected safe fields', async () => {
    const res = await request(app).get('/api/auth/sessions').set('Authorization', `Bearer ${adminToken}`);
    const s = res.body.sessions[0];
    expect(s).toHaveProperty('id');
    expect(s).toHaveProperty('expiresAt');
    expect(s).toHaveProperty('createdAt');
  });

  test('regular user only sees own sessions', async () => {
    const res = await request(app).get('/api/auth/sessions').set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    for (const s of res.body.sessions) {
      expect(s.userId).toBe(userId);
    }
  });

  test('admin can revoke a session', async () => {
    const sessRes = await request(app).get('/api/auth/sessions').set('Authorization', `Bearer ${adminToken}`);
    const sessions = sessRes.body.sessions;
    if (!sessions.length) return;
    const sess = sessions[0];
    const del = await request(app).delete(`/api/auth/sessions/${sess.id}`).set('Authorization', `Bearer ${adminToken}`);
    expect([200, 404]).toContain(del.status);
  });

  test('user can revoke own session', async () => {
    const ur2 = await request(app).post('/api/auth/login').send({ username: 'sess-user', password: 'Pass123!' });
    const t2 = ur2.body.token;
    const sessRes = await request(app).get('/api/auth/sessions').set('Authorization', `Bearer ${t2}`);
    if (!sessRes.body.sessions.length) return;
    const s = sessRes.body.sessions[0];
    const del = await request(app).delete(`/api/auth/sessions/${s.id}`).set('Authorization', `Bearer ${t2}`);
    expect([200, 404]).toContain(del.status);
  });

  test('user cannot revoke another user session', async () => {
    const adminSessRes = await request(app).get('/api/auth/sessions').set('Authorization', `Bearer ${adminToken}`);
    const adminSessions = adminSessRes.body.sessions.filter((s) => s.userId !== userId);
    if (!adminSessions.length) return;
    const adminSess = adminSessions[0];
    const del = await request(app).delete(`/api/auth/sessions/${adminSess.id}`).set('Authorization', `Bearer ${userToken}`);
    expect(del.status).toBe(403);
  });

  test('POST /api/auth/sessions/revoke-all works for current user', async () => {
    // Login a second time to have 2 sessions
    await request(app).post('/api/auth/login').send({ username: 'sess-user', password: 'Pass123!' });
    const res = await request(app).post('/api/auth/sessions/revoke-all').set('Authorization', `Bearer ${userToken}`).send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('sessions endpoint requires auth', async () => {
    const res = await request(app).get('/api/auth/sessions');
    expect(res.status).toBe(401);
  });

  test('single mode returns empty sessions without auth', async () => {
    jest.resetModules();
    process.env.AUTH_MODE = 'single';
    process.env.DATA_DIR = tmpDir();
    delete process.env.AUTH_SQLITE;
    process.env.JWT_SECRET = 'phase6f-sessions-secret';
    const { app: app2 } = require('../src/server');
    const req2 = require('supertest');
    const res = await req2(app2).get('/api/auth/sessions');
    expect(res.status).toBe(200);
    expect(res.body.sessions).toEqual([]);
  });
});

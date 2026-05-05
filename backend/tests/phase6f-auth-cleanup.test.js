'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

function tmpDir() {
  const d = path.join(os.tmpdir(), `sap-6f-cleanup-${crypto.randomBytes(6).toString('hex')}`);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

// ── authCleanup module ────────────────────────────────────────────────────────

describe('Phase 6F — authCleanup module', () => {
  beforeEach(() => { jest.resetModules(); });
  afterEach(() => {
    delete process.env.AUTH_CLEANUP_ENABLED;
    delete process.env.AUTH_SQLITE;
    delete process.env.DATA_DIR;
    delete process.env.ACCESS_BLACKLIST_STORE;
  });

  test('runCleanup returns success shape', async () => {
    process.env.ACCESS_BLACKLIST_STORE = 'memory';
    const { runCleanup } = require('../src/auth/authCleanup');
    const result = await runCleanup({ skipAudit: true });
    expect(result.success).toBe(true);
    expect(typeof result.sessionsRemoved).toBe('number');
    expect(typeof result.jtiRemoved).toBe('number');
    expect(typeof result.auditRemoved).toBe('number');
    expect(typeof result.durationMs).toBe('number');
    expect(result.runAt).toBeDefined();
  });

  test('runCleanup includes legacy fields for backward compat', async () => {
    process.env.ACCESS_BLACKLIST_STORE = 'memory';
    const { runCleanup } = require('../src/auth/authCleanup');
    const result = await runCleanup({ skipAudit: true });
    expect(typeof result.tokens).toBe('object');
    expect(typeof result.audit).toBe('object');
    expect(typeof result.runAt).toBe('string');
  });

  test('runCleanup removes expired JTI from memory store', async () => {
    process.env.ACCESS_BLACKLIST_STORE = 'memory';
    const memStore = require('../src/auth/accessBlacklistMemory');
    memStore.clear();
    memStore.add('test-jti-exp', new Date(Date.now() - 1000).toISOString());
    memStore.add('test-jti-live', new Date(Date.now() + 60000).toISOString());

    const { runCleanup } = require('../src/auth/authCleanup');
    const result = await runCleanup({ skipAudit: true });
    expect(result.success).toBe(true);
    expect(result.jtiRemoved).toBeGreaterThanOrEqual(1);
  });

  test('runCleanup removes expired sessions (JSON fallback)', async () => {
    const dir = tmpDir();
    process.env.DATA_DIR = dir;
    delete process.env.AUTH_SQLITE;
    process.env.ACCESS_BLACKLIST_STORE = 'memory';

    const rt = require('../src/auth/refreshTokens');
    rt.issueRefreshToken('user-x');
    const p = path.join(dir, 'refresh-tokens.json');
    const tokens = JSON.parse(fs.readFileSync(p, 'utf8'));
    tokens[0].expiresAt = new Date(Date.now() - 1000).toISOString();
    fs.writeFileSync(p, JSON.stringify(tokens), 'utf8');

    const { runCleanup } = require('../src/auth/authCleanup');
    const result = await runCleanup({ skipAudit: true });
    expect(result.success).toBe(true);
    expect(result.sessionsRemoved).toBeGreaterThanOrEqual(1);
  });

  test('getStatus returns expected shape', () => {
    process.env.ACCESS_BLACKLIST_STORE = 'memory';
    const { getStatus } = require('../src/auth/authCleanup');
    const s = getStatus();
    expect(typeof s.running).toBe('boolean');
    expect(typeof s.autoEnabled).toBe('boolean');
    expect(typeof s.intervalMs).toBe('number');
  });

  test('startAutoCleanup does not run when AUTH_CLEANUP_ENABLED=false', () => {
    process.env.AUTH_CLEANUP_ENABLED = 'false';
    process.env.ACCESS_BLACKLIST_STORE = 'memory';
    const { startAutoCleanup, stopAutoCleanup } = require('../src/auth/authCleanup');
    expect(() => { startAutoCleanup(); stopAutoCleanup(); }).not.toThrow();
  });
});

// ── HTTP cleanup endpoints ────────────────────────────────────────────────────

describe('Phase 6F — cleanup HTTP endpoints', () => {
  let app, token, request;

  beforeEach(async () => {
    jest.resetModules();
    process.env.DATA_DIR = tmpDir();
    process.env.AUTH_MODE = 'multi';
    process.env.JWT_SECRET = 'phase6f-cleanup-secret';
    process.env.AUTH_SQLITE = 'true';
    process.env.ACCESS_BLACKLIST_STORE = 'sqlite';

    app = require('../src/server').app;
    request = require('supertest');

    const users = require('../src/auth/users');
    users.createUser({ username: 'cleanup-admin', password: 'Pass123!', role: 'admin' });
    users.createUser({ username: 'cleanup-user', password: 'Pass123!', role: 'user' });

    const loginRes = await request(app).post('/api/auth/login').send({ username: 'cleanup-admin', password: 'Pass123!' });
    token = loginRes.body.token;
  });

  afterEach(() => {
    delete process.env.AUTH_MODE;
    delete process.env.JWT_SECRET;
    delete process.env.AUTH_SQLITE;
    delete process.env.DATA_DIR;
    delete process.env.ACCESS_BLACKLIST_STORE;
  });

  test('GET /api/auth/cleanup/status returns status shape', async () => {
    const res = await request(app).get('/api/auth/cleanup/status').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.running).toBe('boolean');
    expect(typeof res.body.autoEnabled).toBe('boolean');
    expect(typeof res.body.intervalMs).toBe('number');
  });

  test('POST /api/auth/cleanup returns cleanup result', async () => {
    const res = await request(app).post('/api/auth/cleanup').set('Authorization', `Bearer ${token}`).send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.sessionsRemoved).toBe('number');
    expect(typeof res.body.jtiRemoved).toBe('number');
    expect(typeof res.body.auditRemoved).toBe('number');
  });

  test('POST /api/auth/cleanup also returns legacy fields', async () => {
    const res = await request(app).post('/api/auth/cleanup').set('Authorization', `Bearer ${token}`).send({});
    expect(res.status).toBe(200);
    expect(typeof res.body.tokens).toBe('object');
    expect(typeof res.body.audit).toBe('object');
    expect(typeof res.body.runAt).toBe('string');
  });

  test('cleanup endpoints require admin', async () => {
    const userLoginRes = await request(app).post('/api/auth/login').send({ username: 'cleanup-user', password: 'Pass123!' });
    const userToken = userLoginRes.body.token;

    const [s1, s2] = await Promise.all([
      request(app).get('/api/auth/cleanup/status').set('Authorization', `Bearer ${userToken}`),
      request(app).post('/api/auth/cleanup').set('Authorization', `Bearer ${userToken}`).send({}),
    ]);
    expect(s1.status).toBe(403);
    expect(s2.status).toBe(403);
  });

  test('cleanup without auth returns 401', async () => {
    const res = await request(app).post('/api/auth/cleanup').send({});
    expect(res.status).toBe(401);
  });
});

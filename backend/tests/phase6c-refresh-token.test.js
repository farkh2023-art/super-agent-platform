'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

function tmpDir() {
  const d = path.join(os.tmpdir(), `sap-6c-${crypto.randomBytes(6).toString('hex')}`);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

// ── Refresh token store (unit) ────────────────────────────────────────────────

describe('Phase 6C — refreshTokens unit', () => {
  let rt;

  beforeEach(() => {
    jest.resetModules();
    process.env.DATA_DIR = tmpDir();
    rt = require('../src/auth/refreshTokens');
  });

  test('issueRefreshToken returns 64-char hex string', () => {
    const token = rt.issueRefreshToken('user-1');
    expect(typeof token).toBe('string');
    expect(token).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(token)).toBe(true);
  });

  test('verifyRefreshToken returns entry for valid token', () => {
    const token = rt.issueRefreshToken('user-1');
    const entry = rt.verifyRefreshToken(token);
    expect(entry).not.toBeNull();
    expect(entry.userId).toBe('user-1');
  });

  test('verifyRefreshToken returns null for unknown token', () => {
    expect(rt.verifyRefreshToken('0'.repeat(64))).toBeNull();
  });

  test('revokeRefreshToken invalidates token', () => {
    const token = rt.issueRefreshToken('user-2');
    rt.revokeRefreshToken(token);
    expect(rt.verifyRefreshToken(token)).toBeNull();
  });

  test('token cannot be used twice after rotation pattern', () => {
    const t1 = rt.issueRefreshToken('user-3');
    rt.revokeRefreshToken(t1);  // simulate rotation
    expect(rt.verifyRefreshToken(t1)).toBeNull();
  });

  test('revokeAllForUser invalidates all tokens for user', () => {
    const t1 = rt.issueRefreshToken('user-4');
    const t2 = rt.issueRefreshToken('user-4');
    rt.revokeAllForUser('user-4');
    expect(rt.verifyRefreshToken(t1)).toBeNull();
    expect(rt.verifyRefreshToken(t2)).toBeNull();
  });
});

// ── Login returns refreshToken ────────────────────────────────────────────────

describe('Phase 6C — POST /api/auth/login returns refreshToken', () => {
  let app, request;

  beforeEach(() => {
    jest.resetModules();
    process.env.DATA_DIR = tmpDir();
    process.env.AUTH_MODE = 'multi';
    process.env.JWT_SECRET = 'phase6c-login-secret';
    process.env.ACCESS_TOKEN_TTL_SECONDS = '900';
    app = require('../src/server').app;
    request = require('supertest');
    const users = require('../src/auth/users');
    users.createUser({ username: 'alice', password: 'pass123', role: 'admin' });
  });

  afterEach(() => {
    delete process.env.AUTH_MODE;
    delete process.env.JWT_SECRET;
    delete process.env.ACCESS_TOKEN_TTL_SECONDS;
  });

  test('login response includes refreshToken', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'alice', password: 'pass123' });
    expect(res.status).toBe(200);
    expect(typeof res.body.refreshToken).toBe('string');
    expect(res.body.refreshToken).toHaveLength(64);
    expect(res.body.expiresIn).toBe(900);
  });

  test('login response does not expose passwordHash', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'alice', password: 'pass123' });
    expect(JSON.stringify(res.body)).not.toContain('scrypt:');
    expect(res.body.user.passwordHash).toBeUndefined();
  });
});

// ── Refresh endpoint ──────────────────────────────────────────────────────────

describe('Phase 6C — POST /api/auth/refresh', () => {
  let app, request, refreshToken;

  beforeEach(async () => {
    jest.resetModules();
    process.env.DATA_DIR = tmpDir();
    process.env.AUTH_MODE = 'multi';
    process.env.JWT_SECRET = 'phase6c-refresh-secret';
    process.env.ACCESS_TOKEN_TTL_SECONDS = '5';
    app = require('../src/server').app;
    request = require('supertest');
    const users = require('../src/auth/users');
    users.createUser({ username: 'bob', password: 'bob123', role: 'user' });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'bob', password: 'bob123' });
    refreshToken = loginRes.body.refreshToken;
  });

  afterEach(() => {
    delete process.env.AUTH_MODE;
    delete process.env.JWT_SECRET;
    delete process.env.ACCESS_TOKEN_TTL_SECONDS;
  });

  test('refresh returns new access token and new refreshToken', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(typeof res.body.refreshToken).toBe('string');
    expect(res.body.refreshToken).not.toBe(refreshToken);
  });

  test('old refreshToken is revoked after rotation', async () => {
    await request(app).post('/api/auth/refresh').send({ refreshToken });
    const res2 = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(res2.status).toBe(401);
  });

  test('invalid refresh token returns 401', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'a'.repeat(64) });
    expect(res.status).toBe(401);
  });

  test('refresh is accessible without access token (public path)', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });
    expect(res.status).toBe(200);
  });
});

// ── Logout revokes refresh token ──────────────────────────────────────────────

describe('Phase 6C — logout revokes refresh token', () => {
  let app, request, accessToken, refreshToken;

  beforeEach(async () => {
    jest.resetModules();
    process.env.DATA_DIR = tmpDir();
    process.env.AUTH_MODE = 'multi';
    process.env.JWT_SECRET = 'phase6c-logout-secret';
    app = require('../src/server').app;
    request = require('supertest');
    const users = require('../src/auth/users');
    users.createUser({ username: 'carol', password: 'carol123', role: 'user' });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'carol', password: 'carol123' });
    accessToken = loginRes.body.token;
    refreshToken = loginRes.body.refreshToken;
  });

  afterEach(() => {
    delete process.env.AUTH_MODE;
    delete process.env.JWT_SECRET;
  });

  test('refresh token is unusable after logout', async () => {
    await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken });

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });
    expect(res.status).toBe(401);
  });
});

// ── Disabled user ─────────────────────────────────────────────────────────────

describe('Phase 6C — disabled user cannot authenticate', () => {
  let app, request, adminToken, targetUserId;

  beforeEach(async () => {
    jest.resetModules();
    process.env.DATA_DIR = tmpDir();
    process.env.AUTH_MODE = 'multi';
    process.env.JWT_SECRET = 'phase6c-disable-secret';
    app = require('../src/server').app;
    request = require('supertest');
    const users = require('../src/auth/users');
    users.createUser({ username: 'admin', password: 'adminpass', role: 'admin' });
    const target = users.createUser({ username: 'target', password: 'targetpass', role: 'user' });
    targetUserId = target.id;

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'adminpass' });
    adminToken = loginRes.body.token;
  });

  afterEach(() => {
    delete process.env.AUTH_MODE;
    delete process.env.JWT_SECRET;
  });

  test('disabled user cannot login', async () => {
    await request(app)
      .put(`/api/auth/users/${targetUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ disabled: true });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'target', password: 'targetpass' });
    expect(res.status).toBe(401);
  });

  test('refresh token is revoked when user is disabled', async () => {
    const targetLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: 'target', password: 'targetpass' });
    const targetRT = targetLogin.body.refreshToken;

    await request(app)
      .put(`/api/auth/users/${targetUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ disabled: true });

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: targetRT });
    expect(res.status).toBe(401);
  });
});

// ── User management endpoints ─────────────────────────────────────────────────

describe('Phase 6C — admin user management', () => {
  let app, request, adminToken, userId;

  beforeEach(async () => {
    jest.resetModules();
    process.env.DATA_DIR = tmpDir();
    process.env.AUTH_MODE = 'multi';
    process.env.JWT_SECRET = 'phase6c-mgmt-secret';
    app = require('../src/server').app;
    request = require('supertest');
    const users = require('../src/auth/users');
    users.createUser({ username: 'admin', password: 'adminpass', role: 'admin' });
    const u = users.createUser({ username: 'dave', password: 'davepass', role: 'user' });
    userId = u.id;

    const lr = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'adminpass' });
    adminToken = lr.body.token;
  });

  afterEach(() => {
    delete process.env.AUTH_MODE;
    delete process.env.JWT_SECRET;
  });

  test('PUT /api/auth/users/:id updates role', async () => {
    const res = await request(app)
      .put(`/api/auth/users/${userId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('admin');
  });

  test('PUT /api/auth/users/:id disables user', async () => {
    const res = await request(app)
      .put(`/api/auth/users/${userId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ disabled: true });
    expect(res.status).toBe(200);
    expect(res.body.user.disabled).toBe(true);
  });

  test('DELETE /api/auth/users/:id removes user', async () => {
    const res = await request(app)
      .delete(`/api/auth/users/${userId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const usersRes = await request(app)
      .get('/api/auth/users')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(usersRes.body.users.find((u) => u.id === userId)).toBeUndefined();
  });

  test('non-admin cannot update users', async () => {
    const users = require('../src/auth/users');
    users.createUser({ username: 'regular', password: 'regpass', role: 'user' });
    const lr = await request(app).post('/api/auth/login').send({ username: 'regular', password: 'regpass' });
    const regToken = lr.body.token;

    const res = await request(app)
      .put(`/api/auth/users/${userId}`)
      .set('Authorization', `Bearer ${regToken}`)
      .send({ role: 'admin' });
    expect(res.status).toBe(403);
  });
});

// ── Audit log filtering ───────────────────────────────────────────────────────

describe('Phase 6C — audit log filtering', () => {
  let app, request, adminToken;

  beforeEach(async () => {
    jest.resetModules();
    process.env.DATA_DIR = tmpDir();
    process.env.AUTH_MODE = 'multi';
    process.env.JWT_SECRET = 'phase6c-audit-secret';
    app = require('../src/server').app;
    request = require('supertest');
    const users = require('../src/auth/users');
    users.createUser({ username: 'admin', password: 'adminpass', role: 'admin' });
    const lr = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'adminpass' });
    adminToken = lr.body.token;

    // Generate audit entries via workspace creation (not in SKIP_PATHS)
    await request(app)
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Workspace A' });
    await request(app)
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Workspace B' });
  });

  afterEach(() => {
    delete process.env.AUTH_MODE;
    delete process.env.JWT_SECRET;
  });

  test('GET /api/auth/audit-log returns entries', async () => {
    const res = await request(app)
      .get('/api/auth/audit-log')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.entries)).toBe(true);
    expect(res.body.entries.length).toBeGreaterThan(0);
  });

  test('?method=POST filters to POST entries', async () => {
    const res = await request(app)
      .get('/api/auth/audit-log?method=POST')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    res.body.entries.forEach((e) => expect(e.method).toBe('POST'));
  });

  test('?username= filters by username', async () => {
    const res = await request(app)
      .get('/api/auth/audit-log?username=admin')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    res.body.entries.forEach((e) => expect(e.username).toBe('admin'));
  });

  test('?from= future date returns no entries', async () => {
    const res = await request(app)
      .get('/api/auth/audit-log?from=2099-01-01')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(0);
  });
});

// ── Single-user mode stays compatible ────────────────────────────────────────

describe('Phase 6C — single-user backward compat', () => {
  let app, request;

  beforeEach(() => {
    jest.resetModules();
    process.env.DATA_DIR = tmpDir();
    delete process.env.AUTH_MODE;
    app = require('../src/server').app;
    request = require('supertest');
  });

  test('POST /api/auth/refresh returns 400 in single mode', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'a'.repeat(64) });
    expect(res.status).toBe(400);
  });

  test('all main routes accessible without token in single mode', async () => {
    const routes = ['/api/agents', '/api/tasks', '/api/executions'];
    for (const r of routes) {
      const res = await request(app).get(r);
      expect(res.status).toBe(200);
    }
  });
});

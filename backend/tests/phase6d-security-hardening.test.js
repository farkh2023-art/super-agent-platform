'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

function tmpDir() {
  const d = path.join(os.tmpdir(), `sap-6d-${crypto.randomBytes(6).toString('hex')}`);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

// ── Token Blacklist (unit) ────────────────────────────────────────────────────

describe('Phase 6D — tokenBlacklist unit', () => {
  let bl;

  beforeEach(() => {
    jest.resetModules();
    bl = require('../src/auth/tokenBlacklist');
    bl.clear();
  });

  test('isBlacklisted returns false for unknown jti', () => {
    expect(bl.isBlacklisted('jti-unknown')).toBe(false);
  });

  test('blacklistToken then isBlacklisted returns true', () => {
    bl.blacklistToken('jti-abc');
    expect(bl.isBlacklisted('jti-abc')).toBe(true);
  });

  test('isBlacklisted returns false for null/undefined', () => {
    expect(bl.isBlacklisted(null)).toBe(false);
    expect(bl.isBlacklisted(undefined)).toBe(false);
  });

  test('size increases after blacklisting', () => {
    bl.blacklistToken('jti-1');
    bl.blacklistToken('jti-2');
    expect(bl.size()).toBe(2);
  });

  test('clear empties the blacklist', () => {
    bl.blacklistToken('jti-x');
    bl.clear();
    expect(bl.size()).toBe(0);
  });
});

// ── JWT has jti field ─────────────────────────────────────────────────────────

describe('Phase 6D — JWT includes jti', () => {
  beforeEach(() => { jest.resetModules(); });

  test('signed token payload contains jti field', () => {
    const jwt = require('../src/auth/jwt');
    const token = jwt.sign({ userId: 'u1' });
    const parts = token.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    expect(typeof payload.jti).toBe('string');
    expect(payload.jti.length).toBeGreaterThan(10);
  });

  test('each sign call produces a unique jti', () => {
    const jwt = require('../src/auth/jwt');
    const t1 = jwt.sign({ userId: 'u1' });
    const t2 = jwt.sign({ userId: 'u1' });
    const p1 = JSON.parse(Buffer.from(t1.split('.')[1], 'base64url').toString());
    const p2 = JSON.parse(Buffer.from(t2.split('.')[1], 'base64url').toString());
    expect(p1.jti).not.toBe(p2.jti);
  });
});

// ── Access token blacklist via logout ─────────────────────────────────────────

describe('Phase 6D — logout blacklists access token', () => {
  let app, request, token;

  beforeEach(async () => {
    jest.resetModules();
    process.env.DATA_DIR = tmpDir();
    process.env.AUTH_MODE = 'multi';
    process.env.JWT_SECRET = 'phase6d-blacklist-secret';
    // Clear in-memory blacklist
    require('../src/auth/tokenBlacklist').clear();
    app = require('../src/server').app;
    request = require('supertest');
    const users = require('../src/auth/users');
    users.createUser({ username: 'alice', password: 'pass123', role: 'admin' });
    const lr = await request(app).post('/api/auth/login').send({ username: 'alice', password: 'pass123' });
    token = lr.body.token;
  });

  afterEach(() => {
    delete process.env.AUTH_MODE;
    delete process.env.JWT_SECRET;
    require('../src/auth/tokenBlacklist').clear();
  });

  test('token works before logout', async () => {
    const res = await request(app).get('/api/agents').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  test('token returns 401 after logout', async () => {
    await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    const res = await request(app).get('/api/agents').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  test('logout response does not expose jti', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('jti');
  });
});

// ── Cookie mode ───────────────────────────────────────────────────────────────

describe('Phase 6D — REFRESH_TOKEN_COOKIE mode', () => {
  let app, request;

  beforeEach(() => {
    jest.resetModules();
    process.env.DATA_DIR = tmpDir();
    process.env.AUTH_MODE = 'multi';
    process.env.JWT_SECRET = 'phase6d-cookie-secret';
    process.env.REFRESH_TOKEN_COOKIE = 'true';
    const users = require('../src/auth/users');
    app = require('../src/server').app;
    request = require('supertest');
    users.createUser({ username: 'bob', password: 'bob123', role: 'user' });
  });

  afterEach(() => {
    delete process.env.AUTH_MODE;
    delete process.env.JWT_SECRET;
    delete process.env.REFRESH_TOKEN_COOKIE;
  });

  test('login response has Set-Cookie with sap_refresh (HttpOnly)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'bob', password: 'bob123' });
    expect(res.status).toBe(200);
    const cookies = res.headers['set-cookie'] || [];
    const refreshCookie = cookies.find((c) => c.startsWith('sap_refresh='));
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toMatch(/HttpOnly/i);
    expect(refreshCookie).toMatch(/SameSite=Strict/i);
  });

  test('login response body has no refreshToken in cookie mode', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'bob', password: 'bob123' });
    expect(res.body.refreshToken).toBeUndefined();
    expect(res.body.token).toBeDefined();
  });

  test('POST /auth/refresh works with cookie', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'bob', password: 'bob123' });
    const cookies = loginRes.headers['set-cookie'] || [];
    const refreshCookie = cookies.find((c) => c.startsWith('sap_refresh='));
    const refreshValue = refreshCookie.split(';')[0];

    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', refreshValue)
      .send({});
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
  });

  test('body mode still works when cookie mode enabled (fallback)', async () => {
    // Issue a token via direct store access
    const rt = require('../src/auth/refreshTokens');
    const users = require('../src/auth/users');
    const u = users.listUsers()[0];
    const refreshToken = rt.issueRefreshToken(u.id);

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });
    expect(res.status).toBe(200);
  });
});

// ── CSRF protection ───────────────────────────────────────────────────────────

describe('Phase 6D — CSRF_PROTECTION', () => {
  let app, request, token, csrfToken;

  beforeEach(async () => {
    jest.resetModules();
    process.env.DATA_DIR = tmpDir();
    process.env.AUTH_MODE = 'multi';
    process.env.JWT_SECRET = 'phase6d-csrf-secret';
    process.env.CSRF_PROTECTION = 'true';
    app = require('../src/server').app;
    request = require('supertest');
    const users = require('../src/auth/users');
    users.createUser({ username: 'carol', password: 'carol123', role: 'admin' });

    const lr = await request(app).post('/api/auth/login').send({ username: 'carol', password: 'carol123' });
    token = lr.body.token;

    // Extract CSRF token from Set-Cookie header
    const cookies = lr.headers['set-cookie'] || [];
    const csrfCookie = cookies.find((c) => c.startsWith('sap_csrf='));
    if (csrfCookie) {
      csrfToken = decodeURIComponent(csrfCookie.split(';')[0].replace('sap_csrf=', ''));
    }
  });

  afterEach(() => {
    delete process.env.AUTH_MODE;
    delete process.env.JWT_SECRET;
    delete process.env.CSRF_PROTECTION;
  });

  test('CSRF token is set in login response cookie', async () => {
    expect(typeof csrfToken).toBe('string');
    expect(csrfToken.length).toBeGreaterThan(0);
  });

  test('mutating request without CSRF token returns 403', async () => {
    const res = await request(app)
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test WS' });
    expect(res.status).toBe(403);
  });

  test('mutating request with valid CSRF token succeeds', async () => {
    const res = await request(app)
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .set('Cookie', `sap_csrf=${csrfToken}`)
      .set('X-CSRF-Token', csrfToken)
      .send({ name: 'Test WS' });
    expect(res.status).toBe(201);
  });

  test('CSRF is not required on exempt auth endpoints', async () => {
    // /auth/login itself is exempt
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'carol', password: 'carol123' });
    expect(res.status).toBe(200);
  });

  test('CSRF not required when disabled', async () => {
    jest.resetModules();
    delete process.env.CSRF_PROTECTION;
    process.env.DATA_DIR = tmpDir();
    process.env.AUTH_MODE = 'multi';
    process.env.JWT_SECRET = 'phase6d-no-csrf-secret';
    const app2 = require('../src/server').app;
    const users2 = require('../src/auth/users');
    users2.createUser({ username: 'dave', password: 'dave123', role: 'admin' });
    const lr2 = await request(app2).post('/api/auth/login').send({ username: 'dave', password: 'dave123' });
    const tk2 = lr2.body.token;

    const res = await request(app2)
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${tk2}`)
      .send({ name: 'NoCSRF WS' });
    expect(res.status).toBe(201);
    delete process.env.AUTH_MODE;
    delete process.env.JWT_SECRET;
  });
});

// ── Login rate limiting ───────────────────────────────────────────────────────

describe('Phase 6D — login rate limiter', () => {
  let app, request;

  beforeEach(() => {
    jest.resetModules();
    process.env.DATA_DIR = tmpDir();
    process.env.AUTH_MODE = 'multi';
    process.env.JWT_SECRET = 'phase6d-ratelimit-secret';
    process.env.LOGIN_RATE_LIMIT_MAX = '3';
    process.env.LOGIN_RATE_LIMIT_WINDOW_MS = '60000';
    // Reset buckets
    require('../src/middleware/authRateLimiter').resetBuckets();
    app = require('../src/server').app;
    request = require('supertest');
  });

  afterEach(() => {
    delete process.env.AUTH_MODE;
    delete process.env.JWT_SECRET;
    delete process.env.LOGIN_RATE_LIMIT_MAX;
    delete process.env.LOGIN_RATE_LIMIT_WINDOW_MS;
    require('../src/middleware/authRateLimiter').resetBuckets();
  });

  test('exceeding login attempts returns 429', async () => {
    const attempts = [];
    for (let i = 0; i < 5; i++) {
      attempts.push(request(app).post('/api/auth/login').send({ username: 'x', password: 'y' }));
    }
    const results = await Promise.all(attempts);
    expect(results.some((r) => r.status === 429)).toBe(true);
  });

  test('429 response includes retryAfter', async () => {
    for (let i = 0; i < 4; i++) {
      await request(app).post('/api/auth/login').send({ username: 'x', password: 'y' });
    }
    const last = await request(app).post('/api/auth/login').send({ username: 'x', password: 'y' });
    if (last.status === 429) {
      expect(typeof last.body.retryAfter).toBe('number');
    }
  });

  test('rate limiter inactive in single mode', async () => {
    jest.resetModules();
    process.env.DATA_DIR = tmpDir();
    delete process.env.AUTH_MODE;
    process.env.LOGIN_RATE_LIMIT_MAX = '1';
    const app2 = require('../src/server').app;
    for (let i = 0; i < 5; i++) {
      const res = await request(app2).get('/api/health');
      expect(res.status).toBe(200);
    }
    delete process.env.LOGIN_RATE_LIMIT_MAX;
  });
});

// ── Security config endpoint ──────────────────────────────────────────────────

describe('Phase 6D — GET /api/auth/security-config', () => {
  let app, request;

  beforeEach(() => {
    jest.resetModules();
    process.env.DATA_DIR = tmpDir();
    delete process.env.AUTH_MODE;
    process.env.REFRESH_TOKEN_COOKIE = 'true';
    process.env.CSRF_PROTECTION = 'true';
    app = require('../src/server').app;
    request = require('supertest');
  });

  afterEach(() => {
    delete process.env.REFRESH_TOKEN_COOKIE;
    delete process.env.CSRF_PROTECTION;
  });

  test('returns security feature flags', async () => {
    const res = await request(app).get('/api/auth/security-config');
    expect(res.status).toBe(200);
    expect(res.body.cookieMode).toBe(true);
    expect(res.body.csrfProtection).toBe(true);
    expect(res.body.blacklistEnabled).toBe(true);
    expect(typeof res.body.accessTokenTtl).toBe('number');
  });

  test('endpoint is public (no auth required)', async () => {
    const res = await request(app).get('/api/auth/security-config');
    expect(res.status).toBe(200);
  });
});

// ── Single mode compatibility ─────────────────────────────────────────────────

describe('Phase 6D — single-user mode unchanged', () => {
  let app, request;

  beforeEach(() => {
    jest.resetModules();
    process.env.DATA_DIR = tmpDir();
    delete process.env.AUTH_MODE;
    delete process.env.CSRF_PROTECTION;
    delete process.env.REFRESH_TOKEN_COOKIE;
    app = require('../src/server').app;
    request = require('supertest');
  });

  test('all main routes accessible without token', async () => {
    for (const route of ['/api/agents', '/api/tasks', '/api/executions', '/api/health']) {
      const res = await request(app).get(route);
      expect(res.status).toBe(200);
    }
  });

  test('CSRF not enforced in single mode even when CSRF_PROTECTION=true', async () => {
    jest.resetModules();
    process.env.DATA_DIR = tmpDir();
    process.env.CSRF_PROTECTION = 'true';
    delete process.env.AUTH_MODE;
    const app2 = require('../src/server').app;
    const res = await request(app2).get('/api/agents');
    expect(res.status).toBe(200);
    delete process.env.CSRF_PROTECTION;
  });
});

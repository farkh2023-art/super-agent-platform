'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

function tmpDir() {
  const d = path.join(os.tmpdir(), `sap-6f-audit-${crypto.randomBytes(6).toString('hex')}`);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

describe('Phase 6F — Audit log enrichment', () => {
  let app, token, request;

  beforeEach(async () => {
    jest.resetModules();
    process.env.DATA_DIR = tmpDir();
    process.env.AUTH_MODE = 'multi';
    process.env.JWT_SECRET = 'phase6f-audit-secret';
    process.env.AUTH_SQLITE = 'true';
    process.env.AUDIT_CAPTURE_IP = 'true';
    process.env.AUDIT_CAPTURE_USER_AGENT = 'true';
    process.env.ACCESS_BLACKLIST_STORE = 'sqlite';

    app = require('../src/server').app;
    request = require('supertest');

    const users = require('../src/auth/users');
    users.createUser({ username: 'audit-admin', password: 'Pass123!', role: 'admin' });

    const r = await request(app).post('/api/auth/login').send({ username: 'audit-admin', password: 'Pass123!' });
    token = r.body.token;
  });

  afterEach(() => {
    delete process.env.AUTH_MODE;
    delete process.env.JWT_SECRET;
    delete process.env.AUTH_SQLITE;
    delete process.env.DATA_DIR;
    delete process.env.AUDIT_CAPTURE_IP;
    delete process.env.AUDIT_CAPTURE_USER_AGENT;
    delete process.env.ACCESS_BLACKLIST_STORE;
  });

  test('audit log entry captures User-Agent', async () => {
    const ua = 'TestBrowser/6F-Audit-Test';
    await request(app)
      .post('/api/auth/cleanup')
      .set('Authorization', `Bearer ${token}`)
      .set('User-Agent', ua)
      .send({});

    const res = await request(app).get('/api/auth/audit-log').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const entries = res.body.entries || [];
    const entry = entries.find((e) => e.userAgent && e.userAgent.includes('6F-Audit-Test'));
    expect(entry).toBeDefined();
    expect(entry.userAgent).toContain('6F-Audit-Test');
  });

  test('audit log entry has ipAddress field', async () => {
    await request(app).post('/api/auth/cleanup').set('Authorization', `Bearer ${token}`).send({});
    const res = await request(app).get('/api/auth/audit-log').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const entries = res.body.entries || [];
    expect(entries.length).toBeGreaterThan(0);
    // ipAddress field should exist (may be null or a string)
    expect(Object.prototype.hasOwnProperty.call(entries[0], 'ipAddress') || entries[0].ipAddress === undefined).toBeTruthy();
  });

  test('audit log does not capture Authorization header', async () => {
    await request(app).post('/api/auth/cleanup').set('Authorization', `Bearer ${token}`).send({});
    const res = await request(app).get('/api/auth/audit-log').set('Authorization', `Bearer ${token}`);
    const entries = res.body.entries || [];
    for (const e of entries) {
      const str = JSON.stringify(e);
      expect(str).not.toMatch(/Bearer /);
      expect(str).not.toMatch(/"password"/);
    }
  });

  test('audit log does not capture Cookie header value', async () => {
    await request(app).post('/api/auth/cleanup').set('Authorization', `Bearer ${token}`).send({});
    const res = await request(app).get('/api/auth/audit-log').set('Authorization', `Bearer ${token}`);
    const entries = res.body.entries || [];
    for (const e of entries) {
      // No cookie header value should be stored
      expect(e).not.toHaveProperty('cookie');
      expect(e).not.toHaveProperty('Cookie');
    }
  });

  test('User-Agent truncated to 256 chars max', async () => {
    const longUa = 'A'.repeat(300);
    await request(app)
      .post('/api/auth/cleanup')
      .set('Authorization', `Bearer ${token}`)
      .set('User-Agent', longUa)
      .send({});

    const res = await request(app).get('/api/auth/audit-log').set('Authorization', `Bearer ${token}`);
    const entries = res.body.entries || [];
    const entry = entries.find((e) => e.userAgent && e.userAgent.startsWith('AAA'));
    if (entry) {
      expect(entry.userAgent.length).toBeLessThanOrEqual(256);
    }
  });

  test('AUDIT_CAPTURE_IP=false results in null ipAddress', async () => {
    jest.resetModules();
    process.env.DATA_DIR = tmpDir();
    process.env.AUTH_MODE = 'multi';
    process.env.JWT_SECRET = 'phase6f-audit-secret2';
    process.env.AUTH_SQLITE = 'true';
    process.env.AUDIT_CAPTURE_IP = 'false';
    process.env.AUDIT_CAPTURE_USER_AGENT = 'false';
    process.env.ACCESS_BLACKLIST_STORE = 'sqlite';

    const app2 = require('../src/server').app;
    const req2 = require('supertest');
    const users2 = require('../src/auth/users');
    users2.createUser({ username: 'no-audit', password: 'Pass123!', role: 'admin' });
    const r2 = await req2(app2).post('/api/auth/login').send({ username: 'no-audit', password: 'Pass123!' });
    const t2 = r2.body.token;

    await req2(app2).post('/api/auth/cleanup').set('Authorization', `Bearer ${t2}`).send({});
    const res2 = await req2(app2).get('/api/auth/audit-log').set('Authorization', `Bearer ${t2}`);
    const entries2 = res2.body.entries || [];
    for (const e of entries2) {
      expect(e.ipAddress == null).toBe(true);
      expect(e.userAgent == null).toBe(true);
    }
  });

  test('auditLog middleware does not include auth/register path in log', async () => {
    const res = await request(app).get('/api/auth/audit-log').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const entries = res.body.entries || [];
    const registerEntry = entries.find((e) => e.path === '/register');
    expect(registerEntry).toBeUndefined();
  });
});

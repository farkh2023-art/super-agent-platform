'use strict';

// API_KEY must be set BEFORE requiring server so auth middleware picks it up
process.env.AI_PROVIDER = 'mock';
process.env.PORT = '3095';
process.env.DATA_DIR = './data-test-3';
process.env.API_KEY = 'test-key-phase3';

const request = require('supertest');
const { app } = require('../src/server');
const fs = require('fs');
const path = require('path');

const TEST_DATA_DIR = path.resolve(__dirname, '..', 'data-test-3');
const ROOT = path.resolve(__dirname, '..', '..');   // super-agent-platform/

afterAll(() => {
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
});

// ── API Key – unauthenticated requests ────────────────────────────────────────
describe('API Key auth – unauthenticated', () => {
  it('returns 401 for /api/agents without key', async () => {
    const res = await request(app).get('/api/agents');
    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
    expect(res.body.hint).toBeDefined();
  });

  it('returns 401 for /api/dashboard/stats without key', async () => {
    const res = await request(app).get('/api/dashboard/stats');
    expect(res.status).toBe(401);
  });

  it('/api/health is always public (200, no auth)', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('/api/health/detailed is always public (200, no auth)', async () => {
    const res = await request(app).get('/api/health/detailed');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

// ── API Key – authenticated requests ─────────────────────────────────────────
describe('API Key auth – authenticated', () => {
  const auth = { Authorization: 'Bearer test-key-phase3' };

  it('returns 200 for /api/agents with correct Bearer token', async () => {
    const res = await request(app).get('/api/agents').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(10);
  });

  it('returns 401 with wrong Bearer token', async () => {
    const res = await request(app).get('/api/agents').set('Authorization', 'Bearer wrong-key');
    expect(res.status).toBe(401);
  });

  it('accepts X-Api-Key header as alternative', async () => {
    const res = await request(app).get('/api/agents').set('X-Api-Key', 'test-key-phase3');
    expect(res.status).toBe(200);
  });
});

// ── Webhook configuration ─────────────────────────────────────────────────────
describe('Webhook & auth flags in settings/status', () => {
  const auth = { Authorization: 'Bearer test-key-phase3' };

  it('settings/status shows authEnabled: true', async () => {
    const res = await request(app).get('/api/settings/status').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.authEnabled).toBe(true);
  });

  it('settings/status shows webhookConfigured: false (WEBHOOK_URL not set)', async () => {
    const res = await request(app).get('/api/settings/status').set(auth);
    expect(res.body.webhookConfigured).toBe(false);
  });

  it('settings/status never leaks API_KEY value', async () => {
    const res = await request(app).get('/api/settings/status').set(auth);
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/test-key-phase3/);
    expect(body).not.toMatch(/API_KEY/);
  });
});

// ── Backup ZIP – secret audit (regression) ────────────────────────────────────
describe('Backup ZIP still has no secrets', () => {
  const auth = { Authorization: 'Bearer test-key-phase3' };

  it('ZIP content contains no API key patterns', async () => {
    const res = await request(app).get('/api/backup/download').set(auth)
      .buffer(true).parse((res, fn) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => fn(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    const raw = res.body.toString('latin1');
    expect(raw).not.toMatch(/test-key-phase3/);
    expect(raw).not.toMatch(/"API_KEY"/);
    expect(raw).not.toMatch(/sk-ant-[A-Za-z0-9]/);
    expect(raw).not.toMatch(/"anthropicApiKey"/);
  });
});

// ── Docker files exist ────────────────────────────────────────────────────────
describe('Docker deployment files', () => {
  it('Dockerfile exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'Dockerfile'))).toBe(true);
  });

  it('docker-compose.yml exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'docker-compose.yml'))).toBe(true);
  });

  it('.dockerignore exists', () => {
    expect(fs.existsSync(path.join(ROOT, '.dockerignore'))).toBe(true);
  });

  it('.dockerignore excludes .env', () => {
    const content = fs.readFileSync(path.join(ROOT, '.dockerignore'), 'utf8');
    expect(content).toMatch(/^\.env$/m);
  });
});

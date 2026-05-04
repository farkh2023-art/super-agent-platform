'use strict';

process.env.AI_PROVIDER = 'mock';
process.env.PORT = '3096';
process.env.DATA_DIR = './data-test-2d';
process.env.MAX_CONCURRENT_EXECUTIONS = '3';

const request = require('supertest');
const { app } = require('../src/server');
const fs = require('fs');
const path = require('path');

const TEST_DATA_DIR = path.resolve(__dirname, '..', 'data-test-2d');

afterAll(() => {
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
});

// ── Provider test ──────────────────────────────────────────────────────────────
describe('POST /api/settings/test-provider', () => {
  it('succeeds immediately in mock mode', async () => {
    const res = await request(app).post('/api/settings/test-provider');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.provider).toBe('mock');
  });

  it('response contains no API key', async () => {
    const res = await request(app).post('/api/settings/test-provider');
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/sk-ant-/);
    expect(body).not.toMatch(/sk-[a-zA-Z]/);
    expect(body).not.toMatch(/anthropicApiKey/);
    expect(body).not.toMatch(/openaiApiKey/);
  });
});

// ── Ollama diagnostics ─────────────────────────────────────────────────────────
describe('GET /api/settings/ollama-health', () => {
  it('returns a diagnostic object', async () => {
    const res = await request(app).get('/api/settings/ollama-health');
    expect(res.status).toBe(200);
    expect(typeof res.body.reachable).toBe('boolean');
    expect(res.body.url).toBeDefined();
    expect(res.body.configuredModel).toBeDefined();
    expect(Array.isArray(res.body.models)).toBe(true);
  });

  it('is not reachable when Ollama is not running', async () => {
    const res = await request(app).get('/api/settings/ollama-health');
    // Ollama not running in CI/test environment
    expect(res.body.reachable).toBe(false);
    expect(res.body.error).toBeDefined();
    expect(res.body.hint).toBeDefined();
  });

  it('does not expose secrets in response', async () => {
    const res = await request(app).get('/api/settings/ollama-health');
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/sk-ant-/);
    expect(body).not.toMatch(/anthropicApiKey/);
    expect(body).not.toMatch(/openaiApiKey/);
  });
});

// ── Enriched dashboard stats ──────────────────────────────────────────────────
describe('GET /api/dashboard/stats (enriched)', () => {
  it('includes successRate field', async () => {
    const res = await request(app).get('/api/dashboard/stats');
    expect(res.status).toBe(200);
    expect(res.body.executions.successRate !== undefined).toBe(true);
  });

  it('includes workflowRuns count', async () => {
    const res = await request(app).get('/api/dashboard/stats');
    expect(res.body.workflowRuns).toBeDefined();
    expect(typeof res.body.workflowRuns.total).toBe('number');
  });

  it('includes concurrency stats', async () => {
    const res = await request(app).get('/api/dashboard/stats');
    expect(res.body.concurrency).toBeDefined();
    expect(res.body.concurrency.max).toBe(3);
    expect(typeof res.body.concurrency.active).toBe('number');
  });

  it('includes logsToday count', async () => {
    const res = await request(app).get('/api/dashboard/stats');
    expect(typeof res.body.logsToday).toBe('number');
  });

  it('lastExecution is null when no executions', async () => {
    const res = await request(app).get('/api/dashboard/stats');
    expect(res.body.lastExecution).toBeNull();
  });

  it('successRate is null when no executions', async () => {
    const res = await request(app).get('/api/dashboard/stats');
    expect(res.body.executions.successRate).toBeNull();
  });
});

// ── Settings status enriched ──────────────────────────────────────────────────
describe('GET /api/settings/status (enriched)', () => {
  it('returns claudeModel and openaiModel fields', async () => {
    const res = await request(app).get('/api/settings/status');
    expect(res.status).toBe(200);
    expect(res.body.claudeModel).toBeDefined();
    expect(res.body.openaiModel).toBeDefined();
    expect(res.body.ollamaModel).toBeDefined();
  });

  it('does not expose API keys', async () => {
    const res = await request(app).get('/api/settings/status');
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/sk-ant-/);
    expect(body).not.toMatch(/anthropicApiKey/);
    expect(body).not.toMatch(/openaiApiKey/);
  });
});

// ── Backup still has no secrets ───────────────────────────────────────────────
describe('GET /api/backup/download – secret audit', () => {
  it('ZIP content contains no API key patterns', async () => {
    const res = await request(app).get('/api/backup/download').buffer(true).parse((res, fn) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => fn(null, Buffer.concat(chunks)));
    });
    // Convert ZIP to string and scan for key patterns
    const raw = res.body.toString('latin1');
    expect(raw).not.toMatch(/sk-ant-[A-Za-z0-9]/);
    expect(raw).not.toMatch(/"anthropicApiKey"/);
    expect(raw).not.toMatch(/"openaiApiKey"/);
  });
});

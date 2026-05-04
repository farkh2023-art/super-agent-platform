'use strict';

process.env.AI_PROVIDER = 'mock';
process.env.PORT = '3098';
process.env.DATA_DIR = './data-test-dashboard';

const request = require('supertest');
const { app } = require('../src/server');
const fs = require('fs');
const path = require('path');

const TEST_DATA_DIR = path.resolve(__dirname, '..', 'data-test-dashboard');

afterAll(() => {
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
});

describe('GET /api/dashboard/stats', () => {
  it('returns 200 with required fields', async () => {
    const res = await request(app).get('/api/dashboard/stats');
    expect(res.status).toBe(200);
    expect(res.body.agents).toBeDefined();
    expect(res.body.executions).toBeDefined();
    expect(res.body.artifacts).toBeDefined();
    expect(res.body.workflows).toBeDefined();
    expect(res.body.uptime).toBeDefined();
    expect(res.body.provider).toBeDefined();
    expect(res.body.timestamp).toBeDefined();
  });

  it('returns correct agents count (10)', async () => {
    const res = await request(app).get('/api/dashboard/stats');
    expect(res.status).toBe(200);
    expect(res.body.agents.total).toBe(10);
  });

  it('returns correct provider in mock mode', async () => {
    const res = await request(app).get('/api/dashboard/stats');
    expect(res.status).toBe(200);
    expect(res.body.provider).toBe('mock');
  });

  it('returns numeric uptime', async () => {
    const res = await request(app).get('/api/dashboard/stats');
    expect(typeof res.body.uptime).toBe('number');
    expect(res.body.uptime).toBeGreaterThanOrEqual(0);
  });

  it('returns executions byStatus object', async () => {
    const res = await request(app).get('/api/dashboard/stats');
    expect(typeof res.body.executions.byStatus).toBe('object');
    expect(typeof res.body.executions.running).toBe('number');
    expect(typeof res.body.executions.completed).toBe('number');
    expect(typeof res.body.executions.errors).toBe('number');
  });

  it('returns zero counts on fresh data dir', async () => {
    const res = await request(app).get('/api/dashboard/stats');
    expect(res.body.executions.total).toBe(0);
    expect(res.body.artifacts.total).toBe(0);
    expect(res.body.workflows.total).toBe(0);
  });
});

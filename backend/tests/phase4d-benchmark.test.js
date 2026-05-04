'use strict';

process.env.AI_PROVIDER = 'mock';
process.env.PORT = '3096';
process.env.DATA_DIR = './data-test-4d-benchmark';
process.env.MEMORY_EMBEDDINGS = 'false';

const request = require('supertest');
const { app } = require('../src/server');
const fs = require('fs');
const path = require('path');

const TEST_DATA_DIR = path.resolve(__dirname, '..', 'data-test-4d-benchmark');

afterAll(() => {
  if (fs.existsSync(TEST_DATA_DIR)) fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

describe('Phase 4D benchmark', () => {
  beforeAll(async () => {
    await request(app).delete('/api/memory');
    await request(app).post('/api/memory').send({ content: 'workflow phase 4C benchmark retrieval' });
  });

  it('POST /api/memory/benchmark compares modes', async () => {
    const res = await request(app).post('/api/memory/benchmark').send({ queries: ['workflow phase 4C'], topK: 5 });
    expect(res.status).toBe(200);
    expect(res.body.results[0].keyword.latencyMs).toBeGreaterThanOrEqual(0);
    expect(res.body.results[0].vector.modeUsed).toBe('keyword');
    expect(res.body.summary.bestMode).toBeDefined();
  });
});

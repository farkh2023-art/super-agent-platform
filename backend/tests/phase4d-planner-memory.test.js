'use strict';

process.env.AI_PROVIDER = 'mock';
process.env.PORT = '3097';
process.env.DATA_DIR = './data-test-4d-planner';
process.env.MEMORY_ENABLED = 'true';
process.env.MEMORY_EMBEDDINGS = 'false';

const request = require('supertest');
const { app } = require('../src/server');
const fs = require('fs');
const path = require('path');

const TEST_DATA_DIR = path.resolve(__dirname, '..', 'data-test-4d-planner');

afterAll(() => {
  if (fs.existsSync(TEST_DATA_DIR)) fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

describe('Phase 4D planner/executor memory metadata', () => {
  beforeAll(async () => {
    await request(app).delete('/api/memory');
    await request(app).post('/api/memory').send({ content: 'Contexte workflow phase 4C important' });
  });

  it('execution with memory records retrieval mode and scores', async () => {
    const res = await request(app).post('/api/executions').send({ task: 'workflow phase 4C', useMemory: true, wait: true });
    expect(res.status).toBe(201);
    const exec = await request(app).get(`/api/executions/${res.body.id}`);
    expect(exec.body.memoryRetrievals.length).toBeGreaterThan(0);
    expect(exec.body.memoryRetrievals[0].modeUsed).toBe('keyword');
    expect(exec.body.memoryRetrievals[0].scores).toBeDefined();
  }, 30000);
});

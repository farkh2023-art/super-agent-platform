'use strict';

process.env.AI_PROVIDER = 'mock';
process.env.PORT = '3095';
process.env.DATA_DIR = './data-test-4d-embeddings';
process.env.MEMORY_ENABLED = 'true';
process.env.MEMORY_EMBEDDINGS = 'true';
process.env.MEMORY_EMBEDDING_MODEL = 'nomic-embed-text';

const request = require('supertest');
const { app } = require('../src/server');
const fs = require('fs');
const path = require('path');

const TEST_DATA_DIR = path.resolve(__dirname, '..', 'data-test-4d-embeddings');
const originalFetch = global.fetch;

beforeAll(() => {
  global.fetch = jest.fn(async (url) => {
    if (String(url).endsWith('/api/tags')) {
      return { ok: true, json: async () => ({ models: [{ name: 'nomic-embed-text:latest' }] }) };
    }
    return { ok: true, json: async () => ({ embedding: [1, 0, 0] }) };
  });
});

afterAll(() => {
  global.fetch = originalFetch;
  if (fs.existsSync(TEST_DATA_DIR)) fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

describe('Phase 4D embeddings endpoints', () => {
  let id;

  beforeAll(async () => {
    await request(app).delete('/api/memory');
    const res = await request(app).post('/api/memory').send({ content: 'Embedding test content workflow' });
    id = res.body.id;
  });

  it('GET /api/memory/embeddings/status returns model and enabled', async () => {
    const res = await request(app).get('/api/memory/embeddings/status');
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
    expect(res.body.model).toBe('nomic-embed-text');
  });

  it('POST /api/memory/embeddings/reindex creates embeddings', async () => {
    const res = await request(app).post('/api/memory/embeddings/reindex');
    expect(res.status).toBe(200);
    expect(res.body.indexed).toBeGreaterThanOrEqual(1);
  });

  it('POST /api/memory/embeddings/reindex/:id reindexes one item', async () => {
    const res = await request(app).post(`/api/memory/embeddings/reindex/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
  });

  it('DELETE /api/memory/embeddings clears vectors only', async () => {
    const res = await request(app).delete('/api/memory/embeddings');
    expect(res.status).toBe(200);
    const list = await request(app).get('/api/memory');
    expect(list.body.total).toBeGreaterThanOrEqual(1);
  });
});

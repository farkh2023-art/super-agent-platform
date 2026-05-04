'use strict';

process.env.AI_PROVIDER = 'mock';
process.env.PORT = '3098';
process.env.DATA_DIR = './data-test-4d-security';
process.env.MEMORY_EMBEDDINGS = 'true';

const request = require('supertest');
const { app } = require('../src/server');
const fs = require('fs');
const path = require('path');

const TEST_DATA_DIR = path.resolve(__dirname, '..', 'data-test-4d-security');
const originalFetch = global.fetch;

afterAll(() => {
  global.fetch = originalFetch;
  if (fs.existsSync(TEST_DATA_DIR)) fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

describe('Phase 4D security', () => {
  it('redacts secrets before embedding', async () => {
    let embeddedPrompt = '';
    global.fetch = jest.fn(async (url, options) => {
      embeddedPrompt = JSON.parse(options.body).prompt;
      return { ok: true, json: async () => ({ embedding: [0.1, 0.2] }) };
    });
    await request(app).delete('/api/memory');
    await request(app).post('/api/memory').send({ content: 'secret sk-ant-api03-ABCDEFGHIJKLMNOP and Bearer ABCDEFGHIJKLMNOPQRSTUVWXYZ' });
    const item = (await request(app).get('/api/memory')).body.chunks[0];
    await request(app).post(`/api/memory/embeddings/reindex/${item.id}`);
    expect(embeddedPrompt).not.toMatch(/sk-ant-api03|Bearer ABC/);
    expect(embeddedPrompt).toContain('[REDACTED]');
  });
});

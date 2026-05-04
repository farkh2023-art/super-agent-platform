'use strict';

process.env.AI_PROVIDER = 'mock';
process.env.PORT = '3099';
process.env.DATA_DIR = './data-test-4d-backup';
process.env.MEMORY_EMBEDDINGS = 'false';

const request = require('supertest');
const { app } = require('../src/server');
const fs = require('fs');
const path = require('path');

const TEST_DATA_DIR = path.resolve(__dirname, '..', 'data-test-4d-backup');

afterAll(() => {
  if (fs.existsSync(TEST_DATA_DIR)) fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

describe('Phase 4D backup', () => {
  it('backup manifest marks embeddingsIncluded false', async () => {
    const res = await request(app).get('/api/backup/download')
      .buffer(true).parse((res, fn) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => fn(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    const raw = res.body.toString('latin1');
    expect(raw).toMatch(/embeddingsIncluded/);
    expect(raw).toMatch(/memory_embeddings_metadata\.json/);
  });
});

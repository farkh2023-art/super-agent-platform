'use strict';

process.env.AI_PROVIDER = 'mock';
process.env.PORT = '3098';
process.env.DATA_DIR = './data-test-4e-security';
process.env.MEMORY_ENABLED = 'true';
process.env.MEMORY_EMBEDDINGS = 'false';

const request = require('supertest');
const fs = require('fs');
const path = require('path');
const { app } = require('../src/server');

const TEST_DATA_DIR = path.resolve(__dirname, '..', 'data-test-4e-security');

afterAll(async () => {
  await request(app).delete('/api/memory');
  if (fs.existsSync(TEST_DATA_DIR)) fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

describe('Phase 4E security', () => {
  it('sanitizes evaluation query fields', async () => {
    const secret = 'sk-ant-abcdefghijklmnopqrstuvwxyz123456';
    const res = await request(app).post('/api/memory/evaluation/queries').send({
      query: `find ${secret}`,
      expectedKeywords: ['jest', secret],
      description: `description ${secret}`,
    });
    expect(res.status).toBe(201);
    expect(JSON.stringify(res.body)).not.toContain(secret);
    expect(JSON.stringify(res.body)).toContain('[REDACTED]');
  });

  it('does not export raw secrets in markdown reports', async () => {
    const secret = 'sk-abcdefghijklmnopqrstuvwxyz123456';
    await request(app).post('/api/memory/evaluation/queries').send({
      query: `secret report ${secret}`,
      expectedKeywords: ['secret'],
      description: `must not leak ${secret}`,
    });
    await request(app).post('/api/memory/evaluation/run').send({ topK: 3 });
    const report = await request(app).post('/api/memory/evaluation/export-report').send({});
    expect(report.status).toBe(200);
    expect(report.body.markdown).not.toContain(secret);
  });

  it('backup includes eval queries but excludes full embeddings and env secrets', async () => {
    const res = await request(app).get('/api/backup/download').buffer(true).parse((response, fn) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => fn(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    const text = res.body.toString('latin1');
    expect(text).toContain('memory_eval_queries.json');
    expect(text).toContain('embeddingsIncluded_false.txt');
    expect(text).not.toContain('ANTHROPIC_API_KEY=');
    expect(text).not.toContain('OPENAI_API_KEY=');
  });
});

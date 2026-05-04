'use strict';

process.env.AI_PROVIDER = 'mock';
process.env.PORT = '3094';
process.env.DATA_DIR = './data-test-4d-retrieval';
process.env.MEMORY_ENABLED = 'true';
process.env.MEMORY_EMBEDDINGS = 'false';

const request = require('supertest');
const { app } = require('../src/server');
const fs = require('fs');
const path = require('path');
const { chunkText } = require('../src/memory/chunker');

const TEST_DATA_DIR = path.resolve(__dirname, '..', 'data-test-4d-retrieval');

afterAll(() => {
  if (fs.existsSync(TEST_DATA_DIR)) fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

describe('Phase 4D chunking', () => {
  it('short text returns one chunk', () => {
    expect(chunkText('short text')).toHaveLength(1);
  });

  it('long text returns overlapping non-empty chunks', () => {
    const text = Array.from({ length: 120 }, (_, i) => `line ${i} with useful content`).join('\n');
    const chunks = chunkText(text, { maxChars: 400, overlap: 80 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.trim().length > 0)).toBe(true);
    expect(chunks[0].slice(-30).length).toBeGreaterThan(0);
  });
});

describe('Phase 4D memory retrieval modes', () => {
  beforeAll(async () => {
    await request(app).delete('/api/memory');
    await request(app).post('/api/memory').send({ content: 'Workflow phase 4C visual builder pagination memory executions' });
    await request(app).post('/api/memory').send({ content: 'Simulation FDTD nanoparticules or plasmon maillage fin' });
  });

  afterAll(async () => {
    await request(app).delete('/api/memory');
  });

  it('POST /api/memory/retrieve supports keyword mode', async () => {
    const res = await request(app).post('/api/memory/retrieve').send({ query: 'workflow phase 4C', mode: 'keyword', topK: 2 });
    expect(res.status).toBe(200);
    expect(res.body.modeUsed).toBe('keyword');
    expect(res.body.results.length).toBeGreaterThan(0);
    expect(res.body.results[0].keywordScore).toBeDefined();
  });

  it('vector mode falls back to keyword when embeddings are disabled', async () => {
    const res = await request(app).post('/api/memory/retrieve').send({ query: 'FDTD', mode: 'vector', useEmbeddings: true });
    expect(res.status).toBe(200);
    expect(res.body.modeRequested).toBe('vector');
    expect(res.body.modeUsed).toBe('keyword');
    expect(res.body.embeddingsAvailable).toBe(false);
  });
});

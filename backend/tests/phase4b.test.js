'use strict';

process.env.AI_PROVIDER = 'mock';
process.env.PORT = '3093';
process.env.DATA_DIR = './data-test-4b';
process.env.MEMORY_ENABLED = 'true';
// MEMORY_EMBEDDINGS intentionally NOT set → Ollama embeddings off by default

const request = require('supertest');
const { app } = require('../src/server');
const fs = require('fs');
const path = require('path');

const TEST_DATA_DIR = path.resolve(__dirname, '..', 'data-test-4b');

afterAll(() => {
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
});

// ── Memory store CRUD ─────────────────────────────────────────────────────────
describe('Memory store', () => {
  let chunkId;

  it('GET /api/memory returns empty list initially', async () => {
    const res = await request(app).get('/api/memory');
    expect(res.status).toBe(200);
    expect(res.body.chunks).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it('POST /api/memory adds a chunk and returns it without embedding', async () => {
    const res = await request(app).post('/api/memory').send({
      content: 'La table users contient les colonnes id, email, created_at',
      source: 'manual',
      tags: ['sql', 'schema'],
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.content).toBeDefined();
    expect(res.body.embedding).toBeUndefined();
    expect(res.body.source).toBe('manual');
    chunkId = res.body.id;
  });

  it('GET /api/memory lists the created chunk', async () => {
    const res = await request(app).get('/api/memory');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.chunks[0].id).toBe(chunkId);
    expect(res.body.chunks[0].embedding).toBeUndefined();
  });

  it('GET /api/memory/stats returns count and config', async () => {
    const res = await request(app).get('/api/memory/stats');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.embeddingsEnabled).toBe(false);
    expect(res.body.sources.manual).toBe(1);
  });

  it('DELETE /api/memory/:id removes the chunk', async () => {
    const del = await request(app).delete(`/api/memory/${chunkId}`);
    expect(del.status).toBe(200);
    const list = await request(app).get('/api/memory');
    expect(list.body.total).toBe(0);
  });

  it('DELETE /api/memory/:id returns 404 for unknown id', async () => {
    const res = await request(app).delete('/api/memory/no-such-id');
    expect(res.status).toBe(404);
  });
});

// ── Secrets filtering ─────────────────────────────────────────────────────────
describe('Memory secrets filtering', () => {
  afterEach(async () => {
    await request(app).delete('/api/memory');
  });

  it('strips Anthropic API keys from stored content', async () => {
    const res = await request(app).post('/api/memory').send({
      content: 'La clé est sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ et le résultat est 42',
    });
    expect(res.status).toBe(201);
    expect(res.body.content).not.toMatch(/sk-ant-/);
    expect(res.body.content).toContain('[REDACTED]');
  });

  it('strips OpenAI API keys from stored content', async () => {
    const res = await request(app).post('/api/memory').send({
      content: 'Utiliser sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ pour OpenAI',
    });
    expect(res.status).toBe(201);
    expect(res.body.content).not.toMatch(/sk-[A-Za-z0-9]{20}/);
    expect(res.body.content).toContain('[REDACTED]');
  });

  it('strips sensitive JSON fields from stored content', async () => {
    const res = await request(app).post('/api/memory').send({
      content: 'Config: {"anthropicApiKey": "my-secret-key", "name": "test"}',
    });
    expect(res.status).toBe(201);
    expect(res.body.content).not.toContain('my-secret-key');
    expect(res.body.content).toContain('[REDACTED]');
  });
});

// ── RAG search ────────────────────────────────────────────────────────────────
describe('Memory RAG search', () => {
  beforeAll(async () => {
    await request(app).post('/api/memory').send({
      content: 'La table orders contient order_id, user_id, amount, status',
      source: 'manual',
    });
    await request(app).post('/api/memory').send({
      content: 'La table products contient product_id, name, price, stock',
      source: 'manual',
    });
    await request(app).post('/api/memory').send({
      content: 'Simuler des nanoparticules avec FDTD requiert un maillage fin',
      source: 'manual',
    });
  });

  afterAll(async () => {
    await request(app).delete('/api/memory');
  });

  it('GET /api/memory/search requires q param', async () => {
    const res = await request(app).get('/api/memory/search');
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('search returns relevant results for SQL query', async () => {
    const res = await request(app).get('/api/memory/search?q=table+orders+status');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.results)).toBe(true);
    expect(res.body.results.length).toBeGreaterThan(0);
    const contents = res.body.results.map((r) => r.content).join(' ');
    expect(contents).toMatch(/orders|table/i);
  });

  it('search respects limit parameter', async () => {
    const res = await request(app).get('/api/memory/search?q=table&limit=1');
    expect(res.status).toBe(200);
    expect(res.body.results.length).toBeLessThanOrEqual(1);
  });

  it('search results do not expose embedding field', async () => {
    const res = await request(app).get('/api/memory/search?q=table');
    expect(res.status).toBe(200);
    for (const r of res.body.results) {
      expect(r.embedding).toBeUndefined();
    }
  });
});

// ── Memory injection in executions ────────────────────────────────────────────
describe('Memory use in executions', () => {
  beforeAll(async () => {
    await request(app).post('/api/memory').send({
      content: 'Contexte important: la base SQL de production a 3 tables principales',
      source: 'manual',
    });
  });

  afterAll(async () => {
    await request(app).delete('/api/memory');
  });

  it('execution with useMemory:true stores useMemory flag', async () => {
    const res = await request(app).post('/api/executions').send({
      task: 'Analyser les tables SQL',
      useMemory: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.useMemory).toBe(true);
  });

  it('execution with useMemory:false stores useMemory:false', async () => {
    const res = await request(app).post('/api/executions').send({
      task: 'Analyser les tables SQL',
      useMemory: false,
    });
    expect(res.status).toBe(201);
    expect(res.body.useMemory).toBe(false);
  });

  it('execution without useMemory defaults to MEMORY_ENABLED env value', async () => {
    const res = await request(app).post('/api/executions').send({
      task: 'Analyser les tables SQL',
    });
    expect(res.status).toBe(201);
    // MEMORY_ENABLED=true so default should be true
    expect(res.body.useMemory).toBe(true);
  });
});

// ── Memory clear ──────────────────────────────────────────────────────────────
describe('Memory clear', () => {
  it('DELETE /api/memory clears all chunks', async () => {
    await request(app).post('/api/memory').send({ content: 'Chunk A' });
    await request(app).post('/api/memory').send({ content: 'Chunk B' });
    const before = await request(app).get('/api/memory');
    expect(before.body.total).toBeGreaterThanOrEqual(2);

    const del = await request(app).delete('/api/memory');
    expect(del.status).toBe(200);

    const after = await request(app).get('/api/memory');
    expect(after.body.total).toBe(0);
  });
});

// ── Backup includes memory ────────────────────────────────────────────────────
describe('Backup ZIP includes memory without secrets', () => {
  beforeAll(async () => {
    await request(app).post('/api/memory').send({
      content: 'Table users avec colonnes id et email',
      source: 'manual',
    });
  });

  afterAll(async () => {
    await request(app).delete('/api/memory');
  });

  it('ZIP contains memory.json', async () => {
    const res = await request(app).get('/api/backup/download')
      .buffer(true).parse((res, fn) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => fn(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    const raw = res.body.toString('latin1');
    expect(raw).toMatch(/memory\.json/);
  });

  it('ZIP memory.json contains no API key patterns', async () => {
    await request(app).post('/api/memory').send({
      content: 'sk-ant-api03-ABCDEFGHIJKLMNOP doit être effacé',
    });
    const res = await request(app).get('/api/backup/download')
      .buffer(true).parse((res, fn) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => fn(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    const raw = res.body.toString('latin1');
    expect(raw).not.toMatch(/sk-ant-api03/);
  });

  it('POST /api/memory rejects missing content', async () => {
    const res = await request(app).post('/api/memory').send({ source: 'manual' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/content/i);
  });
});

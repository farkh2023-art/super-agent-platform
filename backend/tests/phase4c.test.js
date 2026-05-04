'use strict';

process.env.AI_PROVIDER = 'mock';
process.env.PORT        = '3092';
process.env.DATA_DIR    = './data-test-4c';

const request = require('supertest');
const { app }  = require('../src/server');
const fs       = require('fs');
const path     = require('path');

const TEST_DATA_DIR = path.resolve(__dirname, '..', 'data-test-4c');

afterAll(() => {
  if (fs.existsSync(TEST_DATA_DIR))
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

// ── Memory pagination ─────────────────────────────────────────────────────────
describe('Memory pagination', () => {
  beforeAll(async () => {
    for (let i = 0; i < 25; i++) {
      await request(app).post('/api/memory').send({ content: `Chunk numéro ${i} avec données SQL` });
    }
  });
  afterAll(async () => { await request(app).delete('/api/memory'); });

  it('GET /api/memory returns all fields incl. total', async () => {
    const res = await request(app).get('/api/memory');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(25);
    expect(typeof res.body.limit).toBe('number');
    expect(typeof res.body.offset).toBe('number');
    expect(typeof res.body.hasMore).toBe('boolean');
  });

  it('limit=10 returns 10 chunks with hasMore true', async () => {
    const res = await request(app).get('/api/memory?limit=10&offset=0');
    expect(res.status).toBe(200);
    expect(res.body.chunks.length).toBe(10);
    expect(res.body.total).toBe(25);
    expect(res.body.hasMore).toBe(true);
    expect(res.body.limit).toBe(10);
    expect(res.body.offset).toBe(0);
  });

  it('offset=20,limit=10 returns 5 chunks with hasMore false', async () => {
    const res = await request(app).get('/api/memory?limit=10&offset=20');
    expect(res.status).toBe(200);
    expect(res.body.chunks.length).toBe(5);
    expect(res.body.hasMore).toBe(false);
  });

  it('embeddings are never exposed in paginated response', async () => {
    const res = await request(app).get('/api/memory?limit=5');
    for (const c of res.body.chunks) {
      expect(c.embedding).toBeUndefined();
    }
  });
});

// ── Executions pagination ─────────────────────────────────────────────────────
describe('Executions pagination', () => {
  beforeAll(async () => {
    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        request(app).post('/api/executions').send({ task: `Tâche de test numéro ${i}` })
      )
    );
  }, 30000);

  it('GET /api/executions without params returns all (backwards compat)', async () => {
    const res = await request(app).get('/api/executions');
    expect(res.status).toBe(200);
    expect(res.body.executions).toBeDefined();
    expect(res.body.total).toBeGreaterThanOrEqual(12);
    expect(res.body.limit).toBeUndefined();
  });

  it('limit=5 returns 5 executions with hasMore true', async () => {
    const res = await request(app).get('/api/executions?limit=5&offset=0');
    expect(res.status).toBe(200);
    expect(res.body.executions.length).toBe(5);
    expect(res.body.hasMore).toBe(true);
    expect(res.body.limit).toBe(5);
  });

  it('offset beyond total returns empty array with hasMore false', async () => {
    const total = (await request(app).get('/api/executions')).body.total;
    const res = await request(app).get(`/api/executions?limit=5&offset=${total + 10}`);
    expect(res.status).toBe(200);
    expect(res.body.executions).toEqual([]);
    expect(res.body.hasMore).toBe(false);
  });

  it('total is consistent across pages', async () => {
    const p1 = await request(app).get('/api/executions?limit=5&offset=0');
    const p2 = await request(app).get('/api/executions?limit=5&offset=5');
    expect(p1.body.total).toBe(p2.body.total);
  });
});

// ── Schedule export / import ──────────────────────────────────────────────────
describe('Schedule export / import', () => {
  let schedId;

  beforeAll(async () => {
    const res = await request(app).post('/api/schedules').send({
      name: 'Daily SQL',
      task: 'Analyser la base de données SQL',
      intervalMs: 86400000,
    });
    schedId = res.body.id;
  });
  afterAll(async () => {
    if (schedId) await request(app).delete(`/api/schedules/${schedId}`);
  });

  it('GET /api/schedules/export returns schedules array', async () => {
    const res = await request(app).get('/api/schedules/export');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.schedules)).toBe(true);
    expect(res.body.exportedAt).toBeDefined();
    expect(res.body.total).toBeGreaterThanOrEqual(1);
  });

  it('exported schedule has expected fields', async () => {
    const res = await request(app).get('/api/schedules/export');
    const s = res.body.schedules.find((x) => x.id === schedId);
    expect(s).toBeDefined();
    expect(s.name).toBe('Daily SQL');
    expect(s.intervalMs).toBe(86400000);
  });

  it('POST /api/schedules/import assigns new IDs', async () => {
    const exportRes = await request(app).get('/api/schedules/export');
    const orig = exportRes.body.schedules.find((x) => x.id === schedId);
    const importRes = await request(app).post('/api/schedules/import').send({
      schedules: [orig],
    });
    expect(importRes.status).toBe(200);
    expect(importRes.body.imported).toBe(1);
    const newId = importRes.body.schedules[0].id;
    expect(newId).not.toBe(schedId);
    // cleanup
    await request(app).delete(`/api/schedules/${newId}`);
  });

  it('import with empty array returns 400', async () => {
    const res = await request(app).post('/api/schedules/import').send({ schedules: [] });
    expect(res.status).toBe(400);
  });

  it('import skips entries missing required fields', async () => {
    const res = await request(app).post('/api/schedules/import').send({
      schedules: [{ name: 'Missing task and interval' }],
    });
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(0);
  });

  it('export contains no API key patterns', async () => {
    const res = await request(app).get('/api/schedules/export');
    const raw = JSON.stringify(res.body);
    expect(raw).not.toMatch(/sk-ant-[A-Za-z0-9]/);
    expect(raw).not.toMatch(/"anthropicApiKey"/);
  });
});

// ── Memory export / import ────────────────────────────────────────────────────
describe('Memory export / import', () => {
  afterEach(async () => { await request(app).delete('/api/memory'); });

  it('GET /api/memory/export returns chunks without embeddings', async () => {
    await request(app).post('/api/memory').send({
      content: 'Table orders avec colonnes order_id, user_id, amount',
    });
    const res = await request(app).get('/api/memory/export');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.chunks)).toBe(true);
    expect(res.body.exportedAt).toBeDefined();
    expect(res.body.total).toBe(1);
    expect(res.body.chunks[0].embedding).toBeUndefined();
  });

  it('POST /api/memory/import assigns new IDs and sanitizes content', async () => {
    await request(app).post('/api/memory').send({ content: 'Table products: product_id, name' });
    const exportRes = await request(app).get('/api/memory/export');
    const orig = exportRes.body.chunks[0];

    await request(app).delete('/api/memory');

    const importRes = await request(app).post('/api/memory/import').send({
      chunks: [orig],
    });
    expect(importRes.status).toBe(200);
    expect(importRes.body.imported).toBe(1);
    expect(importRes.body.chunks[0].id).not.toBe(orig.id);
    expect(importRes.body.chunks[0].embedding).toBeUndefined();
  });

  it('import sanitizes secrets in content', async () => {
    const res = await request(app).post('/api/memory/import').send({
      chunks: [{ content: 'La clé est sk-ant-api03-ABCDEFGHIJKLMNOPQRS important', source: 'import' }],
    });
    expect(res.status).toBe(200);
    expect(res.body.chunks[0].content).not.toMatch(/sk-ant-/);
    expect(res.body.chunks[0].content).toContain('[REDACTED]');
  });

  it('import with empty array returns 400', async () => {
    const res = await request(app).post('/api/memory/import').send({ chunks: [] });
    expect(res.status).toBe(400);
  });

  it('import skips entries missing content', async () => {
    const res = await request(app).post('/api/memory/import').send({
      chunks: [{ source: 'manual' }],
    });
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(0);
  });

  it('export contains no API key patterns', async () => {
    await request(app).post('/api/memory').send({
      content: 'sk-ant-api03-ABCDEFG will be redacted automatically before storage',
    });
    const res = await request(app).get('/api/memory/export');
    const raw = JSON.stringify(res.body);
    expect(raw).not.toMatch(/sk-ant-api03/);
  });
});

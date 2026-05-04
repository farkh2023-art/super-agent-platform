'use strict';

process.env.AI_PROVIDER = 'mock';
process.env.PORT = '3096';
process.env.DATA_DIR = './data-test-4e-evaluation';
process.env.MEMORY_ENABLED = 'true';
process.env.MEMORY_EMBEDDINGS = 'false';

const request = require('supertest');
const fs = require('fs');
const path = require('path');
const { app } = require('../src/server');
const evaluator = require('../src/memory/evaluator');

const TEST_DATA_DIR = path.resolve(__dirname, '..', 'data-test-4e-evaluation');

afterAll(async () => {
  await request(app).delete('/api/memory');
  if (fs.existsSync(TEST_DATA_DIR)) fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

describe('Phase 4E RAG evaluation', () => {
  beforeAll(async () => {
    await request(app).delete('/api/memory');
    await request(app).post('/api/memory').send({
      content: 'Jest async warning worker cleanup regression note',
      source: 'manual',
    });
    await request(app).post('/api/memory').send({
      content: 'FDTD nanoparticules plasmon simulation content',
      source: 'manual',
    });
  });

  it('CRUD evaluation queries', async () => {
    const create = await request(app).post('/api/memory/evaluation/queries').send({
      query: 'jest worker warning',
      expectedKeywords: ['jest', 'worker'],
      expectedTypes: ['manual_note'],
      description: 'Find Jest warning memory',
    });
    expect(create.status).toBe(201);
    expect(create.body.query).toBe('jest worker warning');

    const list = await request(app).get('/api/memory/evaluation/queries');
    expect(list.status).toBe(200);
    expect(list.body.queries.some((q) => q.id === create.body.id)).toBe(true);

    const update = await request(app).put(`/api/memory/evaluation/queries/${create.body.id}`).send({
      query: 'updated jest worker',
      expectedKeywords: ['updated', 'jest'],
    });
    expect(update.status).toBe(200);
    expect(update.body.query).toBe('updated jest worker');

    const del = await request(app).delete(`/api/memory/evaluation/queries/${create.body.id}`);
    expect(del.status).toBe(200);
  });

  it('computes precision@K, recall@K and nDCG@K', () => {
    const results = [
      { title: 'Jest warning', excerpt: '', content: '', metadata: {} },
      { title: 'Other', excerpt: 'worker pool', content: '', metadata: {} },
      { title: 'No match', excerpt: '', content: '', metadata: {} },
    ];
    expect(evaluator.precisionAtK(results, ['jest', 'worker'], 2)).toBe(1);
    expect(evaluator.recallAtK(results, ['jest', 'worker'], 2)).toBe(1);
    expect(evaluator.ndcgAtK(results, ['jest', 'worker'], 2)).toBeGreaterThan(0.9);
  });

  it('runs evaluation without embeddings and marks vector unavailable', async () => {
    const res = await request(app).post('/api/memory/evaluation/run').send({
      topK: 5,
      modes: ['keyword', 'vector', 'hybrid'],
    });
    expect(res.status).toBe(200);
    expect(res.body.summary.totalQueries).toBeGreaterThan(0);
    expect(res.body.summary.embeddingsAvailable).toBe(false);
    expect(res.body.summary.averagePrecisionAtK.keyword).not.toBeNull();
    const first = res.body.results[0];
    expect(first.modes.vector.available).toBe(false);
    expect(first.modes.hybrid.modeUsed).toBe('keyword');
  });

  it('exports a markdown evaluation report', async () => {
    await request(app).post('/api/memory/evaluation/run').send({ topK: 5 });
    const res = await request(app).post('/api/memory/evaluation/export-report').send({});
    expect(res.status).toBe(200);
    expect(res.body.filename).toMatch(/^rag-evaluation-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\.md$/);
    expect(res.body.markdown).toContain('RAG Evaluation Report');
    expect(fs.existsSync(res.body.path)).toBe(true);
  });
});

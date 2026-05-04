'use strict';

process.env.AI_PROVIDER = 'mock';
process.env.PORT = '3097';
process.env.DATA_DIR = './data-test-4e-cleanup';
process.env.MEMORY_ENABLED = 'true';
process.env.MEMORY_EMBEDDINGS = 'false';
process.env.MEMORY_EMBEDDING_MODEL = 'nomic-embed-text';

const request = require('supertest');
const fs = require('fs');
const path = require('path');
const { app } = require('../src/server');
const embeddingStore = require('../src/memory/embeddingStore');
const { contentHash } = require('../src/memory/embeddings');

const TEST_DATA_DIR = path.resolve(__dirname, '..', 'data-test-4e-cleanup');

afterAll(async () => {
  await request(app).delete('/api/memory');
  if (fs.existsSync(TEST_DATA_DIR)) fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

describe('Phase 4E embedding cleanup', () => {
  let memoryId;

  beforeEach(async () => {
    await request(app).delete('/api/memory');
    embeddingStore.clearEmbeddings();
    const created = await request(app).post('/api/memory').send({ content: 'Current memory content for embedding integrity' });
    memoryId = created.body.id;
  });

  it('detects orphan and stale embeddings', async () => {
    embeddingStore.upsertEmbedding({
      memoryId: 'missing-memory-id',
      model: 'nomic-embed-text',
      embedding: [1, 0, 0],
      contentHash: 'hash',
    });
    embeddingStore.upsertEmbedding({
      memoryId,
      model: 'nomic-embed-text',
      embedding: [0, 1, 0],
      contentHash: 'stale-hash',
    });

    const res = await request(app).get('/api/memory/embeddings/integrity');
    expect(res.status).toBe(200);
    expect(res.body.totalEmbeddings).toBe(2);
    expect(res.body.orphans).toBe(1);
    expect(res.body.stale).toBe(1);
  });

  it('cleans orphan and stale embeddings without deleting memory', async () => {
    embeddingStore.upsertEmbedding({
      memoryId: 'missing-memory-id',
      model: 'nomic-embed-text',
      embedding: [1, 0, 0],
      contentHash: 'hash',
    });
    embeddingStore.upsertEmbedding({
      memoryId,
      model: 'nomic-embed-text',
      embedding: [0, 1, 0],
      contentHash: 'stale-hash',
    });

    const cleanup = await request(app).post('/api/memory/embeddings/cleanup').send({});
    expect(cleanup.status).toBe(200);
    expect(cleanup.body.removed).toBe(2);
    const list = await request(app).get('/api/memory');
    expect(list.body.total).toBe(1);
    expect(embeddingStore.listEmbeddings()).toHaveLength(0);
  });

  it('keeps valid embeddings', async () => {
    const item = (await request(app).get('/api/memory')).body.chunks[0];
    embeddingStore.upsertEmbedding({
      memoryId,
      model: 'nomic-embed-text',
      embedding: [1, 0, 0],
      contentHash: contentHash(item.content),
    });

    const cleanup = await request(app).post('/api/memory/embeddings/cleanup').send({});
    expect(cleanup.body.removed).toBe(0);
    expect(embeddingStore.listEmbeddings()).toHaveLength(1);
  });
});

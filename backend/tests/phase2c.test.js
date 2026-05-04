'use strict';

process.env.AI_PROVIDER = 'mock';
process.env.PORT = '3097';
process.env.DATA_DIR = './data-test-2c';
process.env.MAX_CONCURRENT_EXECUTIONS = '3';

const request = require('supertest');
const { app } = require('../src/server');
const fs = require('fs');
const path = require('path');

const TEST_DATA_DIR = path.resolve(__dirname, '..', 'data-test-2c');

afterAll(() => {
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
});

// ── Health detailed ────────────────────────────────────────────────────────────
describe('GET /api/health/detailed', () => {
  it('returns 200 with required sections', async () => {
    const res = await request(app).get('/api/health/detailed');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.system).toBeDefined();
    expect(res.body.storage).toBeDefined();
    expect(res.body.concurrency).toBeDefined();
    expect(res.body.agents).toBeDefined();
  });

  it('returns system.node and platform', async () => {
    const res = await request(app).get('/api/health/detailed');
    expect(res.body.system.node).toBeDefined();
    expect(res.body.system.platform).toBeDefined();
    expect(res.body.system.memoryMB).toBeDefined();
  });

  it('returns concurrency stats with correct max', async () => {
    const res = await request(app).get('/api/health/detailed');
    expect(res.body.concurrency.max).toBe(3);
    expect(typeof res.body.concurrency.active).toBe('number');
    expect(typeof res.body.concurrency.queued).toBe('number');
  });

  it('returns agents total of 10', async () => {
    const res = await request(app).get('/api/health/detailed');
    expect(res.body.agents.total).toBe(10);
  });
});

// ── Search ─────────────────────────────────────────────────────────────────────
describe('GET /api/search', () => {
  it('returns 400 when q is missing', async () => {
    const res = await request(app).get('/api/search');
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('returns structured results for a query', async () => {
    const res = await request(app).get('/api/search?q=test');
    expect(res.status).toBe(200);
    expect(res.body.query).toBe('test');
    expect(res.body.results).toBeDefined();
    expect(Array.isArray(res.body.results.tasks)).toBe(true);
    expect(Array.isArray(res.body.results.executions)).toBe(true);
    expect(Array.isArray(res.body.results.artifacts)).toBe(true);
    expect(Array.isArray(res.body.results.workflows)).toBe(true);
    expect(typeof res.body.total).toBe('number');
  });

  it('finds a workflow by name', async () => {
    // Create a searchable workflow
    await request(app).post('/api/workflows').send({
      name: 'SuperSearch Pipeline',
      steps: [{ name: 'Step 1', task: 'Analyse SQL', agentIds: ['data-lineage-en'] }],
    });
    const res = await request(app).get('/api/search?q=supersearch');
    expect(res.status).toBe(200);
    expect(res.body.results.workflows.length).toBeGreaterThanOrEqual(1);
    expect(res.body.results.workflows[0].name).toContain('SuperSearch');
  });

  it('supports type filter', async () => {
    const res = await request(app).get('/api/search?q=sql&type=workflows');
    expect(res.status).toBe(200);
    expect(res.body.results.tasks).toBeUndefined();
    expect(res.body.results.executions).toBeUndefined();
    expect(Array.isArray(res.body.results.workflows)).toBe(true);
  });
});

// ── Workflow import/export ─────────────────────────────────────────────────────
describe('Workflow import/export', () => {
  let workflowId;

  beforeAll(async () => {
    const res = await request(app).post('/api/workflows').send({
      name: 'Export Test Workflow',
      description: 'For export/import testing',
      steps: [{ name: 'Step A', task: 'Do something', agentIds: ['repo-indexer'] }],
    });
    workflowId = res.body.id;
  });

  it('exports a workflow as JSON with download headers', async () => {
    const res = await request(app).get(`/api/workflows/${workflowId}/export`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
    expect(res.body.workflow).toBeDefined();
    expect(res.body.workflow.name).toBe('Export Test Workflow');
    expect(res.body.exportedAt).toBeDefined();
  });

  it('imports a workflow and assigns new IDs', async () => {
    const exported = (await request(app).get(`/api/workflows/${workflowId}/export`)).body.workflow;
    const res = await request(app).post('/api/workflows/import').send({ workflow: exported });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.id).not.toBe(workflowId);
    expect(res.body.name).toBe('Export Test Workflow');
    expect(res.body.steps).toHaveLength(1);
    expect(res.body.steps[0].id).not.toBe(exported.steps[0].id);
  });

  it('returns 400 when importing invalid JSON', async () => {
    const res = await request(app).post('/api/workflows/import').send({ workflow: { name: '' } });
    expect(res.status).toBe(400);
  });

  it('exports all workflows', async () => {
    const res = await request(app).get('/api/workflows/export-all');
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
    expect(Array.isArray(res.body.workflows)).toBe(true);
    expect(res.body.exportedAt).toBeDefined();
  });
});

// ── Workflow runs ─────────────────────────────────────────────────────────────
describe('GET /api/workflow-runs', () => {
  it('returns list of runs', async () => {
    const res = await request(app).get('/api/workflow-runs');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.runs)).toBe(true);
    expect(typeof res.body.total).toBe('number');
  });

  it('returns 404 for unknown run', async () => {
    const res = await request(app).get('/api/workflow-runs/does-not-exist');
    expect(res.status).toBe(404);
  });
});

// ── Backup ────────────────────────────────────────────────────────────────────
describe('GET /api/backup/download', () => {
  it('returns a ZIP file with correct headers', async () => {
    const res = await request(app).get('/api/backup/download');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/zip/);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
    expect(res.headers['content-disposition']).toMatch(/superagent_backup/);
  });

  it('returns non-empty ZIP body', async () => {
    const res = await request(app).get('/api/backup/download').buffer(true).parse((res, fn) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => fn(null, Buffer.concat(chunks)));
    });
    expect(res.body.length).toBeGreaterThan(100);
  });
});

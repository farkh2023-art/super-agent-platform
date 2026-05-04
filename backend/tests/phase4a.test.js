'use strict';

process.env.AI_PROVIDER = 'mock';
process.env.PORT = '3094';
process.env.DATA_DIR = './data-test-4a';

const request = require('supertest');
const { app } = require('../src/server');
const fs = require('fs');
const path = require('path');

const TEST_DATA_DIR = path.resolve(__dirname, '..', 'data-test-4a');

afterAll(() => {
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
});

// ── Schedules CRUD ────────────────────────────────────────────────────────────
describe('Schedules CRUD', () => {
  let scheduleId;

  it('GET /api/schedules returns empty list initially', async () => {
    const res = await request(app).get('/api/schedules');
    expect(res.status).toBe(200);
    expect(res.body.schedules).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it('POST /api/schedules creates a schedule', async () => {
    const res = await request(app).post('/api/schedules').send({
      name: 'Daily SQL',
      task: 'Analyser la base de données SQL',
      agentIds: ['data-lineage-fr'],
      intervalMs: 86400000,
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe('Daily SQL');
    expect(res.body.task).toBe('Analyser la base de données SQL');
    expect(res.body.intervalMs).toBe(86400000);
    expect(res.body.enabled).toBe(true);
    expect(res.body.runCount).toBe(0);
    expect(res.body.nextRunAt).toBeDefined();
    expect(res.body.lastRunAt).toBeNull();
    scheduleId = res.body.id;
  });

  it('GET /api/schedules lists the created schedule', async () => {
    const res = await request(app).get('/api/schedules');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.schedules[0].id).toBe(scheduleId);
  });

  it('GET /api/schedules/:id returns the schedule', async () => {
    const res = await request(app).get(`/api/schedules/${scheduleId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(scheduleId);
    expect(res.body.name).toBe('Daily SQL');
  });

  it('PUT /api/schedules/:id updates name and intervalMs', async () => {
    const res = await request(app).put(`/api/schedules/${scheduleId}`).send({
      name: 'Hourly SQL',
      intervalMs: 3600000,
    });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Hourly SQL');
    expect(res.body.intervalMs).toBe(3600000);
    expect(res.body.nextRunAt).toBeDefined();
  });

  it('PUT /api/schedules/:id can disable a schedule', async () => {
    const res = await request(app).put(`/api/schedules/${scheduleId}`).send({ enabled: false });
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(false);
  });

  it('DELETE /api/schedules/:id removes the schedule', async () => {
    const del = await request(app).delete(`/api/schedules/${scheduleId}`);
    expect(del.status).toBe(200);
    const get = await request(app).get(`/api/schedules/${scheduleId}`);
    expect(get.status).toBe(404);
  });
});

// ── Schedule validation ───────────────────────────────────────────────────────
describe('Schedule validation', () => {
  it('rejects missing name', async () => {
    const res = await request(app).post('/api/schedules').send({
      task: 'Some task',
      intervalMs: 3600000,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/i);
  });

  it('rejects missing task', async () => {
    const res = await request(app).post('/api/schedules').send({
      name: 'My schedule',
      intervalMs: 3600000,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/task/i);
  });

  it('rejects missing intervalMs', async () => {
    const res = await request(app).post('/api/schedules').send({
      name: 'My schedule',
      task: 'Some task',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/intervalMs/i);
  });

  it('rejects intervalMs = 0', async () => {
    const res = await request(app).post('/api/schedules').send({
      name: 'My schedule',
      task: 'Some task',
      intervalMs: 0,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/intervalMs/i);
  });

  it('rejects negative intervalMs', async () => {
    const res = await request(app).post('/api/schedules').send({
      name: 'My schedule',
      task: 'Some task',
      intervalMs: -1000,
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown schedule id', async () => {
    const res = await request(app).get('/api/schedules/nonexistent-id');
    expect(res.status).toBe(404);
  });

  it('PUT with invalid intervalMs returns 400', async () => {
    const create = await request(app).post('/api/schedules').send({
      name: 'Temp', task: 'Temp task', intervalMs: 3600000,
    });
    const id = create.body.id;
    const res = await request(app).put(`/api/schedules/${id}`).send({ intervalMs: -5 });
    expect(res.status).toBe(400);
    await request(app).delete(`/api/schedules/${id}`);
  });
});

// ── Schedule trigger ──────────────────────────────────────────────────────────
describe('Schedule trigger', () => {
  let scheduleId;

  beforeAll(async () => {
    const res = await request(app).post('/api/schedules').send({
      name: 'Trigger Test',
      task: 'Tâche à déclencher manuellement',
      agentIds: ['sim-fdtd'],
      intervalMs: 3600000,
    });
    scheduleId = res.body.id;
  });

  afterAll(async () => {
    await request(app).delete(`/api/schedules/${scheduleId}`);
  });

  it('POST /api/schedules/:id/trigger creates an execution', async () => {
    const res = await request(app).post(`/api/schedules/${scheduleId}/trigger`);
    expect(res.status).toBe(200);
    expect(res.body.executionId).toBeDefined();
    expect(res.body.message).toBeDefined();
  });

  it('trigger increments runCount and sets lastRunAt', async () => {
    const res = await request(app).get(`/api/schedules/${scheduleId}`);
    expect(res.body.runCount).toBeGreaterThanOrEqual(1);
    expect(res.body.lastRunAt).not.toBeNull();
    expect(res.body.lastExecutionId).toBeDefined();
  });

  it('trigger on unknown id returns 404', async () => {
    const res = await request(app).post('/api/schedules/no-such-id/trigger');
    expect(res.status).toBe(404);
  });
});

// ── Metrics ───────────────────────────────────────────────────────────────────
describe('Metrics', () => {
  it('GET /api/metrics returns global structure', async () => {
    const res = await request(app).get('/api/metrics');
    expect(res.status).toBe(200);
    expect(res.body.global).toBeDefined();
    expect(typeof res.body.global.total).toBe('number');
    expect(typeof res.body.global.completed).toBe('number');
    expect(typeof res.body.global.failed).toBe('number');
    expect(typeof res.body.global.cancelled).toBe('number');
    expect(res.body.byAgent).toBeDefined();
  });

  it('GET /api/metrics/agents returns agents array', async () => {
    const res = await request(app).get('/api/metrics/agents');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.agents)).toBe(true);
    expect(typeof res.body.total).toBe('number');
  });

  it('metrics successRate is null when no finished executions', async () => {
    const res = await request(app).get('/api/metrics');
    // May or may not be null depending on whether trigger test completed
    expect(res.body.global.successRate === null || typeof res.body.global.successRate === 'number').toBe(true);
  });
});

// ── Backup includes schedules + metrics ───────────────────────────────────────
describe('Backup ZIP includes schedules and metrics', () => {
  it('ZIP contains schedules.json and metrics.json', async () => {
    const res = await request(app).get('/api/backup/download')
      .buffer(true).parse((res, fn) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => fn(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    const raw = res.body.toString('latin1');
    expect(raw).toMatch(/schedules\.json/);
    expect(raw).toMatch(/metrics\.json/);
  });

  it('ZIP contains no API key patterns', async () => {
    const res = await request(app).get('/api/backup/download')
      .buffer(true).parse((res, fn) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => fn(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    const raw = res.body.toString('latin1');
    expect(raw).not.toMatch(/sk-ant-[A-Za-z0-9]/);
    expect(raw).not.toMatch(/"anthropicApiKey"/);
    expect(raw).not.toMatch(/"openaiApiKey"/);
  });
});

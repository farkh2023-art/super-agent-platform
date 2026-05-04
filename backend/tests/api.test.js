'use strict';

process.env.AI_PROVIDER = 'mock';
process.env.PORT = '3099';
process.env.DATA_DIR = './data-test';

const request = require('supertest');
const { app } = require('../src/server');
const fs = require('fs');
const path = require('path');

const TEST_DATA_DIR = path.resolve(__dirname, '..', 'data-test');

afterAll(() => {
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
});

describe('GET /api/health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.version).toBe('1.0.0');
    expect(res.body.provider).toBe('mock');
  });
});

describe('GET /api/agents', () => {
  it('returns 10 agents', async () => {
    const res = await request(app).get('/api/agents');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(10);
    expect(Array.isArray(res.body.agents)).toBe(true);
    expect(res.body.agents).toHaveLength(10);
  });

  it('returns agents with required fields', async () => {
    const res = await request(app).get('/api/agents');
    for (const agent of res.body.agents) {
      expect(agent.id).toBeDefined();
      expect(agent.name).toBeDefined();
      expect(agent.emoji).toBeDefined();
      expect(agent.description).toBeDefined();
    }
  });
});

describe('GET /api/agents/:id', () => {
  it('returns agent by id', async () => {
    const res = await request(app).get('/api/agents/sim-fdtd');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('sim-fdtd');
    expect(res.body.name).toContain('SimAgent');
  });

  it('returns 404 for unknown agent', async () => {
    const res = await request(app).get('/api/agents/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });
});

describe('GET /api/agents/categories', () => {
  it('returns categories list', async () => {
    const res = await request(app).get('/api/agents/categories');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.categories)).toBe(true);
    expect(res.body.categories.length).toBeGreaterThan(0);
  });
});

describe('POST /api/tasks', () => {
  it('creates a task with a plan', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ task: 'Analyse la base de données SQL pour la lignée de données' });
    expect(res.status).toBe(201);
    expect(res.body.task).toBeDefined();
    expect(res.body.task.id).toBeDefined();
    expect(res.body.task.plan).toBeDefined();
    expect(res.body.task.plan.agents).toBeDefined();
    expect(Array.isArray(res.body.task.plan.agents)).toBe(true);
  }, 15000);

  it('returns 400 when task is missing', async () => {
    const res = await request(app).post('/api/tasks').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('returns 400 when task is empty string', async () => {
    const res = await request(app).post('/api/tasks').send({ task: '   ' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/tasks', () => {
  it('returns tasks list', async () => {
    const res = await request(app).get('/api/tasks');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.tasks)).toBe(true);
  });
});

describe('GET /api/settings/status', () => {
  it('returns provider status', async () => {
    const res = await request(app).get('/api/settings/status');
    expect(res.status).toBe(200);
    expect(res.body.provider).toBe('mock');
    expect(res.body.mockMode).toBe(true);
  });
});

describe('GET /api/executions', () => {
  it('returns executions list', async () => {
    const res = await request(app).get('/api/executions');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.executions)).toBe(true);
  });
});

describe('GET /api/artifacts', () => {
  it('returns artifacts list', async () => {
    const res = await request(app).get('/api/artifacts');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.artifacts)).toBe(true);
  });
});

describe('Workflow CRUD', () => {
  let workflowId;

  it('creates a workflow', async () => {
    const res = await request(app)
      .post('/api/workflows')
      .send({
        name: 'Test Workflow',
        description: 'A test workflow',
        steps: [
          { name: 'Step 1', task: 'Analyse SQL', agentIds: ['data-lineage-en'] },
          { name: 'Step 2', task: 'Generate backlog', agentIds: ['backlog-forge'] },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.steps).toHaveLength(2);
    workflowId = res.body.id;
  });

  it('gets the workflow by id', async () => {
    const res = await request(app).get(`/api/workflows/${workflowId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(workflowId);
    expect(res.body.name).toBe('Test Workflow');
  });

  it('lists workflows', async () => {
    const res = await request(app).get('/api/workflows');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.workflows)).toBe(true);
    expect(res.body.workflows.some((w) => w.id === workflowId)).toBe(true);
  });

  it('deletes the workflow', async () => {
    const res = await request(app).delete(`/api/workflows/${workflowId}`);
    expect(res.status).toBe(200);
    const check = await request(app).get(`/api/workflows/${workflowId}`);
    expect(check.status).toBe(404);
  });

  it('returns 400 for workflow without steps', async () => {
    const res = await request(app)
      .post('/api/workflows')
      .send({ name: 'Empty Workflow', steps: [] });
    expect(res.status).toBe(400);
  });
});

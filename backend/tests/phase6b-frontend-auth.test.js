'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

function tmpDir() {
  const d = path.join(os.tmpdir(), `sap-6b-${crypto.randomBytes(6).toString('hex')}`);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

// ── Auth mode endpoint ────────────────────────────────────────────────────────

describe('Phase 6B — GET /api/auth/mode (always public)', () => {
  let app;

  beforeEach(() => {
    jest.resetModules();
    process.env.DATA_DIR = tmpDir();
    delete process.env.AUTH_MODE;
    delete process.env.JWT_SECRET;
    app = require('../src/server').app;
  });

  test('returns single by default', async () => {
    const request = require('supertest');
    const res = await request(app).get('/api/auth/mode');
    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('single');
  });

  test('returns multi when AUTH_MODE=multi', async () => {
    jest.resetModules();
    process.env.DATA_DIR = tmpDir();
    process.env.AUTH_MODE = 'multi';
    process.env.JWT_SECRET = 'test-secret-phase6b';
    const appMulti = require('../src/server').app;
    const request = require('supertest');
    const res = await request(appMulti).get('/api/auth/mode');
    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('multi');
    delete process.env.AUTH_MODE;
    delete process.env.JWT_SECRET;
  });
});

// ── Tasks accept workspaceId ──────────────────────────────────────────────────

describe('Phase 6B — POST /api/tasks accepts workspaceId', () => {
  let app, request;

  beforeEach(() => {
    jest.resetModules();
    process.env.DATA_DIR = tmpDir();
    delete process.env.AUTH_MODE;
    app = require('../src/server').app;
    request = require('supertest');
  });

  test('task is created with workspaceId when provided', async () => {
    const wsId = crypto.randomUUID();
    const res = await request(app)
      .post('/api/tasks')
      .send({ task: 'Analyse le système', workspaceId: wsId });
    expect(res.status).toBe(201);
    expect(res.body.task).toBeDefined();
    expect(res.body.task.workspaceId).toBe(wsId);
  });

  test('task created without workspaceId has no workspaceId field', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ task: 'Analyse le système sans workspace' });
    expect(res.status).toBe(201);
    expect(res.body.task.workspaceId).toBeUndefined();
  });

  test('workspaceId is stored as string', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ task: 'Test string coerce', workspaceId: 42 });
    expect(res.status).toBe(201);
    expect(typeof res.body.task.workspaceId).toBe('string');
    expect(res.body.task.workspaceId).toBe('42');
  });
});

// ── Single-user mode — no token required ─────────────────────────────────────

describe('Phase 6B — single-user mode backward compat', () => {
  let app, request;

  beforeEach(() => {
    jest.resetModules();
    process.env.DATA_DIR = tmpDir();
    delete process.env.AUTH_MODE;
    delete process.env.API_KEY;
    app = require('../src/server').app;
    request = require('supertest');
  });

  test('GET /api/agents returns 200 without token', async () => {
    const res = await request(app).get('/api/agents');
    expect(res.status).toBe(200);
  });

  test('GET /api/tasks returns 200 without token', async () => {
    const res = await request(app).get('/api/tasks');
    expect(res.status).toBe(200);
  });

  test('GET /api/dashboard/stats returns 200 without token', async () => {
    const res = await request(app).get('/api/dashboard/stats');
    expect(res.status).toBe(200);
  });
});

// ── Multi-user mode — login required ─────────────────────────────────────────

describe('Phase 6B — multi-user mode login flow', () => {
  let app, request;

  beforeEach(() => {
    jest.resetModules();
    process.env.DATA_DIR = tmpDir();
    process.env.AUTH_MODE = 'multi';
    process.env.JWT_SECRET = 'phase6b-test-secret';
    app = require('../src/server').app;
    request = require('supertest');
  });

  afterEach(() => {
    delete process.env.AUTH_MODE;
    delete process.env.JWT_SECRET;
  });

  test('POST /api/auth/login returns token for valid credentials', async () => {
    const users = require('../src/auth/users');
    users.createUser({ username: 'alice', password: 'pass123', role: 'admin' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'alice', password: 'pass123' });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.token.length).toBeGreaterThan(10);
    expect(res.body.user.username).toBe('alice');
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  test('protected route returns 401 without token', async () => {
    const res = await request(app).get('/api/agents');
    expect(res.status).toBe(401);
  });

  test('protected route is accessible with valid token', async () => {
    const users = require('../src/auth/users');
    users.createUser({ username: 'bob', password: 'secure99', role: 'admin' });
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'bob', password: 'secure99' });
    const token = loginRes.body.token;

    const res = await request(app)
      .get('/api/agents')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  test('GET /api/auth/me returns user info (no passwordHash)', async () => {
    const users = require('../src/auth/users');
    users.createUser({ username: 'carol', password: 'mypass', role: 'user' });
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'carol', password: 'mypass' });
    const token = loginRes.body.token;

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('carol');
    expect(res.body.user.passwordHash).toBeUndefined();
  });
});

// ── Workspace task route used by Command Center ───────────────────────────────

describe('Phase 6B — workspace-scoped task creation', () => {
  let app, request, token, wsId;

  beforeEach(async () => {
    jest.resetModules();
    process.env.DATA_DIR = tmpDir();
    process.env.AUTH_MODE = 'multi';
    process.env.JWT_SECRET = 'phase6b-ws-secret';
    app = require('../src/server').app;
    request = require('supertest');

    const users = require('../src/auth/users');
    const wsStore = require('../src/auth/workspaces');
    users.createUser({ username: 'dave', password: 'davepass', role: 'admin' });
    const ws = wsStore.createWorkspace({ name: 'Test WS', limits: { maxTasks: 10, maxExecutions: 5 } });
    wsId = ws.id;

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'dave', password: 'davepass' });
    token = loginRes.body.token;
  });

  afterEach(() => {
    delete process.env.AUTH_MODE;
    delete process.env.JWT_SECRET;
  });

  test('GET /api/workspaces/:id/tasks returns workspace tasks', async () => {
    const res = await request(app)
      .get(`/api/workspaces/${wsId}/tasks`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.tasks)).toBe(true);
  });

  test('POST /api/workspaces/:id/tasks creates task tagged with workspaceId', async () => {
    const res = await request(app)
      .post(`/api/workspaces/${wsId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Task via Command Center', type: 'ai-task' });
    expect(res.status).toBe(201);
    expect(res.body.task.workspaceId).toBe(wsId);
  });

  test('workspace task appears in GET /api/workspaces/:id/tasks list', async () => {
    await request(app)
      .post(`/api/workspaces/${wsId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Visible task' });

    const res = await request(app)
      .get(`/api/workspaces/${wsId}/tasks`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.tasks.some((t) => t.title === 'Visible task')).toBe(true);
  });
});

// ── Audit log not exposing secrets ───────────────────────────────────────────

describe('Phase 6B — audit log hides secrets', () => {
  let app, request, token;

  beforeEach(async () => {
    jest.resetModules();
    process.env.DATA_DIR = tmpDir();
    process.env.AUTH_MODE = 'multi';
    process.env.JWT_SECRET = 'phase6b-audit-secret';
    app = require('../src/server').app;
    request = require('supertest');

    const users = require('../src/auth/users');
    users.createUser({ username: 'eve', password: 'evepass', role: 'admin' });
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'eve', password: 'evepass' });
    token = loginRes.body.token;

    // Trigger a mutating request to generate an audit entry
    await request(app)
      .post('/api/auth/register')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'frank', password: 'frankpass', role: 'user' });
  });

  afterEach(() => {
    delete process.env.AUTH_MODE;
    delete process.env.JWT_SECRET;
  });

  test('GET /api/auth/audit-log returns entries without passwordHash', async () => {
    const res = await request(app)
      .get('/api/auth/audit-log')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const entries = res.body.entries || [];
    entries.forEach((e) => {
      expect(JSON.stringify(e)).not.toContain('scrypt:');
      expect(e.passwordHash).toBeUndefined();
    });
  });
});

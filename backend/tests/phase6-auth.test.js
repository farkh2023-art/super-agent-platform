'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');

function setupEnv(suffix = '', authMode = 'single') {
  jest.resetModules();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `sap-6${suffix}-`));
  process.env.DATA_DIR = dir;
  process.env.STORAGE_MODE = 'json';
  process.env.SQLITE_DB_PATH = path.join(dir, 'test6.sqlite');
  process.env.AUTH_MODE = authMode;
  process.env.JWT_SECRET = 'test-secret-phase6';
  process.env.RATE_LIMIT_MAX_REQUESTS = '5';
  process.env.RATE_LIMIT_WINDOW_MS = '60000';
  delete process.env.API_KEY;
  return dir;
}

// ─── JWT ──────────────────────────────────────────────────────────────────────
describe('Phase 6 — JWT', () => {
  test('sign and verify a valid token', () => {
    setupEnv('-jwt0');
    const jwt = require('../src/auth/jwt');
    const token = jwt.sign({ id: 'u1', username: 'alice', role: 'user' });
    const payload = jwt.verify(token);
    expect(payload.username).toBe('alice');
    expect(payload.id).toBe('u1');
  });

  test('verify rejects token with wrong signature', () => {
    setupEnv('-jwt1');
    const jwt = require('../src/auth/jwt');
    const token = jwt.sign({ id: 'u1' });
    const tampered = token.slice(0, -3) + 'xxx';
    expect(() => jwt.verify(tampered)).toThrow();
  });

  test('verify rejects expired token', () => {
    setupEnv('-jwt2');
    const jwt = require('../src/auth/jwt');
    const token = jwt.sign({ id: 'u1' }, -1);
    expect(() => jwt.verify(token)).toThrow(/expired/i);
  });

  test('verify rejects malformed token', () => {
    setupEnv('-jwt3');
    const jwt = require('../src/auth/jwt');
    expect(() => jwt.verify('not.a.token.extra')).toThrow();
    expect(() => jwt.verify('')).toThrow();
  });
});

// ─── Users ────────────────────────────────────────────────────────────────────
describe('Phase 6 — Users', () => {
  test('createUser stores hashed password, returns safe user without hash', () => {
    const dir = setupEnv('-usr0');
    const users = require('../src/auth/users');
    const user = users.createUser({ username: 'alice', password: 'secret123', role: 'admin', workspaceId: 'ws1' });
    expect(user.username).toBe('alice');
    expect(user.role).toBe('admin');
    expect(user.passwordHash).toBeUndefined();
    const raw = JSON.parse(fs.readFileSync(path.join(dir, 'users.json'), 'utf8'));
    expect(raw[0].passwordHash).toMatch(/^scrypt:/);
  });

  test('authenticate returns user with correct password', () => {
    setupEnv('-usr1');
    const users = require('../src/auth/users');
    users.createUser({ username: 'bob', password: 'pass42' });
    const user = users.authenticate('bob', 'pass42');
    expect(user).not.toBeNull();
    expect(user.username).toBe('bob');
    expect(user.passwordHash).toBeUndefined();
  });

  test('authenticate returns null with wrong password', () => {
    setupEnv('-usr2');
    const users = require('../src/auth/users');
    users.createUser({ username: 'carol', password: 'correct' });
    expect(users.authenticate('carol', 'wrong')).toBeNull();
    expect(users.authenticate('unknown', 'pass')).toBeNull();
  });

  test('createUser rejects duplicate username', () => {
    setupEnv('-usr3');
    const users = require('../src/auth/users');
    users.createUser({ username: 'dave', password: 'x' });
    expect(() => users.createUser({ username: 'dave', password: 'y' })).toThrow();
  });

  test('listUsers never includes passwordHash', () => {
    setupEnv('-usr4');
    const users = require('../src/auth/users');
    users.createUser({ username: 'eve', password: 'pw' });
    const list = users.listUsers();
    expect(list.length).toBe(1);
    expect(list[0].passwordHash).toBeUndefined();
  });
});

// ─── Workspaces ───────────────────────────────────────────────────────────────
describe('Phase 6 — Workspaces', () => {
  test('createWorkspace creates a workspace with limits', () => {
    setupEnv('-ws0');
    const ws = require('../src/auth/workspaces');
    const created = ws.createWorkspace({ name: 'team-alpha', limits: { maxTasks: 50 } });
    expect(created.name).toBe('team-alpha');
    expect(created.limits.maxTasks).toBe(50);
    expect(created.id).toBeDefined();
  });

  test('findById returns workspace or null', () => {
    setupEnv('-ws1');
    const ws = require('../src/auth/workspaces');
    const created = ws.createWorkspace({ name: 'beta' });
    expect(ws.findById(created.id).name).toBe('beta');
    expect(ws.findById('nonexistent')).toBeNull();
  });

  test('getOrCreate returns existing workspace on second call', () => {
    setupEnv('-ws2');
    const ws = require('../src/auth/workspaces');
    const first = ws.getOrCreate('default');
    const second = ws.getOrCreate('default');
    expect(first.id).toBe(second.id);
    expect(ws.list().length).toBe(1);
  });
});

// ─── AUTH_MODE=single — aucun impact sur les routes existantes ────────────────
describe('Phase 6 — single-user mode (backward compat)', () => {
  test('GET /api/auth/mode returns single', async () => {
    setupEnv('-s0', 'single');
    const { app } = require('../src/server');
    const res = await request(app).get('/api/auth/mode').expect(200);
    expect(res.body.mode).toBe('single');
  });

  test('POST /api/auth/login returns 400 in single mode', async () => {
    setupEnv('-s1', 'single');
    const { app } = require('../src/server');
    await request(app).post('/api/auth/login').send({ username: 'x', password: 'y' }).expect(400);
  });

  test('existing routes accessible without token in single mode', async () => {
    setupEnv('-s2', 'single');
    const { app } = require('../src/server');
    const res = await request(app).get('/api/storage/status').expect(200);
    expect(res.body.mode).toBe('json');
  });
});

// ─── AUTH_MODE=multi — login ──────────────────────────────────────────────────
describe('Phase 6 — multi-user login', () => {
  function setupMulti(suffix) {
    const dir = setupEnv(suffix, 'multi');
    jest.resetModules();
    process.env.DATA_DIR = dir;
    process.env.AUTH_MODE = 'multi';
    process.env.JWT_SECRET = 'test-secret-phase6';
    return dir;
  }

  test('POST /api/auth/login with valid credentials returns JWT', async () => {
    const dir = setupMulti('-ml0');
    const users = require('../src/auth/users');
    const ws = require('../src/auth/workspaces');
    const wsp = ws.createWorkspace({ name: 'default' });
    users.createUser({ username: 'alice', password: 'pass123', workspaceId: wsp.id });
    const { app } = require('../src/server');
    const res = await request(app).post('/api/auth/login').send({ username: 'alice', password: 'pass123' }).expect(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.username).toBe('alice');
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  test('POST /api/auth/login with wrong credentials returns 401', async () => {
    const dir = setupMulti('-ml1');
    const users = require('../src/auth/users');
    const ws = require('../src/auth/workspaces');
    const wsp = ws.createWorkspace({ name: 'default' });
    users.createUser({ username: 'bob', password: 'correct', workspaceId: wsp.id });
    const { app } = require('../src/server');
    await request(app).post('/api/auth/login').send({ username: 'bob', password: 'wrong' }).expect(401);
    await request(app).post('/api/auth/login').send({ username: 'nobody', password: 'x' }).expect(401);
  });

  test('protected routes return 401 without token in multi mode', async () => {
    setupMulti('-ml2');
    const { app } = require('../src/server');
    await request(app).get('/api/storage/status').expect(401);
  });

  test('GET /api/auth/me returns user info with valid token', async () => {
    const dir = setupMulti('-ml3');
    const users = require('../src/auth/users');
    const ws = require('../src/auth/workspaces');
    const jwt = require('../src/auth/jwt');
    const wsp = ws.createWorkspace({ name: 'default' });
    const user = users.createUser({ username: 'carol', password: 'pw', workspaceId: wsp.id });
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role, workspaceId: user.workspaceId });
    const { app } = require('../src/server');
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
    expect(res.body.user.username).toBe('carol');
  });

  test('GET /api/auth/me returns 401 with invalid token', async () => {
    setupMulti('-ml4');
    const { app } = require('../src/server');
    await request(app).get('/api/auth/me').set('Authorization', 'Bearer bad.token.here').expect(401);
  });
});

// ─── Workspace isolation ──────────────────────────────────────────────────────
describe('Phase 6 — workspace isolation', () => {
  function makeToken(payload) {
    const jwt = require('../src/auth/jwt');
    return jwt.sign(payload);
  }

  test('tasks created in workspace A not visible from workspace B', async () => {
    const dir = setupEnv('-iso0', 'multi');
    jest.resetModules();
    process.env.DATA_DIR = dir;
    process.env.AUTH_MODE = 'multi';
    process.env.JWT_SECRET = 'test-secret-phase6';

    const ws = require('../src/auth/workspaces');
    const users = require('../src/auth/users');
    const wsA = ws.createWorkspace({ name: 'team-A' });
    const wsB = ws.createWorkspace({ name: 'team-B' });
    const userA = users.createUser({ username: 'userA', password: 'pw', role: 'user', workspaceId: wsA.id });
    const userB = users.createUser({ username: 'userB', password: 'pw', role: 'user', workspaceId: wsB.id });

    const { app } = require('../src/server');
    const tokenA = makeToken({ id: userA.id, username: userA.username, role: 'user', workspaceId: wsA.id });
    const tokenB = makeToken({ id: userB.id, username: userB.username, role: 'user', workspaceId: wsB.id });

    // Create task in workspace A
    const createRes = await request(app)
      .post(`/api/workspaces/${wsA.id}/tasks`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ task: 'task in workspace A' })
      .expect(201);
    expect(createRes.body.task.workspaceId).toBe(wsA.id);

    // Workspace A sees its task
    const resA = await request(app)
      .get(`/api/workspaces/${wsA.id}/tasks`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(resA.body.tasks.length).toBe(1);

    // Workspace B sees zero tasks
    const resB = await request(app)
      .get(`/api/workspaces/${wsB.id}/tasks`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    expect(resB.body.tasks.length).toBe(0);
  });

  test('user from workspace B cannot access workspace A resources', async () => {
    const dir = setupEnv('-iso1', 'multi');
    jest.resetModules();
    process.env.DATA_DIR = dir;
    process.env.AUTH_MODE = 'multi';
    process.env.JWT_SECRET = 'test-secret-phase6';

    const ws = require('../src/auth/workspaces');
    const users = require('../src/auth/users');
    const wsA = ws.createWorkspace({ name: 'A' });
    const wsB = ws.createWorkspace({ name: 'B' });
    const userB = users.createUser({ username: 'intruder', password: 'pw', role: 'user', workspaceId: wsB.id });

    const { app } = require('../src/server');
    const tokenB = makeToken({ id: userB.id, username: userB.username, role: 'user', workspaceId: wsB.id });

    await request(app)
      .get(`/api/workspaces/${wsA.id}/tasks`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(403);
  });

  test('workspace task limit is enforced', async () => {
    const dir = setupEnv('-iso2', 'multi');
    jest.resetModules();
    process.env.DATA_DIR = dir;
    process.env.AUTH_MODE = 'multi';
    process.env.JWT_SECRET = 'test-secret-phase6';

    const ws = require('../src/auth/workspaces');
    const users = require('../src/auth/users');
    const wsC = ws.createWorkspace({ name: 'C', limits: { maxTasks: 1 } });
    const userC = users.createUser({ username: 'userC', password: 'pw', role: 'user', workspaceId: wsC.id });

    const { app } = require('../src/server');
    const token = makeToken({ id: userC.id, username: userC.username, role: 'user', workspaceId: wsC.id });

    await request(app).post(`/api/workspaces/${wsC.id}/tasks`).set('Authorization', `Bearer ${token}`).send({ task: 'first' }).expect(201);
    await request(app).post(`/api/workspaces/${wsC.id}/tasks`).set('Authorization', `Bearer ${token}`).send({ task: 'second' }).expect(429);
  });
});

// ─── Audit log ────────────────────────────────────────────────────────────────
describe('Phase 6 — audit log', () => {
  test('appendEntry writes a file and appendEntry is sanitized (unit)', () => {
    const dir = setupEnv('-aud0', 'multi');
    const { auditLog, listAuditLog, logPath } = require('../src/middleware/auditLog');

    // Simulate a complete request/response cycle via the middleware directly
    let endCalled = false;
    const res = {
      statusCode: 201,
      end: function (...args) { endCalled = true; },
    };
    const req = {
      method: 'POST',
      path: '/workspaces/ws1/tasks',
      user: { id: 'u1', username: 'alice', workspaceId: 'ws1' },
    };

    auditLog(req, res, () => {});
    res.end(); // trigger the patched end

    expect(endCalled).toBe(true);
    const entries = listAuditLog({ limit: 10 });
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].method).toBe('POST');
    expect(entries[0].userId).toBe('u1');
    expect(entries[0].username).toBe('alice');
  });

  test('audit log skips GET requests', () => {
    const dir = setupEnv('-aud1', 'multi');
    const { auditLog, listAuditLog } = require('../src/middleware/auditLog');
    const req = { method: 'GET', path: '/tasks', user: { id: 'u2' } };
    const res = { statusCode: 200, end: () => {} };
    auditLog(req, res, () => {});
    res.end();
    expect(listAuditLog().length).toBe(0);
  });

  test('audit log inactive in single-user mode', () => {
    const dir = setupEnv('-aud2', 'single');
    const { auditLog, listAuditLog } = require('../src/middleware/auditLog');
    const req = { method: 'POST', path: '/tasks', user: { id: 'u3' } };
    const res = { statusCode: 201, end: () => {} };
    auditLog(req, res, () => {});
    res.end();
    expect(listAuditLog().length).toBe(0);
  });

  test('audit log entries have no secrets', () => {
    const dir = setupEnv('-aud3', 'multi');
    const { auditLog, logPath } = require('../src/middleware/auditLog');
    const req = { method: 'POST', path: '/tasks', user: { id: 'u4', username: 'test', workspaceId: 'ws4' } };
    const res = { statusCode: 201, end: () => {} };
    auditLog(req, res, () => {});
    res.end();
    const p = logPath();
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, 'utf8');
      expect(raw).not.toContain('passwordHash');
      expect(raw).not.toContain('scrypt:');
    }
  });
});

// ─── Rate limiter ─────────────────────────────────────────────────────────────
describe('Phase 6 — rate limiter', () => {
  test('rate limiter passes through in single-user mode', async () => {
    setupEnv('-rl0', 'single');
    const { app } = require('../src/server');
    for (let i = 0; i < 10; i++) {
      await request(app).get('/api/storage/status').expect(200);
    }
  });

  test('rate limiter enforces limit per workspace (unit)', () => {
    const dir = setupEnv('-rl1', 'multi');
    process.env.RATE_LIMIT_MAX_REQUESTS = '2';
    process.env.RATE_LIMIT_WINDOW_MS = '60000';
    const { rateLimiter, resetBuckets } = require('../src/middleware/rateLimiter');
    resetBuckets();

    const responses = [];
    const mockReq = { user: { workspaceId: 'ws-rl' }, ip: '127.0.0.1' };
    const makeRes = () => {
      const r = { _status: 200, _body: null };
      r.status = (code) => { r._status = code; return r; };
      r.json = (body) => { r._body = body; };
      return r;
    };

    for (let i = 0; i < 5; i++) {
      const res = makeRes();
      rateLimiter(mockReq, res, () => {});
      responses.push(res._status);
    }

    expect(responses.filter((s) => s === 429).length).toBeGreaterThan(0);
  });

  test('rate limiter skips in single-user mode (unit)', () => {
    const dir = setupEnv('-rl2', 'single');
    process.env.RATE_LIMIT_MAX_REQUESTS = '1';
    const { rateLimiter, resetBuckets } = require('../src/middleware/rateLimiter');
    resetBuckets();
    const req = { user: { workspaceId: 'ws-skip' }, ip: '127.0.0.1' };
    for (let i = 0; i < 5; i++) {
      const res = { status: () => res, json: () => {} };
      let nextCalled = false;
      rateLimiter(req, res, () => { nextCalled = true; });
      expect(nextCalled).toBe(true);
    }
  });
});

// ─── Rollback to single-user mode ────────────────────────────────────────────
describe('Phase 6 — rollback vers mode mono-utilisateur', () => {
  test('authConfig.setAuthMode switches between single and multi', () => {
    setupEnv('-rb0', 'single');
    const { getAuthMode, setAuthMode } = require('../src/auth/authConfig');
    expect(getAuthMode()).toBe('single');
    setAuthMode('multi');
    expect(getAuthMode()).toBe('multi');
    setAuthMode('single');
    expect(getAuthMode()).toBe('single');
  });

  test('authConfig.setAuthMode rejects invalid mode', () => {
    setupEnv('-rb1', 'single');
    const { setAuthMode } = require('../src/auth/authConfig');
    expect(() => setAuthMode('ldap')).toThrow();
  });

  test('after rollback to single, routes accessible without token', async () => {
    const dir = setupEnv('-rb2', 'multi');
    jest.resetModules();
    process.env.DATA_DIR = dir;
    process.env.AUTH_MODE = 'multi';
    process.env.JWT_SECRET = 'test-secret-phase6';

    const { setAuthMode } = require('../src/auth/authConfig');
    setAuthMode('single');

    const { app } = require('../src/server');
    const res = await request(app).get('/api/storage/status').expect(200);
    expect(res.body.mode).toBe('json');
  });

  test('GET /api/auth/mode reports current mode after rollback', async () => {
    const dir = setupEnv('-rb3', 'multi');
    jest.resetModules();
    process.env.DATA_DIR = dir;
    process.env.AUTH_MODE = 'multi';
    process.env.JWT_SECRET = 'test-secret-phase6';
    const { setAuthMode } = require('../src/auth/authConfig');
    setAuthMode('single');
    const { app } = require('../src/server');
    const res = await request(app).get('/api/auth/mode').expect(200);
    expect(res.body.mode).toBe('single');
  });
});

// ─── Admin routes ─────────────────────────────────────────────────────────────
describe('Phase 6 — admin routes', () => {
  function makeAdminSetup(suffix) {
    const dir = setupEnv(suffix, 'multi');
    jest.resetModules();
    process.env.DATA_DIR = dir;
    process.env.AUTH_MODE = 'multi';
    process.env.JWT_SECRET = 'test-secret-phase6';
    const ws = require('../src/auth/workspaces');
    const users = require('../src/auth/users');
    const jwt = require('../src/auth/jwt');
    const wsp = ws.createWorkspace({ name: 'admin-ws' });
    const admin = users.createUser({ username: 'admin', password: 'pw', role: 'admin', workspaceId: wsp.id });
    const token = jwt.sign({ id: admin.id, username: admin.username, role: 'admin', workspaceId: wsp.id });
    return { dir, wsp, token };
  }

  test('GET /api/workspaces requires admin role', async () => {
    const dir = setupEnv('-adm0', 'multi');
    jest.resetModules();
    process.env.DATA_DIR = dir;
    process.env.AUTH_MODE = 'multi';
    process.env.JWT_SECRET = 'test-secret-phase6';
    const ws = require('../src/auth/workspaces');
    const users = require('../src/auth/users');
    const jwt = require('../src/auth/jwt');
    const wsp = ws.createWorkspace({ name: 'default' });
    const user = users.createUser({ username: 'plain', password: 'pw', role: 'user', workspaceId: wsp.id });
    const token = jwt.sign({ id: user.id, username: user.username, role: 'user', workspaceId: wsp.id });
    const { app } = require('../src/server');
    await request(app).get('/api/workspaces').set('Authorization', `Bearer ${token}`).expect(403);
  });

  test('GET /api/workspaces returns workspaces for admin', async () => {
    const { token } = makeAdminSetup('-adm1');
    const { app } = require('../src/server');
    const res = await request(app).get('/api/workspaces').set('Authorization', `Bearer ${token}`).expect(200);
    expect(Array.isArray(res.body.workspaces)).toBe(true);
    expect(res.body.workspaces.length).toBeGreaterThan(0);
  });

  test('GET /api/auth/users returns users for admin only', async () => {
    const { token } = makeAdminSetup('-adm2');
    const { app } = require('../src/server');
    const res = await request(app).get('/api/auth/users').set('Authorization', `Bearer ${token}`).expect(200);
    expect(Array.isArray(res.body.users)).toBe(true);
    res.body.users.forEach((u) => expect(u.passwordHash).toBeUndefined());
  });
});

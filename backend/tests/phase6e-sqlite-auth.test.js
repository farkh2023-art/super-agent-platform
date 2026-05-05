'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

function tmpDir() {
  const d = path.join(os.tmpdir(), `sap-6e-${crypto.randomBytes(6).toString('hex')}`);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

// ── authDb availability ───────────────────────────────────────────────────────

describe('Phase 6E — authDb availability', () => {
  beforeEach(() => { jest.resetModules(); });

  test('isAvailable returns false when AUTH_SQLITE not set', () => {
    delete process.env.AUTH_SQLITE;
    const { isAvailable } = require('../src/auth/authDb');
    expect(isAvailable()).toBe(false);
  });

  test('isAvailable returns true when AUTH_SQLITE=true', () => {
    jest.resetModules();
    process.env.DATA_DIR = tmpDir();
    process.env.AUTH_SQLITE = 'true';
    const { isAvailable } = require('../src/auth/authDb');
    expect(isAvailable()).toBe(true);
    delete process.env.AUTH_SQLITE;
  });

  test('getAuthDb returns null when AUTH_SQLITE not enabled', () => {
    delete process.env.AUTH_SQLITE;
    const { getAuthDb } = require('../src/auth/authDb');
    expect(getAuthDb()).toBeNull();
  });

  test('getAuthDb returns a DB instance when enabled', () => {
    jest.resetModules();
    process.env.DATA_DIR = tmpDir();
    process.env.AUTH_SQLITE = 'true';
    const { getAuthDb } = require('../src/auth/authDb');
    const db = getAuthDb();
    expect(db).not.toBeNull();
    expect(typeof db.prepare).toBe('function');
    delete process.env.AUTH_SQLITE;
    delete process.env.DATA_DIR;
  });

  test('auth.sqlite created in DATA_DIR', () => {
    jest.resetModules();
    const dir = tmpDir();
    process.env.DATA_DIR = dir;
    process.env.AUTH_SQLITE = 'true';
    require('../src/auth/authDb').getAuthDb();
    expect(fs.existsSync(path.join(dir, 'auth.sqlite'))).toBe(true);
    delete process.env.AUTH_SQLITE;
    delete process.env.DATA_DIR;
  });
});

// ── Token hashing ─────────────────────────────────────────────────────────────

describe('Phase 6E — token hashing (no raw token in DB)', () => {
  beforeEach(() => { jest.resetModules(); });
  afterEach(() => {
    delete process.env.AUTH_SQLITE;
    delete process.env.DATA_DIR;
  });

  test('hashToken is deterministic', () => {
    const { hashToken } = require('../src/auth/refreshTokens');
    const h1 = hashToken('abc');
    const h2 = hashToken('abc');
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64); // SHA-256 hex = 64 chars
  });

  test('different tokens produce different hashes', () => {
    const { hashToken } = require('../src/auth/refreshTokens');
    expect(hashToken('token-a')).not.toBe(hashToken('token-b'));
  });

  test('raw token not stored in SQLite DB', () => {
    jest.resetModules();
    process.env.DATA_DIR = tmpDir();
    process.env.AUTH_SQLITE = 'true';
    const rt = require('../src/auth/refreshTokens');
    const rawToken = rt.issueRefreshToken('user-123');
    const { getAuthDb } = require('../src/auth/authDb');
    const db = getAuthDb();
    const rows = db.prepare('SELECT * FROM auth_refresh_tokens').all();
    // Raw token must not appear in any column
    const serialized = JSON.stringify(rows);
    expect(serialized).not.toContain(rawToken);
    // But hash must be present
    const { hashToken } = require('../src/auth/refreshTokens');
    expect(serialized).toContain(hashToken(rawToken));
  });

  test('raw token not stored in JSON fallback', () => {
    jest.resetModules();
    const dir = tmpDir();
    process.env.DATA_DIR = dir;
    delete process.env.AUTH_SQLITE;
    const rt = require('../src/auth/refreshTokens');
    const rawToken = rt.issueRefreshToken('user-456');
    const stored = JSON.parse(fs.readFileSync(path.join(dir, 'refresh-tokens.json'), 'utf8'));
    const serialized = JSON.stringify(stored);
    expect(serialized).not.toContain(rawToken);
  });

  test('verify works with hashed storage (SQLite)', () => {
    jest.resetModules();
    process.env.DATA_DIR = tmpDir();
    process.env.AUTH_SQLITE = 'true';
    const rt = require('../src/auth/refreshTokens');
    const token = rt.issueRefreshToken('user-abc');
    const entry = rt.verifyRefreshToken(token);
    expect(entry).not.toBeNull();
    expect(entry.userId).toBe('user-abc');
  });

  test('verify works with hashed storage (JSON fallback)', () => {
    jest.resetModules();
    process.env.DATA_DIR = tmpDir();
    delete process.env.AUTH_SQLITE;
    const rt = require('../src/auth/refreshTokens');
    const token = rt.issueRefreshToken('user-xyz');
    const entry = rt.verifyRefreshToken(token);
    expect(entry).not.toBeNull();
    expect(entry.userId).toBe('user-xyz');
  });
});

// ── SQLite sessions (refresh tokens) ─────────────────────────────────────────

describe('Phase 6E — sessions in SQLite', () => {
  beforeEach(() => { jest.resetModules(); });
  afterEach(() => {
    delete process.env.AUTH_SQLITE;
    delete process.env.DATA_DIR;
  });

  test('session gets a unique ID', () => {
    jest.resetModules();
    process.env.DATA_DIR = tmpDir();
    process.env.AUTH_SQLITE = 'true';
    const rt = require('../src/auth/refreshTokens');
    rt.issueRefreshToken('u1');
    const sessions = rt.listActiveSessions();
    expect(sessions.length).toBe(1);
    expect(typeof sessions[0].id).toBe('string');
  });

  test('listActiveSessions returns only active sessions', () => {
    jest.resetModules();
    process.env.DATA_DIR = tmpDir();
    process.env.AUTH_SQLITE = 'true';
    const rt = require('../src/auth/refreshTokens');
    const t1 = rt.issueRefreshToken('u1');
    rt.issueRefreshToken('u2');
    rt.revokeRefreshToken(t1);
    const sessions = rt.listActiveSessions();
    expect(sessions.length).toBe(1);
    expect(sessions[0].userId).toBe('u2');
  });

  test('revokeSessionById revokes by ID', () => {
    jest.resetModules();
    process.env.DATA_DIR = tmpDir();
    process.env.AUTH_SQLITE = 'true';
    const rt = require('../src/auth/refreshTokens');
    rt.issueRefreshToken('u1');
    const sessions = rt.listActiveSessions();
    const revoked = rt.revokeSessionById(sessions[0].id);
    expect(revoked).toBe(true);
    expect(rt.listActiveSessions().length).toBe(0);
  });

  test('revokeSessionById returns false for unknown ID', () => {
    jest.resetModules();
    process.env.DATA_DIR = tmpDir();
    process.env.AUTH_SQLITE = 'true';
    const rt = require('../src/auth/refreshTokens');
    expect(rt.revokeSessionById('no-such-id')).toBe(false);
  });

  test('listActiveSessions filters by userId', () => {
    jest.resetModules();
    process.env.DATA_DIR = tmpDir();
    process.env.AUTH_SQLITE = 'true';
    const rt = require('../src/auth/refreshTokens');
    rt.issueRefreshToken('alice');
    rt.issueRefreshToken('alice');
    rt.issueRefreshToken('bob');
    const aliceSessions = rt.listActiveSessions('alice');
    expect(aliceSessions.length).toBe(2);
    expect(aliceSessions.every((s) => s.userId === 'alice')).toBe(true);
  });
});

// ── SQLite audit log ──────────────────────────────────────────────────────────

describe('Phase 6E — audit log in SQLite', () => {
  let app, request;

  beforeEach(async () => {
    jest.resetModules();
    process.env.DATA_DIR = tmpDir();
    process.env.AUTH_MODE = 'multi';
    process.env.JWT_SECRET = 'phase6e-audit-secret';
    process.env.AUTH_SQLITE = 'true';
    app = require('../src/server').app;
    request = require('supertest');
    const users = require('../src/auth/users');
    users.createUser({ username: 'admin6e', password: 'pass123', role: 'admin' });
  });

  afterEach(() => {
    delete process.env.AUTH_MODE;
    delete process.env.JWT_SECRET;
    delete process.env.AUTH_SQLITE;
    delete process.env.DATA_DIR;
  });

  test('audit entries written to SQLite', async () => {
    const lr = await request(app).post('/api/auth/login').send({ username: 'admin6e', password: 'pass123' });
    const token = lr.body.token;
    await request(app).post('/api/workspaces').set('Authorization', `Bearer ${token}`).send({ name: 'Test' });

    const { getAuthDb } = require('../src/auth/authDb');
    const db = getAuthDb();
    const rows = db.prepare('SELECT * FROM auth_audit_log').all();
    expect(rows.length).toBeGreaterThan(0);
  });

  test('audit log filters by username in SQLite', async () => {
    const lr = await request(app).post('/api/auth/login').send({ username: 'admin6e', password: 'pass123' });
    const token = lr.body.token;
    await request(app).post('/api/workspaces').set('Authorization', `Bearer ${token}`).send({ name: 'AuditTest' });

    const res = await request(app).get('/api/auth/audit-log?username=admin6e').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.entries.length).toBeGreaterThan(0);
    expect(res.body.entries.every((e) => e.username === 'admin6e')).toBe(true);
  });

  test('audit log does not contain raw tokens', async () => {
    const lr = await request(app).post('/api/auth/login').send({ username: 'admin6e', password: 'pass123' });
    const token = lr.body.token;
    await request(app).post('/api/workspaces').set('Authorization', `Bearer ${token}`).send({ name: 'TokenTest' });

    const { getAuthDb } = require('../src/auth/authDb');
    const db = getAuthDb();
    const rows = db.prepare('SELECT * FROM auth_audit_log').all();
    const serialized = JSON.stringify(rows);
    // Token value should not appear literally in audit rows
    expect(serialized).not.toContain(token);
  });
});

// ── Users in SQLite ───────────────────────────────────────────────────────────

describe('Phase 6E — users in SQLite', () => {
  beforeEach(() => { jest.resetModules(); });
  afterEach(() => {
    delete process.env.AUTH_SQLITE;
    delete process.env.DATA_DIR;
  });

  test('createUser writes to auth_users table', () => {
    jest.resetModules();
    process.env.DATA_DIR = tmpDir();
    process.env.AUTH_SQLITE = 'true';
    const users = require('../src/auth/users');
    users.createUser({ username: 'alice', password: 'pass123', role: 'admin' });
    const { getAuthDb } = require('../src/auth/authDb');
    const row = getAuthDb().prepare('SELECT * FROM auth_users WHERE username = ?').get('alice');
    expect(row).toBeDefined();
    expect(row.role).toBe('admin');
  });

  test('password hash not returned in safe user object', () => {
    jest.resetModules();
    process.env.DATA_DIR = tmpDir();
    process.env.AUTH_SQLITE = 'true';
    const users = require('../src/auth/users');
    const u = users.createUser({ username: 'bob', password: 'secret' });
    expect(u.passwordHash).toBeUndefined();
    expect(u.password_hash).toBeUndefined();
  });

  test('authenticate works via SQLite', () => {
    jest.resetModules();
    process.env.DATA_DIR = tmpDir();
    process.env.AUTH_SQLITE = 'true';
    const users = require('../src/auth/users');
    users.createUser({ username: 'carol', password: 'mypassword' });
    const result = users.authenticate('carol', 'mypassword');
    expect(result).not.toBeNull();
    expect(result.username).toBe('carol');
  });

  test('updateUser and deleteUser work in SQLite', () => {
    jest.resetModules();
    process.env.DATA_DIR = tmpDir();
    process.env.AUTH_SQLITE = 'true';
    const users = require('../src/auth/users');
    const u = users.createUser({ username: 'dave', password: 'pass' });
    users.updateUser(u.id, { disabled: true });
    const updated = users.findById(u.id);
    expect(updated.disabled).toBe(true);
    users.deleteUser(u.id);
    expect(users.findById(u.id)).toBeNull();
  });
});

// ── Cleanup ───────────────────────────────────────────────────────────────────

describe('Phase 6E — cleanup', () => {
  beforeEach(() => { jest.resetModules(); });
  afterEach(() => {
    delete process.env.AUTH_SQLITE;
    delete process.env.DATA_DIR;
  });

  test('cleanupExpiredTokens removes revoked entries (SQLite)', () => {
    jest.resetModules();
    process.env.DATA_DIR = tmpDir();
    process.env.AUTH_SQLITE = 'true';
    const rt = require('../src/auth/refreshTokens');
    const t = rt.issueRefreshToken('u1');
    rt.revokeRefreshToken(t);
    // Revoked token is now in DB — cleanup should remove it
    const result = rt.cleanupExpiredTokens();
    expect(result.deleted).toBeGreaterThanOrEqual(1);
    const { getAuthDb } = require('../src/auth/authDb');
    const count = getAuthDb().prepare('SELECT COUNT(*) AS n FROM auth_refresh_tokens').get().n;
    expect(count).toBe(0);
  });

  test('cleanupExpiredTokens removes revoked entries (JSON)', () => {
    jest.resetModules();
    const dir = tmpDir();
    process.env.DATA_DIR = dir;
    delete process.env.AUTH_SQLITE;
    const rt = require('../src/auth/refreshTokens');
    const t = rt.issueRefreshToken('u1');
    rt.revokeRefreshToken(t);
    const result = rt.cleanupExpiredTokens();
    expect(result.deleted).toBeGreaterThanOrEqual(1);
  });

  test('cleanupOldAuditEntries removes entries older than threshold (SQLite)', () => {
    jest.resetModules();
    process.env.DATA_DIR = tmpDir();
    process.env.AUTH_SQLITE = 'true';
    const { getAuthDb } = require('../src/auth/authDb');
    const db = getAuthDb();
    const oldDate = new Date(Date.now() - 200 * 24 * 3600 * 1000).toISOString();
    db.prepare(`INSERT INTO auth_audit_log (id, user_id, username, workspace_id, method, path, status_code, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('old-id', null, 'user', null, 'POST', '/api/test', 200, 5, oldDate);
    const { cleanupOldAuditEntries } = require('../src/middleware/auditLog');
    const result = cleanupOldAuditEntries(90);
    expect(result.deleted).toBe(1);
  });

  test('POST /api/auth/cleanup returns cleanup stats', async () => {
    jest.resetModules();
    process.env.DATA_DIR = tmpDir();
    process.env.AUTH_MODE = 'multi';
    process.env.JWT_SECRET = 'phase6e-cleanup-secret';
    process.env.AUTH_SQLITE = 'true';
    const app = require('../src/server').app;
    const request = require('supertest');
    const users = require('../src/auth/users');
    users.createUser({ username: 'cleanadmin', password: 'pass123', role: 'admin' });
    const lr = await request(app).post('/api/auth/login').send({ username: 'cleanadmin', password: 'pass123' });
    const token = lr.body.token;
    const res = await request(app).post('/api/auth/cleanup').set('Authorization', `Bearer ${token}`).send({});
    expect(res.status).toBe(200);
    expect(typeof res.body.tokens).toBe('object');
    expect(typeof res.body.audit).toBe('object');
    expect(typeof res.body.runAt).toBe('string');
    delete process.env.AUTH_MODE;
    delete process.env.JWT_SECRET;
    delete process.env.AUTH_SQLITE;
    delete process.env.DATA_DIR;
  });
});

// ── Migration JSON → SQLite ───────────────────────────────────────────────────

describe('Phase 6E — migration JSON → SQLite', () => {
  beforeEach(() => { jest.resetModules(); });
  afterEach(() => {
    delete process.env.AUTH_SQLITE;
    delete process.env.DATA_DIR;
  });

  test('migrateJsonToSqlite imports users from users.json', () => {
    jest.resetModules();
    const dir = tmpDir();
    process.env.DATA_DIR = dir;
    process.env.AUTH_SQLITE = 'true';

    // Write a users.json with raw data
    const usersFile = path.join(dir, 'users.json');
    const { hashPassword } = require('../src/auth/users');
    const ph = hashPassword('testpass');
    fs.writeFileSync(usersFile, JSON.stringify([{ id: 'uid-1', username: 'migrated', passwordHash: ph, role: 'user', workspaceId: null, createdAt: new Date().toISOString() }]), 'utf8');

    // Now enable SQLite and migrate
    jest.resetModules();
    process.env.DATA_DIR = dir;
    process.env.AUTH_SQLITE = 'true';
    const { migrateJsonToSqlite } = require('../src/auth/sessionManager');
    const result = migrateJsonToSqlite();
    expect(result.migrated).toBe(true);
    expect(result.results.users).toBe(1);

    // Verify SQLite has the user
    const { getAuthDb } = require('../src/auth/authDb');
    const row = getAuthDb().prepare('SELECT * FROM auth_users WHERE username = ?').get('migrated');
    expect(row).toBeDefined();
  });

  test('migrateJsonToSqlite returns skipped when SQLite disabled', () => {
    delete process.env.AUTH_SQLITE;
    const { migrateJsonToSqlite } = require('../src/auth/sessionManager');
    const result = migrateJsonToSqlite();
    expect(result.skipped).toBe(true);
  });

  test('POST /api/auth/migrate endpoint works', async () => {
    jest.resetModules();
    process.env.DATA_DIR = tmpDir();
    process.env.AUTH_MODE = 'multi';
    process.env.JWT_SECRET = 'phase6e-migrate-secret';
    process.env.AUTH_SQLITE = 'true';
    const app = require('../src/server').app;
    const request = require('supertest');
    const users = require('../src/auth/users');
    users.createUser({ username: 'migrateadmin', password: 'pass123', role: 'admin' });
    const lr = await request(app).post('/api/auth/login').send({ username: 'migrateadmin', password: 'pass123' });
    const token = lr.body.token;
    const res = await request(app).post('/api/auth/migrate').set('Authorization', `Bearer ${token}`).send({});
    expect(res.status).toBe(200);
    expect(res.body.migrated).toBe(true);
    delete process.env.AUTH_MODE;
    delete process.env.JWT_SECRET;
    delete process.env.AUTH_SQLITE;
    delete process.env.DATA_DIR;
  });
});

// ── Sessions API endpoint ─────────────────────────────────────────────────────

describe('Phase 6E — sessions API', () => {
  let app, request, adminToken;

  beforeEach(async () => {
    jest.resetModules();
    process.env.DATA_DIR = tmpDir();
    process.env.AUTH_MODE = 'multi';
    process.env.JWT_SECRET = 'phase6e-sessions-secret';
    process.env.AUTH_SQLITE = 'true';
    app = require('../src/server').app;
    request = require('supertest');
    const users = require('../src/auth/users');
    users.createUser({ username: 'sessadmin', password: 'pass123', role: 'admin' });
    users.createUser({ username: 'sessuser', password: 'pass123', role: 'user' });
    const lr = await request(app).post('/api/auth/login').send({ username: 'sessadmin', password: 'pass123' });
    adminToken = lr.body.token;
  });

  afterEach(() => {
    delete process.env.AUTH_MODE;
    delete process.env.JWT_SECRET;
    delete process.env.AUTH_SQLITE;
    delete process.env.DATA_DIR;
  });

  test('GET /api/auth/sessions returns array', async () => {
    const res = await request(app).get('/api/auth/sessions').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.sessions)).toBe(true);
  });

  test('sessions list does not contain raw tokens or hashes', async () => {
    const rt = require('../src/auth/refreshTokens');
    const raw = rt.issueRefreshToken('user-test');
    const { hashToken } = require('../src/auth/refreshTokens');
    const h = hashToken(raw);
    const res = await request(app).get('/api/auth/sessions').set('Authorization', `Bearer ${adminToken}`);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain(raw);
    expect(body).not.toContain(h);
  });

  test('DELETE /api/auth/sessions/:id revokes a session', async () => {
    const rt = require('../src/auth/refreshTokens');
    rt.issueRefreshToken('user-temp');
    const listRes = await request(app).get('/api/auth/sessions').set('Authorization', `Bearer ${adminToken}`);
    const sessions = listRes.body.sessions;
    expect(sessions.length).toBeGreaterThan(0);
    const id = sessions[0].id;
    const delRes = await request(app).delete(`/api/auth/sessions/${id}`).set('Authorization', `Bearer ${adminToken}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);
  });

  test('DELETE /api/auth/sessions/:id returns 404 for unknown session', async () => {
    const res = await request(app).delete('/api/auth/sessions/no-such-id').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  test('GET /api/auth/sessions returns empty array in single mode', async () => {
    jest.resetModules();
    process.env.DATA_DIR = tmpDir();
    delete process.env.AUTH_MODE;
    process.env.AUTH_SQLITE = 'true';
    const app2 = require('../src/server').app;
    const res = await request(app2).get('/api/auth/sessions');
    expect(res.status).toBe(200);
    expect(res.body.sessions).toEqual([]);
    delete process.env.AUTH_SQLITE;
    delete process.env.DATA_DIR;
  });
});

// ── Fallback JSON mode ────────────────────────────────────────────────────────

describe('Phase 6E — fallback JSON mode', () => {
  let app, request;

  beforeEach(() => {
    jest.resetModules();
    process.env.DATA_DIR = tmpDir();
    process.env.AUTH_MODE = 'multi';
    process.env.JWT_SECRET = 'phase6e-fallback-secret';
    delete process.env.AUTH_SQLITE;
    app = require('../src/server').app;
    request = require('supertest');
  });

  afterEach(() => {
    delete process.env.AUTH_MODE;
    delete process.env.JWT_SECRET;
    delete process.env.AUTH_SQLITE;
    delete process.env.DATA_DIR;
  });

  test('all auth operations work without AUTH_SQLITE', async () => {
    const users = require('../src/auth/users');
    users.createUser({ username: 'fallback', password: 'pass', role: 'admin' });
    const res = await request(app).post('/api/auth/login').send({ username: 'fallback', password: 'pass' });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
  });

  test('revokeAllForUser works in JSON mode', () => {
    const rt = require('../src/auth/refreshTokens');
    rt.issueRefreshToken('json-user');
    rt.issueRefreshToken('json-user');
    rt.revokeAllForUser('json-user');
    const active = rt.listActiveSessions('json-user');
    expect(active.length).toBe(0);
  });
});

// ── db-status endpoint ────────────────────────────────────────────────────────

describe('Phase 6E — db-status endpoint', () => {
  afterEach(() => {
    delete process.env.AUTH_MODE;
    delete process.env.JWT_SECRET;
    delete process.env.AUTH_SQLITE;
    delete process.env.DATA_DIR;
  });

  test('GET /api/auth/db-status reflects AUTH_SQLITE state', async () => {
    jest.resetModules();
    process.env.DATA_DIR = tmpDir();
    process.env.AUTH_MODE = 'multi';
    process.env.JWT_SECRET = 'phase6e-dbstatus-secret';
    process.env.AUTH_SQLITE = 'true';
    const app = require('../src/server').app;
    const request = require('supertest');
    const users = require('../src/auth/users');
    users.createUser({ username: 'statusadmin', password: 'pass', role: 'admin' });
    const lr = await request(app).post('/api/auth/login').send({ username: 'statusadmin', password: 'pass' });
    const res = await request(app).get('/api/auth/db-status').set('Authorization', `Bearer ${lr.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.sqliteEnabled).toBe(true);
    expect(res.body.exists).toBe(true);
  });
});

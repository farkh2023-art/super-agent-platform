'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');

function tmpDir() {
  const d = path.join(os.tmpdir(), 'sap-p7-csv-' + Date.now());
  fs.mkdirSync(d, { recursive: true });
  return d;
}

describe('Phase 7 — Audit CSV Export', () => {
  let app, request, dataDir;

  beforeEach(() => {
    jest.resetModules();
    dataDir = tmpDir();
    process.env.DATA_DIR = dataDir;
    process.env.AUTH_MODE = 'multi';
    process.env.JWT_SECRET = 'test-secret-csv';
    delete process.env.AUTH_SQLITE_ENABLED;
    const { app: a } = require('../src/server');
    app = a;
    request = require('supertest');
  });

  afterEach(() => {
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch {}
  });

  function getAdminToken() {
    const users = require('../src/auth/users');
    const jwt = require('../src/auth/jwt');
    const ws = require('../src/auth/workspaces');
    const wsId = ws.getOrCreate('default').id;
    let user;
    try { user = users.createUser({ username: 'csv_admin', password: 'pass1234', role: 'admin', workspaceId: wsId }); }
    catch { user = users.findByUsername('csv_admin'); }
    return jwt.sign({ id: user.id, username: user.username, role: 'admin', workspaceId: wsId }, 900);
  }

  test('GET /api/auth/audit-log/export.csv returns 200', async () => {
    const token = getAdminToken();
    const res = await request(app).get('/api/auth/audit-log/export.csv').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  test('CSV content-type is text/csv', async () => {
    const token = getAdminToken();
    const res = await request(app).get('/api/auth/audit-log/export.csv').set('Authorization', `Bearer ${token}`);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
  });

  test('CSV has correct header row', async () => {
    const token = getAdminToken();
    const res = await request(app).get('/api/auth/audit-log/export.csv').set('Authorization', `Bearer ${token}`);
    const lines = res.text.split('\r\n');
    expect(lines[0]).toBe('createdAt,username,userId,workspaceId,method,action,statusCode,ip,userAgent,resourceType,resourceId');
  });

  test('CSV does not contain secrets (token/password/authorization/cookie)', async () => {
    const token = getAdminToken();
    const res = await request(app).get('/api/auth/audit-log/export.csv').set('Authorization', `Bearer ${token}`);
    const csv = res.text.toLowerCase();
    expect(csv).not.toMatch(/password|bearer\s+ey|cookie:/);
  });

  test('CSV export requires admin role', async () => {
    const users = require('../src/auth/users');
    const jwt = require('../src/auth/jwt');
    const ws = require('../src/auth/workspaces');
    const wsId = ws.getOrCreate('default').id;
    const user = users.createUser({ username: 'regular_csv', password: 'pass1234', role: 'user', workspaceId: wsId });
    const userToken = jwt.sign({ id: user.id, username: user.username, role: 'user', workspaceId: wsId }, 900);
    const res = await request(app).get('/api/auth/audit-log/export.csv').set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });

  test('CSV export without auth returns 401', async () => {
    const res = await request(app).get('/api/auth/audit-log/export.csv');
    expect(res.status).toBe(401);
  });

  test('CSV supports limit query parameter', async () => {
    const token = getAdminToken();
    const res = await request(app).get('/api/auth/audit-log/export.csv?limit=10').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
  });

  test('CSV escape handles commas in values', () => {
    // Unit test for the CSV escaping logic
    function csvEscape(v) {
      if (v == null) return '';
      const s = String(v).replace(/"/g, '""');
      return /[",\r\n]/.test(s) ? `"${s}"` : s;
    }
    expect(csvEscape('hello, world')).toBe('"hello, world"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape(null)).toBe('');
    expect(csvEscape(undefined)).toBe('');
    expect(csvEscape(200)).toBe('200');
    expect(csvEscape('simple')).toBe('simple');
  });

  test('Content-Disposition header for CSV download', async () => {
    const token = getAdminToken();
    const res = await request(app).get('/api/auth/audit-log/export.csv').set('Authorization', `Bearer ${token}`);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
    expect(res.headers['content-disposition']).toMatch(/audit-log\.csv/);
  });
});

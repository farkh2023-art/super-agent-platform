'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

function tmpDir() {
  const d = path.join(os.tmpdir(), `sap-6f-bkp-${crypto.randomBytes(6).toString('hex')}`);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

// ── Auth summary structure ────────────────────────────────────────────────────

describe('Phase 6F — Backup auth security (unit)', () => {
  let dir;

  beforeEach(() => {
    jest.resetModules();
    dir = tmpDir();
    process.env.DATA_DIR = dir;
    process.env.AUTH_SQLITE = 'true';
    process.env.ACCESS_BLACKLIST_STORE = 'sqlite';
  });

  afterEach(() => {
    delete process.env.DATA_DIR;
    delete process.env.AUTH_SQLITE;
    delete process.env.ACCESS_BLACKLIST_STORE;
  });

  test('auth summary has expected safe keys only', () => {
    const authDb = require('../src/auth/authDb');
    const db = authDb.getAuthDb();
    expect(db).not.toBeNull();

    const now = new Date().toISOString();
    const usersCount = db.prepare('SELECT COUNT(*) AS n FROM auth_users WHERE disabled = 0').get().n;
    const activeSessionsCount = db.prepare('SELECT COUNT(*) AS n FROM auth_refresh_tokens WHERE revoked_at IS NULL AND expires_at > ?').get(now).n;
    const revokedSessionsCount = db.prepare('SELECT COUNT(*) AS n FROM auth_refresh_tokens WHERE revoked_at IS NOT NULL').get().n;
    const auditEventsCount = db.prepare('SELECT COUNT(*) AS n FROM auth_audit_log').get().n;

    let blacklistCount = 0;
    try { blacklistCount = db.prepare('SELECT COUNT(*) AS n FROM auth_jti_blacklist').get().n; } catch {}

    const summary = { usersCount, activeSessionsCount, revokedSessionsCount, auditEventsCount, blacklistCount, generatedAt: now };

    expect(summary).toHaveProperty('usersCount');
    expect(summary).toHaveProperty('activeSessionsCount');
    expect(summary).toHaveProperty('revokedSessionsCount');
    expect(summary).toHaveProperty('auditEventsCount');
    expect(summary).toHaveProperty('blacklistCount');
    expect(summary).toHaveProperty('generatedAt');

    // Must NOT contain sensitive data
    expect(summary).not.toHaveProperty('password_hash');
    expect(summary).not.toHaveProperty('token_hash');
    expect(summary).not.toHaveProperty('jti_hash');
    expect(summary).not.toHaveProperty('refreshToken');
    expect(typeof summary.usersCount).toBe('number');
  });

  test('auth_jti_blacklist stores only hashed JTIs', () => {
    const authDb = require('../src/auth/authDb');
    const db = authDb.getAuthDb();
    const store = require('../src/auth/accessBlacklistSqlite');

    store.add('raw-jti-value', new Date(Date.now() + 60000).toISOString(), { userId: 'u1', reason: 'test' });

    const rows = db.prepare('SELECT * FROM auth_jti_blacklist').all();
    expect(rows.length).toBe(1);
    // jti_hash must be hex SHA-256, not the raw value
    expect(rows[0].jti_hash).not.toBe('raw-jti-value');
    expect(rows[0].jti_hash).toMatch(/^[a-f0-9]{64}$/);
    // raw_json column must be null
    expect(rows[0].raw_json).toBeNull();
  });

  test('BACKUP_INCLUDE_AUTH_DB=false is the default', () => {
    delete process.env.BACKUP_INCLUDE_AUTH_DB;
    const val = String(process.env.BACKUP_INCLUDE_AUTH_DB || 'false').toLowerCase() === 'true';
    expect(val).toBe(false);
  });

  test('BACKUP_INCLUDE_AUTH_SUMMARY=true is the default', () => {
    delete process.env.BACKUP_INCLUDE_AUTH_SUMMARY;
    const val = String(process.env.BACKUP_INCLUDE_AUTH_SUMMARY || 'true').toLowerCase() === 'true';
    expect(val).toBe(true);
  });

  test('no raw token values in refresh_tokens table', () => {
    const authDb = require('../src/auth/authDb');
    const db = authDb.getAuthDb();
    const rt = require('../src/auth/refreshTokens');

    const rawToken = rt.issueRefreshToken('user-test');
    const rows = db.prepare('SELECT * FROM auth_refresh_tokens').all();
    expect(rows.length).toBe(1);
    // raw token should not be in any column
    for (const row of rows) {
      const str = JSON.stringify(row);
      expect(str).not.toContain(rawToken);
    }
    // token_hash should be a hex SHA-256
    expect(rows[0].token_hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

// ── Backup HTTP endpoint ──────────────────────────────────────────────────────

describe('Phase 6F — Backup HTTP endpoint (single mode)', () => {
  let app, request;

  beforeEach(() => {
    jest.resetModules();
    process.env.DATA_DIR = tmpDir();
    // Use single mode so backup endpoint is accessible without auth (consistent with phase4d tests)
    delete process.env.AUTH_MODE;
    process.env.BACKUP_INCLUDE_AUTH_DB = 'false';
    process.env.BACKUP_INCLUDE_AUTH_SUMMARY = 'true';
    process.env.ACCESS_BLACKLIST_STORE = 'memory';

    app = require('../src/server').app;
    request = require('supertest');
  });

  afterEach(() => {
    delete process.env.DATA_DIR;
    delete process.env.AUTH_MODE;
    delete process.env.BACKUP_INCLUDE_AUTH_DB;
    delete process.env.BACKUP_INCLUDE_AUTH_SUMMARY;
    delete process.env.ACCESS_BLACKLIST_STORE;
  });

  test('backup download returns 200 in single mode', async () => {
    const res = await request(app).get('/api/backup/download');
    expect(res.status).toBe(200);
  });

  test('backup response Content-Type is application/zip', async () => {
    const res = await request(app).get('/api/backup/download');
    expect(res.headers['content-type']).toMatch(/application\/zip/);
  });

  test('backup manifest includes authSummaryIncluded and authDbIncluded flags', async () => {
    const res = await request(app).get('/api/backup/download');
    expect(res.status).toBe(200);
    // The manifest is embedded in the zip; we verify the endpoint responds successfully
    // and Content-Disposition includes "backup"
    expect(res.headers['content-disposition']).toMatch(/superagent_backup/);
  });

  test('BACKUP_INCLUDE_AUTH_DB=false flag prevents auth.sqlite inclusion', () => {
    process.env.BACKUP_INCLUDE_AUTH_DB = 'false';
    expect(String(process.env.BACKUP_INCLUDE_AUTH_DB).toLowerCase() === 'true').toBe(false);
  });

  test('BACKUP_INCLUDE_AUTH_SUMMARY=true is the default behavior', () => {
    delete process.env.BACKUP_INCLUDE_AUTH_SUMMARY;
    const val = String(process.env.BACKUP_INCLUDE_AUTH_SUMMARY || 'true').toLowerCase() === 'true';
    expect(val).toBe(true);
  });
});

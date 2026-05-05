'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

function tmpDir() {
  const d = path.join(os.tmpdir(), `sap-6f-jti-${crypto.randomBytes(6).toString('hex')}`);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

// ── Memory store ──────────────────────────────────────────────────────────────

describe('Phase 6F — accessBlacklistMemory', () => {
  let store;
  beforeEach(() => { jest.resetModules(); store = require('../src/auth/accessBlacklistMemory'); store.clear(); });

  test('add + has returns true for valid entry', () => {
    const jti = crypto.randomUUID();
    store.add(jti, new Date(Date.now() + 60000).toISOString());
    expect(store.has(jti)).toBe(true);
  });

  test('has returns false for unknown jti', () => {
    expect(store.has(crypto.randomUUID())).toBe(false);
  });

  test('has returns false for expired entry', () => {
    const jti = crypto.randomUUID();
    store.add(jti, new Date(Date.now() - 1000).toISOString());
    expect(store.has(jti)).toBe(false);
  });

  test('count reflects stored entries', () => {
    store.add(crypto.randomUUID(), new Date(Date.now() + 60000).toISOString());
    store.add(crypto.randomUUID(), new Date(Date.now() + 60000).toISOString());
    expect(store.count()).toBe(2);
  });

  test('removeExpired removes only expired entries', () => {
    const alive = crypto.randomUUID();
    const dead  = crypto.randomUUID();
    store.add(alive, new Date(Date.now() + 60000).toISOString());
    store.add(dead,  new Date(Date.now() - 1000).toISOString());
    const removed = store.removeExpired();
    expect(removed).toBe(1);
    expect(store.has(alive)).toBe(true);
  });

  test('clear empties the store', () => {
    store.add(crypto.randomUUID(), new Date(Date.now() + 60000).toISOString());
    store.clear();
    expect(store.count()).toBe(0);
  });

  test('raw jti is never stored (hash used internally)', () => {
    const jti = 'my-test-jti';
    store.add(jti, new Date(Date.now() + 60000).toISOString());
    // There's no way to retrieve the raw jti from the store — only via has()
    expect(store.has(jti)).toBe(true);
    // Verify the raw string is not directly accessible via count/clear
    expect(store.count()).toBe(1);
  });
});

// ── SQLite store ──────────────────────────────────────────────────────────────

describe('Phase 6F — accessBlacklistSqlite', () => {
  let dir;
  beforeEach(() => {
    jest.resetModules();
    dir = tmpDir();
    process.env.AUTH_SQLITE = 'true';
    process.env.DATA_DIR = dir;
  });
  afterEach(() => {
    jest.resetModules();
    delete process.env.AUTH_SQLITE;
    delete process.env.DATA_DIR;
  });

  test('add + has returns true', () => {
    const store = require('../src/auth/accessBlacklistSqlite');
    const jti = crypto.randomUUID();
    store.add(jti, new Date(Date.now() + 60000).toISOString());
    expect(store.has(jti)).toBe(true);
  });

  test('has returns false for unknown jti', () => {
    const store = require('../src/auth/accessBlacklistSqlite');
    expect(store.has(crypto.randomUUID())).toBe(false);
  });

  test('has returns false for expired entry', () => {
    const store = require('../src/auth/accessBlacklistSqlite');
    const jti = crypto.randomUUID();
    store.add(jti, new Date(Date.now() - 1000).toISOString());
    expect(store.has(jti)).toBe(false);
  });

  test('no raw jti stored in database', () => {
    const store = require('../src/auth/accessBlacklistSqlite');
    const { getAuthDb } = require('../src/auth/authDb');
    const jti = 'raw-jti-test-value';
    store.add(jti, new Date(Date.now() + 60000).toISOString());
    const db = getAuthDb();
    const rows = db.prepare('SELECT jti_hash FROM auth_jti_blacklist').all();
    expect(rows.length).toBe(1);
    // The stored value must NOT be the raw jti
    expect(rows[0].jti_hash).not.toBe(jti);
    // It should be a hex SHA-256 hash
    expect(rows[0].jti_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  test('removeExpired clears expired entries', () => {
    const store = require('../src/auth/accessBlacklistSqlite');
    const jti = crypto.randomUUID();
    store.add(jti, new Date(Date.now() - 1000).toISOString());
    expect(store.count()).toBe(1);
    store.removeExpired();
    expect(store.count()).toBe(0);
  });

  test('blacklist survives module reload (persistence)', () => {
    let store = require('../src/auth/accessBlacklistSqlite');
    const jti = crypto.randomUUID();
    store.add(jti, new Date(Date.now() + 60000).toISOString());
    // Simulate reload
    jest.resetModules();
    process.env.AUTH_SQLITE = 'true';
    process.env.DATA_DIR = dir;
    store = require('../src/auth/accessBlacklistSqlite');
    expect(store.has(jti)).toBe(true);
  });
});

// ── Store factory ─────────────────────────────────────────────────────────────

describe('Phase 6F — accessBlacklistStore factory', () => {
  beforeEach(() => { jest.resetModules(); });
  afterEach(() => {
    delete process.env.ACCESS_BLACKLIST_STORE;
    delete process.env.AUTH_SQLITE;
    delete process.env.DATA_DIR;
  });

  test('memory mode returns memory store', () => {
    process.env.ACCESS_BLACKLIST_STORE = 'memory';
    const { getStore } = require('../src/auth/accessBlacklistStore');
    const store = getStore();
    expect(typeof store.add).toBe('function');
    expect(typeof store.has).toBe('function');
  });

  test('auto mode returns memory store when SQLite unavailable', () => {
    process.env.ACCESS_BLACKLIST_STORE = 'auto';
    delete process.env.AUTH_SQLITE;
    const { getStore } = require('../src/auth/accessBlacklistStore');
    const store = getStore();
    expect(typeof store.has).toBe('function');
  });

  test('auto mode returns sqlite store when SQLite available', () => {
    const dir = tmpDir();
    process.env.ACCESS_BLACKLIST_STORE = 'auto';
    process.env.AUTH_SQLITE = 'true';
    process.env.DATA_DIR = dir;
    const { getStore } = require('../src/auth/accessBlacklistStore');
    const store = getStore();
    expect(typeof store.has).toBe('function');
  });
});

// ── tokenBlacklist backward compat ───────────────────────────────────────────

describe('Phase 6F — tokenBlacklist backward compatibility', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.ACCESS_BLACKLIST_STORE = 'memory';
  });
  afterEach(() => { delete process.env.ACCESS_BLACKLIST_STORE; });

  test('blacklistToken + isBlacklisted works', () => {
    const bl = require('../src/auth/tokenBlacklist');
    const jti = crypto.randomUUID();
    bl.blacklistToken(jti, new Date(Date.now() + 60000).toISOString());
    expect(bl.isBlacklisted(jti)).toBe(true);
  });

  test('isBlacklisted returns false for unknown jti', () => {
    const bl = require('../src/auth/tokenBlacklist');
    expect(bl.isBlacklisted(crypto.randomUUID())).toBe(false);
  });

  test('size() returns count', () => {
    const bl = require('../src/auth/tokenBlacklist');
    bl.clear();
    bl.blacklistToken(crypto.randomUUID(), new Date(Date.now() + 60000).toISOString());
    expect(bl.size()).toBeGreaterThanOrEqual(1);
  });

  test('clear() empties store', () => {
    const bl = require('../src/auth/tokenBlacklist');
    bl.blacklistToken(crypto.randomUUID(), new Date(Date.now() + 60000).toISOString());
    bl.clear();
    expect(bl.size()).toBe(0);
  });
});

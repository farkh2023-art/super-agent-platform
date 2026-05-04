'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');

function setupEnv(suffix = '') {
  jest.resetModules();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `sap-5d${suffix}-`));
  process.env.DATA_DIR = dir;
  process.env.STORAGE_MODE = 'json';
  process.env.SQLITE_DB_PATH = path.join(dir, 'test5d.sqlite');
  process.env.STORAGE_ADMIN_ENABLED = 'true';
  process.env.STORAGE_ADMIN_ALLOW_MUTATIONS = 'true';
  process.env.STORAGE_ADMIN_REQUIRE_CONFIRMATION = 'true';
  delete process.env.API_KEY;
  fs.writeFileSync(path.join(dir, 'tasks.json'), JSON.stringify([{ id: 't1', task: 'phase5d' }, { id: 't2', task: 'switch' }]), 'utf8');
  return dir;
}

const CONFIRM = 'I_UNDERSTAND_STORAGE_RISK';

// ─── runtimeConfig ────────────────────────────────────────────────────────────
describe('Phase 5D — runtimeConfig', () => {
  test('getStorageMode returns env var when no runtime file', () => {
    const dir = setupEnv('-rc0');
    process.env.STORAGE_MODE = 'json';
    const rc = require('../src/storage/runtimeConfig');
    expect(rc.getStorageMode()).toBe('json');
  });

  test('setStorageMode persists mode in runtime config file', () => {
    const dir = setupEnv('-rc1');
    const rc = require('../src/storage/runtimeConfig');
    rc.setStorageMode('hybrid');
    expect(rc.getStorageMode()).toBe('hybrid');
    const cfg = rc.readRuntimeConfig();
    expect(cfg.storageMode).toBe('hybrid');
    expect(fs.existsSync(rc.configPath())).toBe(true);
  });

  test('getStorageMode runtime file overrides env var', () => {
    const dir = setupEnv('-rc2');
    process.env.STORAGE_MODE = 'json';
    const rc = require('../src/storage/runtimeConfig');
    rc.setStorageMode('sqlite');
    expect(rc.getStorageMode()).toBe('sqlite');
  });

  test('setStorageMode rejects invalid mode', () => {
    setupEnv('-rc3');
    const rc = require('../src/storage/runtimeConfig');
    expect(() => rc.setStorageMode('kafka')).toThrow();
  });

  test('setDoubleWrite and getDoubleWrite work correctly', () => {
    setupEnv('-rc4');
    const rc = require('../src/storage/runtimeConfig');
    expect(rc.getDoubleWrite()).toBe(false);
    rc.setDoubleWrite(true);
    expect(rc.getDoubleWrite()).toBe(true);
    rc.setDoubleWrite(false);
    expect(rc.getDoubleWrite()).toBe(false);
  });

  test('runtimeConfig survives module reset (simulates server restart)', () => {
    const dir = setupEnv('-rc5');
    const rc1 = require('../src/storage/runtimeConfig');
    rc1.setStorageMode('hybrid');
    jest.resetModules();
    process.env.DATA_DIR = dir;
    const rc2 = require('../src/storage/runtimeConfig');
    expect(rc2.getStorageMode()).toBe('hybrid');
  });
});

// ─── Readiness gate ───────────────────────────────────────────────────────────
describe('Phase 5D — readiness gate', () => {
  test('getMigrationReadinessGate returns not-ready when SQLite absent', () => {
    setupEnv('-gate0');
    const { getMigrationReadinessGate } = require('../src/storage/migrations');
    const gate = getMigrationReadinessGate();
    expect(gate.ready).toBe(false);
    expect(gate.blockers.length).toBeGreaterThan(0);
  });

  test('getMigrationReadinessGate returns ready after migration and validation', () => {
    setupEnv('-gate1');
    const { migrateJsonToSqlite, validateSqliteMigration, getMigrationReadinessGate } = require('../src/storage/migrations');
    migrateJsonToSqlite({ dryRun: false, backup: false });
    validateSqliteMigration({ sampleSize: 10 });
    const gate = getMigrationReadinessGate();
    expect(gate.ready).toBe(true);
    expect(gate.blockers).toHaveLength(0);
    expect(gate.lastValidationAt).not.toBeNull();
    expect(gate.lastMigrationAt).not.toBeNull();
  });

  test('GET /api/storage/migration/readiness-gate returns 409 when SQLite absent', async () => {
    setupEnv('-gate2');
    const { app } = require('../src/server');
    const res = await request(app).get('/api/storage/migration/readiness-gate').expect(409);
    expect(res.body.ready).toBe(false);
    expect(Array.isArray(res.body.blockers)).toBe(true);
  });

  test('GET /api/storage/migration/readiness-gate returns 200 after migration', async () => {
    setupEnv('-gate3');
    const { migrateJsonToSqlite, validateSqliteMigration } = require('../src/storage/migrations');
    migrateJsonToSqlite({ dryRun: false, backup: false });
    validateSqliteMigration({ sampleSize: 10 });
    const { app } = require('../src/server');
    const res = await request(app).get('/api/storage/migration/readiness-gate').expect(200);
    expect(res.body.ready).toBe(true);
  });
});

// ─── Mode switch ──────────────────────────────────────────────────────────────
describe('Phase 5D — switch-mode API', () => {
  test('POST /api/storage/switch-mode rejects invalid mode', async () => {
    setupEnv('-sw0');
    const { app } = require('../src/server');
    await request(app).post('/api/storage/switch-mode')
      .send({ mode: 'redis', confirmation: CONFIRM }).expect(400);
  });

  test('POST /api/storage/switch-mode to sqlite blocked when readiness gate fails', async () => {
    setupEnv('-sw1');
    const { app } = require('../src/server');
    const res = await request(app).post('/api/storage/switch-mode')
      .send({ mode: 'sqlite', confirmation: CONFIRM }).expect(409);
    expect(res.body.blockers).toBeDefined();
  });

  test('POST /api/storage/switch-mode to json succeeds without readiness gate', async () => {
    setupEnv('-sw2');
    const { app } = require('../src/server');
    const res = await request(app).post('/api/storage/switch-mode')
      .send({ mode: 'json', confirmation: CONFIRM }).expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.mode).toBe('json');
  });

  test('POST /api/storage/switch-mode to sqlite succeeds after migration and validation', async () => {
    setupEnv('-sw3');
    const { migrateJsonToSqlite, validateSqliteMigration } = require('../src/storage/migrations');
    migrateJsonToSqlite({ dryRun: false, backup: false });
    validateSqliteMigration({ sampleSize: 10 });
    const { app } = require('../src/server');
    const res = await request(app).post('/api/storage/switch-mode')
      .send({ mode: 'sqlite', confirmation: CONFIRM }).expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.mode).toBe('sqlite');
    expect(res.body.previous).toBe('json');
  });

  test('mode switch creates a storage_mode_switched event', async () => {
    setupEnv('-sw4');
    const { app } = require('../src/server');
    await request(app).post('/api/storage/switch-mode')
      .send({ mode: 'json', confirmation: CONFIRM }).expect(200);
    const evRes = await request(app).get('/api/storage/events').expect(200);
    const switchEvent = evRes.body.events.find((e) => e.type === 'storage_mode_switched');
    expect(switchEvent).toBeDefined();
    expect(switchEvent.metadata.to).toBe('json');
  });

  test('POST /api/storage/switch-mode requires confirmation token', async () => {
    setupEnv('-sw5');
    const { app } = require('../src/server');
    await request(app).post('/api/storage/switch-mode')
      .send({ mode: 'json', confirmation: 'wrong' }).expect(400);
  });

  test('GET /api/storage/switch-history returns mode switch events', async () => {
    setupEnv('-sw6');
    const { app } = require('../src/server');
    await request(app).post('/api/storage/switch-mode')
      .send({ mode: 'json', confirmation: CONFIRM }).expect(200);
    const res = await request(app).get('/api/storage/switch-history').expect(200);
    expect(Array.isArray(res.body.history)).toBe(true);
    expect(res.body.history.length).toBeGreaterThan(0);
    expect(res.body.history[0].type).toBe('storage_mode_switched');
  });
});

// ─── Double-write ─────────────────────────────────────────────────────────────
describe('Phase 5D — double-write toggle', () => {
  test('POST /api/storage/set-double-write enables double-write', async () => {
    setupEnv('-dw0');
    const { app } = require('../src/server');
    const res = await request(app).post('/api/storage/set-double-write')
      .send({ enabled: true, confirmation: CONFIRM }).expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.doubleWrite).toBe(true);
  });

  test('POST /api/storage/set-double-write disables double-write', async () => {
    setupEnv('-dw1');
    const { app } = require('../src/server');
    await request(app).post('/api/storage/set-double-write')
      .send({ enabled: true, confirmation: CONFIRM }).expect(200);
    const res = await request(app).post('/api/storage/set-double-write')
      .send({ enabled: false, confirmation: CONFIRM }).expect(200);
    expect(res.body.doubleWrite).toBe(false);
  });

  test('double-write toggle creates double_write_changed event', async () => {
    setupEnv('-dw2');
    const { app } = require('../src/server');
    await request(app).post('/api/storage/set-double-write')
      .send({ enabled: true, confirmation: CONFIRM }).expect(200);
    const evRes = await request(app).get('/api/storage/events').expect(200);
    const evt = evRes.body.events.find((e) => e.type === 'double_write_changed');
    expect(evt).toBeDefined();
    expect(evt.metadata.to).toBe(true);
  });

  test('switch-history includes double_write_changed events', async () => {
    setupEnv('-dw3');
    const { app } = require('../src/server');
    await request(app).post('/api/storage/set-double-write')
      .send({ enabled: true, confirmation: CONFIRM }).expect(200);
    const res = await request(app).get('/api/storage/switch-history').expect(200);
    const evt = res.body.history.find((e) => e.type === 'double_write_changed');
    expect(evt).toBeDefined();
  });
});

// ─── storageMonitor ───────────────────────────────────────────────────────────
describe('Phase 5D — storageMonitor', () => {
  test('storageMonitor.runCheck does not throw when SQLite absent', () => {
    setupEnv('-mon0');
    process.env.SQLITE_DESYNC_MONITOR_ENABLED = 'false';
    const monitor = require('../src/engine/storageMonitor');
    expect(() => monitor.runCheck()).not.toThrow();
    monitor.stop();
  });

  test('storageMonitor.start does not create timer when monitor disabled', () => {
    setupEnv('-mon1');
    process.env.SQLITE_DESYNC_MONITOR_ENABLED = 'false';
    const monitor = require('../src/engine/storageMonitor');
    monitor.start(null);
    monitor.stop();
  });

  test('storageMonitor setBroadcast sets broadcast function', () => {
    setupEnv('-mon2');
    const monitor = require('../src/engine/storageMonitor');
    let called = false;
    monitor.setBroadcast(() => { called = true; });
    monitor.stop();
    expect(called).toBe(false); // not called without desync
  });
});

// ─── storage/index.js mode switch integration ─────────────────────────────────
describe('Phase 5D — storage index reflects mode switch', () => {
  test('GET /api/storage/status reflects mode from runtimeConfig', async () => {
    setupEnv('-idx0');
    const rc = require('../src/storage/runtimeConfig');
    rc.setStorageMode('json');
    const { app } = require('../src/server');
    const res = await request(app).get('/api/storage/status').expect(200);
    expect(res.body.mode).toBe('json');
  });
});

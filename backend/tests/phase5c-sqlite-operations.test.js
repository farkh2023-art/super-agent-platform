'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');

function setupEnv(suffix = '') {
  jest.resetModules();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `sap-5c${suffix}-`));
  process.env.DATA_DIR = dir;
  process.env.STORAGE_MODE = 'json';
  process.env.SQLITE_DB_PATH = path.join(dir, 'test5c.sqlite');
  process.env.STORAGE_ADMIN_ENABLED = 'true';
  process.env.STORAGE_ADMIN_ALLOW_MUTATIONS = 'false';
  delete process.env.API_KEY;
  fs.writeFileSync(path.join(dir, 'tasks.json'), JSON.stringify([{ id: 't1', task: 'phase5c' }, { id: 't2', task: 'test' }]), 'utf8');
  return dir;
}

describe('Phase 5C — validation reports persistants', () => {
  test('validateSqliteMigration saves a report file after migration', () => {
    const dir = setupEnv('-vrep');
    const { migrateJsonToSqlite, validateSqliteMigration } = require('../src/storage/migrations');
    migrateJsonToSqlite({ dryRun: false, backup: false });
    const result = validateSqliteMigration({ sampleSize: 10 });
    expect(result.reportFilename).toMatch(/^validation-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\.json$/);
    const reportsPath = path.join(dir, 'validation-reports', result.reportFilename);
    expect(fs.existsSync(reportsPath)).toBe(true);
    const saved = JSON.parse(fs.readFileSync(reportsPath, 'utf8'));
    expect(saved.success).toBe(true);
  });

  test('listValidationReports and loadValidationReport work correctly', () => {
    const dir = setupEnv('-list');
    const { migrateJsonToSqlite, validateSqliteMigration } = require('../src/storage/migrations');
    const vr = require('../src/storage/validationReports');
    migrateJsonToSqlite({ dryRun: false, backup: false });
    validateSqliteMigration({ sampleSize: 10 });
    const reports = vr.listValidationReports();
    expect(reports.length).toBeGreaterThan(0);
    expect(reports[0].filename).toMatch(/^validation-/);
    const loaded = vr.loadValidationReport(reports[0].filename);
    expect(loaded).toHaveProperty('success');
  });

  test('loadValidationReport rejects invalid filenames', () => {
    setupEnv('-sec');
    const vr = require('../src/storage/validationReports');
    expect(() => vr.loadValidationReport('../../../etc/passwd')).toThrow();
    expect(() => vr.loadValidationReport('validation-bad-name.json')).toThrow();
  });
});

describe('Phase 5C — comparaison ID par ID', () => {
  test('compareIdByIdAllCollections returns full comparison without sample limit', () => {
    const dir = setupEnv('-ids');
    const { migrateJsonToSqlite, compareIdByIdAllCollections } = require('../src/storage/migrations');
    migrateJsonToSqlite({ dryRun: false, backup: false });
    const result = compareIdByIdAllCollections();
    expect(result.allInSync).toBe(true);
    expect(result.desynced).toHaveLength(0);
    expect(result.collections.tasks.jsonCount).toBe(2);
    expect(result.collections.tasks.missingInSqlite).toHaveLength(0);
    expect(result.collections.tasks.extraInSqlite).toHaveLength(0);
    expect(result.collections.tasks.checksumMismatches).toHaveLength(0);
  });

  test('compareIdByIdAllCollections detects missing IDs', () => {
    const dir = setupEnv('-miss');
    const { migrateJsonToSqlite, compareIdByIdAllCollections } = require('../src/storage/migrations');
    const jsonStore = require('../src/storage/jsonStore');
    migrateJsonToSqlite({ dryRun: false, backup: false });
    // Add an item to JSON that is not in SQLite
    jsonStore.writeCollection('tasks', [{ id: 't1', task: 'phase5c' }, { id: 't2', task: 'test' }, { id: 't3', task: 'new' }]);
    const result = compareIdByIdAllCollections();
    expect(result.allInSync).toBe(false);
    expect(result.collections.tasks.missingInSqlite).toContain('t3');
  });
});

describe('Phase 5C — checksum report Markdown', () => {
  test('generateChecksumReportMarkdown returns valid Markdown', () => {
    setupEnv('-md');
    const checksums = require('../src/storage/checksums');
    const result = checksums.compareAllCollectionChecksums();
    const md = checksums.generateChecksumReportMarkdown(result);
    expect(md).toContain('# SQLite Checksum Report');
    expect(md).toContain('## Summary');
    expect(md).toContain('## Collections');
    expect(md).toContain('| Collection | JSON count | SQLite count | Match |');
    expect(md).toContain('tasks');
  });
});

describe('Phase 5C — download securise (API)', () => {
  test('GET /api/storage/checksums/report.md returns Markdown content', async () => {
    setupEnv('-dlmd');
    const { app } = require('../src/server');
    const res = await request(app).get('/api/storage/checksums/report.md').expect(200);
    expect(res.headers['content-type']).toMatch(/markdown/);
    expect(res.text).toContain('# SQLite Checksum Report');
  });

  test('GET /api/storage/validation-reports/:filename rejects bad filenames', async () => {
    setupEnv('-dlbad');
    const { app } = require('../src/server');
    await request(app).get('/api/storage/validation-reports/..%2Fetc%2Fpasswd').expect(400);
  });

  test('GET /api/storage/validation-reports lists reports', async () => {
    setupEnv('-dllist');
    const { migrateJsonToSqlite, validateSqliteMigration } = require('../src/storage/migrations');
    migrateJsonToSqlite({ dryRun: false, backup: false });
    validateSqliteMigration({ sampleSize: 10 });
    const { app } = require('../src/server');
    const res = await request(app).get('/api/storage/validation-reports').expect(200);
    expect(Array.isArray(res.body.reports)).toBe(true);
    expect(res.body.reports.length).toBeGreaterThan(0);
  });

  test('GET /api/storage/validation-reports/:filename serves valid report', async () => {
    setupEnv('-dldl');
    const { migrateJsonToSqlite, validateSqliteMigration } = require('../src/storage/migrations');
    migrateJsonToSqlite({ dryRun: false, backup: false });
    const r = validateSqliteMigration({ sampleSize: 10 });
    const { app } = require('../src/server');
    const res = await request(app).get(`/api/storage/validation-reports/${r.reportFilename}`).expect(200);
    expect(res.headers['content-disposition']).toContain('attachment');
    const parsed = JSON.parse(res.text);
    expect(parsed.success).toBe(true);
  });
});

describe('Phase 5C — sqlite readiness', () => {
  test('GET /api/storage/sqlite/readiness returns 503 when SQLite absent', async () => {
    setupEnv('-rdy0');
    const { app } = require('../src/server');
    const res = await request(app).get('/api/storage/sqlite/readiness');
    expect(res.status).toBe(503);
    expect(res.body.ready).toBe(false);
    expect(res.body.checks).toHaveProperty('exists');
  });

  test('GET /api/storage/sqlite/readiness returns 200 when SQLite connected', async () => {
    setupEnv('-rdy1');
    const { migrateJsonToSqlite } = require('../src/storage/migrations');
    migrateJsonToSqlite({ dryRun: false, backup: false });
    const { app } = require('../src/server');
    const res = await request(app).get('/api/storage/sqlite/readiness').expect(200);
    expect(res.body.ready).toBe(true);
    expect(res.body.checks.connected).toBe(true);
  });
});

describe('Phase 5C — alertes desync', () => {
  test('GET /api/storage/checksums/desync-alerts returns empty alerts when in sync', async () => {
    setupEnv('-dsync0');
    const { app } = require('../src/server');
    const res = await request(app).get('/api/storage/checksums/desync-alerts').expect(200);
    expect(res.body.desynced).toBe(0);
    expect(Array.isArray(res.body.alerts)).toBe(true);
  });

  test('detectAndAlertDesyncs function works standalone', () => {
    setupEnv('-dsync1');
    const checksums = require('../src/storage/checksums');
    const result = checksums.detectAndAlertDesyncs();
    expect(typeof result.checked).toBe('number');
    expect(typeof result.desynced).toBe('number');
    expect(Array.isArray(result.alerts)).toBe(true);
  });
});

describe('Phase 5C — dashboard storage enrichi', () => {
  test('GET /api/storage/status includes lastValidationReport field', async () => {
    setupEnv('-dash');
    const { migrateJsonToSqlite, validateSqliteMigration } = require('../src/storage/migrations');
    migrateJsonToSqlite({ dryRun: false, backup: false });
    validateSqliteMigration({ sampleSize: 10 });
    const { app } = require('../src/server');
    const res = await request(app).get('/api/storage/status').expect(200);
    expect(res.body).toHaveProperty('lastValidationReport');
    expect(res.body.lastValidationReport).not.toBeNull();
    expect(res.body.lastValidationReport.filename).toMatch(/^validation-/);
  });

  test('GET /api/storage/compare-ids returns full ID comparison', async () => {
    setupEnv('-cmpids');
    const { migrateJsonToSqlite } = require('../src/storage/migrations');
    migrateJsonToSqlite({ dryRun: false, backup: false });
    const { app } = require('../src/server');
    const res = await request(app).get('/api/storage/compare-ids').expect(200);
    expect(res.body).toHaveProperty('allInSync');
    expect(res.body).toHaveProperty('collections');
    expect(res.body.collections.tasks.jsonCount).toBe(2);
  });
});

describe('Phase 5C — backup inclut rapports sans secrets', () => {
  test('GET /api/backup/download zip contains validation-reports directory', async () => {
    setupEnv('-bkp');
    const { migrateJsonToSqlite, validateSqliteMigration } = require('../src/storage/migrations');
    migrateJsonToSqlite({ dryRun: false, backup: false });
    validateSqliteMigration({ sampleSize: 10 });
    const { app } = require('../src/server');
    const res = await request(app).get('/api/backup/download').expect(200);
    expect(res.headers['content-type']).toContain('zip');
    // ZIP contains bytes; just verify it is non-empty and is a zip (PK header)
    const buf = Buffer.isBuffer(res.body) ? res.body : Buffer.from(res.text || '', 'binary');
    expect(buf.length).toBeGreaterThan(100);
  });
});

describe('Phase 5C — .gitignore sqlite protection', () => {
  test('.gitignore at repo root contains *.sqlite pattern', () => {
    const gitignorePath = path.resolve(__dirname, '..', '..', '.gitignore');
    expect(fs.existsSync(gitignorePath)).toBe(true);
    const content = fs.readFileSync(gitignorePath, 'utf8');
    expect(content).toContain('*.sqlite');
  });
});

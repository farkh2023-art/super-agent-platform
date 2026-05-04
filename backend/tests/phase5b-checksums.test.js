'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function setupEnv() {
  jest.resetModules();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sap-5b-checksums-'));
  process.env.DATA_DIR = dir;
  process.env.STORAGE_MODE = 'json';
  process.env.SQLITE_DB_PATH = path.join(dir, 'super.sqlite');
  process.env.STORAGE_ADMIN_ENABLED = 'true';
  return dir;
}

describe('Phase 5B collection checksums', () => {
  test('checksums compare JSON and SQLite after migration', () => {
    const dir = setupEnv();
    fs.writeFileSync(path.join(dir, 'tasks.json'), JSON.stringify([{ id: 't1', task: 'hello', createdAt: '2026-05-04T00:00:00.000Z' }]), 'utf8');
    const { migrateJsonToSqlite } = require('../src/storage/migrations');
    const checksums = require('../src/storage/checksums');

    migrateJsonToSqlite({ dryRun: false, backup: false });
    const result = checksums.compareCollectionChecksums('tasks');
    expect(result.available).toBe(true);
    expect(result.match).toBe(true);
    expect(result.jsonCount).toBe(1);
    expect(result.sqliteCount).toBe(1);
  });

  test('SQLite unavailable returns clean checksum response', () => {
    const dir = setupEnv();
    process.env.SQLITE_DB_PATH = path.join(dir, 'absent', 'missing.sqlite');
    const checksums = require('../src/storage/checksums');
    const result = checksums.computeSqliteCollectionChecksum('tasks');
    expect(result.available).toBe(false);
    expect(result.checksum).toBeNull();
  });
});

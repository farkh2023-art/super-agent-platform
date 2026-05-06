'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('Phase 8 - Windows packaging scripts', () => {
  test('release scripts exist', () => {
    [
      'release/install.ps1',
      'release/start.ps1',
      'release/stop.ps1',
      'release/backup.ps1',
      'release/health-check.ps1',
      'release/create-release.ps1',
      'release/demo.ps1',
    ].forEach((rel) => expect(fs.existsSync(path.join(ROOT, rel))).toBe(true));
  });

  test('release config template exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'release/config/.env.template'))).toBe(true);
  });

  test('install script preserves existing .env and installs backend only', () => {
    const content = read('release/install.ps1');
    expect(content).toMatch(/npm install/);
    expect(content).toMatch(/\.env already exists/);
    expect(content).toMatch(/\.env\.example/);
    expect(content).not.toMatch(/npm install -g/);
  });

  test('start and demo scripts support demo mode without permanent .env edits', () => {
    const start = read('release/start.ps1');
    const demo = read('release/demo.ps1');
    expect(start).toMatch(/AI_PROVIDER\s*=\s*"mock"/);
    expect(start).toMatch(/AUTH_MODE\s*=\s*"single"/);
    expect(start).toMatch(/STORAGE_MODE\s*=\s*"json"/);
    expect(demo).toMatch(/No API key is required/);
    expect(demo).not.toMatch(/Set-Content.*\.env/);
  });

  test('health-check script covers required endpoints and JSON option', () => {
    const content = read('release/health-check.ps1');
    expect(content).toMatch(/\/api\/health/);
    expect(content).toMatch(/\/api\/admin\/health/);
    expect(content).toMatch(/\/api\/agents/);
    expect(content).toMatch(/\/api\/storage\/status/);
    expect(content).toMatch(/\[switch\]\$Json/);
  });

  test('release docs exist inside release folder', () => {
    [
      'release/README_RELEASE.md',
      'release/docs/USER_GUIDE.md',
      'release/docs/ADMIN_GUIDE.md',
      'release/docs/SECURITY_CHECKLIST.md',
    ].forEach((rel) => expect(fs.existsSync(path.join(ROOT, rel))).toBe(true));
  });
});

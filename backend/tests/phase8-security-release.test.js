'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('Phase 8 - release security', () => {
  test('create-release excludes secrets, dependencies, runtime data and SQLite', () => {
    const content = read('release/create-release.ps1');
    [
      '.env',
      'node_modules',
      'backend/node_modules',
      'backend/data',
      'backend/data-test*',
      'backend/migration-backups',
      'dist',
      '*.sqlite',
      '*.sqlite-wal',
      '*.sqlite-shm',
      'github_pat*.txt',
      '*tokens*.txt',
      '*.log',
    ].forEach((pattern) => expect(content).toContain(pattern));
  });

  test('create-release writes manifest with version, git metadata, tests and checksum', () => {
    const content = read('release/create-release.ps1');
    expect(content).toMatch(/MANIFEST\.json/);
    expect(content).toMatch(/version/);
    expect(content).toMatch(/commitGit/);
    expect(content).toMatch(/testsTotalKnown/);
    expect(content).toMatch(/SHA256/);
  });

  test('backup script excludes local secrets by default', () => {
    const content = read('release/backup.ps1');
    expect(content).toMatch(/IncludeRawSqlite/);
    expect(content).toMatch(/\.sqlite/);
    expect(content).toMatch(/github_pat/);
    expect(content).toMatch(/tokens/);
    expect(content).toMatch(/\.env/);
  });

  test('user-facing documentation exists', () => {
    [
      'docs/USER_GUIDE.md',
      'docs/ADMIN_GUIDE.md',
      'docs/INSTALLATION_WINDOWS.md',
      'docs/TROUBLESHOOTING.md',
      'docs/FINAL_RELEASE_NOTES.md',
      'docs/SECURITY_CHECKLIST.md',
      'README.md',
    ].forEach((rel) => expect(fs.existsSync(path.join(ROOT, rel))).toBe(true));
  });

  test('scripts and phase 8 docs contain no realistic secret values', () => {
    const files = [
      'release/install.ps1',
      'release/start.ps1',
      'release/stop.ps1',
      'release/backup.ps1',
      'release/health-check.ps1',
      'release/create-release.ps1',
      'release/demo.ps1',
      'docs/USER_GUIDE.md',
      'docs/ADMIN_GUIDE.md',
      'docs/INSTALLATION_WINDOWS.md',
      'docs/TROUBLESHOOTING.md',
      'docs/FINAL_RELEASE_NOTES.md',
      'docs/SECURITY_CHECKLIST.md',
    ];
    const joined = files.map(read).join('\n');
    expect(joined).not.toMatch(/sk-ant-[A-Za-z0-9_-]{10,}/);
    expect(joined).not.toMatch(/ghp_[A-Za-z0-9_]{20,}/);
    expect(joined).not.toMatch(/Bearer\s+[A-Za-z0-9._-]{20,}/);
  });
});

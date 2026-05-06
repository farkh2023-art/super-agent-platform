'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('Phase 8B - security packaging checks', () => {
  test('verify-release blocks forbidden file classes', () => {
    const content = read('release/verify-release.ps1');
    [
      '.env',
      'node_modules/',
      'backend/data/',
      'backend/data-test*/',
      '*.sqlite',
      '*.sqlite-wal',
      '*.sqlite-shm',
      'github_pat*.txt',
      '*tokens*.txt',
      '*.pem',
      '*.key',
    ].forEach((pattern) => expect(content).toContain(pattern));
  });

  test('verify-release checks sensitive patterns', () => {
    const content = read('release/verify-release.ps1');
    [
      'sk-',
      'github_pat_',
      'Authorization:',
      'refreshToken',
      'password_hash',
      'refresh_token_hash',
      'jti_hash',
    ].forEach((pattern) => expect(content).toContain(pattern));
  });

  test('health-check writes a local JSON report and supports deep mode', () => {
    const content = read('release/health-check.ps1');
    expect(content).toMatch(/health-check-latest\.json/);
    expect(content).toMatch(/\[switch\]\$Deep/);
    expect(content).toMatch(/node --version/);
    expect(content).toMatch(/npm --version/);
    expect(content).toMatch(/backend\\package\.json/);
  });

  test('release scripts do not contain realistic provider tokens', () => {
    const files = [
      'release/verify-release.ps1',
      'release/sign-release.ps1',
      'release/install-service.ps1',
      'release/uninstall-service.ps1',
      'release/uninstall.ps1',
      'release/create-shortcuts.ps1',
    ];
    const joined = files.map(read).join('\n');
    expect(joined).not.toMatch(/sk-ant-[A-Za-z0-9_-]{10,}/);
    expect(joined).not.toMatch(/ghp_[A-Za-z0-9_]{20,}/);
    expect(joined).not.toMatch(/Bearer\s+[A-Za-z0-9._-]{20,}/);
  });
});

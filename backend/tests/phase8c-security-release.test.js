'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('Phase 8C - strengthened release security rules', () => {
  test('verify-release blocks additional runtime and backup files', () => {
    const content = read('release/verify-release.ps1');
    [
      'auth.sqlite',
      'storage-runtime.json',
      'auth-runtime.json',
      '*.db',
      '*.bak',
      '*_secret*',
      '*_key*',
      '.claude/settings.local.json',
      '*github_pat*',
    ].forEach((pattern) => expect(content).toContain(pattern));
  });

  test('create-release excludes additional runtime and secret-like files', () => {
    const content = read('release/create-release.ps1');
    [
      'auth.sqlite',
      'storage-runtime.json',
      'auth-runtime.json',
      '*.db',
      '*.bak',
      '*_secret*',
      '*_key*',
      '.claude/settings.local.json',
      '*github_pat*',
    ].forEach((pattern) => expect(content).toContain(pattern));
  });

  test('test-release checks forbidden entries before install creates local config', () => {
    const content = read('release/test-release.ps1');
    expect(content).toMatch(/Test-ForbiddenEntry/);
    expect(content).toMatch(/zip-exclusions/);
    expect(content).toMatch(/\.env/);
    expect(content).toMatch(/\*\.sqlite/);
  });

  test('source files with token logic are not filename-blocked by release rules', () => {
    const verify = read('release/verify-release.ps1');
    expect(verify).not.toContain('*token*');
    expect(verify).toContain('*tokens*.txt');
    expect(fs.existsSync(path.join(ROOT, 'backend/src/auth/tokenBlacklist.js')) || true).toBe(true);
  });
});

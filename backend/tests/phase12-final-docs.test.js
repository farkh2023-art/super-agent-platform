'use strict';

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('Phase 12 final docs and release metadata', () => {
  test('VERSION contains final Phase 12 version', () => {
    expect(read('VERSION').trim()).toBe('3.0.0-phase-12');
  });

  test('backend package version is 3.0.0', () => {
    expect(JSON.parse(read('backend/package.json')).version).toBe('3.0.0');
  });

  test('.env.example documents update monitor configuration', () => {
    const env = read('.env.example');
    expect(env).toContain('UPDATE_FEED_URL');
    expect(env).toContain('UPDATE_MONITOR_ENABLED');
    expect(env).toContain('UPDATE_MONITOR_INTERVAL_MS');
  });

  test('PHASE12 documentation covers update flow', () => {
    const docPath = path.join(repoRoot, 'docs', 'PHASE12.md');
    expect(fs.existsSync(docPath)).toBe(true);
    const doc = fs.readFileSync(docPath, 'utf8');

    expect(doc).toContain('/api/update/check');
    expect(doc).toContain('update-check.ps1');
    expect(doc).toContain('update-install.ps1');
    expect(doc).toContain('update_available');
    expect(doc.toLowerCase()).toContain('rollback');
  });

  test('update manifest example contains required fields', () => {
    const manifestPath = path.join(repoRoot, 'release', 'update-manifest.example.json');
    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    expect(manifest).toHaveProperty('version');
    expect(manifest).toHaveProperty('downloadUrl');
    expect(manifest).toHaveProperty('sha256');
  });

  test('README and release notes mention Phase 12 final release', () => {
    expect(read('README.md')).toContain('PHASE12.md');
    expect(read('docs/FINAL_RELEASE_NOTES.md')).toContain('v3.0.0-phase-12');
    expect(read('release/create-release.ps1')).toContain('v3.0.0-phase-12');
  });

  test('CI includes master branch when workflow exists', () => {
    const ciPath = path.join(repoRoot, '.github', 'workflows', 'ci.yml');
    if (!fs.existsSync(ciPath)) return;

    expect(fs.readFileSync(ciPath, 'utf8')).toContain('master');
  });
});

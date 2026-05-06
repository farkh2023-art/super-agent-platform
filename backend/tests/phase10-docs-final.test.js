'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('Phase 10 Lot 6 - final release docs and version alignment', () => {
  test('VERSION contains 2.9.0-phase-10', () => {
    expect(read('VERSION').trim()).toBe('2.9.0-phase-10');
  });

  test('backend package version is 2.9.0', () => {
    const pkg = JSON.parse(read('backend/package.json'));
    expect(pkg.version).toBe('2.9.0');
  });

  test('docs/PHASE10.md exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'docs', 'PHASE10.md'))).toBe(true);
  });

  test('docs/PHASE10.md mentions /api/docs', () => {
    expect(read('docs/PHASE10.md')).toMatch(/\/api\/docs/);
  });

  test('docs/PHASE10.md mentions Documentation Center', () => {
    expect(read('docs/PHASE10.md')).toMatch(/Documentation Center/);
  });

  test('docs/PHASE10.md mentions generate-docs.ps1', () => {
    expect(read('docs/PHASE10.md')).toMatch(/generate-docs\.ps1/);
  });

  test('docs/PHASE10.md mentions release-public-check.ps1', () => {
    expect(read('docs/PHASE10.md')).toMatch(/release-public-check\.ps1/);
  });

  test('README links to PHASE10.md', () => {
    expect(read('README.md')).toMatch(/PHASE10\.md/);
  });

  test('docs README links to PHASE10.md', () => {
    expect(read('docs/README.md')).toMatch(/PHASE10\.md/);
  });

  test('final release notes mention v2.9.0-phase-10', () => {
    expect(read('docs/FINAL_RELEASE_NOTES.md')).toMatch(/v2\.9\.0-phase-10/);
  });

  test('create-release default version and test total are aligned', () => {
    const content = read('release/create-release.ps1');

    expect(content).toMatch(/v2\.9\.0-phase-10/);
    const match = content.match(/testsTotalKnown\s*=\s*(\d+)/);
    expect(match).not.toBeNull();
    expect(Number(match[1])).toBeGreaterThanOrEqual(694);
  });
});

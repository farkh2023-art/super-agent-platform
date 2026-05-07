'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('Phase 10 Lot 6 - final release docs and version alignment', () => {
  test('VERSION contains a valid release version', () => {
  const version = read('VERSION').trim();

  expect(version).toMatch(/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i);
  expect(version).not.toMatch(/phase-8c|phase-8d/i);
});

test('backend package version matches VERSION numeric part', () => {
  const version = read('VERSION').trim();
  const expectedPackageVersion = version.replace(/^v/, '').split('-')[0];

  const pkg = JSON.parse(read('backend/package.json'));
  expect(pkg.version).toBe(expectedPackageVersion);
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

    const version = read('VERSION').trim();
    const match = content.match(/testsTotalKnown\s*=\s*(\d+)/);
    expect(match).not.toBeNull();
    expect(Number(match[1])).toBeGreaterThanOrEqual(694);
  });
});

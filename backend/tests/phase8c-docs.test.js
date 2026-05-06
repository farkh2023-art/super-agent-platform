'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('Phase 8C - documentation', () => {
  test('Phase 8C documentation exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'docs/PHASE8C.md'))).toBe(true);
  });

  test('Phase 8C docs describe local CI, extracted release test and cleanup', () => {
    const content = read('docs/PHASE8C.md');
    expect(content).toMatch(/local-ci\.ps1/);
    expect(content).toMatch(/test-release\.ps1/);
    expect(content).toMatch(/cleanup-release-test\.ps1/);
    expect(content).toMatch(/LOCAL_CI_REPORT\.json/);
  });

  test('release README documents Phase 8C commands', () => {
    const content = read('release/README_RELEASE.md');
    expect(content).toMatch(/local-ci\.ps1/);
    expect(content).toMatch(/test-release\.ps1/);
    expect(content).toMatch(/cleanup-release-test\.ps1/);
  });

  test('user-facing docs mention reproducible local release validation', () => {
    const docs = [
      'docs/INSTALLATION_WINDOWS.md',
      'docs/INSTALLATION_NON_TECHNIQUE.md',
      'docs/TROUBLESHOOTING.md',
      'docs/FINAL_RELEASE_NOTES.md',
    ].map(read).join('\n');
    expect(docs).toMatch(/local-ci\.ps1/);
    expect(docs).toMatch(/v2\.6\.0-phase-8c/);
  });
});

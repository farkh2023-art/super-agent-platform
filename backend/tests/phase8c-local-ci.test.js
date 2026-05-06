'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('Phase 8C - local CI script', () => {
  test('local-ci script exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'release/local-ci.ps1'))).toBe(true);
  });

  test('local-ci runs tests, release build, verify, sign and extraction test', () => {
    const content = read('release/local-ci.ps1');
    expect(content).toMatch(/node --experimental-vm-modules/);
    expect(content).toMatch(/create-release\.ps1/);
    expect(content).toMatch(/verify-release\.ps1/);
    expect(content).toMatch(/sign-release\.ps1/);
    expect(content).toMatch(/test-release\.ps1/);
  });

  test('local-ci supports required options and reports', () => {
    const content = read('release/local-ci.ps1');
    ['Version', 'SkipTests', 'SkipReleaseBuild', 'KeepTemp', 'Json', 'Strict'].forEach((name) => {
      expect(content).toMatch(new RegExp(`\\$${name}`));
    });
    expect(content).toMatch(/LOCAL_CI_REPORT\.json/);
    expect(content).toMatch(/LOCAL_CI_REPORT\.md/);
  });

  test('local-ci records git state without changing safe.directory globally', () => {
    const content = read('release/local-ci.ps1');
    expect(content).toMatch(/git -c safe\.directory/);
    expect(content).toMatch(/status --short/);
    expect(content).not.toMatch(/git config --global --add safe\.directory/);
  });
});

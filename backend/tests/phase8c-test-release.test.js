'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('Phase 8C - extracted release test script', () => {
  test('test-release and cleanup scripts exist', () => {
    expect(fs.existsSync(path.join(ROOT, 'release/test-release.ps1'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'release/cleanup-release-test.ps1'))).toBe(true);
  });

  test('test-release uses an isolated temp extraction directory', () => {
    const content = read('release/test-release.ps1');
    expect(content).toMatch(/\$env:TEMP/);
    expect(content).toMatch(/super-agent-platform-release-test/);
    expect(content).toMatch(/Expand-Archive/);
    expect(content).not.toMatch(/C:\\Users\\Youss\\super-agent-platform\\backend\\data/);
  });

  test('test-release installs, starts demo mode, checks health and stops', () => {
    const content = read('release/test-release.ps1');
    expect(content).toMatch(/install\.ps1/);
    expect(content).toMatch(/start\.ps1/);
    expect(content).toMatch(/-Mode demo/);
    expect(content).toMatch(/health-check\.ps1/);
    expect(content).toMatch(/stop\.ps1/);
  });

  test('cleanup script stops recorded test pids and supports dry-run', () => {
    const content = read('release/cleanup-release-test.ps1');
    expect(content).toMatch(/\[switch\]\$DryRun/);
    expect(content).toMatch(/super-agent\.pid/);
    expect(content).toMatch(/Stop-Process/);
    expect(content).toMatch(/Remove-Item/);
  });
});

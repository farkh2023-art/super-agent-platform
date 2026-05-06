'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

function findPowerShell() {
  for (const command of ['pwsh', 'powershell']) {
    const result = spawnSync(command, ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'], {
      cwd: ROOT,
      encoding: 'utf8',
      windowsHide: true
    });

    if (result.status === 0) {
      return command;
    }
  }

  return null;
}

function runPowerShell(script, args) {
  const result = spawnSync(POWERSHELL, [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    script,
    ...args
  ], {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true
  });

  return {
    status: result.status,
    output: `${result.stdout || ''}\n${result.stderr || ''}`
  };
}

const POWERSHELL = findPowerShell();
const describeIfPowerShell = POWERSHELL ? describe : describe.skip;

describeIfPowerShell('Phase 9 Lot 5 - publish PowerShell smoke tests', () => {
  test('check-version.ps1 supports offline JSON mode', () => {
    const result = runPowerShell(path.join(ROOT, 'release', 'check-version.ps1'), ['-Offline', '-Json']);

    expect(result.status).toBe(0);
    expect(result.output).toMatch(/OFFLINE/);
  });

  test('publish-release.ps1 supports dry run without publishing', () => {
    const result = runPowerShell(path.join(ROOT, 'release', 'publish-release.ps1'), [
      '-DryRun',
      '-SkipCI',
      '-SkipGitHubRelease'
    ]);

    expect(result.status).toBe(0);
    expect(result.output).toMatch(/git tag|DRY-RUN/);
  });
});

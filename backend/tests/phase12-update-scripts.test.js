'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const checkScript = path.join(repoRoot, 'release', 'update-check.ps1');
const installScript = path.join(repoRoot, 'release', 'update-install.ps1');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function findPowerShell() {
  for (const command of ['pwsh', 'powershell']) {
    const result = spawnSync(command, ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'], {
      encoding: 'utf8',
    });
    if (!result.error && result.status === 0) return command;
  }
  return null;
}

describe('Phase 12 update PowerShell scripts - static checks', () => {
  test('update-check.ps1 exists and exposes safe check inputs', () => {
    expect(fs.existsSync(checkScript)).toBe(true);
    const content = read(checkScript);

    expect(content).toContain('FeedUrl');
    expect(content).toContain('Offline');
    expect(content).toContain('Json');
    expect(content).toContain('VERSION');
    expect(content).toMatch(/Scheme\s+-ne\s+'https'/);
    expect(content).toContain('updateAvailable');
  });

  test('update-install.ps1 exists and exposes guided install safeguards', () => {
    expect(fs.existsSync(installScript)).toBe(true);
    const content = read(installScript);

    expect(content).toContain('DryRun');
    expect(content).toContain('Sha256');
    expect(content).toContain('Get-FileHash');
    expect(content).toMatch(/Scheme\s+-ne\s+'https'/);
    expect(content).toContain('update-history.json');
    expect(content).not.toMatch(/Invoke-Expression/i);
    expect(content).not.toMatch(/\biex\b/i);
    expect(content).not.toMatch(/powershell\s+.*\.(ps1|zip|exe)/i);
  });

  test('scripts do not contain obvious hardcoded secrets', () => {
    const combined = `${read(checkScript)}\n${read(installScript)}`;

    expect(combined).not.toMatch(/github_pat/i);
    expect(combined).not.toMatch(/\bsk-[A-Za-z0-9_-]+/);
    expect(combined).not.toMatch(/password\s*=/i);
  });
});

describe('Phase 12 update PowerShell scripts - smoke checks', () => {
  const shell = findPowerShell();

  test('update-check.ps1 -Offline -Json exits 0 with offline status', () => {
    if (!shell) return;

    const result = spawnSync(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', checkScript, '-Offline', '-Json'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/OFFLINE|status/i);
  });

  test('update-install.ps1 -DryRun -Offline -Json exits 0 with offline or dry run status', () => {
    if (!shell) return;

    const result = spawnSync(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', installScript, '-DryRun', '-Offline', '-Json'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/OFFLINE|DRY_RUN|DryRun|status/i);
  });
});

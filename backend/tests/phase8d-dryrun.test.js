'use strict';

const fs   = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT       = path.resolve(__dirname, '..', '..');
const read       = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const SCRIPT     = path.join(ROOT, 'release', 'packaging-tools.ps1');
const VERSION    = read('VERSION').trim();
const TAG        = `v${VERSION}`;

function findPowerShell() {
  for (const command of ['pwsh', 'powershell']) {
    const result = spawnSync(command, ['-NonInteractive', '-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'], {
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

const POWERSHELL = findPowerShell();
const describeIfPowerShell = POWERSHELL ? describe : describe.skip;

function runPs(args, timeoutMs = 30000) {
  const result = spawnSync(POWERSHELL, [
    '-NonInteractive',
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    SCRIPT,
    ...args
  ], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: timeoutMs,
    windowsHide: true
  });

  if (result.error) {
    throw result.error;
  }

  return {
    status: result.status,
    output: `${result.stdout || ''}\n${result.stderr || ''}`
  };
}

describe('Phase 8D - dry-run, cross-GUID, version and pipeline order', () => {

  describeIfPowerShell('packaging-tools.ps1 - dry-run (no external tools required)', () => {
    test('-DryRun -BuildMsi exits with code 0 and outputs [DRY-RUN]', () => {
      const result = runPs(['-BuildMsi', '-DryRun']);
      expect(result.status).toBe(0);
      expect(result.output).toMatch(/\[DRY-RUN\]/);
    });

    test('-DryRun -BuildMsix exits with code 0 and outputs [DRY-RUN]', () => {
      const result = runPs(['-BuildMsix', '-DryRun']);
      expect(result.status).toBe(0);
      expect(result.output).toMatch(/\[DRY-RUN\]/);
    });
  });

  describe('WiX - cross-file GUID uniqueness', () => {
    test('all Component GUIDs across all WiX files are globally unique', () => {
      const wxsFiles = ['release/wix/product.wxs', 'release/wix/components.wxs'];
      const allGuids = wxsFiles.flatMap(f =>
        [...read(f).matchAll(/\bGuid="\{([^}]+)\}"/g)].map(m => m[1].toUpperCase())
      );
      expect(allGuids.length).toBeGreaterThan(0);
      expect(new Set(allGuids).size).toBe(allGuids.length);
    });
  });

  describe('default version - phase-8d', () => {
    test('create-release.ps1 default Version matches VERSION tag', () => {
      expect(read('release/create-release.ps1')).toContain(`$Version = "${TAG}"`);
    });

    test('local-ci.ps1 default Version matches VERSION tag', () => {
      expect(read('release/local-ci.ps1')).toContain(`$Version = "${TAG}"`);
    });
  });

  describe('pipeline ordering and local-checksum fallback', () => {
    test('sign-release.ps1 uses local-checksum as fallback signature type', () => {
      expect(read('release/sign-release.ps1')).toMatch(/local-checksum/);
    });

    test('local-ci.ps1 calls verify-release before sign-release', () => {
      const content   = read('release/local-ci.ps1');
      const verifyPos = content.indexOf('"verify-release"');
      const signPos   = content.indexOf('"sign-release"');
      expect(verifyPos).toBeGreaterThan(0);
      expect(signPos).toBeGreaterThan(verifyPos);
    });
  });
});

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(ROOT, 'release', 'release-public-check.ps1');
const readScript = () => fs.readFileSync(SCRIPT, 'utf8');

function findPowerShell() {
  for (const command of ['pwsh', 'powershell']) {
    const result = spawnSync(command, ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'], {
      cwd: ROOT,
      encoding: 'utf8',
      windowsHide: true
    });

    if (result.status === 0) return command;
  }

  return null;
}

const POWERSHELL = findPowerShell();
const describeIfPowerShell = POWERSHELL ? describe : describe.skip;

describe('Phase 10 Lot 5 - public release check script', () => {
  test('release-public-check.ps1 exists', () => {
    expect(fs.existsSync(SCRIPT)).toBe(true);
  });

  test('script exposes required parameters and reads version files', () => {
    const content = readScript();

    expect(content).toMatch(/DryRun/);
    expect(content).toMatch(/Offline/);
    expect(content).toMatch(/Json/);
    expect(content).toMatch(/Strict/);
    expect(content).toMatch(/VERSION/);
    expect(content).toMatch(/backend\\package\.json|backend\/package\.json/);
  });

  test('script references required release and docs steps', () => {
    const content = readScript();

    expect(content).toMatch(/generate-docs\.ps1/);
    expect(content).toMatch(/local-ci\.ps1|jest/);
    expect(content).toMatch(/create-release\.ps1/);
    expect(content).toMatch(/verify-release\.ps1/);
    expect(content).toMatch(/sign-release\.ps1/);
  });

  test('script verifies docs backend and frontend markers', () => {
    const content = readScript();

    expect(content).toMatch(/docsManifest|docsManifest\.js|routes\\docs\.js|routes\/docs\.js/);
    expect(content).toMatch(/frontend\/js\/app\.js|frontend\\js\\app\.js/);
    expect(content).toMatch(/frontend\/js\/api\.js|frontend\\js\\api\.js/);
    expect(content).toMatch(/frontend\/index\.html|frontend\\index\.html/);
    expect(content).toMatch(/Documentation Center|loadDocsView|view-docs/);
  });

  test('script contains forbidden file checks without hardcoded secrets', () => {
    const content = readScript();

    expect(content).toMatch(/\.env/);
    expect(content).toMatch(/github_pat/);
    expect(content).toMatch(/sqlite/i);
    expect(content).toMatch(/backend\/data|backend\\data/);
    expect(content).not.toMatch(/github_pat_[A-Za-z0-9_]+/);
    expect(content).not.toMatch(/sk-[A-Za-z0-9]/);
  });
});

describeIfPowerShell('Phase 10 Lot 5 - public release check smoke', () => {
  test('dry-run offline JSON gate exits 0 and emits status or version', () => {
    const result = spawnSync(POWERSHELL, [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      SCRIPT,
      '-DryRun',
      '-Offline',
      '-Json',
      '-SkipTests',
      '-SkipDocs',
      '-SkipReleaseBuild'
    ], {
      cwd: ROOT,
      encoding: 'utf8',
      windowsHide: true
    });

    expect(result.status).toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/status|version/);
  });
});

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(ROOT, 'release', 'generate-docs.ps1');
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

describe('Phase 10 Lot 4 - generate docs script', () => {
  test('generate-docs.ps1 exists', () => {
    expect(fs.existsSync(SCRIPT)).toBe(true);
  });

  test('script exposes required parameters and manifest output', () => {
    const content = readScript();

    expect(content).toMatch(/OutputDir/);
    expect(content).toMatch(/DryRun/);
    expect(content).toMatch(/IncludePdf/);
    expect(content).toMatch(/DOCS_MANIFEST\.json/);
    expect(content).toMatch(/sha256/i);
  });

  test('script includes stable public documentation sources', () => {
    const content = readScript();

    expect(content).toMatch(/USER_GUIDE\.md/);
    expect(content).toMatch(/ADMIN_GUIDE\.md/);
    expect(content).toMatch(/INSTALLATION_WINDOWS\.md/);
    expect(content).toMatch(/TROUBLESHOOTING\.md/);
    expect(content).toMatch(/SECURITY_CHECKLIST\.md/);
    expect(content).toMatch(/API\.md/);
    expect(content).toMatch(/PHASE9\.md/);
  });

  test('script supports optional PDF detection and graceful skip', () => {
    const content = readScript();

    expect(content).toMatch(/wkhtmltopdf|pandoc/);
    expect(content).toMatch(/pdfSkipped/);
    expect(content).toMatch(/skipping PDF export|PDF generation requested/i);
  });

  test('script does not hardcode forbidden paths or sources', () => {
    const content = readScript();

    expect(content).not.toMatch(/C:\\Users/i);
    expect(content).not.toMatch(/["']\.env["']/i);
    expect(content).not.toMatch(/["']backend\/data["']|["']backend\\data["']/i);
  });
});

describeIfPowerShell('Phase 10 Lot 4 - generate docs PowerShell smoke', () => {
  test('generate-docs.ps1 -DryRun -Json exits 0 and reports dryRun', () => {
    const result = spawnSync(POWERSHELL, [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      SCRIPT,
      '-DryRun',
      '-Json'
    ], {
      cwd: ROOT,
      encoding: 'utf8',
      windowsHide: true
    });

    expect(result.status).toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/DryRun|dryRun/);
  });
});

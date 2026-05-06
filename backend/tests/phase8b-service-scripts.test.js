'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('Phase 8B - Windows service and local cleanup scripts', () => {
  test('service, uninstall and shortcut scripts exist', () => {
    [
      'release/install-service.ps1',
      'release/uninstall-service.ps1',
      'release/uninstall.ps1',
      'release/create-shortcuts.ps1',
    ].forEach((rel) => expect(fs.existsSync(path.join(ROOT, rel))).toBe(true));
  });

  test('install-service is optional, dry-run capable and checks admin rights', () => {
    const content = read('release/install-service.ps1');
    expect(content).toMatch(/\$ServiceName = "SuperAgentPlatform"/);
    expect(content).toMatch(/\[switch\]\$DryRun/);
    expect(content).toMatch(/Administrator rights/);
    expect(content).toMatch(/sc\.exe create/);
    expect(content).not.toMatch(/ANTHROPIC_API_KEY|OPENAI_API_KEY/);
  });

  test('uninstall-service does not remove user data', () => {
    const content = read('release/uninstall-service.ps1');
    expect(content).toMatch(/sc\.exe delete/);
    expect(content).toMatch(/User data was not deleted/);
    expect(content).toMatch(/\[switch\]\$DryRun/);
  });

  test('uninstall keeps data by default and supports dry-run', () => {
    const content = read('release/uninstall.ps1');
    expect(content).toMatch(/\[switch\]\$KeepData/);
    expect(content).toMatch(/\[switch\]\$RemoveData/);
    expect(content).toMatch(/\[switch\]\$DryRun/);
    expect(content).toMatch(/Default uninstall keeps/);
  });

  test('create-shortcuts creates desktop shortcuts in dry-run', () => {
    const content = read('release/create-shortcuts.ps1');
    expect(content).toMatch(/Desktop/);
    expect(content).toMatch(/Super-Agent Platform Demo/);
    expect(content).toMatch(/Health Check/);
    expect(content).toMatch(/\[switch\]\$DryRun/);
  });
});

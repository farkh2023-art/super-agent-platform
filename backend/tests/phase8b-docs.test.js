'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('Phase 8B - documentation', () => {
  test('non-technical installation guide exists', () => {
    const file = path.join(ROOT, 'docs/INSTALLATION_NON_TECHNIQUE.md');
    expect(fs.existsSync(file)).toBe(true);
    const content = fs.readFileSync(file, 'utf8');
    expect(content).toMatch(/Telecharger et extraire/);
    expect(content).toMatch(/mode demo/i);
    expect(content).toMatch(/Desinstaller/);
  });

  test('release README documents verify, sign and service scripts', () => {
    const content = read('release/README_RELEASE.md');
    expect(content).toMatch(/verify-release\.ps1/);
    expect(content).toMatch(/sign-release\.ps1/);
    expect(content).toMatch(/install-service\.ps1/);
    expect(content).toMatch(/uninstall-service\.ps1/);
  });

  test('Windows installation docs mention verification and optional service', () => {
    const content = read('docs/INSTALLATION_WINDOWS.md');
    expect(content).toMatch(/verify-release\.ps1/);
    expect(content).toMatch(/sign-release\.ps1/);
    expect(content).toMatch(/Optional Windows Service/);
  });

  test('security checklist includes verification and local signature', () => {
    const content = read('docs/SECURITY_CHECKLIST.md');
    expect(content).toMatch(/verify-release\.ps1 -Strict/);
    expect(content).toMatch(/RELEASE_SIGNATURE\.json/);
    expect(content).toMatch(/Windows service/);
  });
});

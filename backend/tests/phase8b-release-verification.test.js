'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('Phase 8B - release verification scripts', () => {
  test('verify and sign scripts exist', () => {
    expect(fs.existsSync(path.join(ROOT, 'release/verify-release.ps1'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'release/sign-release.ps1'))).toBe(true);
  });

  test('verify-release checks manifest, checksum, required files and reports', () => {
    const content = read('release/verify-release.ps1');
    expect(content).toMatch(/MANIFEST\.json/);
    expect(content).toMatch(/Get-FileHash/);
    expect(content).toMatch(/backend\/package\.json/);
    expect(content).toMatch(/VERIFY_REPORT\.json/);
    expect(content).toMatch(/VERIFY_REPORT\.md/);
  });

  test('create-release supports Verify and Strict options', () => {
    const content = read('release/create-release.ps1');
    expect(content).toMatch(/\[switch\]\$Verify/);
    expect(content).toMatch(/\[switch\]\$Strict/);
    expect(content).toMatch(/verify-release\.ps1/);
  });

  test('sign-release creates sha256 and local signature json', () => {
    const content = read('release/sign-release.ps1');
    expect(content).toMatch(/\.sha256/);
    expect(content).toMatch(/RELEASE_SIGNATURE\.json/);
    expect(content).toMatch(/local-checksum/);
    expect(content).toMatch(/not a certificate-backed/);
  });
});

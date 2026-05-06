'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

describe('Phase 8D - MSI/MSIX packaging and code signing', () => {

  describe('required files exist', () => {
    test('release/packaging-tools.ps1 exists', () => {
      expect(exists('release/packaging-tools.ps1')).toBe(true);
    });

    test('release/verify-signature.ps1 exists', () => {
      expect(exists('release/verify-signature.ps1')).toBe(true);
    });

    test('release/config/packaging.example.json exists', () => {
      expect(exists('release/config/packaging.example.json')).toBe(true);
    });
  });

  describe('create-release.ps1 - MSI/MSIX switches', () => {
    test('create-release contains BuildMsi', () => {
      expect(read('release/create-release.ps1')).toMatch(/BuildMsi/);
    });

    test('create-release contains BuildMsix', () => {
      expect(read('release/create-release.ps1')).toMatch(/BuildMsix/);
    });
  });

  describe('local-ci.ps1 - MSI/MSIX steps', () => {
    test('local-ci contains BuildMsi', () => {
      expect(read('release/local-ci.ps1')).toMatch(/BuildMsi/);
    });

    test('local-ci contains BuildMsix', () => {
      expect(read('release/local-ci.ps1')).toMatch(/BuildMsix/);
    });
  });

  describe('sign-release.ps1 - code signing reference', () => {
    test('sign-release references signtool or signatureType', () => {
      const content = read('release/sign-release.ps1');
      expect(content).toMatch(/signtool|signatureType/);
    });
  });

  describe('.gitignore - binary artefact protection', () => {
    test('.gitignore protects *.msi', () => {
      expect(read('.gitignore')).toMatch(/\*\.msi\b/);
    });

    test('.gitignore protects *.msix', () => {
      expect(read('.gitignore')).toMatch(/\*\.msix\b/);
    });

    test('.gitignore protects *.appxbundle', () => {
      expect(read('.gitignore')).toMatch(/\*\.appxbundle\b/);
    });
  });

  describe('packaging-tools.ps1 - content', () => {
    test('packaging-tools declares BuildMsi function or step', () => {
      expect(read('release/packaging-tools.ps1')).toMatch(/BuildMsi|Build-Msi/);
    });

    test('packaging-tools declares BuildMsix function or step', () => {
      expect(read('release/packaging-tools.ps1')).toMatch(/BuildMsix|Build-Msix/);
    });

    test('packaging-tools references signtool for code signing', () => {
      expect(read('release/packaging-tools.ps1')).toMatch(/signtool/i);
    });

    test('packaging-tools accepts a certificate path parameter', () => {
      const content = read('release/packaging-tools.ps1');
      expect(content).toMatch(/CertificatePath|CertPath|certFile|\.pfx|\.p12/i);
    });
  });

  describe('verify-signature.ps1 - content', () => {
    test('verify-signature uses Windows Authenticode verification', () => {
      const content = read('release/verify-signature.ps1');
      expect(content).toMatch(/signtool verify|Get-AuthenticodeSignature|Authenticode/i);
    });

    test('verify-signature targets .msi and/or .msix files', () => {
      const content = read('release/verify-signature.ps1');
      expect(content).toMatch(/\.msi|\.msix/);
    });

    test('verify-signature outputs a report or status', () => {
      const content = read('release/verify-signature.ps1');
      expect(content).toMatch(/VERIFY_SIGNATURE_REPORT|Write-Host|Write-Output/i);
    });
  });

  describe('packaging.example.json - structure', () => {
    test('packaging.example.json is valid JSON', () => {
      expect(() => JSON.parse(read('release/config/packaging.example.json'))).not.toThrow();
    });

    test('packaging.example.json has msi section', () => {
      const cfg = JSON.parse(read('release/config/packaging.example.json'));
      expect(cfg).toHaveProperty('msi');
    });

    test('packaging.example.json has msix section', () => {
      const cfg = JSON.parse(read('release/config/packaging.example.json'));
      expect(cfg).toHaveProperty('msix');
    });

    test('packaging.example.json has signing section', () => {
      const cfg = JSON.parse(read('release/config/packaging.example.json'));
      expect(cfg).toHaveProperty('signing');
    });
  });
});

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

describe('Phase 8D - build integration', () => {

  describe('RELEASE.md', () => {
    test('RELEASE.md exists at project root', () => {
      expect(exists('RELEASE.md')).toBe(true);
    });

    test('RELEASE.md contains a version or release heading', () => {
      expect(read('RELEASE.md')).toMatch(/##?\s+(v?\d+\.\d+|Release|Changelog)/i);
    });
  });

  describe('MSIX Assets - existence (4 files)', () => {
    test('Assets/StoreLogo.png exists', () => {
      expect(exists('release/msix/Assets/StoreLogo.png')).toBe(true);
    });

    test('Assets/Square44x44Logo.png exists', () => {
      expect(exists('release/msix/Assets/Square44x44Logo.png')).toBe(true);
    });

    test('Assets/Square150x150Logo.png exists', () => {
      expect(exists('release/msix/Assets/Square150x150Logo.png')).toBe(true);
    });

    test('Assets/Square71x71Logo.png exists', () => {
      expect(exists('release/msix/Assets/Square71x71Logo.png')).toBe(true);
    });
  });

  describe('AppxManifest.xml - Assets references', () => {
    test('AppxManifest references StoreLogo.png', () => {
      expect(read('release/msix/AppxManifest.xml')).toMatch(/StoreLogo\.png/);
    });

    test('AppxManifest references Square44x44Logo.png', () => {
      expect(read('release/msix/AppxManifest.xml')).toMatch(/Square44x44Logo\.png/);
    });

    test('AppxManifest references Square150x150Logo.png', () => {
      expect(read('release/msix/AppxManifest.xml')).toMatch(/Square150x150Logo\.png/);
    });

    test('AppxManifest references Square71x71Logo.png', () => {
      expect(read('release/msix/AppxManifest.xml')).toMatch(/Square71x71Logo\.png/);
    });
  });

  describe('packaging-tools.ps1 - real build invocations', () => {
    test('packaging-tools.ps1 references candle.exe (WiX compiler)', () => {
      expect(read('release/packaging-tools.ps1')).toMatch(/candle\.exe/i);
    });

    test('packaging-tools.ps1 references light.exe (WiX linker)', () => {
      expect(read('release/packaging-tools.ps1')).toMatch(/light\.exe/i);
    });

    test('packaging-tools.ps1 references makeappx.exe pack', () => {
      expect(read('release/packaging-tools.ps1')).toMatch(/makeappx(?:\.exe)?\s+pack/i);
    });
  });
});

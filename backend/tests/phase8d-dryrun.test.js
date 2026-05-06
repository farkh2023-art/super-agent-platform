'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT       = path.resolve(__dirname, '..', '..');
const read       = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const SCRIPT     = path.join(ROOT, 'release', 'packaging-tools.ps1');
const PS_FLAGS   = '-NonInteractive -NoProfile';

function runPs(args, timeoutMs = 30000) {
  return execSync(
    `powershell ${PS_FLAGS} -File "${SCRIPT}" ${args}`,
    { encoding: 'utf8', timeout: timeoutMs, cwd: ROOT }
  );
}

describe('Phase 8D - dry-run, cross-GUID, version and pipeline order', () => {

  describe('packaging-tools.ps1 - dry-run (no external tools required)', () => {
    test('-DryRun -BuildMsi exits with code 0 and outputs [DRY-RUN]', () => {
      const out = runPs('-BuildMsi -DryRun');
      expect(out).toMatch(/\[DRY-RUN\]/);
    });

    test('-DryRun -BuildMsix exits with code 0 and outputs [DRY-RUN]', () => {
      const out = runPs('-BuildMsix -DryRun');
      expect(out).toMatch(/\[DRY-RUN\]/);
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
    test('create-release.ps1 default Version is v2.6.0-phase-8d', () => {
      expect(read('release/create-release.ps1')).toMatch(/\$Version = "v2\.6\.0-phase-8d"/);
    });

    test('local-ci.ps1 default Version is v2.6.0-phase-8d', () => {
      expect(read('release/local-ci.ps1')).toMatch(/\$Version = "v2\.6\.0-phase-8d"/);
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

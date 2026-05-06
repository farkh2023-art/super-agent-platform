'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('Phase 8D - version injection and Feature integration', () => {

  describe('product.wxs - Feature completeness', () => {
    test('product.wxs Feature references FrontendComponents', () => {
      expect(read('release/wix/product.wxs')).toMatch(/ComponentGroupRef[^>]*FrontendComponents/);
    });

    test('product.wxs Product Version uses WiX preprocessor variable', () => {
      expect(read('release/wix/product.wxs')).toMatch(/Version="\$\(var\./);
    });
  });

  describe('packaging-tools.ps1 - version conversion', () => {
    test('packaging-tools.ps1 declares ConvertTo-WixVersion function', () => {
      expect(read('release/packaging-tools.ps1')).toMatch(/ConvertTo-WixVersion/);
    });

    test('packaging-tools.ps1 passes -dVersion to candle.exe', () => {
      expect(read('release/packaging-tools.ps1')).toMatch(/-dVersion/);
    });
  });

  describe('packaging-tools.ps1 - AppxManifest version patch', () => {
    test('packaging-tools.ps1 has $MsixVersion for MSIX build', () => {
      expect(read('release/packaging-tools.ps1')).toMatch(/\$MsixVersion/);
    });

    test('packaging-tools.ps1 writes patched AppxManifest.xml to staging', () => {
      expect(read('release/packaging-tools.ps1')).toMatch(/Set-Content[^\n]*AppxManifest/);
    });
  });
});

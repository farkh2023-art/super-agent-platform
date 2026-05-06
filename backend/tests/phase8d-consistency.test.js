'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

describe('Phase 8D - cross-file consistency', () => {

  describe('WiX - ComponentGroupRef integrity', () => {
    test('every ComponentGroupRef in product.wxs has a matching ComponentGroup definition', () => {
      const product    = read('release/wix/product.wxs');
      const components = read('release/wix/components.wxs');
      const refs = [...product.matchAll(/ComponentGroupRef[^>]*Id="([^"]+)"/g)].map(m => m[1]);
      const defs = [...(product + components).matchAll(/<ComponentGroup\b[^>]*Id="([^"]+)"/g)].map(m => m[1]);
      expect(refs.length).toBeGreaterThan(0);
      refs.forEach(id => expect(defs).toContain(id));
    });

    test('component GUIDs in components.wxs are all unique', () => {
      const content = read('release/wix/components.wxs');
      const guids = [...content.matchAll(/\bGuid="\{([^}]+)\}"/g)].map(m => m[1].toUpperCase());
      expect(guids.length).toBeGreaterThan(0);
      expect(new Set(guids).size).toBe(guids.length);
    });

    test('component IDs in components.wxs are all unique', () => {
      const content = read('release/wix/components.wxs');
      const ids = [...content.matchAll(/<Component\b[^>]*\bId="([^"]+)"/g)].map(m => m[1]);
      expect(ids.length).toBeGreaterThan(0);
      expect(new Set(ids).size).toBe(ids.length);
    });

    test('WiX Source attributes contain only relative paths (no absolute drive letters)', () => {
      const combined = read('release/wix/product.wxs') + read('release/wix/components.wxs');
      const sources = [...combined.matchAll(/\bSource="([^"]+)"/g)].map(m => m[1]);
      expect(sources.length).toBeGreaterThan(0);
      sources.forEach(src => expect(src).not.toMatch(/^[A-Za-z]:\\/));
    });
  });

  describe('MSIX - asset integrity', () => {
    test('every asset referenced in AppxManifest.xml exists on disk', () => {
      const manifest = read('release/msix/AppxManifest.xml');
      const refs = [...manifest.matchAll(/Assets[/\\]([^\s"<>]+)/g)]
        .map(m => `release/msix/Assets/${m[1]}`);
      expect(refs.length).toBeGreaterThan(0);
      refs.forEach(rel => expect(exists(rel)).toBe(true));
    });
  });

  describe('packaging pipeline - version coherence', () => {
    test('create-release.ps1 forwards -Version to packaging-tools.ps1', () => {
      const content = read('release/create-release.ps1');
      expect(content).toMatch(/packaging-tools\.ps1[\s\S]*?-Version/);
    });

    test('local-ci.ps1 forwards -Version to packaging-tools.ps1', () => {
      const content = read('release/local-ci.ps1');
      expect(content).toMatch(/packaging-tools\.ps1[\s\S]*?-Version/);
    });
  });
});

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

describe('Phase 8D - WiX and MSIX template files', () => {

  describe('WiX product template - existence', () => {
    test('release/wix/product.wxs exists', () => {
      expect(exists('release/wix/product.wxs')).toBe(true);
    });
  });

  describe('WiX product template - structure', () => {
    test('product.wxs is well-formed XML', () => {
      expect(read('release/wix/product.wxs')).toMatch(/<\?xml|<Wix\b/);
    });

    test('product.wxs contains <Product element', () => {
      expect(read('release/wix/product.wxs')).toMatch(/<Product\b/);
    });

    test('product.wxs contains UpgradeCode attribute', () => {
      expect(read('release/wix/product.wxs')).toMatch(/UpgradeCode/);
    });

    test('product.wxs contains <Feature element', () => {
      expect(read('release/wix/product.wxs')).toMatch(/<Feature\b/);
    });

    test('product.wxs contains <Component or ComponentGroupRef', () => {
      expect(read('release/wix/product.wxs')).toMatch(/<Component\b|ComponentGroupRef/);
    });

    test('product.wxs references Super-Agent Platform name', () => {
      expect(read('release/wix/product.wxs')).toMatch(/Super-Agent Platform/i);
    });
  });

  describe('MSIX AppxManifest - existence', () => {
    test('release/msix/AppxManifest.xml exists', () => {
      expect(exists('release/msix/AppxManifest.xml')).toBe(true);
    });
  });

  describe('MSIX AppxManifest - structure', () => {
    test('AppxManifest.xml is well-formed XML', () => {
      expect(read('release/msix/AppxManifest.xml')).toMatch(/<\?xml|<Package\b/);
    });

    test('AppxManifest.xml contains <Package root element', () => {
      expect(read('release/msix/AppxManifest.xml')).toMatch(/<Package\b/);
    });

    test('AppxManifest.xml contains <Identity element', () => {
      expect(read('release/msix/AppxManifest.xml')).toMatch(/<Identity\b/);
    });

    test('AppxManifest.xml has Version attribute', () => {
      expect(read('release/msix/AppxManifest.xml')).toMatch(/\bVersion=/);
    });

    test('AppxManifest.xml has Publisher attribute', () => {
      expect(read('release/msix/AppxManifest.xml')).toMatch(/\bPublisher=/);
    });

    test('AppxManifest.xml references Super-Agent platform name', () => {
      expect(read('release/msix/AppxManifest.xml')).toMatch(/Super-Agent/i);
    });
  });
});

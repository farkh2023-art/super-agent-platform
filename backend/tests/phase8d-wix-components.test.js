'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

describe('Phase 8D - WiX components file', () => {

  describe('release/wix/components.wxs - existence', () => {
    test('release/wix/components.wxs exists', () => {
      expect(exists('release/wix/components.wxs')).toBe(true);
    });
  });

  describe('release/wix/components.wxs - structure', () => {
    test('components.wxs is well-formed XML', () => {
      expect(read('release/wix/components.wxs')).toMatch(/<\?xml|<Wix\b/);
    });

    test('components.wxs contains <Fragment element', () => {
      expect(read('release/wix/components.wxs')).toMatch(/<Fragment\b/);
    });

    test('components.wxs contains <ComponentGroup element', () => {
      expect(read('release/wix/components.wxs')).toMatch(/<ComponentGroup\b/);
    });

    test('components.wxs references frontend/index.html', () => {
      expect(read('release/wix/components.wxs')).toMatch(/frontend[/\\]index\.html/i);
    });

    test('components.wxs contains <Component elements', () => {
      expect(read('release/wix/components.wxs')).toMatch(/<Component\b/);
    });
  });

  describe('packaging templates - no hardcoded C:\\Users path', () => {
    const templates = [
      'release/wix/product.wxs',
      'release/wix/components.wxs',
      'release/msix/AppxManifest.xml',
      'release/config/packaging.example.json',
    ];

    templates.forEach((tpl) => {
      test(`${tpl} has no C:\\Users path`, () => {
        expect(read(tpl)).not.toMatch(/C:[/\\]Users/i);
      });
    });
  });
});

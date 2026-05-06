'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('Phase 10 Lot 3 - documentation frontend', () => {
  test('API client exposes docs methods', () => {
    const api = read('frontend/js/api.js');

    expect(api).toMatch(/getDocs\s*:/);
    expect(api).toMatch(/getDoc\s*:/);
    expect(api).toMatch(/apiFetch\('\/docs'\)/);
    expect(api).toMatch(/apiFetch\(`\/docs\/\$\{encodeURIComponent\(id\)\}`\)/);
  });

  test('index contains Documentation navigation and view containers', () => {
    const html = read('frontend/index.html');

    expect(html).toMatch(/data-view="docs"/);
    expect(html).toMatch(/view-docs|docs-view/);
    expect(html).toMatch(/id="docs-list"/);
    expect(html).toMatch(/id="docs-reader"/);
    expect(html).toMatch(/id="docs-search"/);
  });

  test('app implements docs loading and API calls', () => {
    const app = read('frontend/js/app.js');

    expect(app).toMatch(/case 'docs':\s*loadDocsView\(\)/);
    expect(app).toMatch(/function loadDocsView|async function loadDocsView/);
    expect(app).toMatch(/function loadDocContent|async function loadDocContent/);
    expect(app).toMatch(/API\.getDocs\(\)/);
    expect(app).toMatch(/API\.getDoc\(id\)/);
  });

  test('app renders markdown content as safe text instead of raw innerHTML', () => {
    const app = read('frontend/js/app.js');
    const loadDocContent = app.slice(app.indexOf('async function loadDocContent'));

    expect(loadDocContent).toMatch(/textContent\s*=\s*doc\.content/);
    expect(loadDocContent).not.toMatch(/innerHTML\s*=\s*doc\.content/);
    expect(loadDocContent).not.toMatch(/\$\{doc\.content\}/);
  });

  test('CSS contains documentation layout styles', () => {
    const css = read('frontend/css/styles.css');

    expect(css).toMatch(/\.docs-layout/);
    expect(css).toMatch(/\.docs-sidebar/);
    expect(css).toMatch(/\.docs-list/);
    expect(css).toMatch(/\.docs-reader/);
    expect(css).toMatch(/\.docs-search/);
  });
});

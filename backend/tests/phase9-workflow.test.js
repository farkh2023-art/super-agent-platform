'use strict';
const path = require('path');
const fs   = require('fs');

const ROOT          = path.resolve(__dirname, '..', '..');
const WORKFLOW_PATH = path.join(ROOT, '.github', 'workflows', 'ci.yml');

function read() { return fs.readFileSync(WORKFLOW_PATH, 'utf8'); }

describe('Phase 9 Lot 3 — GitHub Actions CI workflow', () => {

  test('.github/workflows/ci.yml exists', () => {
    expect(fs.existsSync(WORKFLOW_PATH)).toBe(true);
  });

  test('workflow has push trigger', () => {
    expect(read()).toMatch(/push/);
  });

  test('workflow has pull_request trigger', () => {
    expect(read()).toMatch(/pull_request/);
  });

  test('workflow has jobs: section', () => {
    expect(read()).toMatch(/^jobs:/m);
  });

  test('workflow uses actions/checkout', () => {
    expect(read()).toMatch(/actions\/checkout/);
  });

  test('workflow uses actions/setup-node', () => {
    expect(read()).toMatch(/actions\/setup-node/);
  });

  test('workflow specifies node-version', () => {
    expect(read()).toMatch(/node-version/);
  });

  test('workflow has npm install or npm ci step', () => {
    expect(read()).toMatch(/npm (?:install|ci)\b/);
  });

  test('workflow has npm test step', () => {
    expect(read()).toMatch(/npm(?:\s+run)?\s+test/);
  });

  test('workflow scopes working-directory to backend', () => {
    expect(read()).toMatch(/working-directory.*backend/);
  });

});

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const INDEX = fs.readFileSync(path.join(ROOT, 'frontend/index.html'), 'utf8');
const APP = fs.readFileSync(path.join(ROOT, 'frontend/js/app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'frontend/css/styles.css'), 'utf8');

describe('Phase 8 - frontend onboarding', () => {
  test('onboarding banner exists with required checklist entries', () => {
    expect(INDEX).toMatch(/onboarding-banner/);
    expect(INDEX).toMatch(/Mode demo actif/);
    expect(INDEX).toMatch(/Creer une premiere tache/);
    expect(INDEX).toMatch(/Voir les agents/);
    expect(INDEX).toMatch(/Voir Memory/);
    expect(INDEX).toMatch(/Voir Admin Health/);
    expect(INDEX).toMatch(/Faire un backup/);
  });

  test('onboarding can be hidden and reset through localStorage', () => {
    expect(APP).toMatch(/sap_onboarding_hidden/);
    expect(APP).toMatch(/hideOnboarding/);
    expect(APP).toMatch(/resetOnboarding/);
    expect(APP).toMatch(/localStorage\.setItem/);
    expect(APP).toMatch(/localStorage\.removeItem/);
  });

  test('settings view exposes onboarding reset action', () => {
    expect(INDEX).toMatch(/Reinitialiser onboarding/);
    expect(INDEX).toMatch(/resetOnboarding\(\)/);
  });

  test('onboarding has dedicated CSS', () => {
    expect(CSS).toMatch(/\.onboarding-banner/);
    expect(CSS).toMatch(/\.onboarding-checklist/);
    expect(CSS).toMatch(/\.onboarding-step/);
  });
});

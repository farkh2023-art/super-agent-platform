'use strict';
const path    = require('path');
const fs      = require('fs');
const request = require('supertest');
const { app } = require('../src/server');

const ROOT         = path.resolve(__dirname, '..', '..');
const VERSION_FILE = path.join(ROOT, 'VERSION');

function readVersion() {
  return fs.readFileSync(VERSION_FILE, 'utf8').trim();
}

describe('Phase 9 Lot 2 — VERSION file + /api/version endpoint', () => {

  test('VERSION file exists', () => {
    expect(fs.existsSync(VERSION_FILE)).toBe(true);
  });

  test('VERSION file contains a semver string', () => {
    const ver = readVersion();
    expect(ver).toMatch(/^\d+\.\d+\.\d+/);
  });

  test('GET /api/version returns HTTP 200', async () => {
    const res = await request(app).get('/api/version');
    expect(res.status).toBe(200);
  });

  test('GET /api/version response.version matches VERSION file', async () => {
    const res = await request(app).get('/api/version');
    expect(res.body.version).toBe(readVersion());
  });

  test('GET /api/version response contains buildDate (ISO 8601)', async () => {
    const res = await request(app).get('/api/version');
    expect(res.body.buildDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('GET /api/health version is consistent with VERSION file', async () => {
    const res     = await request(app).get('/api/health');
    const fileVer = readVersion();
    expect(fileVer.startsWith(res.body.version) || res.body.version === fileVer).toBe(true);
  });

  test('backend package.json version matches major.minor.patch of VERSION file', () => {
    const pkg     = JSON.parse(fs.readFileSync(path.join(ROOT, 'backend', 'package.json'), 'utf8'));
    const fileVer = readVersion();
    const [major, minor, patch] = fileVer.split(/[.\-]/);
    expect(pkg.version).toBe(`${major}.${minor}.${patch}`);
  });

});

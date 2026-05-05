'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');

function tmpDir() {
  const d = path.join(os.tmpdir(), 'sap-p7-rep-' + Date.now());
  fs.mkdirSync(d, { recursive: true });
  return d;
}

describe('Phase 7 — Admin Reports', () => {
  let dataDir;

  beforeEach(() => {
    jest.resetModules();
    dataDir = tmpDir();
    process.env.DATA_DIR = dataDir;
    process.env.AUTH_MODE = 'single';
    process.env.JWT_SECRET = 'test-secret-report';
    delete process.env.AUTH_SQLITE_ENABLED;
    delete process.env.STORAGE_MODE;
  });

  afterEach(() => {
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch {}
  });

  test('buildReport returns all required keys', () => {
    const { buildReport } = require('../src/reports/adminReport');
    const report = buildReport();
    expect(report).toHaveProperty('status');
    expect(report).toHaveProperty('generatedAt');
    expect(report).toHaveProperty('system');
    expect(report).toHaveProperty('storage');
    expect(report).toHaveProperty('auth');
    expect(report).toHaveProperty('rag');
    expect(report).toHaveProperty('scheduler');
    expect(report).toHaveProperty('tests');
    expect(report).toHaveProperty('warnings');
  });

  test('buildReport.tests.lastKnownTotal is 427', () => {
    const { buildReport } = require('../src/reports/adminReport');
    const report = buildReport();
    expect(report.tests.lastKnownTotal).toBe(427);
  });

  test('buildMarkdownReport returns a markdown string', () => {
    const { buildReport, buildMarkdownReport } = require('../src/reports/adminReport');
    const report = buildReport();
    const md = buildMarkdownReport(report);
    expect(typeof md).toBe('string');
    expect(md).toMatch(/# Super-Agent Platform/);
    expect(md).toMatch(/## System/);
    expect(md).toMatch(/## Auth/);
    expect(md).toMatch(/## Storage/);
    expect(md).toMatch(/## RAG/);
    expect(md).toMatch(/## Scheduler/);
  });

  test('buildMarkdownReport does not contain secrets', () => {
    const { buildReport, buildMarkdownReport } = require('../src/reports/adminReport');
    const report = buildReport();
    const md = buildMarkdownReport(report);
    expect(md).not.toMatch(/password|sk-ant|token_hash|apiKey/i);
  });

  test('saveReport writes json and md files', () => {
    const { buildReport, saveReport, reportsDir } = require('../src/reports/adminReport');
    const report = buildReport();
    const { jsonFile, mdFile } = saveReport(report);
    const dir = reportsDir();
    expect(fs.existsSync(path.join(dir, jsonFile))).toBe(true);
    expect(fs.existsSync(path.join(dir, mdFile))).toBe(true);
  });

  test('saved JSON report contains no secrets', () => {
    const { buildReport, saveReport, reportsDir } = require('../src/reports/adminReport');
    const report = buildReport();
    const { jsonFile } = saveReport(report);
    const content = fs.readFileSync(path.join(reportsDir(), jsonFile), 'utf8');
    expect(content).not.toMatch(/password|sk-ant|token_hash|apiKey/i);
  });

  describe('HTTP endpoints', () => {
    let app, request;

    beforeEach(() => {
      const { app: a } = require('../src/server');
      app = a;
      request = require('supertest');
    });

    test('GET /api/admin/report.json returns 200 in single mode', async () => {
      const res = await request(app).get('/api/admin/report.json');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('generatedAt');
    });

    test('GET /api/admin/report.md returns markdown', async () => {
      const res = await request(app).get('/api/admin/report.md');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/markdown/);
      expect(res.text).toMatch(/# Super-Agent Platform/);
    });

    test('GET /api/admin/report.md has content-disposition attachment', async () => {
      const res = await request(app).get('/api/admin/report.md');
      expect(res.headers['content-disposition']).toMatch(/attachment/);
    });

    test('GET /api/admin/report.json does not contain secrets', async () => {
      const res = await request(app).get('/api/admin/report.json');
      const body = JSON.stringify(res.body);
      expect(body).not.toMatch(/password|sk-ant|token_hash|apiKey/i);
    });

    test('GET /api/admin/reports returns list', async () => {
      await request(app).get('/api/admin/report.json');
      const res = await request(app).get('/api/admin/reports');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('reports');
      expect(Array.isArray(res.body.reports)).toBe(true);
    });
  });
});

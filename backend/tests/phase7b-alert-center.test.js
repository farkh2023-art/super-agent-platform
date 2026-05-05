'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
const request = require('supertest');

function tmpDir() {
  const d = path.join(os.tmpdir(), 'sap-p7b-alerts-' + Date.now() + '-' + Math.random().toString(16).slice(2));
  fs.mkdirSync(d, { recursive: true });
  return d;
}

describe('Phase 7B - Alert Center', () => {
  let app;
  let dataDir;

  beforeEach(() => {
    jest.resetModules();
    dataDir = tmpDir();
    process.env.DATA_DIR = dataDir;
    process.env.AUTH_MODE = 'single';
    process.env.JWT_SECRET = 'phase7b-secret';
    delete process.env.STORAGE_MODE;
    app = require('../src/server').app;
  });

  afterEach(() => {
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch {}
  });

  test('alert rules CRUD works in single auth mode', async () => {
    const create = await request(app).post('/api/admin/alert-rules').send({
      name: 'Any warning',
      metric: 'warningsCount',
      operator: '>=',
      threshold: 0,
      cooldownMs: 0,
      severity: 'warning',
    });
    expect(create.status).toBe(201);
    expect(create.body.id).toBeDefined();

    const list = await request(app).get('/api/admin/alert-rules');
    expect(list.status).toBe(200);
    expect(list.body.rules).toHaveLength(1);

    const update = await request(app).put(`/api/admin/alert-rules/${create.body.id}`).send({ enabled: false });
    expect(update.status).toBe(200);
    expect(update.body.enabled).toBe(false);

    const del = await request(app).delete(`/api/admin/alert-rules/${create.body.id}`);
    expect(del.status).toBe(200);
  });

  test('alert evaluation creates persistent notification and respects cooldown', async () => {
    await request(app).post('/api/admin/alert-rules').send({
      name: 'Always trigger',
      metric: 'warningsCount',
      operator: '>=',
      threshold: 0,
      cooldownMs: 600000,
    });

    const first = await request(app).post('/api/admin/alerts/evaluate').send({});
    expect(first.status).toBe(200);
    expect(first.body.triggered).toHaveLength(1);

    const second = await request(app).post('/api/admin/alerts/evaluate').send({});
    expect(second.status).toBe(200);
    expect(second.body.triggered).toHaveLength(0);

    const alerts = await request(app).get('/api/admin/alerts');
    expect(alerts.status).toBe(200);
    expect(alerts.body.notifications).toHaveLength(1);
    expect(alerts.body.unread).toBe(1);
    expect(JSON.stringify(alerts.body)).not.toMatch(/authorization|cookie|password|token/i);
  });

  test('notifications can be marked read', async () => {
    await request(app).post('/api/admin/alert-rules').send({ metric: 'warningsCount', operator: '>=', threshold: 0, cooldownMs: 0 });
    await request(app).post('/api/admin/alerts/evaluate').send({});
    const alerts = await request(app).get('/api/admin/alerts');
    const id = alerts.body.notifications[0].id;

    const read = await request(app).patch(`/api/admin/alerts/${id}/read`).send({});
    expect(read.status).toBe(200);
    expect(read.body.read).toBe(true);

    const after = await request(app).get('/api/admin/alerts?unread=true');
    expect(after.body.notifications).toHaveLength(0);
  });

  test('scheduled admin report config and trigger persist report files', async () => {
    const cfg = await request(app).put('/api/admin/report-schedule').send({ enabled: true, intervalMs: 60000 });
    expect(cfg.status).toBe(200);
    expect(cfg.body.enabled).toBe(true);

    const run = await request(app).post('/api/admin/report-schedule/trigger').send({});
    expect(run.status).toBe(200);
    expect(run.body.files.jsonFile).toMatch(/admin-report-/);

    const reports = await request(app).get('/api/admin/reports');
    expect(reports.body.reports.length).toBeGreaterThanOrEqual(1);
  });
});

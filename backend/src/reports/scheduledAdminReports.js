'use strict';

const storage = require('../storage');
const { buildReport, saveReport } = require('./adminReport');
const { evaluateAlertRules } = require('../alerts/alertCenter');

const RECORD = 'admin_report_schedule';
const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;
let _timer = null;

function getConfig() {
  const current = storage.readRecord(RECORD);
  return {
    enabled: current.enabled === true,
    intervalMs: Number.isFinite(Number(current.intervalMs)) && Number(current.intervalMs) > 0 ? Number(current.intervalMs) : DEFAULT_INTERVAL_MS,
    nextRunAt: current.nextRunAt || null,
    lastRunAt: current.lastRunAt || null,
    lastFiles: current.lastFiles || null,
    runCount: Number(current.runCount || 0),
  };
}

function setConfig(input = {}) {
  const current = getConfig();
  const intervalMs = input.intervalMs !== undefined ? Number(input.intervalMs) : current.intervalMs;
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    const err = new Error('intervalMs must be positive');
    err.statusCode = 400;
    throw err;
  }
  const enabled = input.enabled !== undefined ? input.enabled === true : current.enabled;
  const cfg = {
    ...current,
    enabled,
    intervalMs,
    nextRunAt: input.nextRunAt || current.nextRunAt || new Date(Date.now() + intervalMs).toISOString(),
  };
  storage.writeRecord(RECORD, cfg);
  return cfg;
}

function runOnce() {
  const report = buildReport();
  const files = saveReport(report);
  evaluateAlertRules(report);
  const current = getConfig();
  const updated = {
    ...current,
    lastRunAt: report.generatedAt,
    nextRunAt: new Date(Date.now() + current.intervalMs).toISOString(),
    lastFiles: files,
    runCount: current.runCount + 1,
  };
  storage.writeRecord(RECORD, updated);
  return { report, files, schedule: updated };
}

function tick() {
  const cfg = getConfig();
  if (!cfg.enabled) return null;
  if (!cfg.nextRunAt || new Date(cfg.nextRunAt).getTime() <= Date.now()) return runOnce();
  return null;
}

function start() {
  if (_timer) return;
  const interval = parseInt(process.env.ADMIN_REPORT_SCHEDULER_INTERVAL_MS || '60000', 10);
  if (interval <= 0) return;
  _timer = setInterval(() => { try { tick(); } catch {} }, interval);
  if (_timer.unref) _timer.unref();
}

function stop() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}

module.exports = { getConfig, setConfig, runOnce, tick, start, stop };

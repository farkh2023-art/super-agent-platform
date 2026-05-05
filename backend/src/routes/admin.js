'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { requireAuth, requireRole } = require('../middleware/requireAuth');
const { getAuthMode } = require('../auth/authConfig');
const { buildReport, buildMarkdownReport, saveReport, reportsDir } = require('../reports/adminReport');
const { notify } = require('../notifications/wsNotifications');
const alerts = require('../alerts/alertCenter');
const scheduledReports = require('../reports/scheduledAdminReports');

const router = express.Router();

// GET /api/admin/health — admin in multi mode, open in single mode
router.get('/health', requireAuth, (req, res) => {
  if (getAuthMode() === 'multi' && req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin required' });
  }
  try {
    const report = buildReport();
    if (report.warnings.length > 0) {
      notify.healthWarning({ warnings: report.warnings });
    }
    const alertEvaluation = alerts.evaluateAlertRules(report);
    report.alerts = { ...report.alerts, triggered: alertEvaluation.triggered.length, unreadNotifications: alerts.listNotifications({ unreadOnly: true }).unread };
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/report.json
router.get('/report.json', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const report = buildReport();
    saveReport(report);
    const alertEvaluation = alerts.evaluateAlertRules(report);
    report.alerts = { ...report.alerts, triggered: alertEvaluation.triggered.length, unreadNotifications: alerts.listNotifications({ unreadOnly: true }).unread };
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/report.md
router.get('/report.md', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const report = buildReport();
    saveReport(report);
    alerts.evaluateAlertRules(report);
    const md = buildMarkdownReport(report);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="admin-report.md"');
    res.send(md);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/reports — list saved reports
router.get('/reports', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const dir = reportsDir();
    if (!fs.existsSync(dir)) return res.json({ reports: [] });
    const files = fs.readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .slice(-20)
      .reverse();
    res.json({ reports: files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Alert rules CRUD
router.get('/alert-rules', requireAuth, requireRole('admin'), (_req, res) => {
  res.json({ rules: alerts.listRules() });
});

router.post('/alert-rules', requireAuth, requireRole('admin'), (req, res) => {
  try {
    res.status(201).json(alerts.createRule(req.body || {}));
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.get('/alert-rules/:id', requireAuth, requireRole('admin'), (req, res) => {
  const rule = alerts.listRules().find((r) => r.id === req.params.id);
  if (!rule) return res.status(404).json({ error: 'Alert rule not found' });
  res.json(rule);
});

router.put('/alert-rules/:id', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const rule = alerts.updateRule(req.params.id, req.body || {});
    if (!rule) return res.status(404).json({ error: 'Alert rule not found' });
    res.json(rule);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.delete('/alert-rules/:id', requireAuth, requireRole('admin'), (req, res) => {
  if (!alerts.deleteRule(req.params.id)) return res.status(404).json({ error: 'Alert rule not found' });
  res.json({ message: 'Alert rule deleted' });
});

router.post('/alerts/evaluate', requireAuth, requireRole('admin'), (_req, res) => {
  const report = buildReport();
  res.json(alerts.evaluateAlertRules(report));
});

router.get('/alerts', requireAuth, requireRole('admin'), (req, res) => {
  res.json(alerts.listNotifications({
    unreadOnly: req.query.unread === 'true',
    limit: req.query.limit,
  }));
});

router.patch('/alerts/:id/read', requireAuth, requireRole('admin'), (req, res) => {
  const notification = alerts.markNotificationRead(req.params.id);
  if (!notification) return res.status(404).json({ error: 'Notification not found' });
  res.json(notification);
});

router.post('/alerts/mark-all-read', requireAuth, requireRole('admin'), (_req, res) => {
  res.json({ updated: alerts.markAllRead() });
});

router.get('/report-schedule', requireAuth, requireRole('admin'), (_req, res) => {
  res.json(scheduledReports.getConfig());
});

router.put('/report-schedule', requireAuth, requireRole('admin'), (req, res) => {
  try {
    res.json(scheduledReports.setConfig(req.body || {}));
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/report-schedule/trigger', requireAuth, requireRole('admin'), (_req, res) => {
  try {
    res.json(scheduledReports.runOnce());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

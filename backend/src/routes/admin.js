'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { requireAuth, requireRole } = require('../middleware/requireAuth');
const { getAuthMode } = require('../auth/authConfig');
const { buildReport, buildMarkdownReport, saveReport, reportsDir } = require('../reports/adminReport');
const { notify } = require('../notifications/wsNotifications');

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

module.exports = router;

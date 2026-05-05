'use strict';

const path = require('path');
const fs = require('fs');

const REPORTS_DIR = path.resolve(__dirname, '..', '..', 'data', 'admin-reports');

function ensureReportsDir() {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

function buildReport() {
  const now = new Date().toISOString();
  const warnings = [];

  // System
  const mem = process.memoryUsage();
  const heapUsed = Math.round(mem.heapUsed / 1024 / 1024);
  const heapTotal = Math.round(mem.heapTotal / 1024 / 1024);
  const system = {
    uptimeSec: Math.round(process.uptime()),
    memory: {
      rss: Math.round(mem.rss / 1024 / 1024),
      heapUsed,
      heapTotal,
    },
    nodeVersion: process.version,
    platform: process.platform,
  };
  if (heapTotal > 0 && heapUsed / heapTotal > 0.9) {
    warnings.push({ level: 'warning', component: 'system', message: 'Heap usage above 90%' });
  }

  // Storage
  const storageMode = (process.env.STORAGE_MODE || 'json').toLowerCase();
  let sqliteConnected = false;
  try {
    const sqlite = require('../storage/sqlite');
    sqliteConnected = typeof sqlite.isAvailable === 'function' ? sqlite.isAvailable() : !!sqlite.openDatabase;
  } catch {}

  let lastValidationAt = null;
  let desyncAlerts = 0;
  try {
    const { listEvents } = require('../storage/storageEvents');
    const events = listEvents({ limit: 50 });
    const validation = events.filter((e) => e.type === 'validation_completed');
    if (validation.length > 0) lastValidationAt = validation[0].createdAt || null;
    desyncAlerts = events.filter((e) => e.type === 'desync_detected').length;
  } catch {}

  const storageSection = { mode: storageMode, sqliteConnected, lastValidationAt, desyncAlerts };

  // Auth
  let authMode = 'single';
  try { authMode = require('../auth/authConfig').getAuthMode(); } catch {}
  let activeSessions = 0;
  try {
    const { listActiveSessions } = require('../auth/refreshTokens');
    const result = listActiveSessions();
    activeSessions = result.total != null ? result.total : (result.items ? result.items.length : 0);
  } catch {}
  let blacklistCount = 0;
  try { blacklistCount = require('../auth/tokenBlacklist').size(); } catch {}
  const cleanupEnabled = String(process.env.AUTH_CLEANUP_ENABLED || 'false').toLowerCase() === 'true';
  const authSection = { mode: authMode, activeSessions, blacklistCount, cleanupEnabled };

  // RAG
  let memoryItems = 0;
  let embeddingsEnabled = false;
  let embeddingsCount = 0;
  let lastEvaluationAt = null;
  try {
    const { listChunks } = require('../memory/retriever');
    memoryItems = listChunks().length;
  } catch {}
  try {
    const embeddingStore = require('../memory/embeddingStore');
    const store = embeddingStore.readStore();
    embeddingsEnabled = store.metadata?.enabled === true;
    embeddingsCount = Object.keys(store.embeddings || {}).length;
  } catch {}
  try {
    const evaluator = require('../memory/evaluator');
    if (typeof evaluator.getLatestEvaluation === 'function') {
      const latest = evaluator.getLatestEvaluation();
      if (latest) lastEvaluationAt = latest.runAt || null;
    }
  } catch {}
  const ragSection = { memoryItems, embeddingsEnabled, embeddingsCount, lastEvaluationAt };

  // Scheduler
  let schedulesCount = 0;
  let lastRunAt = null;
  let schedulerEnabled = true;
  try {
    const storage = require('../storage');
    const schedules = storage.findAll('schedules');
    schedulesCount = schedules.length;
    const ran = schedules.filter((s) => s.lastRunAt).sort((a, b) => new Date(b.lastRunAt) - new Date(a.lastRunAt));
    if (ran.length > 0) lastRunAt = ran[0].lastRunAt;
    schedulerEnabled = parseInt(process.env.SCHEDULER_INTERVAL_MS || '60000', 10) > 0;
  } catch {}
  const schedulerSection = { enabled: schedulerEnabled, schedulesCount, lastRunAt };

  let alertRulesCount = 0;
  let unreadNotifications = 0;
  let scheduledReportsEnabled = false;
  try {
    const storage = require('../storage');
    alertRulesCount = storage.findAll('alert_rules').length;
    unreadNotifications = storage.findAll('notifications').filter((n) => !n.read).length;
    scheduledReportsEnabled = require('./scheduledAdminReports').getConfig().enabled;
  } catch {}
  const alertsSection = { alertRulesCount, unreadNotifications, scheduledReportsEnabled };

  let status = 'ok';
  if (warnings.some((w) => w.level === 'critical')) status = 'critical';
  else if (warnings.length > 0) status = 'warning';

  return {
    status,
    generatedAt: now,
    system,
    storage: storageSection,
    auth: authSection,
    rag: ragSection,
    scheduler: schedulerSection,
    alerts: alertsSection,
    tests: { lastKnownTotal: 535 },
    warnings,
  };
}

function buildMarkdownReport(report) {
  const lines = [
    `# Super-Agent Platform — Admin Report`,
    ``,
    `**Status**: \`${report.status}\``,
    `**Generated**: ${report.generatedAt}`,
    ``,
    `---`,
    ``,
    `## System`,
    ``,
    `| Key | Value |`,
    `|-----|-------|`,
    `| Uptime | ${report.system.uptimeSec}s |`,
    `| Node | ${report.system.nodeVersion} |`,
    `| Platform | ${report.system.platform} |`,
    `| Heap Used | ${report.system.memory.heapUsed} MB |`,
    `| Heap Total | ${report.system.memory.heapTotal} MB |`,
    `| RSS | ${report.system.memory.rss} MB |`,
    ``,
    `## Storage`,
    ``,
    `| Key | Value |`,
    `|-----|-------|`,
    `| Mode | ${report.storage.mode} |`,
    `| SQLite Connected | ${report.storage.sqliteConnected} |`,
    `| Last Validation | ${report.storage.lastValidationAt || 'N/A'} |`,
    `| Desync Alerts | ${report.storage.desyncAlerts} |`,
    ``,
    `## Auth`,
    ``,
    `| Key | Value |`,
    `|-----|-------|`,
    `| Mode | ${report.auth.mode} |`,
    `| Active Sessions | ${report.auth.activeSessions} |`,
    `| Blacklist Count | ${report.auth.blacklistCount} |`,
    `| Cleanup Enabled | ${report.auth.cleanupEnabled} |`,
    ``,
    `## RAG / Memory`,
    ``,
    `| Key | Value |`,
    `|-----|-------|`,
    `| Memory Items | ${report.rag.memoryItems} |`,
    `| Embeddings Enabled | ${report.rag.embeddingsEnabled} |`,
    `| Embeddings Count | ${report.rag.embeddingsCount} |`,
    `| Last Evaluation | ${report.rag.lastEvaluationAt || 'N/A'} |`,
    ``,
    `## Scheduler`,
    ``,
    `| Key | Value |`,
    `|-----|-------|`,
    `| Enabled | ${report.scheduler.enabled} |`,
    `| Schedules Count | ${report.scheduler.schedulesCount} |`,
    `| Last Run | ${report.scheduler.lastRunAt || 'N/A'} |`,
    ``,
    `## Alerts`,
    ``,
    `| Key | Value |`,
    `|-----|-------|`,
    `| Alert Rules | ${report.alerts?.alertRulesCount ?? 0} |`,
    `| Unread Notifications | ${report.alerts?.unreadNotifications ?? 0} |`,
    `| Scheduled Reports Enabled | ${report.alerts?.scheduledReportsEnabled ?? false} |`,
    ``,
    `## Tests`,
    ``,
    `Last known total: **${report.tests.lastKnownTotal}**`,
    ``,
  ];

  if (report.warnings.length > 0) {
    lines.push(`## Warnings`, ``);
    for (const w of report.warnings) {
      lines.push(`- **[${w.level.toUpperCase()}]** \`${w.component}\`: ${w.message}`);
    }
    lines.push(``);
  }

  return lines.join('\n');
}

function saveReport(report) {
  ensureReportsDir();
  const ts = report.generatedAt.slice(0, 16).replace('T', '-').replace(':', '-');
  const jsonFile = `admin-report-${ts}.json`;
  const mdFile = `admin-report-${ts}.md`;
  fs.writeFileSync(path.join(REPORTS_DIR, jsonFile), JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(path.join(REPORTS_DIR, mdFile), buildMarkdownReport(report), 'utf8');
  return { jsonFile, mdFile };
}

function reportsDir() {
  return REPORTS_DIR;
}

module.exports = { buildReport, buildMarkdownReport, saveReport, reportsDir };

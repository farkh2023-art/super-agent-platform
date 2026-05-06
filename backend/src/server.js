'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const { setBroadcast } = require('./engine/executor');
const limiter = require('./engine/concurrency');

const fs = require('fs');

const _versionFilePath = path.resolve(__dirname, '../../VERSION');
const _appVersion = fs.existsSync(_versionFilePath)
  ? fs.readFileSync(_versionFilePath, 'utf8').trim()
  : '0.0.0';

const app = express();
const server = http.createServer(app);

// ── WebSocket ─────────────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server, path: '/ws' });
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: 'connected', message: 'Super-Agent Platform WebSocket ready' }));
  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));
});

function broadcast(event) {
  const msg = JSON.stringify(event);
  for (const client of clients) {
    if (client.readyState === 1) {
      client.send(msg);
    }
  }
}

setBroadcast(broadcast);
require('./notifications/wsNotifications').setBroadcastFn(broadcast);

// ── Middleware ────────────────────────────────────────────────────────────────
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
app.use(cors({ origin: [FRONTEND_URL, 'http://localhost:3000', 'null', '*'], credentials: true }));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: false }));

// Mini cookie parser — no external dependency
app.use((req, _res, next) => {
  req.cookies = {};
  const header = req.headers.cookie || '';
  header.split(';').forEach((part) => {
    const eq = part.indexOf('=');
    if (eq === -1) return;
    const key = part.slice(0, eq).trim();
    try { req.cookies[key] = decodeURIComponent(part.slice(eq + 1).trim()); }
    catch { req.cookies[key] = part.slice(eq + 1).trim(); }
  });
  next();
});

// Serve frontend static files
const FRONTEND_DIR = path.resolve(__dirname, '../../frontend');
app.use(express.static(FRONTEND_DIR));

// ── API Auth (optional – enabled when API_KEY env var is set) ─────────────────
app.use('/api', require('./middleware/auth'));

// ── Audit log + rate limiters (active only in multi-user mode) ───────────────
app.use('/api', require('./middleware/auditLog').auditLog);
app.use('/api', require('./middleware/rateLimiter').rateLimiter);
app.use('/api', require('./middleware/csrfProtection').csrfProtection);

// ── Auth routes (always public for /login and /mode) ─────────────────────────
app.use('/api/auth', require('./routes/auth'));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/agents', require('./routes/agents'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/executions', require('./routes/executions'));
app.use('/api/workflows', require('./routes/workflows'));
app.use('/api/artifacts', require('./routes/artifacts'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/search', require('./routes/search'));
app.use('/api/workflow-runs', require('./routes/workflow-runs'));
app.use('/api/backup', require('./routes/backup'));
app.use('/api/schedules', require('./routes/schedules'));
app.use('/api/metrics', require('./routes/metrics'));
app.use('/api/memory', require('./routes/memory'));
app.use('/api/storage', require('./routes/storage'));
app.use('/api/workspaces', require('./routes/workspaces'));
app.use('/api/admin', require('./routes/admin'));

// Version info
app.get('/api/version', (req, res) => {
  res.json({
    version: _appVersion,
    buildDate: new Date().toISOString(),
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: _appVersion,
    provider: process.env.AI_PROVIDER || 'mock',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// Detailed health
app.get('/api/health/detailed', (req, res) => {
  const storage = require('./storage');
  const { getAllAgents } = require('./agents/registry');
  const mem = process.memoryUsage();
  res.json({
    status: 'ok',
    version: _appVersion,
    system: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      memoryMB: {
        rss: Math.round(mem.rss / 1024 / 1024),
        heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
      },
    },
    storage: {
      executions: storage.findAll('executions').length,
      artifacts:  storage.findAll('artifacts').length,
      workflows:  storage.findAll('workflows').length,
      tasks:      storage.findAll('tasks').length,
      workflowRuns: storage.findAll('workflow_runs').length,
    },
    agents:      { total: getAllAgents().length },
    concurrency: limiter.stats(),
    provider:    process.env.AI_PROVIDER || 'mock',
    uptime:      Math.round(process.uptime()),
    timestamp:   new Date().toISOString(),
  });
});

// SPA fallback – serve index.html for any non-API route
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
  } else {
    res.status(404).json({ error: 'Route introuvable' });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3001', 10);

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`\n🚀 Super-Agent Platform Backend`);
    console.log(`   API    : http://localhost:${PORT}/api`);
    console.log(`   UI     : http://localhost:${PORT}`);
    console.log(`   WS     : ws://localhost:${PORT}/ws`);
    console.log(`   Mode   : ${process.env.AI_PROVIDER || 'mock'}`);
    console.log(`   Données: ${require('./storage').DATA_DIR}\n`);
    require('./engine/scheduler').start();
    require('./reports/scheduledAdminReports').start();
    require('./engine/storageMonitor').start(broadcast);
    require('./auth/authCleanup').startAutoCleanup();
  });
}

module.exports = { app, server };

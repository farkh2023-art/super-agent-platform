'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const { setBroadcast } = require('./engine/executor');

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

// ── Middleware ────────────────────────────────────────────────────────────────
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
app.use(cors({ origin: [FRONTEND_URL, 'http://localhost:3000', 'null', '*'] }));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: false }));

// Serve frontend static files
const FRONTEND_DIR = path.resolve(__dirname, '../../frontend');
app.use(express.static(FRONTEND_DIR));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/agents', require('./routes/agents'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/executions', require('./routes/executions'));
app.use('/api/workflows', require('./routes/workflows'));
app.use('/api/artifacts', require('./routes/artifacts'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/dashboard', require('./routes/dashboard'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    provider: process.env.AI_PROVIDER || 'mock',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
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
  });
}

module.exports = { app, server };

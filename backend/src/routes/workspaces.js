'use strict';

const express = require('express');
const crypto = require('crypto');
const storage = require('../storage');
const wsStore = require('../auth/workspaces');
const { forWorkspace } = require('../storage/workspaceStorage');
const { requireAuth, requireRole } = require('../middleware/requireAuth');
const { getAuthMode } = require('../auth/authConfig');

const router = express.Router();

// GET /api/workspaces — admin only
router.get('/', requireAuth, requireRole('admin'), (req, res) => {
  res.json({ workspaces: wsStore.list() });
});

// POST /api/workspaces — admin only
router.post('/', requireAuth, requireRole('admin'), (req, res) => {
  const { name, ownerId, limits } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const ws = wsStore.createWorkspace({ name, ownerId, limits });
  res.status(201).json({ workspace: ws });
});

// GET /api/workspaces/:id — admin or workspace member
router.get('/:id', requireAuth, (req, res) => {
  const ws = wsStore.findById(req.params.id);
  if (!ws) return res.status(404).json({ error: 'Workspace not found' });
  if (req.user && req.user.role !== 'admin' && req.user.workspaceId !== ws.id) {
    return res.status(403).json({ error: 'Access denied' });
  }
  res.json({ workspace: ws });
});

// ── Workspace-scoped collection routes ──────────────────────────────────────

function wsMiddleware(req, res, next) {
  const ws = wsStore.findById(req.params.id);
  if (!ws) return res.status(404).json({ error: 'Workspace not found' });
  if (getAuthMode() === 'multi' && req.user && req.user.role !== 'admin' && req.user.workspaceId !== ws.id) {
    return res.status(403).json({ error: 'Access denied to this workspace' });
  }
  req.ws = ws;
  req.wsStorage = forWorkspace(ws.id);
  next();
}

// GET /api/workspaces/:id/tasks
router.get('/:id/tasks', requireAuth, wsMiddleware, (req, res) => {
  res.json({ tasks: req.wsStorage.list('tasks') });
});

// POST /api/workspaces/:id/tasks
router.post('/:id/tasks', requireAuth, wsMiddleware, (req, res) => {
  const ws = req.ws;
  const current = req.wsStorage.count('tasks');
  if (current >= ws.limits.maxTasks) {
    return res.status(429).json({ error: `Workspace task limit reached (${ws.limits.maxTasks})` });
  }
  const item = { id: crypto.randomUUID(), ...req.body, createdAt: new Date().toISOString() };
  const created = req.wsStorage.create('tasks', item);
  res.status(201).json({ task: created });
});

// GET /api/workspaces/:id/executions
router.get('/:id/executions', requireAuth, wsMiddleware, (req, res) => {
  res.json({ executions: req.wsStorage.list('executions') });
});

// GET /api/workspaces/:id/artifacts
router.get('/:id/artifacts', requireAuth, wsMiddleware, (req, res) => {
  res.json({ artifacts: req.wsStorage.list('artifacts') });
});

module.exports = router;

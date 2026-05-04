'use strict';

const express = require('express');
const crypto = require('crypto');
const jwt = require('../auth/jwt');
const users = require('../auth/users');
const workspaces = require('../auth/workspaces');
const { getAuthMode, setAuthMode } = require('../auth/authConfig');
const { requireAuth, requireRole } = require('../middleware/requireAuth');
const { listAuditLog } = require('../middleware/auditLog');

const router = express.Router();
const CONFIRMATION = 'I_UNDERSTAND_AUTH_RISK';

// GET /api/auth/mode — always public
router.get('/mode', (req, res) => {
  res.json({ mode: getAuthMode() });
});

// POST /api/auth/login — always public
router.post('/login', (req, res) => {
  if (getAuthMode() !== 'multi') {
    return res.status(400).json({ error: 'Auth mode is single-user — login not required' });
  }
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });

  const user = users.authenticate(username, password);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign({ id: user.id, username: user.username, role: user.role, workspaceId: user.workspaceId });
  res.json({ token, user });
});

// POST /api/auth/register — admin only (or first user becomes admin)
router.post('/register', requireAuth, (req, res) => {
  const isFirstUser = users.count() === 0;
  if (!isFirstUser && (!req.user || req.user.role !== 'admin')) {
    return res.status(403).json({ error: 'Admin required to register users' });
  }
  const { username, password, role, workspaceId } = req.body || {};
  try {
    const wsId = workspaceId || workspaces.getOrCreate('default').id;
    const user = users.createUser({ username, password, role: isFirstUser ? 'admin' : (role || 'user'), workspaceId: wsId });
    res.status(201).json({ user });
  } catch (err) {
    const status = err.code === 'DUPLICATE_USERNAME' ? 409 : err.code === 'INVALID_INPUT' ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  if (getAuthMode() !== 'multi') return res.json({ mode: 'single', user: null });
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const user = users.findById(req.user.id);
  res.json({ user: user || req.user });
});

// GET /api/auth/users — admin only
router.get('/users', requireAuth, requireRole('admin'), (req, res) => {
  res.json({ users: users.listUsers() });
});

// GET /api/auth/audit-log — admin only
router.get('/audit-log', requireAuth, requireRole('admin'), (req, res) => {
  const limit = parseInt(req.query.limit || '100', 10);
  res.json({ entries: listAuditLog({ limit }) });
});

// POST /api/auth/set-mode — admin only
router.post('/set-mode', requireAuth, requireRole('admin'), (req, res) => {
  const { mode, confirmation } = req.body || {};
  if (confirmation !== CONFIRMATION) return res.status(400).json({ error: `confirmation must equal ${CONFIRMATION}` });
  try {
    setAuthMode(mode);
    res.json({ success: true, mode });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/auth/logout — client-side token invalidation; server records it
router.post('/logout', requireAuth, (req, res) => {
  res.json({ success: true, message: 'Token invalidated client-side. Remove it from storage.' });
});

module.exports = router;

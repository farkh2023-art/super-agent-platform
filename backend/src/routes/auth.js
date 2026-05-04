'use strict';

const express = require('express');
const crypto = require('crypto');
const jwt = require('../auth/jwt');
const users = require('../auth/users');
const workspaces = require('../auth/workspaces');
const refreshTokens = require('../auth/refreshTokens');
const { getAuthMode, setAuthMode } = require('../auth/authConfig');
const { requireAuth, requireRole } = require('../middleware/requireAuth');
const { listAuditLog } = require('../middleware/auditLog');

const router = express.Router();
const CONFIRMATION = 'I_UNDERSTAND_AUTH_RISK';

function accessTtl() {
  return parseInt(process.env.ACCESS_TOKEN_TTL_SECONDS || '900', 10);
}

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
  if (user.disabled) return res.status(401).json({ error: 'Account disabled' });

  const token = jwt.sign({ id: user.id, username: user.username, role: user.role, workspaceId: user.workspaceId }, accessTtl());
  const refreshToken = refreshTokens.issueRefreshToken(user.id);
  res.json({ token, refreshToken, expiresIn: accessTtl(), user });
});

// POST /api/auth/refresh — public (no access token needed)
router.post('/refresh', (req, res) => {
  if (getAuthMode() !== 'multi') {
    return res.status(400).json({ error: 'Refresh tokens are only used in multi-user mode' });
  }
  const { refreshToken } = req.body || {};
  if (!refreshToken) return res.status(400).json({ error: 'refreshToken required' });

  const entry = refreshTokens.verifyRefreshToken(refreshToken);
  if (!entry) return res.status(401).json({ error: 'Invalid or expired refresh token' });

  const user = users.findById(entry.userId);
  if (!user) return res.status(401).json({ error: 'User not found' });
  if (user.disabled) return res.status(401).json({ error: 'Account disabled' });

  // Rotation: revoke old, issue new
  refreshTokens.revokeRefreshToken(refreshToken);
  const newRefreshToken = refreshTokens.issueRefreshToken(user.id);
  const newToken = jwt.sign({ id: user.id, username: user.username, role: user.role, workspaceId: user.workspaceId }, accessTtl());
  res.json({ token: newToken, refreshToken: newRefreshToken, expiresIn: accessTtl() });
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
  const user = users.findById(req.user.id || req.user.userId);
  res.json({ user: user || req.user });
});

// GET /api/auth/users — admin only
router.get('/users', requireAuth, requireRole('admin'), (req, res) => {
  res.json({ users: users.listUsers() });
});

// PUT /api/auth/users/:id — admin only (role, disabled, workspaceId)
router.put('/users/:id', requireAuth, requireRole('admin'), (req, res) => {
  const { id } = req.params;
  if (req.user && (req.user.id === id || req.user.userId === id)) {
    return res.status(400).json({ error: 'Cannot modify your own account via this endpoint' });
  }
  const { role, disabled, workspaceId } = req.body || {};
  try {
    const updated = users.updateUser(id, { role, disabled, workspaceId });
    // If disabling, revoke all refresh tokens
    if (disabled) refreshTokens.revokeAllForUser(id);
    res.json({ user: updated });
  } catch (err) {
    const status = err.code === 'NOT_FOUND' ? 404 : 400;
    res.status(status).json({ error: err.message });
  }
});

// DELETE /api/auth/users/:id — admin only
router.delete('/users/:id', requireAuth, requireRole('admin'), (req, res) => {
  const { id } = req.params;
  if (req.user && (req.user.id === id || req.user.userId === id)) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }
  try {
    refreshTokens.revokeAllForUser(id);
    users.deleteUser(id);
    res.json({ success: true });
  } catch (err) {
    const status = err.code === 'NOT_FOUND' ? 404 : 400;
    res.status(status).json({ error: err.message });
  }
});

// GET /api/auth/audit-log — admin only, filterable
router.get('/audit-log', requireAuth, requireRole('admin'), (req, res) => {
  const { limit, username, method, from, to } = req.query;
  res.json({ entries: listAuditLog({ limit, username, method, from, to }) });
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

// POST /api/auth/logout — revokes refresh token server-side
router.post('/logout', requireAuth, (req, res) => {
  const { refreshToken } = req.body || {};
  if (refreshToken) refreshTokens.revokeRefreshToken(refreshToken);
  res.json({ success: true });
});

module.exports = router;

'use strict';

const express = require('express');
const crypto = require('crypto');
const jwt = require('../auth/jwt');
const users = require('../auth/users');
const workspaces = require('../auth/workspaces');
const refreshTokens = require('../auth/refreshTokens');
const blacklist = require('../auth/tokenBlacklist');
const { setRefreshCookie, clearRefreshCookie, setCsrfCookie, clearCsrfCookie, parseCookies } = require('../auth/cookieHelper');
const { getAuthMode, setAuthMode } = require('../auth/authConfig');
const { requireAuth, requireRole } = require('../middleware/requireAuth');
const { loginRateLimit, refreshRateLimit, revokeAllRateLimit } = require('../middleware/authRateLimiter');
const { notify } = require('../notifications/wsNotifications');
const { listAuditLog } = require('../middleware/auditLog');
const { migrateJsonToSqlite } = require('../auth/sessionManager');
const { listActiveSessions, revokeSessionById, revokeAllForUser, issueRefreshToken: _issueRefreshToken } = require('../auth/refreshTokens');
const { isAvailable: authDbAvailable } = require('../auth/authDb');
const authCleanup = require('../auth/authCleanup');

const router = express.Router();
const CONFIRMATION = 'I_UNDERSTAND_AUTH_RISK';

function accessTtl() {
  return parseInt(process.env.ACCESS_TOKEN_TTL_SECONDS || '900', 10);
}
function cookieMode() {
  return process.env.REFRESH_TOKEN_COOKIE === 'true';
}
function csrfEnabled() {
  return process.env.CSRF_PROTECTION === 'true';
}

// GET /api/auth/mode — always public
router.get('/mode', (req, res) => {
  res.json({ mode: getAuthMode() });
});

// GET /api/auth/security-config — public, returns feature flags
router.get('/security-config', (req, res) => {
  res.json({
    cookieMode: cookieMode(),
    csrfProtection: csrfEnabled(),
    accessTokenTtl: accessTtl(),
    loginRateLimitMax: parseInt(process.env.LOGIN_RATE_LIMIT_MAX || '10', 10),
    refreshRateLimitMax: parseInt(process.env.REFRESH_RATE_LIMIT_MAX || '30', 10),
    loginRateLimitWindowMs: parseInt(process.env.LOGIN_RATE_LIMIT_WINDOW_MS || '900000', 10),
    blacklistEnabled: true,
  });
});

// POST /api/auth/login — public, rate-limited
router.post('/login', loginRateLimit, (req, res) => {
  if (getAuthMode() !== 'multi') {
    return res.status(400).json({ error: 'Auth mode is single-user — login not required' });
  }
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });

  const user = users.authenticate(username, password);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  if (user.disabled) return res.status(401).json({ error: 'Account disabled' });

  const token = jwt.sign({ id: user.id, username: user.username, role: user.role, workspaceId: user.workspaceId }, accessTtl());
  const ipAddress = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || null;
  const userAgent = (req.headers['user-agent'] || '').slice(0, 256) || null;
  const refreshToken = refreshTokens.issueRefreshToken(user.id, { ipAddress, userAgent });

  if (cookieMode()) setRefreshCookie(res, refreshToken);
  if (csrfEnabled()) {
    const csrfToken = crypto.randomBytes(16).toString('hex');
    setCsrfCookie(res, csrfToken);
  }
  if (cookieMode()) return res.json({ token, expiresIn: accessTtl(), user });
  res.json({ token, refreshToken, expiresIn: accessTtl(), user });
});

// POST /api/auth/refresh — public, rate-limited; reads cookie OR body
router.post('/refresh', refreshRateLimit, (req, res) => {
  if (getAuthMode() !== 'multi') {
    return res.status(400).json({ error: 'Refresh tokens are only used in multi-user mode' });
  }
  const cookies = parseCookies(req);
  const refreshToken = cookies.sap_refresh || (req.body || {}).refreshToken;
  if (!refreshToken) return res.status(400).json({ error: 'refreshToken required (body or cookie)' });

  const entry = refreshTokens.verifyRefreshToken(refreshToken);
  if (!entry) return res.status(401).json({ error: 'Invalid or expired refresh token' });

  const user = users.findById(entry.userId);
  if (!user) return res.status(401).json({ error: 'User not found' });
  if (user.disabled) return res.status(401).json({ error: 'Account disabled' });

  // Rotation: revoke old, issue new
  refreshTokens.revokeRefreshToken(refreshToken);
  const newRefreshToken = refreshTokens.issueRefreshToken(user.id);
  const newToken = jwt.sign({ id: user.id, username: user.username, role: user.role, workspaceId: user.workspaceId }, accessTtl());

  if (cookieMode()) setRefreshCookie(res, newRefreshToken);
  if (csrfEnabled()) {
    const csrfToken = crypto.randomBytes(16).toString('hex');
    setCsrfCookie(res, csrfToken);
  }
  if (cookieMode()) return res.json({ token: newToken, expiresIn: accessTtl() });
  res.json({ token: newToken, refreshToken: newRefreshToken, expiresIn: accessTtl() });
});

// POST /api/auth/register — admin only
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

// PUT /api/auth/users/:id — admin only
router.put('/users/:id', requireAuth, requireRole('admin'), (req, res) => {
  const { id } = req.params;
  if (req.user && (req.user.id === id || req.user.userId === id)) {
    return res.status(400).json({ error: 'Cannot modify your own account via this endpoint' });
  }
  const { role, disabled, workspaceId } = req.body || {};
  try {
    const updated = users.updateUser(id, { role, disabled, workspaceId });
    if (disabled) refreshTokens.revokeAllForUser(id);
    res.json({ user: updated });
  } catch (err) {
    res.status(err.code === 'NOT_FOUND' ? 404 : 400).json({ error: err.message });
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
    res.status(err.code === 'NOT_FOUND' ? 404 : 400).json({ error: err.message });
  }
});

// GET /api/auth/audit-log — admin only, filterable + paginated
router.get('/audit-log', requireAuth, requireRole('admin'), (req, res) => {
  const { limit, offset, username, method, action, from, to, statusCode, ip, userAgent } = req.query;
  const result = listAuditLog({ limit, offset, username, method, action, from, to, statusCode, ip, userAgent });
  // backward compat: also expose legacy `entries` field
  res.json({ entries: result.items, ...result });
});

// GET /api/auth/audit-log/export.csv — admin only, CSV download
router.get('/audit-log/export.csv', requireAuth, requireRole('admin'), (req, res) => {
  const { limit, offset, username, method, action, from, to, statusCode, ip, userAgent } = req.query;
  const result = listAuditLog({ limit: limit || 5000, offset, username, method, action, from, to, statusCode, ip, userAgent });

  const COLS = ['createdAt', 'username', 'userId', 'workspaceId', 'method', 'action', 'statusCode', 'ip', 'userAgent', 'resourceType', 'resourceId'];
  function csvEscape(v) {
    if (v == null) return '';
    const s = String(v).replace(/"/g, '""');
    return /[",\r\n]/.test(s) ? `"${s}"` : s;
  }
  const rows = [COLS.join(',')];
  for (const e of result.items) {
    rows.push([
      csvEscape(e.createdAt),
      csvEscape(e.username),
      csvEscape(e.userId),
      csvEscape(e.workspaceId),
      csvEscape(e.method),
      csvEscape(e.path),
      csvEscape(e.statusCode),
      csvEscape(e.ipAddress),
      csvEscape(e.userAgent),
      '',
      '',
    ].join(','));
  }
  const csv = rows.join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="audit-log.csv"');
  res.send(csv);
});

// GET /api/auth/sessions — list sessions (admin: all; user: own); paginated
router.get('/sessions', requireAuth, (req, res) => {
  if (getAuthMode() !== 'multi') return res.json({ sessions: [], items: [], total: 0, limit: 50, offset: 0, hasMore: false });
  const isAdmin = req.user?.role === 'admin';
  const { limit, offset, active, userId: queryUserId } = req.query;
  const filterUserId = isAdmin ? (queryUserId || null) : (req.user?.id || req.user?.userId);
  const result = listActiveSessions(filterUserId, { limit, offset, active });
  // backward compat: also expose legacy `sessions` field
  res.json({ sessions: result.items, ...result });
});

// DELETE /api/auth/sessions/:id — revoke a session (admin: any; user: own sessions only)
router.delete('/sessions/:id', requireAuth, (req, res) => {
  if (getAuthMode() !== 'multi') return res.status(400).json({ error: 'Not in multi-user mode' });
  const { id } = req.params;
  const isAdmin = req.user?.role === 'admin';
  if (!isAdmin) {
    const userId = req.user?.id || req.user?.userId;
    const result = listActiveSessions(userId);
    const owns = result.items.some((s) => s.id === id);
    if (!owns) return res.status(403).json({ error: 'Cannot revoke another user\'s session' });
  }
  const revoked = revokeSessionById(id);
  if (!revoked) return res.status(404).json({ error: 'Session not found or already revoked' });
  notify.sessionRevoked({ sessionId: id, revokedBy: req.user?.username || null });
  res.json({ success: true });
});

// POST /api/auth/sessions/revoke-all — revoke all (or all-other) sessions for current user
router.post('/sessions/revoke-all', requireAuth, revokeAllRateLimit, (req, res) => {
  if (getAuthMode() !== 'multi') return res.status(400).json({ error: 'Not in multi-user mode' });
  const userId = req.user?.id || req.user?.userId;
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const { exceptSessionId } = req.body || {};
  if (exceptSessionId) {
    const result = listActiveSessions(userId);
    let revokedCount = 0;
    for (const s of result.items) {
      if (s.id !== exceptSessionId) { revokeSessionById(s.id); revokedCount++; }
    }
    notify.sessionRevoked({ userId, revokedCount, exceptSessionId });
    return res.json({ success: true, revokedCount });
  }
  revokeAllForUser(userId);
  notify.sessionRevoked({ userId, revokedCount: 'all' });
  res.json({ success: true, revokedCount: 0 });
});

// GET /api/auth/cleanup/status — cleanup service status (admin only)
router.get('/cleanup/status', requireAuth, requireRole('admin'), (req, res) => {
  res.json(authCleanup.getStatus());
});

// POST /api/auth/cleanup — purge expired tokens + old audit entries (admin only)
router.post('/cleanup', requireAuth, requireRole('admin'), async (req, res) => {
  const { auditRetentionDays } = req.body || {};
  const result = await authCleanup.runCleanup({
    auditRetentionDays: auditRetentionDays ? parseInt(auditRetentionDays, 10) : undefined,
  });
  if (result.success) {
    notify.cleanupCompleted({ sessionsRemoved: result.sessionsRemoved, jtiRemoved: result.jtiRemoved, auditRemoved: result.auditRemoved });
  }
  res.json(result);
});

// POST /api/auth/migrate — migrate JSON auth data to SQLite (admin only)
router.post('/migrate', requireAuth, requireRole('admin'), (req, res) => {
  const result = migrateJsonToSqlite();
  res.json(result);
});

// GET /api/auth/db-status — auth SQLite status (admin only)
router.get('/db-status', requireAuth, requireRole('admin'), (req, res) => {
  const { isAuthSqliteEnabled, resolveAuthDbPath } = require('../auth/authDb');
  const fs = require('fs');
  const dbPath = resolveAuthDbPath();
  res.json({
    sqliteEnabled: authDbAvailable(),
    configEnabled: isAuthSqliteEnabled(),
    dbPath: dbPath.replace(/\\/g, '/').replace(/.*\/data\//, 'data/'),
    exists: fs.existsSync(dbPath),
  });
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

// POST /api/auth/logout — revokes refresh token + blacklists access token
router.post('/logout', requireAuth, (req, res) => {
  if (req.user?.jti) {
    const expiresAt = req.user.exp ? new Date(req.user.exp * 1000).toISOString() : undefined;
    const userId = req.user.id || req.user.userId || null;
    blacklist.blacklistToken(req.user.jti, expiresAt, { userId, reason: 'logout' });
  }

  // Revoke refresh token: cookie or body
  const cookies = parseCookies(req);
  const rt = cookies.sap_refresh || (req.body || {}).refreshToken;
  if (rt) refreshTokens.revokeRefreshToken(rt);

  if (cookieMode()) {
    clearRefreshCookie(res);
    if (csrfEnabled()) clearCsrfCookie(res);
  }
  res.json({ success: true });
});

module.exports = router;

'use strict';

const jwt = require('../auth/jwt');
const { getAuthMode } = require('../auth/authConfig');
const blacklist = require('../auth/tokenBlacklist');

const PUBLIC_PATHS = ['/auth/login', '/auth/mode', '/auth/refresh', '/health', '/health/detailed'];

function requireAuth(req, res, next) {
  if (getAuthMode() !== 'multi') return next();
  if (PUBLIC_PATHS.some((p) => req.path === p || req.path.startsWith(`${p}/`))) return next();

  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';

  if (!token) {
    return res.status(401).json({ error: 'Authentication required', hint: 'POST /api/auth/login to get a token' });
  }

  try {
    const payload = jwt.verify(token);
    if (blacklist.isBlacklisted(payload.jti)) {
      return res.status(401).json({ error: 'Token revoked' });
    }
    const users = require('../auth/users');
    const liveUser = users.findById(payload.id || payload.userId);
    if (liveUser && liveUser.disabled) {
      return res.status(401).json({ error: 'Account disabled' });
    }
    req.user = payload;
    req.workspaceId = payload.workspaceId || null;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (getAuthMode() !== 'multi') return next();
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (req.user.role !== 'admin' && req.user.role !== role) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };

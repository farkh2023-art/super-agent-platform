'use strict';

const PUBLIC = ['/health', '/health/detailed'];

function authMiddleware(req, res, next) {
  const { getAuthMode } = require('../auth/authConfig');

  // In multi-user mode, delegate entirely to JWT auth
  if (getAuthMode() === 'multi') {
    return require('./requireAuth').requireAuth(req, res, next);
  }

  // Single-user mode: optional API_KEY check (existing behavior)
  const apiKey = process.env.API_KEY;
  if (!apiKey) return next();
  if (PUBLIC.includes(req.path)) return next();

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : (req.headers['x-api-key'] || '');

  if (token !== apiKey) {
    return res.status(401).json({
      error: 'Non autorisé – clé API requise',
      hint: 'Header: Authorization: Bearer <API_KEY>',
    });
  }
  next();
}

module.exports = authMiddleware;

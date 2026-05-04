'use strict';

// Public paths (no auth required even when API_KEY is set)
const PUBLIC = ['/health', '/health/detailed'];

function authMiddleware(req, res, next) {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return next();                          // auth disabled
  if (PUBLIC.includes(req.path)) return next();        // always public

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : (req.headers['x-api-key'] || '');

  if (token !== apiKey) {
    return res.status(401).json({
      error: 'Non autorisé – clé API requise',
      hint:  'Header: Authorization: Bearer <API_KEY>',
    });
  }
  next();
}

module.exports = authMiddleware;

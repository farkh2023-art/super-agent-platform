'use strict';

const crypto = require('crypto');

function secret() {
  return process.env.JWT_SECRET || 'super-agent-dev-secret-CHANGE-IN-PRODUCTION';
}

function base64url(buf) {
  return buf.toString('base64').replace(/={1,2}$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function sign(payload, expiresInSeconds = 86400) {
  const header = base64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const now = Math.floor(Date.now() / 1000);
  const body = base64url(Buffer.from(JSON.stringify({ ...payload, iat: now, exp: now + expiresInSeconds })));
  const sig = base64url(crypto.createHmac('sha256', secret()).update(`${header}.${body}`).digest());
  return `${header}.${body}.${sig}`;
}

function verify(token) {
  if (!token || typeof token !== 'string') throw Object.assign(new Error('Invalid token'), { code: 'JWT_INVALID' });
  const parts = token.split('.');
  if (parts.length !== 3) throw Object.assign(new Error('Invalid token format'), { code: 'JWT_INVALID' });
  const [header, body, sig] = parts;
  const expected = base64url(crypto.createHmac('sha256', secret()).update(`${header}.${body}`).digest());
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    throw Object.assign(new Error('Invalid token signature'), { code: 'JWT_INVALID' });
  }
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw Object.assign(new Error('Token expired'), { code: 'JWT_EXPIRED' });
  }
  return payload;
}

module.exports = { sign, verify };

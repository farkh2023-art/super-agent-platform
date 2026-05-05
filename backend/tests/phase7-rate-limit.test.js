'use strict';

describe('Phase 7 — Rate Limiter', () => {
  beforeEach(() => {
    jest.resetModules();
    delete process.env.AUTH_MODE;
    delete process.env.REVOKE_ALL_RATE_LIMIT_MAX;
    delete process.env.REVOKE_ALL_RATE_LIMIT_WINDOW_MS;
  });

  test('revokeAllRateLimit is exported from authRateLimiter', () => {
    const { revokeAllRateLimit } = require('../src/middleware/authRateLimiter');
    expect(typeof revokeAllRateLimit).toBe('function');
  });

  test('revokeAllRateLimit skips check in single mode', () => {
    process.env.AUTH_MODE = 'single';
    const { revokeAllRateLimit } = require('../src/middleware/authRateLimiter');
    let nextCalled = false;
    const req = { user: { id: 'u1' }, headers: {}, ip: '127.0.0.1' };
    const res = {};
    revokeAllRateLimit(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });

  test('revokeAllRateLimit allows requests under limit in multi mode', () => {
    process.env.AUTH_MODE = 'multi';
    process.env.REVOKE_ALL_RATE_LIMIT_MAX = '5';
    process.env.REVOKE_ALL_RATE_LIMIT_WINDOW_MS = '60000';
    const { revokeAllRateLimit, resetBuckets } = require('../src/middleware/authRateLimiter');
    resetBuckets();

    let nextCalled = false;
    const req = { user: { id: 'u-test' }, headers: {}, ip: '127.0.0.1' };
    const res = { status: () => res, json: () => res };
    revokeAllRateLimit(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });

  test('revokeAllRateLimit blocks after max requests in multi mode', () => {
    process.env.AUTH_MODE = 'multi';
    process.env.REVOKE_ALL_RATE_LIMIT_MAX = '2';
    process.env.REVOKE_ALL_RATE_LIMIT_WINDOW_MS = '60000';
    const { revokeAllRateLimit, resetBuckets } = require('../src/middleware/authRateLimiter');
    resetBuckets();

    let blocked = false;
    const req = { user: { id: 'u-rl' }, headers: {}, ip: '127.0.0.1' };
    const res = {
      status: (code) => { if (code === 429) blocked = true; return res; },
      json: () => res,
    };

    for (let i = 0; i < 3; i++) {
      revokeAllRateLimit(req, res, () => {});
    }
    expect(blocked).toBe(true);
  });

  test('resetBuckets clears all buckets', () => {
    process.env.AUTH_MODE = 'multi';
    process.env.REVOKE_ALL_RATE_LIMIT_MAX = '1';
    process.env.REVOKE_ALL_RATE_LIMIT_WINDOW_MS = '60000';
    const { revokeAllRateLimit, resetBuckets } = require('../src/middleware/authRateLimiter');
    resetBuckets();

    const req = { user: { id: 'u-reset' }, headers: {}, ip: '127.0.0.1' };
    const res = { status: () => res, json: () => res };
    revokeAllRateLimit(req, res, () => {});
    revokeAllRateLimit(req, res, () => {});

    // After reset, should allow again
    resetBuckets();
    let nextCalled = false;
    revokeAllRateLimit(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });
});

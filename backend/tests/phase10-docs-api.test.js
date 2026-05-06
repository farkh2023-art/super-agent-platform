'use strict';

const request = require('supertest');
const { app } = require('../src/server');
const { getDocsManifest } = require('../src/docs/docsManifest');

describe('Phase 10 Lot 2 - docs API', () => {
  test('GET /api/docs returns docs manifest', async () => {
    const res = await request(app).get('/api/docs');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.docs)).toBe(true);
    expect(res.body.count).toBe(res.body.docs.length);
    expect(res.body.count).toBeGreaterThanOrEqual(7);
  });

  test('manifest entries expose required public metadata only', async () => {
    const res = await request(app).get('/api/docs');

    for (const doc of res.body.docs) {
      expect(doc.id).toMatch(/^[a-z0-9-]+$/);
      expect(typeof doc.title).toBe('string');
      expect(typeof doc.category).toBe('string');
      expect(doc.format).toBe('markdown');
      expect(doc.public).toBe(true);
      expect(doc.source).toMatch(/^docs\//);
      expect(typeof doc.description).toBe('string');
      expect(doc.source).not.toMatch(/C:\\Users/i);
      expect(doc.source).not.toMatch(/\.env/i);
    }
  });

  test('GET /api/docs/user-guide returns markdown content', async () => {
    const res = await request(app).get('/api/docs/user-guide');

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('user-guide');
    expect(res.body.title).toBe('User Guide');
    expect(res.body.format).toBe('markdown');
    expect(res.body.source).toBe('docs/USER_GUIDE.md');
    expect(res.body.content).toMatch(/^# /);
  });

  test('GET /api/docs/unknown-doc returns 404', async () => {
    const res = await request(app).get('/api/docs/unknown-doc');

    expect(res.status).toBe(404);
  });

  test('path traversal attempts return 404 or 400', async () => {
    const res = await request(app).get('/api/docs/%2e%2e%2fVERSION');

    expect([400, 404]).toContain(res.status);
  });

  test('manifest does not reference secret or runtime files', () => {
    const forbidden = [
      /\.env/i,
      /backend[\\/]data/i,
      /tokens?/i,
      /secret/i,
      /github_pat/i,
      /C:\\Users/i
    ];

    for (const doc of getDocsManifest()) {
      for (const pattern of forbidden) {
        expect(doc.source).not.toMatch(pattern);
      }
    }
  });
});

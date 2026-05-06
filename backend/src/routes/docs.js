'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { getDocsManifest, findDocById } = require('../docs/docsManifest');

const router = express.Router();
const ROOT = path.resolve(__dirname, '..', '..', '..');
const DOCS_ROOT = path.join(ROOT, 'docs');

function isSafeManifestSource(source) {
  if (!source || path.isAbsolute(source)) return false;
  const normalized = source.replace(/\\/g, '/');
  if (!normalized.startsWith('docs/')) return false;
  if (normalized.includes('..')) return false;
  if (normalized.includes('.env')) return false;
  return true;
}

function resolveDocSource(source) {
  if (!isSafeManifestSource(source)) return null;
  const relativeToDocs = source.replace(/\\/g, '/').replace(/^docs\//, '');
  const resolved = path.resolve(DOCS_ROOT, relativeToDocs);
  if (!resolved.startsWith(DOCS_ROOT + path.sep) && resolved !== DOCS_ROOT) return null;
  return resolved;
}

router.get('/', (_req, res) => {
  const docs = getDocsManifest();
  res.json({
    docs,
    count: docs.length
  });
});

router.get('/:id', (req, res) => {
  const id = String(req.params.id || '');
  if (!/^[a-z0-9-]+$/.test(id)) {
    return res.status(404).json({ error: 'Document not found' });
  }

  const doc = findDocById(id);
  if (!doc) {
    return res.status(404).json({ error: 'Document not found' });
  }

  const filePath = resolveDocSource(doc.source);
  if (!filePath) {
    return res.status(500).json({ error: 'Document source is not readable' });
  }

  try {
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const content = fs.readFileSync(filePath, 'utf8');
    res.json({
      id: doc.id,
      title: doc.title,
      format: doc.format,
      content,
      source: doc.source
    });
  } catch {
    res.status(500).json({ error: 'Document could not be loaded' });
  }
});

module.exports = router;

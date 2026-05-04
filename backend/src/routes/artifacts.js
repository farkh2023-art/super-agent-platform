'use strict';

const express = require('express');
const storage = require('../storage');

const router = express.Router();

// GET /api/artifacts
router.get('/', (req, res) => {
  const { executionId, agentId } = req.query;
  let artifacts = storage.findAll('artifacts');

  if (executionId) artifacts = artifacts.filter((a) => a.executionId === executionId);
  if (agentId) artifacts = artifacts.filter((a) => a.agentId === agentId);

  artifacts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ artifacts, total: artifacts.length });
});

// GET /api/artifacts/:id
router.get('/:id', (req, res) => {
  const artifact = storage.findById('artifacts', req.params.id);
  if (!artifact) return res.status(404).json({ error: 'Artefact introuvable' });
  res.json(artifact);
});

// GET /api/artifacts/:id/download – return raw content
router.get('/:id/download', (req, res) => {
  const artifact = storage.findById('artifacts', req.params.id);
  if (!artifact) return res.status(404).json({ error: 'Artefact introuvable' });

  const filename = `${artifact.agentId}_${artifact.id.substring(0, 8)}.md`;
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(artifact.content);
});

// DELETE /api/artifacts/:id
router.delete('/:id', (req, res) => {
  const ok = storage.remove('artifacts', req.params.id);
  if (!ok) return res.status(404).json({ error: 'Artefact introuvable' });
  res.json({ message: 'Artefact supprimé' });
});

module.exports = router;

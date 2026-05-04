'use strict';

const express = require('express');
const storage = require('../storage');

const router = express.Router();

// GET /api/workflow-runs
router.get('/', (req, res) => {
  const runs = storage
    .findAll('workflow_runs')
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  res.json({ runs, total: runs.length });
});

// GET /api/workflow-runs/:id
router.get('/:id', (req, res) => {
  const run = storage.findById('workflow_runs', req.params.id);
  if (!run) return res.status(404).json({ error: 'Run introuvable' });
  res.json(run);
});

module.exports = router;

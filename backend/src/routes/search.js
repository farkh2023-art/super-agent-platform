'use strict';

const express = require('express');
const storage = require('../storage');

const router = express.Router();

function matchesQuery(value, q) {
  return String(value || '').toLowerCase().includes(q);
}

// GET /api/search?q=term[&type=all|tasks|executions|artifacts|workflows]
router.get('/', (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase();
  if (!q) return res.status(400).json({ error: 'Paramètre "q" requis' });

  const type = req.query.type || 'all';
  const results = {};
  let total = 0;

  if (type === 'all' || type === 'tasks') {
    results.tasks = storage.findAll('tasks').filter((t) =>
      matchesQuery(t.task, q)
    ).map((t) => ({ id: t.id, task: t.task, createdAt: t.createdAt, type: 'task' }));
    total += results.tasks.length;
  }

  if (type === 'all' || type === 'executions') {
    results.executions = storage.findAll('executions').filter((e) =>
      matchesQuery(e.task, q)
    ).map((e) => ({ id: e.id, task: e.task, status: e.status, createdAt: e.createdAt, type: 'execution' }));
    total += results.executions.length;
  }

  if (type === 'all' || type === 'artifacts') {
    results.artifacts = storage.findAll('artifacts').filter((a) =>
      matchesQuery(a.agentName, q) || matchesQuery(a.content.substring(0, 500), q)
    ).map((a) => ({ id: a.id, agentName: a.agentName, agentId: a.agentId, executionId: a.executionId, createdAt: a.createdAt, type: 'artifact' }));
    total += results.artifacts.length;
  }

  if (type === 'all' || type === 'workflows') {
    results.workflows = storage.findAll('workflows').filter((w) =>
      matchesQuery(w.name, q) ||
      matchesQuery(w.description, q) ||
      (w.steps || []).some((s) => matchesQuery(s.task, q) || matchesQuery(s.name, q))
    ).map((w) => ({ id: w.id, name: w.name, description: w.description, stepsCount: (w.steps || []).length, createdAt: w.createdAt, type: 'workflow' }));
    total += results.workflows.length;
  }

  res.json({ query: req.query.q, results, total });
});

module.exports = router;

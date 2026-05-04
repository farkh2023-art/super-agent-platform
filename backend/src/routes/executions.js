'use strict';

const express = require('express');
const { createExecution, runExecution } = require('../engine/executor');
const { generatePlan } = require('../engine/planner');
const storage = require('../storage');
const limiter = require('../engine/concurrency');

const router = express.Router();

// POST /api/executions – create and launch execution from a plan
router.post('/', async (req, res) => {
  const { task, agentIds, planText, useMemory } = req.body;
  if (!task) return res.status(400).json({ error: 'Le champ "task" est requis' });

  try {
    let plan;
    if (planText && agentIds) {
      plan = { task, planText, agents: agentIds.map((id) => ({ id, name: id, emoji: '🤖' })) };
    } else {
      plan = await generatePlan(task, agentIds || []);
    }
    const execution = createExecution(plan, { useMemory });
    limiter.run(() => runExecution(execution.id)).catch(console.error);
    res.status(201).json(execution);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/executions/:id/run – launch an existing pending execution
router.post('/:id/run', async (req, res) => {
  const execution = storage.findById('executions', req.params.id);
  if (!execution) return res.status(404).json({ error: 'Exécution introuvable' });
  if (execution.status !== 'pending') {
    return res.status(400).json({ error: `Exécution déjà en statut: ${execution.status}` });
  }
  runExecution(execution.id).catch(console.error);
  res.json({ message: 'Exécution lancée', executionId: execution.id });
});

// POST /api/executions/:id/cancel
router.post('/:id/cancel', (req, res) => {
  const execution = storage.findById('executions', req.params.id);
  if (!execution) return res.status(404).json({ error: 'Exécution introuvable' });
  if (!['running', 'pending'].includes(execution.status)) {
    return res.status(400).json({ error: 'L\'exécution n\'est pas en cours' });
  }
  storage.update('executions', req.params.id, { status: 'cancelled' });
  res.json({ message: 'Annulation demandée' });
});

// GET /api/executions
router.get('/', (req, res) => {
  const all = storage
    .findAll('executions')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const total = all.length;
  const limitRaw = parseInt(req.query.limit || '0', 10);
  if (limitRaw > 0) {
    const limit  = Math.min(limitRaw, 200);
    const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);
    return res.json({
      executions: all.slice(offset, offset + limit),
      total, limit, offset,
      hasMore: offset + limit < total,
    });
  }
  res.json({ executions: all, total });
});

// GET /api/executions/:id
router.get('/:id', (req, res) => {
  const execution = storage.findById('executions', req.params.id);
  if (!execution) return res.status(404).json({ error: 'Exécution introuvable' });
  res.json(execution);
});

// GET /api/executions/:id/logs
router.get('/:id/logs', (req, res) => {
  const execution = storage.findById('executions', req.params.id);
  if (!execution) return res.status(404).json({ error: 'Exécution introuvable' });
  res.json({ logs: execution.logs || [], total: (execution.logs || []).length });
});

// DELETE /api/executions/:id
router.delete('/:id', (req, res) => {
  const ok = storage.remove('executions', req.params.id);
  if (!ok) return res.status(404).json({ error: 'Exécution introuvable' });
  res.json({ message: 'Exécution supprimée' });
});

module.exports = router;

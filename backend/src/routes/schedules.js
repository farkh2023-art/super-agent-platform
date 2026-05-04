'use strict';

const express = require('express');
const { v4: uuid } = require('uuid');
const storage = require('../storage');
const { createExecution, runExecution } = require('../engine/executor');
const { generatePlan } = require('../engine/planner');
const limiter = require('../engine/concurrency');

const router = express.Router();

// GET /api/schedules
router.get('/', (req, res) => {
  const schedules = storage.findAll('schedules')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ schedules, total: schedules.length });
});

// POST /api/schedules
router.post('/', (req, res) => {
  const { name, task, agentIds, intervalMs, enabled } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Le champ "name" est requis' });
  }
  if (!task || typeof task !== 'string' || !task.trim()) {
    return res.status(400).json({ error: 'Le champ "task" est requis' });
  }
  if (!intervalMs || typeof intervalMs !== 'number' || intervalMs <= 0) {
    return res.status(400).json({ error: 'Le champ "intervalMs" doit être un entier positif' });
  }

  const schedule = {
    id: uuid(),
    name: name.trim(),
    task: task.trim(),
    agentIds: Array.isArray(agentIds) ? agentIds : [],
    intervalMs,
    enabled: enabled !== false,
    lastRunAt: null,
    nextRunAt: new Date(Date.now() + intervalMs).toISOString(),
    runCount: 0,
    lastExecutionId: null,
    createdAt: new Date().toISOString(),
  };

  storage.create('schedules', schedule);
  res.status(201).json(schedule);
});

// GET /api/schedules/:id
router.get('/:id', (req, res) => {
  const schedule = storage.findById('schedules', req.params.id);
  if (!schedule) return res.status(404).json({ error: 'Schedule introuvable' });
  res.json(schedule);
});

// PUT /api/schedules/:id
router.put('/:id', (req, res) => {
  const schedule = storage.findById('schedules', req.params.id);
  if (!schedule) return res.status(404).json({ error: 'Schedule introuvable' });

  const { name, task, agentIds, intervalMs, enabled } = req.body;
  const patch = {};

  if (name !== undefined) patch.name = name;
  if (task !== undefined) patch.task = task;
  if (agentIds !== undefined) patch.agentIds = agentIds;
  if (intervalMs !== undefined) {
    if (typeof intervalMs !== 'number' || intervalMs <= 0) {
      return res.status(400).json({ error: 'intervalMs doit être un entier positif' });
    }
    patch.intervalMs = intervalMs;
    patch.nextRunAt = new Date(Date.now() + intervalMs).toISOString();
  }
  if (enabled !== undefined) patch.enabled = enabled;

  const updated = storage.update('schedules', req.params.id, patch);
  res.json(updated);
});

// DELETE /api/schedules/:id
router.delete('/:id', (req, res) => {
  const ok = storage.remove('schedules', req.params.id);
  if (!ok) return res.status(404).json({ error: 'Schedule introuvable' });
  res.json({ message: 'Schedule supprimé' });
});

// POST /api/schedules/:id/trigger – manual immediate run
router.post('/:id/trigger', async (req, res) => {
  const schedule = storage.findById('schedules', req.params.id);
  if (!schedule) return res.status(404).json({ error: 'Schedule introuvable' });

  try {
    const plan = await generatePlan(schedule.task, schedule.agentIds || []);
    const execution = createExecution(plan);

    storage.update('schedules', schedule.id, {
      lastRunAt: new Date().toISOString(),
      nextRunAt: new Date(Date.now() + schedule.intervalMs).toISOString(),
      runCount: (schedule.runCount || 0) + 1,
      lastExecutionId: execution.id,
    });

    limiter.run(() => runExecution(execution.id)).catch(console.error);
    res.json({ message: 'Exécution lancée', executionId: execution.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

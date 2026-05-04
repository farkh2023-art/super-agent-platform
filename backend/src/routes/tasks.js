'use strict';

const express = require('express');
const { v4: uuid } = require('uuid');
const { generatePlan } = require('../engine/planner');
const { createExecution, runExecution } = require('../engine/executor');
const storage = require('../storage');

const router = express.Router();

// POST /api/tasks – create plan + optionally launch
router.post('/', async (req, res) => {
  const { task, agentIds, autoRun = false } = req.body;
  if (!task || typeof task !== 'string' || !task.trim()) {
    return res.status(400).json({ error: 'Le champ "task" est requis' });
  }

  try {
    const plan = await generatePlan(task.trim(), agentIds || []);
    const taskRecord = {
      id: uuid(),
      task: task.trim(),
      plan,
      createdAt: new Date().toISOString(),
    };
    storage.create('tasks', taskRecord);

    if (autoRun) {
      const execution = createExecution(plan);
      taskRecord.executionId = execution.id;
      storage.update('tasks', taskRecord.id, { executionId: execution.id });
      // Run async (don't await)
      runExecution(execution.id).catch(console.error);
      return res.status(201).json({ task: taskRecord, execution });
    }

    res.status(201).json({ task: taskRecord });
  } catch (err) {
    console.error('Error creating task:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tasks – list all tasks
router.get('/', (req, res) => {
  const tasks = storage.findAll('tasks').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ tasks, total: tasks.length });
});

// GET /api/tasks/:id
router.get('/:id', (req, res) => {
  const task = storage.findById('tasks', req.params.id);
  if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
  res.json(task);
});

// DELETE /api/tasks/:id
router.delete('/:id', (req, res) => {
  const ok = storage.remove('tasks', req.params.id);
  if (!ok) return res.status(404).json({ error: 'Tâche introuvable' });
  res.json({ message: 'Tâche supprimée' });
});

module.exports = router;

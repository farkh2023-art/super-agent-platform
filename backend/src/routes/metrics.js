'use strict';

const express = require('express');
const storage = require('../storage');

const router = express.Router();

function computeMetrics() {
  const executions = storage.findAll('executions');

  const global = {
    total: executions.length,
    completed: 0,
    completedWithErrors: 0,
    failed: 0,
    cancelled: 0,
    running: 0,
    pending: 0,
    successRate: null,
    avgDurationMs: null,
  };

  const byAgent = {};
  const durations = [];

  for (const exec of executions) {
    if (exec.status === 'completed') global.completed++;
    else if (exec.status === 'completed_with_errors') global.completedWithErrors++;
    else if (exec.status === 'failed') global.failed++;
    else if (exec.status === 'cancelled') global.cancelled++;
    else if (exec.status === 'running') global.running++;
    else if (exec.status === 'pending') global.pending++;

    if (exec.startedAt && exec.completedAt) {
      const ms = new Date(exec.completedAt) - new Date(exec.startedAt);
      if (ms >= 0) durations.push(ms);
    }

    for (const step of exec.steps || []) {
      const id = step.agentId;
      if (!id) continue;
      if (!byAgent[id]) {
        byAgent[id] = { agentId: id, total: 0, done: 0, error: 0, successRate: null };
      }
      byAgent[id].total++;
      if (step.status === 'done') byAgent[id].done++;
      else if (step.status === 'error') byAgent[id].error++;
    }
  }

  const finished = global.completed + global.completedWithErrors + global.failed + global.cancelled;
  if (finished > 0) {
    global.successRate = Math.round((global.completed / finished) * 100);
  }

  if (durations.length > 0) {
    global.avgDurationMs = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
  }

  for (const a of Object.values(byAgent)) {
    const fin = a.done + a.error;
    a.successRate = fin > 0 ? Math.round((a.done / fin) * 100) : null;
  }

  return { global, byAgent };
}

// GET /api/metrics
router.get('/', (req, res) => {
  res.json(computeMetrics());
});

// GET /api/metrics/agents
router.get('/agents', (req, res) => {
  const { byAgent } = computeMetrics();
  const agents = Object.values(byAgent).sort((a, b) => b.total - a.total);
  res.json({ agents, total: agents.length });
});

module.exports = router;
module.exports.computeMetrics = computeMetrics;

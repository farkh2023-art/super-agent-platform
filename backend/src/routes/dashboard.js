'use strict';

const express = require('express');
const storage = require('../storage');
const { getAllAgents } = require('../agents/registry');

const router = express.Router();

// GET /api/dashboard/stats
router.get('/stats', (req, res) => {
  const executions = storage.findAll('executions');
  const artifacts  = storage.findAll('artifacts');
  const workflows  = storage.findAll('workflows');
  const agents     = getAllAgents();

  const byStatus = executions.reduce((acc, e) => {
    acc[e.status] = (acc[e.status] || 0) + 1;
    return acc;
  }, {});

  res.json({
    agents:     { total: agents.length },
    executions: {
      total:    executions.length,
      byStatus,
      running:  byStatus.running || 0,
      completed: (byStatus.completed || 0) + (byStatus.completed_with_errors || 0),
      errors:   byStatus.completed_with_errors || 0,
      pending:  byStatus.pending || 0,
    },
    artifacts:  { total: artifacts.length },
    workflows:  { total: workflows.length },
    uptime:     Math.round(process.uptime()),
    provider:   process.env.AI_PROVIDER || 'mock',
    timestamp:  new Date().toISOString(),
  });
});

module.exports = router;

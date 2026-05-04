'use strict';

const fs      = require('fs');
const path    = require('path');
const express = require('express');
const storage = require('../storage');
const { getAllAgents } = require('../agents/registry');
const limiter = require('../engine/concurrency');

const router = express.Router();

// GET /api/dashboard/stats
router.get('/stats', (req, res) => {
  const executions  = storage.findAll('executions');
  const artifacts   = storage.findAll('artifacts');
  const workflows   = storage.findAll('workflows');
  const workflowRuns = storage.findAll('workflow_runs');
  const agents      = getAllAgents();

  const byStatus = executions.reduce((acc, e) => {
    acc[e.status] = (acc[e.status] || 0) + 1;
    return acc;
  }, {});

  const done  = (byStatus.completed || 0) + (byStatus.completed_with_errors || 0);
  const total = executions.length;
  const successRate = total > 0
    ? Math.round(((byStatus.completed || 0) / total) * 100)
    : null;

  const sorted = [...executions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const lastExecution = sorted[0]
    ? { task: sorted[0].task.substring(0, 60), status: sorted[0].status, createdAt: sorted[0].createdAt }
    : null;

  // Count today's JSONL log lines
  const logsDir  = path.join(storage.DATA_DIR, 'logs');
  const today    = new Date().toISOString().slice(0, 10);
  const logFile  = path.join(logsDir, `${today}.jsonl`);
  let logsToday  = 0;
  try {
    if (fs.existsSync(logFile)) {
      logsToday = fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean).length;
    }
  } catch { /* ignore */ }

  res.json({
    agents:      { total: agents.length },
    executions:  {
      total, byStatus,
      running:     byStatus.running  || 0,
      completed:   done,
      errors:      byStatus.completed_with_errors || 0,
      pending:     byStatus.pending  || 0,
      successRate,
    },
    artifacts:   { total: artifacts.length },
    workflows:   { total: workflows.length },
    workflowRuns:{ total: workflowRuns.length },
    concurrency: limiter.stats(),
    logsToday,
    lastExecution,
    uptime:      Math.round(process.uptime()),
    provider:    process.env.AI_PROVIDER || 'mock',
    timestamp:   new Date().toISOString(),
  });
});

module.exports = router;

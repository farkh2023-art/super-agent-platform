'use strict';

const { v4: uuid } = require('uuid');
const storage = require('../storage');
const { createExecution, runExecution } = require('./executor');
const { generatePlan } = require('./planner');

async function runWorkflow(workflowId) {
  const workflow = storage.findById('workflows', workflowId);
  if (!workflow) throw new Error(`Workflow ${workflowId} introuvable`);

  const runId = uuid();
  const run = {
    id: runId,
    workflowId,
    workflowName: workflow.name,
    status: 'running',
    startedAt: new Date().toISOString(),
    stepExecutions: [],
  };
  storage.create('workflow_runs', run);
  storage.update('workflows', workflowId, { lastRunId: runId, lastRunAt: new Date().toISOString() });

  let previousOutput = '';

  for (const wfStep of workflow.steps) {
    const task = previousOutput
      ? `${wfStep.task}\n\nContexte du step précédent:\n${previousOutput.substring(0, 500)}`
      : wfStep.task;

    const plan = await generatePlan(task, wfStep.agentIds || []);
    const execution = createExecution(plan);

    storage.update('workflow_runs', runId, {
      stepExecutions: [
        ...(storage.findById('workflow_runs', runId)?.stepExecutions || []),
        { stepName: wfStep.name, executionId: execution.id },
      ],
    });

    await runExecution(execution.id);

    const artifacts = storage.findAll('artifacts').filter((a) => a.executionId === execution.id);
    previousOutput = artifacts.map((a) => a.content).join('\n\n');
  }

  storage.update('workflow_runs', runId, {
    status: 'completed',
    completedAt: new Date().toISOString(),
  });

  return storage.findById('workflow_runs', runId);
}

module.exports = { runWorkflow };

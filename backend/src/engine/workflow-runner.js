'use strict';

const { v4: uuid } = require('uuid');
const storage = require('../storage');
const { createExecution, runExecution } = require('./executor');
const { generatePlan } = require('./planner');

// Group consecutive parallel steps into batches
function groupSteps(steps) {
  const groups = [];
  let batch = null;
  for (const step of steps) {
    if (step.parallel) {
      if (!batch) { batch = []; groups.push({ parallel: true, steps: batch }); }
      batch.push(step);
    } else {
      batch = null;
      groups.push({ parallel: false, steps: [step] });
    }
  }
  return groups;
}

async function runWorkflowStep(wfStep, runId, contextOutput) {
  const task = contextOutput
    ? `${wfStep.task}\n\nContexte du step précédent:\n${contextOutput.substring(0, 500)}`
    : wfStep.task;

  const plan = await generatePlan(task, wfStep.agentIds || []);
  const execution = createExecution(plan);

  const run = storage.findById('workflow_runs', runId);
  storage.update('workflow_runs', runId, {
    stepExecutions: [
      ...(run?.stepExecutions || []),
      { stepName: wfStep.name, executionId: execution.id },
    ],
  });

  await runExecution(execution.id);

  const artifacts = storage.findAll('artifacts').filter((a) => a.executionId === execution.id);
  return artifacts.map((a) => a.content).join('\n\n');
}

async function runWorkflow(workflowId) {
  const workflow = storage.findById('workflows', workflowId);
  if (!workflow) throw new Error(`Workflow ${workflowId} introuvable`);

  const runId = uuid();
  storage.create('workflow_runs', {
    id: runId,
    workflowId,
    workflowName: workflow.name,
    status: 'running',
    startedAt: new Date().toISOString(),
    stepExecutions: [],
  });
  storage.update('workflows', workflowId, { lastRunId: runId, lastRunAt: new Date().toISOString() });

  let previousOutput = '';
  const groups = groupSteps(workflow.steps);

  for (const group of groups) {
    if (group.parallel) {
      // All steps in this group run concurrently; they all receive the same previous output
      const outputs = await Promise.all(
        group.steps.map((wfStep) => runWorkflowStep(wfStep, runId, previousOutput))
      );
      previousOutput = outputs.join('\n\n');
    } else {
      previousOutput = await runWorkflowStep(group.steps[0], runId, previousOutput);
    }
  }

  storage.update('workflow_runs', runId, {
    status: 'completed',
    completedAt: new Date().toISOString(),
  });

  return storage.findById('workflow_runs', runId);
}

module.exports = { runWorkflow };

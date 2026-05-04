'use strict';

const { v4: uuid } = require('uuid');
const { getAgentById } = require('../agents/registry');
const { callAI } = require('../providers/factory');
const storage = require('../storage');

// broadcast function set by server.js
let broadcastFn = null;
function setBroadcast(fn) {
  broadcastFn = fn;
}

function emit(executionId, type, data) {
  const event = { executionId, type, data, timestamp: new Date().toISOString() };
  if (broadcastFn) broadcastFn(event);
  return event;
}

function appendLog(executionId, level, message, extra = {}) {
  const log = {
    id: uuid(),
    level,
    message,
    timestamp: new Date().toISOString(),
    ...extra,
  };
  const execution = storage.findById('executions', executionId);
  if (execution) {
    const logs = execution.logs || [];
    logs.push(log);
    storage.update('executions', executionId, { logs });
  }
  emit(executionId, 'log', log);
  return log;
}

async function executeStep(executionId, step, task) {
  const agent = getAgentById(step.agentId);
  if (!agent) {
    appendLog(executionId, 'error', `Agent inconnu : ${step.agentId}`);
    return { status: 'error', error: `Agent inconnu: ${step.agentId}` };
  }

  appendLog(executionId, 'info', `▶ Démarrage de ${agent.name}`, { agentId: agent.id });

  // Update step status
  const execution = storage.findById('executions', executionId);
  if (execution) {
    const steps = execution.steps.map((s) =>
      s.id === step.id ? { ...s, status: 'running', startedAt: new Date().toISOString() } : s
    );
    storage.update('executions', executionId, { steps });
  }
  emit(executionId, 'step_start', { stepId: step.id, agentId: agent.id, agentName: agent.name });

  try {
    const userMessage = `Tâche globale: ${task}\n\nTa mission spécifique: ${step.instructions || task}`;
    const result = await callAI(agent.id, agent.systemPrompt, userMessage);

    appendLog(executionId, 'success', `✅ ${agent.name} terminé`, { agentId: agent.id });

    // Save artifact
    const artifact = {
      id: uuid(),
      executionId,
      agentId: agent.id,
      agentName: agent.name,
      stepId: step.id,
      content: result,
      format: 'markdown',
      createdAt: new Date().toISOString(),
    };
    storage.create('artifacts', artifact);
    emit(executionId, 'artifact', artifact);

    // Update step as done
    const exec2 = storage.findById('executions', executionId);
    if (exec2) {
      const steps2 = exec2.steps.map((s) =>
        s.id === step.id
          ? { ...s, status: 'done', completedAt: new Date().toISOString(), artifactId: artifact.id }
          : s
      );
      storage.update('executions', executionId, { steps: steps2 });
    }
    emit(executionId, 'step_done', { stepId: step.id, agentId: agent.id, artifactId: artifact.id });

    return { status: 'done', artifact };
  } catch (err) {
    const msg = err.message || String(err);
    appendLog(executionId, 'error', `❌ Erreur ${agent.name}: ${msg}`, { agentId: agent.id });

    const exec3 = storage.findById('executions', executionId);
    if (exec3) {
      const steps3 = exec3.steps.map((s) =>
        s.id === step.id ? { ...s, status: 'error', error: msg } : s
      );
      storage.update('executions', executionId, { steps: steps3 });
    }
    emit(executionId, 'step_error', { stepId: step.id, agentId: agent.id, error: msg });

    return { status: 'error', error: msg };
  }
}

async function runExecution(executionId) {
  const execution = storage.findById('executions', executionId);
  if (!execution) throw new Error(`Execution ${executionId} introuvable`);

  storage.update('executions', executionId, { status: 'running', startedAt: new Date().toISOString() });
  emit(executionId, 'execution_start', { executionId });
  appendLog(executionId, 'info', `🚀 Démarrage de l'exécution (${execution.steps.length} agents)`);

  let hasError = false;
  for (const step of execution.steps) {
    if (step.status === 'done') continue;

    // Check if cancelled
    const current = storage.findById('executions', executionId);
    if (current?.status === 'cancelled') {
      appendLog(executionId, 'warning', '⛔ Exécution annulée par l\'utilisateur');
      break;
    }

    const stepResult = await executeStep(executionId, step, execution.task);
    if (stepResult.status === 'error') hasError = true;

    // Small delay between agents
    await new Promise((r) => setTimeout(r, 300));
  }

  const finalStatus = hasError ? 'completed_with_errors' : 'completed';
  storage.update('executions', executionId, {
    status: finalStatus,
    completedAt: new Date().toISOString(),
  });

  appendLog(executionId, 'info', `🏁 Exécution terminée : ${finalStatus}`);
  emit(executionId, 'execution_done', { executionId, status: finalStatus });
}

function createExecution(plan) {
  const executionId = uuid();
  const steps = plan.agents.map((a, i) => ({
    id: uuid(),
    order: i + 1,
    agentId: a.id,
    agentName: a.name,
    agentEmoji: a.emoji,
    instructions: plan.task,
    status: 'pending',
  }));

  const execution = {
    id: executionId,
    task: plan.task,
    planText: plan.planText,
    steps,
    logs: [],
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  storage.create('executions', execution);
  return execution;
}

module.exports = { runExecution, createExecution, setBroadcast };

'use strict';

const { callClaude } = require('./claude');
const { callOpenAI } = require('./openai');
const { callOllama } = require('./ollama');
const { getMockResult, getMockPlan } = require('./mock');

function getProvider() {
  return (process.env.AI_PROVIDER || 'mock').toLowerCase();
}

async function callAI(agentId, systemPrompt, userMessage, options = {}) {
  const provider = getProvider();

  switch (provider) {
    case 'claude':
      return callClaude(systemPrompt, userMessage, options);
    case 'openai':
      return callOpenAI(systemPrompt, userMessage, options);
    case 'ollama':
      return callOllama(systemPrompt, userMessage, options);
    case 'mock':
    default: {
      const { result } = getMockResult(agentId);
      await new Promise((r) => setTimeout(r, 800 + Math.random() * 400));
      return result;
    }
  }
}

async function planTask(task, agents) {
  const provider = getProvider();

  if (provider === 'mock') {
    await new Promise((r) => setTimeout(r, 600));
    return getMockPlan(task, agents);
  }

  const systemPrompt = `Tu es un Super-Agent orchestrateur. Ton rôle est de planifier l'exécution d'une tâche en sélectionnant et ordonnant les agents spécialisés appropriés.
Agents disponibles:
${agents.map((a) => `- ${a.id}: ${a.name} – ${a.description.substring(0, 100)}`).join('\n')}

Réponds en Markdown avec un plan structuré incluant: justification de la sélection des agents, ordre d'exécution, estimations, et artefacts attendus.`;

  const message = `Planifie l'exécution de cette tâche:\n\n${task}`;

  switch (provider) {
    case 'claude':
      return callClaude(systemPrompt, message);
    case 'openai':
      return callOpenAI(systemPrompt, message);
    case 'ollama':
      return callOllama(systemPrompt, message);
    default:
      return getMockPlan(task, agents);
  }
}

module.exports = { callAI, planTask, getProvider };

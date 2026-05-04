'use strict';

const { getAllAgents } = require('../agents/registry');
const { planTask } = require('../providers/factory');

const TASK_KEYWORDS = {
  'sim-fdtd': ['simulation', 'fdtd', 'nanoparticle', 'nanoparticule', 'optique', 'absorption', 'plasmon', 'gold', 'or', 'dielectric'],
  'data-lineage-fr': ['lignée', 'lineage', 'sql', 'base de données', 'dépendance', 'schéma', 'procédure'],
  'data-lineage-en': ['lineage', 'sql', 'database', 'dependency', 'schema', 'stored procedure', 'etl'],
  'backlog-forge': ['backlog', 'sprint', 'kanban', 'projet', 'tâche', 'roadmap', 'agile', 'scrum', 'prd', 'sow'],
  'letta-builder': ['agent', 'créer un agent', 'create agent', 'letta', 'build agent', 'configure'],
  'letta-manager': ['gérer', 'manage', 'optimiser', 'optimize', 'problème agent', 'debug agent', 'performance'],
  'repo-indexer': ['dépôt', 'repository', 'repo', 'codebase', 'index', 'analyse de code', 'code analysis'],
  'shell-specialist': ['shell', 'bash', 'script', 'automatisation', 'automation', 'posix', 'cron', 'deploy'],
  'devops-deps': ['dépendance', 'dependency', 'npm', 'pip', 'package', 'vulnerability', 'cve', 'audit'],
  'x-scraper': ['twitter', 'tweet', 'x.com', 'xquik', 'social media', 'scrape', 'réseaux sociaux'],
};

function selectAgentsForTask(task) {
  const lower = task.toLowerCase();
  const allAgents = getAllAgents();
  const scores = new Map();

  for (const [agentId, keywords] of Object.entries(TASK_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) score++;
    }
    if (score > 0) scores.set(agentId, score);
  }

  if (scores.size === 0) {
    return allAgents.slice(0, 3);
  }

  const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const topIds = sorted.slice(0, Math.min(4, sorted.length)).map(([id]) => id);
  return topIds.map((id) => allAgents.find((a) => a.id === id)).filter(Boolean);
}

async function generatePlan(task, agentIds) {
  const allAgents = getAllAgents();
  let agents;

  if (agentIds && agentIds.length > 0) {
    agents = agentIds.map((id) => allAgents.find((a) => a.id === id)).filter(Boolean);
  } else {
    agents = selectAgentsForTask(task);
  }

  const planText = await planTask(task, agents);

  return {
    task,
    agents: agents.map((a) => ({ id: a.id, name: a.name, emoji: a.emoji })),
    planText,
    estimatedDuration: `${agents.length * 2}–${agents.length * 5} min`,
    createdAt: new Date().toISOString(),
  };
}

module.exports = { generatePlan, selectAgentsForTask };

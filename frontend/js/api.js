// API Client for Super-Agent Platform
const API_BASE = window.location.origin + '/api';

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const API = {
  // Agents
  getAgents: () => apiFetch('/agents'),
  getAgent: (id) => apiFetch(`/agents/${id}`),

  // Tasks
  createTask: (body) => apiFetch('/tasks', { method: 'POST', body: JSON.stringify(body) }),
  getTasks: () => apiFetch('/tasks'),
  getTask: (id) => apiFetch(`/tasks/${id}`),
  deleteTask: (id) => apiFetch(`/tasks/${id}`, { method: 'DELETE' }),

  // Executions
  createExecution: (body) => apiFetch('/executions', { method: 'POST', body: JSON.stringify(body) }),
  runExecution: (id) => apiFetch(`/executions/${id}/run`, { method: 'POST' }),
  cancelExecution: (id) => apiFetch(`/executions/${id}/cancel`, { method: 'POST' }),
  getExecutions: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/executions${qs ? '?' + qs : ''}`);
  },
  getExecution: (id) => apiFetch(`/executions/${id}`),
  deleteExecution: (id) => apiFetch(`/executions/${id}`, { method: 'DELETE' }),
  getLogs: (id) => apiFetch(`/executions/${id}/logs`),

  // Workflows
  createWorkflow: (body) => apiFetch('/workflows', { method: 'POST', body: JSON.stringify(body) }),
  getWorkflows: () => apiFetch('/workflows'),
  getWorkflow: (id) => apiFetch(`/workflows/${id}`),
  updateWorkflow: (id, body) => apiFetch(`/workflows/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteWorkflow: (id) => apiFetch(`/workflows/${id}`, { method: 'DELETE' }),
  runWorkflow: (id) => apiFetch(`/workflows/${id}/run`, { method: 'POST' }),
  getWorkflowRuns: (id) => apiFetch(`/workflows/${id}/runs`),

  // Artifacts
  getArtifacts: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/artifacts${qs ? '?' + qs : ''}`);
  },
  getArtifact: (id) => apiFetch(`/artifacts/${id}`),
  deleteArtifact: (id) => apiFetch(`/artifacts/${id}`, { method: 'DELETE' }),

  // Settings
  getSettings: () => apiFetch('/settings'),
  updateSettings: (body) => apiFetch('/settings', { method: 'PUT', body: JSON.stringify(body) }),
  getStatus: () => apiFetch('/settings/status'),

  // Dashboard
  getDashboardStats: () => apiFetch('/dashboard/stats'),

  // Search
  search: (q, type = 'all') => apiFetch(`/search?q=${encodeURIComponent(q)}&type=${type}`),

  // Workflow import
  importWorkflow: (workflow) => apiFetch('/workflows/import', { method: 'POST', body: JSON.stringify({ workflow }) }),

  // Workflow runs
  getWorkflowRuns: () => apiFetch('/workflow-runs'),
  getWorkflowRun: (id) => apiFetch(`/workflow-runs/${id}`),

  // Provider test + Ollama health
  testProvider: () => apiFetch('/settings/test-provider', { method: 'POST' }),
  getOllamaHealth: () => apiFetch('/settings/ollama-health'),

  // Health
  health: () => apiFetch('/health'),

  // Storage / Migration Control
  getStorageStatus: () => apiFetch('/storage/status'),
  getStorageChecksums: () => apiFetch('/storage/checksums'),
  getStorageEvents: () => apiFetch('/storage/events'),
  runStorageDryRun: () => apiFetch('/storage/migration/dry-run', { method: 'POST', body: JSON.stringify({}) }),
  validateStorageMigration: (body = {}) => apiFetch('/storage/migration/validate', { method: 'POST', body: JSON.stringify(body) }),
  exportSqliteDump: () => apiFetch('/storage/sqlite/export-dump', { method: 'POST', body: JSON.stringify({}) }),
  runStorageMigration: (body) => apiFetch('/storage/migration/run', { method: 'POST', body: JSON.stringify(body) }),
  rollbackStorage: (body) => apiFetch('/storage/rollback', { method: 'POST', body: JSON.stringify(body) }),
  getSqliteReadiness: () => apiFetch('/storage/sqlite/readiness'),
  getDesyncAlerts: () => apiFetch('/storage/checksums/desync-alerts'),
  compareIdsAllCollections: () => apiFetch('/storage/compare-ids'),
  listValidationReports: () => apiFetch('/storage/validation-reports'),
  getMigrationReadinessGate: () => apiFetch('/storage/migration/readiness-gate'),
  getSwitchHistory: () => apiFetch('/storage/switch-history'),
  switchStorageMode: (body) => apiFetch('/storage/switch-mode', { method: 'POST', body: JSON.stringify(body) }),
  setDoubleWrite: (body) => apiFetch('/storage/set-double-write', { method: 'POST', body: JSON.stringify(body) }),

  // Schedules
  getSchedules: () => apiFetch('/schedules'),
  createSchedule: (body) => apiFetch('/schedules', { method: 'POST', body: JSON.stringify(body) }),
  updateSchedule: (id, body) => apiFetch(`/schedules/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteSchedule: (id) => apiFetch(`/schedules/${id}`, { method: 'DELETE' }),
  triggerSchedule: (id) => apiFetch(`/schedules/${id}/trigger`, { method: 'POST' }),

  // Memory
  getMemory: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/memory${qs ? '?' + qs : ''}`);
  },
  getMemoryStats: () => apiFetch('/memory/stats'),
  getMemoryEmbeddingStatus: () => apiFetch('/memory/embeddings/status'),
  addMemoryChunk: (body) => apiFetch('/memory', { method: 'POST', body: JSON.stringify(body) }),
  searchMemory: (q, limit = 5) => apiFetch(`/memory/search?q=${encodeURIComponent(q)}&limit=${limit}`),
  retrieveMemory: (body) => apiFetch('/memory/retrieve', { method: 'POST', body: JSON.stringify(body) }),
  reindexMemoryEmbeddings: () => apiFetch('/memory/embeddings/reindex', { method: 'POST' }),
  clearMemoryEmbeddings: () => apiFetch('/memory/embeddings', { method: 'DELETE' }),
  getMemoryEmbeddingIntegrity: () => apiFetch('/memory/embeddings/integrity'),
  cleanupMemoryEmbeddings: (body = {}) => apiFetch('/memory/embeddings/cleanup', { method: 'POST', body: JSON.stringify(body) }),
  benchmarkMemory: (body) => apiFetch('/memory/benchmark', { method: 'POST', body: JSON.stringify(body) }),
  getMemoryEvalQueries: () => apiFetch('/memory/evaluation/queries'),
  createMemoryEvalQuery: (body) => apiFetch('/memory/evaluation/queries', { method: 'POST', body: JSON.stringify(body) }),
  updateMemoryEvalQuery: (id, body) => apiFetch(`/memory/evaluation/queries/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteMemoryEvalQuery: (id) => apiFetch(`/memory/evaluation/queries/${id}`, { method: 'DELETE' }),
  runMemoryEvaluation: (body) => apiFetch('/memory/evaluation/run', { method: 'POST', body: JSON.stringify(body) }),
  getMemoryLatestEvaluation: () => apiFetch('/memory/evaluation/latest'),
  exportMemoryEvaluationReport: (body = {}) => apiFetch('/memory/evaluation/export-report', { method: 'POST', body: JSON.stringify(body) }),
  deleteMemoryChunk: (id) => apiFetch(`/memory/${id}`, { method: 'DELETE' }),
  clearMemory: () => apiFetch('/memory', { method: 'DELETE' }),
  exportMemory: () => apiFetch('/memory/export'),
  importMemory: (chunks) => apiFetch('/memory/import', { method: 'POST', body: JSON.stringify({ chunks }) }),
  exportSchedules: () => apiFetch('/schedules/export'),
  importSchedules: (schedules) => apiFetch('/schedules/import', { method: 'POST', body: JSON.stringify({ schedules }) }),

  // Metrics
  getMetrics: () => apiFetch('/metrics'),
  getAgentMetrics: () => apiFetch('/metrics/agents'),
};

window.API = API;

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
  getExecutions: () => apiFetch('/executions'),
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

  // Health
  health: () => apiFetch('/health'),
};

window.API = API;

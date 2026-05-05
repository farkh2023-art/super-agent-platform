// API Client for Super-Agent Platform
const API_BASE = window.location.origin + '/api';

// ── Token management (never logged) ─────────────────────────────────────────
const AuthToken = {
  get:          ()  => localStorage.getItem('sap_jwt') || '',
  set:          (t) => localStorage.setItem('sap_jwt', t),
  clear:        ()  => localStorage.removeItem('sap_jwt'),
  getRefresh:   ()  => localStorage.getItem('sap_refresh') || '',
  setRefresh:   (t) => localStorage.setItem('sap_refresh', t),
  clearRefresh: ()  => localStorage.removeItem('sap_refresh'),
};
window.AuthToken = AuthToken;

// Prevent concurrent silent refreshes
let _refreshing = false;

// Read a cookie value (for CSRF token) — never logs
function readCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : '';
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

async function apiFetch(path, options = {}) {
  const token = AuthToken.get();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  // Inject CSRF token for mutating requests (when server has CSRF_PROTECTION=true)
  if (MUTATING_METHODS.has(options.method || 'GET')) {
    const csrf = readCookie('sap_csrf');
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    // Try silent refresh once
    const rt = AuthToken.getRefresh();
    if (rt && !_refreshing) {
      _refreshing = true;
      try {
        const rRes = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: rt }),
        });
        if (rRes.ok) {
          const rData = await rRes.json();
          AuthToken.set(rData.token);
          if (rData.refreshToken) AuthToken.setRefresh(rData.refreshToken);
          // Retry original request with new token
          const retryHeaders = { 'Content-Type': 'application/json', ...options.headers, 'Authorization': `Bearer ${rData.token}` };
          const retryRes = await fetch(`${API_BASE}${path}`, { ...options, headers: retryHeaders });
          const retryData = await retryRes.json();
          if (!retryRes.ok) throw new Error(retryData.error || `HTTP ${retryRes.status}`);
          return retryData;
        }
      } catch (e) {
        if (e.message && !e.message.includes('fetch')) throw e;
      } finally {
        _refreshing = false;
      }
    }
    AuthToken.clear();
    AuthToken.clearRefresh();
    window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Non autorisé');
  }

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

  // ── Auth (Phase 6A/B/C) ──────────────────────────────────────────────────
  getAuthMode: () => apiFetch('/auth/mode'),
  getSecurityConfig: () => apiFetch('/auth/security-config'),
  login: (username, password) => apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  refresh: (refreshToken) => apiFetch('/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken }) }),
  me: () => apiFetch('/auth/me'),
  logout: (refreshToken) => apiFetch('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) }),
  getAuditLog: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/auth/audit-log${qs ? '?' + qs : ''}`);
  },
  getAuthUsers: () => apiFetch('/auth/users'),
  registerUser: (body) => apiFetch('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  updateUser: (id, body) => apiFetch(`/auth/users/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteUser: (id) => apiFetch(`/auth/users/${id}`, { method: 'DELETE' }),

  // ── Sessions (Phase 6F / 7) ──────────────────────────────────────────────
  getSessions: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/auth/sessions${qs ? '?' + qs : ''}`);
  },
  revokeSession: (id) => apiFetch(`/auth/sessions/${id}`, { method: 'DELETE' }),
  revokeAllSessions: (body = {}) => apiFetch('/auth/sessions/revoke-all', { method: 'POST', body: JSON.stringify(body) }),
  runAuthCleanup: (body = {}) => apiFetch('/auth/cleanup', { method: 'POST', body: JSON.stringify(body) }),
  getAuthCleanupStatus: () => apiFetch('/auth/cleanup/status'),

  // ── Admin Health / Reports (Phase 7) ────────────────────────────────────
  getAdminHealth: () => apiFetch('/admin/health'),
  getAdminReportJson: () => apiFetch('/admin/report.json'),
  getAdminReports: () => apiFetch('/admin/reports'),
  exportAuditCsv: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return `${API_BASE}/auth/audit-log/export.csv${qs ? '?' + qs : ''}`;
  },
  getAdminReportMdUrl: () => `${API_BASE}/admin/report.md`,

  // ── Workspaces (Phase 6A/B) ──────────────────────────────────────────────
  getWorkspaces: () => apiFetch('/workspaces'),
  createWorkspace: (body) => apiFetch('/workspaces', { method: 'POST', body: JSON.stringify(body) }),
  getWorkspace: (id) => apiFetch(`/workspaces/${id}`),
  getWorkspaceTasks: (id) => apiFetch(`/workspaces/${id}/tasks`),
  createWorkspaceTask: (id, body) => apiFetch(`/workspaces/${id}/tasks`, { method: 'POST', body: JSON.stringify(body) }),
};

window.API = API;

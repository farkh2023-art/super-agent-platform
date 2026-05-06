// ============================================================
// Super-Agent Platform – Main Application
// ============================================================

let state = {
  agents: [],
  executions: [],
  artifacts: [],
  workflows: [],
  currentExecution: null,
  selectedAgentIds: [],
  activeView: 'dashboard',
  settings: { aiProvider: 'mock' },
  wsConnected: false,
  pages: {
    executions: { offset: 0, limit: 20, total: 0 },
    memory:     { offset: 0, limit: 20, total: 0 },
    sessions:   { offset: 0, limit: 20, total: 0 },
    ahSessions: { offset: 0, limit: 10, total: 0 },
    ahAudit:    { offset: 0, limit: 10, total: 0 },
  },
  auth: { mode: 'single', user: null, workspace: null },
};

const ONBOARDING_STORAGE_KEY = 'sap_onboarding_hidden';

function updateOnboardingVisibility() {
  const banner = qs('#onboarding-banner');
  if (!banner) return;
  banner.style.display = localStorage.getItem(ONBOARDING_STORAGE_KEY) === 'true' ? 'none' : 'block';
}

function hideOnboarding() {
  localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
  updateOnboardingVisibility();
}

function resetOnboarding() {
  localStorage.removeItem(ONBOARDING_STORAGE_KEY);
  updateOnboardingVisibility();
  showToast('Onboarding reinitialise', 'success');
}

// ── Routing ──────────────────────────────────────────────────────────────────
function navigate(view) {
  state.activeView = view;
  document.querySelectorAll('.nav-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.view === view);
  });
  document.querySelectorAll('.view').forEach((el) => {
    el.style.display = el.id === `view-${view}` ? 'block' : 'none';
  });
  switch (view) {
    case 'dashboard':   loadDashboard(); break;
    case 'agents':      loadAgentsView(); break;
    case 'execute':     loadExecuteView(); break;
    case 'executions':  loadExecutionsView(); break;
    case 'artifacts':   loadArtifactsView(); break;
    case 'workflows':   loadWorkflowsView(); break;
    case 'settings':    loadSettingsView(); break;
    case 'search':      loadSearchView(); break;
    case 'schedules':   loadSchedulesView(); break;
    case 'memory':      loadMemoryView(); break;
    case 'metrics':     loadMetricsView(); break;
    case 'workspaces':  loadWorkspacesView(); break;
    case 'audit-log':   loadAuditLogView(); break;
    case 'sessions':      loadSessionsView(); break;
    case 'admin-health':  loadAdminHealthView(); break;
    case 'alert-center':  loadAlertCenterView(); break;
  }
}

// ── Auth (Phase 6B) ──────────────────────────────────────────────────────────

function showLoginOverlay() {
  const el = qs('#login-overlay');
  if (el) { el.style.display = 'flex'; qs('#login-username')?.focus(); }
}

function hideLoginOverlay() {
  const el = qs('#login-overlay');
  if (el) el.style.display = 'none';
}

function updateAuthUI() {
  const { mode, user, workspace } = state.auth;
  const bar     = qs('#auth-user-bar');
  const navWs   = qs('#nav-workspaces');
  const navAudit = qs('#nav-audit-log');
  const navSessions = qs('#nav-sessions');
  const navAdminHealth = qs('#nav-admin-health');
  const navAlertCenter = qs('#nav-alert-center');
  const badge    = qs('#execute-workspace-badge');
  const wsName   = qs('#execute-workspace-name');

  if (mode === 'multi' && user) {
    if (bar) {
      bar.style.display = 'block';
      const uLabel = qs('#auth-username-label');
      const wsLabel = qs('#auth-workspace-label');
      if (uLabel) uLabel.textContent = user.username + (user.role === 'admin' ? ' (admin)' : '');
      if (wsLabel) wsLabel.textContent = workspace ? workspace.name : 'Aucun workspace';
    }
    if (navWs)    navWs.style.display = 'flex';
    if (navAudit) navAudit.style.display = user.role === 'admin' ? 'flex' : 'none';
    if (navSessions) navSessions.style.display = 'flex';
    if (navAdminHealth) navAdminHealth.style.display = user.role === 'admin' ? 'flex' : 'none';
    if (navAlertCenter) navAlertCenter.style.display = user.role === 'admin' ? 'flex' : 'none';
    const adminUsersSection = qs('#admin-users-section');
    if (adminUsersSection) adminUsersSection.style.display = user.role === 'admin' ? 'block' : 'none';
    if (badge && wsName) {
      if (workspace) {
        badge.style.display = 'block';
        wsName.textContent = workspace.name;
      } else {
        badge.style.display = 'none';
      }
    }
  } else {
    if (bar)      bar.style.display = 'none';
    if (navWs)    navWs.style.display = 'none';
    if (navAudit) navAudit.style.display = 'none';
    if (navSessions) navSessions.style.display = 'none';
    if (navAdminHealth) navAdminHealth.style.display = 'none';
    if (navAlertCenter) navAlertCenter.style.display = 'none';
    if (badge)    badge.style.display = 'none';
  }
}

async function initAuth() {
  try {
    const { mode } = await API.getAuthMode();
    state.auth.mode = mode;

    if (mode !== 'multi') {
      navigate('dashboard');
      return;
    }

    const token = window.AuthToken.get();
    if (token) {
      try {
        const { user } = await API.me();
        state.auth.user = user;
        updateAuthUI();
        startSessionTimer();
        hideLoginOverlay();
        navigate('dashboard');
        return;
      } catch {
        window.AuthToken.clear();
        window.AuthToken.clearRefresh();
      }
    }

    showLoginOverlay();
  } catch {
    navigate('dashboard');
  }
}

// ── Session timer ────────────────────────────────────────────────────────────

let _sessionTimerInterval = null;

function decodeJWTPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    return JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch { return null; }
}

function startSessionTimer() {
  clearSessionTimer();
  _sessionTimerInterval = setInterval(() => {
    const token = window.AuthToken.get();
    if (!token) { clearSessionTimer(); return; }
    const payload = decodeJWTPayload(token);
    if (!payload || !payload.exp) { clearSessionTimer(); return; }
    const remaining = payload.exp - Math.floor(Date.now() / 1000);
    const timerEl = qs('#session-timer');
    if (timerEl) {
      if (remaining <= 0) {
        timerEl.textContent = 'Expirée';
        timerEl.style.color = 'var(--red)';
      } else {
        const m = Math.floor(remaining / 60);
        const s = remaining % 60;
        timerEl.textContent = `${m}:${String(s).padStart(2, '0')}`;
        timerEl.style.color = remaining < 120 ? 'var(--yellow)' : 'var(--text3)';
      }
    }
    // Auto-refresh at ≤ 60s remaining
    if (remaining > 0 && remaining <= 60) {
      doSilentRefresh();
    }
  }, 1000);
}

function clearSessionTimer() {
  if (_sessionTimerInterval) { clearInterval(_sessionTimerInterval); _sessionTimerInterval = null; }
  const timerEl = qs('#session-timer');
  if (timerEl) timerEl.textContent = '';
}

async function doSilentRefresh() {
  const rt = window.AuthToken.getRefresh();
  if (!rt) return;
  try {
    const data = await API.refresh(rt);
    window.AuthToken.set(data.token);
    if (data.refreshToken) window.AuthToken.setRefresh(data.refreshToken);
  } catch { /* will get 401 on next request, which triggers login overlay */ }
}

async function doLogin() {
  const username = qs('#login-username')?.value?.trim() || '';
  const password = qs('#login-password')?.value || '';
  const errEl    = qs('#login-error');
  const btn      = qs('#login-btn');

  if (!username || !password) {
    if (errEl) { errEl.textContent = 'Identifiant et mot de passe requis'; errEl.style.display = 'block'; }
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Connexion...'; }
  if (errEl) errEl.style.display = 'none';

  try {
    const data = await API.login(username, password);
    window.AuthToken.set(data.token);
    // In cookie mode, refreshToken is in HttpOnly cookie — no need to store in localStorage
    if (data.refreshToken) window.AuthToken.setRefresh(data.refreshToken);
    else window.AuthToken.clearRefresh(); // cookie mode: clear any stale localStorage token
    state.auth.user = data.user;
    updateAuthUI();
    startSessionTimer();
    hideLoginOverlay();
    if (qs('#login-password')) qs('#login-password').value = '';
    navigate('dashboard');
    showToast(`Connecté en tant que ${data.user.username}`, 'success');
  } catch (err) {
    if (errEl) { errEl.textContent = err.message || 'Identifiants incorrects'; errEl.style.display = 'block'; }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Se connecter'; }
  }
}

async function doLogout() {
  const rt = window.AuthToken.getRefresh();
  try { await API.logout(rt); } catch { /* ignore */ }
  clearSessionTimer();
  window.AuthToken.clear();
  window.AuthToken.clearRefresh();
  state.auth = { mode: state.auth.mode, user: null, workspace: null };
  updateAuthUI();
  showLoginOverlay();
}

// ── Workspaces View ──────────────────────────────────────────────────────────

async function loadWorkspacesView() {
  const container = qs('#workspaces-list');
  if (!container) return;
  container.innerHTML = '<div class="text-muted text-sm">Chargement...</div>';

  const createCard = qs('#workspace-create-card');
  if (createCard) createCard.style.display = state.auth.user?.role === 'admin' ? 'block' : 'none';

  // Admin users section
  if (state.auth.user?.role === 'admin') loadUsersManagementUI();

  try {
    const { workspaces } = await API.getWorkspaces();
    if (!workspaces || !workspaces.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">🏢</div><p>Aucun workspace. Un admin peut en créer un.</p></div>';
      return;
    }
    const current = state.auth.workspace;
    container.innerHTML = workspaces.map((ws) => `
      <div class="card" style="margin-bottom:12px;border-color:${current && current.id === ws.id ? 'var(--accent)' : 'var(--border)'}">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
          <div style="min-width:0">
            <div style="font-weight:600;font-size:15px">${escHtml(ws.name)}</div>
            <div style="font-size:12px;color:var(--text2);margin-top:2px">
              ID: <span style="font-family:var(--mono)">${escHtml(ws.id)}</span>
              &nbsp;·&nbsp; Max tasks: ${ws.limits?.maxTasks ?? '–'}
              &nbsp;·&nbsp; Max executions: ${ws.limits?.maxExecutions ?? '–'}
            </div>
          </div>
          <button class="btn btn-sm ${current && current.id === ws.id ? 'btn-primary' : 'btn-secondary'}"
                  onclick="selectWorkspace('${escHtml(ws.id)}','${escHtml(ws.name)}')" style="flex-shrink:0">
            ${current && current.id === ws.id ? 'Actif' : 'Sélectionner'}
          </button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<div class="text-red">Erreur: ${escHtml(err.message)}</div>`;
  }
}

function selectWorkspace(wsId, wsName) {
  state.auth.workspace = { id: wsId, name: wsName };
  updateAuthUI();
  loadWorkspacesView();
  showToast(`Workspace "${wsName}" sélectionné`, 'success');
}

async function createWorkspaceUI() {
  const name     = qs('#ws-create-name')?.value?.trim();
  const maxTasks = parseInt(qs('#ws-create-max-tasks')?.value || '1000', 10);
  if (!name) { showToast('Nom requis', 'error'); return; }
  try {
    await API.createWorkspace({ name, limits: { maxTasks, maxExecutions: 500 } });
    if (qs('#ws-create-name')) qs('#ws-create-name').value = '';
    showToast(`Workspace "${name}" créé`, 'success');
    loadWorkspacesView();
  } catch (err) {
    showToast(`Erreur: ${err.message}`, 'error');
  }
}

// ── Admin Users Management ───────────────────────────────────────────────────

async function loadUsersManagementUI() {
  const container = qs('#users-management-list');
  if (!container) return;
  container.innerHTML = '<div class="text-muted text-sm">Chargement...</div>';
  try {
    const { users } = await API.getAuthUsers();
    if (!users || !users.length) {
      container.innerHTML = '<div class="text-muted text-sm">Aucun utilisateur.</div>';
      return;
    }
    const me = state.auth.user;
    container.innerHTML = users.map((u) => `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;background:var(--bg3);border-radius:8px;margin-bottom:8px">
        <div style="min-width:0">
          <div style="font-weight:600">${escHtml(u.username)}</div>
          <div style="display:flex;gap:6px;margin-top:3px;align-items:center">
            <span class="badge ${u.role === 'admin' ? 'badge-completed' : 'badge-pending'}">${u.role}</span>
            ${u.disabled ? '<span class="badge badge-error">Désactivé</span>' : ''}
          </div>
        </div>
        ${me && me.id !== u.id ? `
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button class="btn btn-sm btn-secondary" onclick="toggleUserRoleUI('${escHtml(u.id)}','${u.role}')">
            ${u.role === 'admin' ? 'Rétrograder' : 'Promouvoir'}
          </button>
          <button class="btn btn-sm ${u.disabled ? 'btn-secondary' : 'btn-danger'}"
                  onclick="toggleUserDisabledUI('${escHtml(u.id)}',${!!u.disabled})">
            ${u.disabled ? 'Activer' : 'Désactiver'}
          </button>
        </div>
        ` : '<span style="font-size:11px;color:var(--text3)">(vous)</span>'}
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<div class="text-red">Erreur: ${escHtml(err.message)}</div>`;
  }
}

async function toggleUserRoleUI(userId, currentRole) {
  const newRole = currentRole === 'admin' ? 'user' : 'admin';
  try {
    await API.updateUser(userId, { role: newRole });
    showToast(`Rôle mis à jour → ${newRole}`, 'success');
    loadUsersManagementUI();
  } catch (err) {
    showToast(`Erreur: ${err.message}`, 'error');
  }
}

async function toggleUserDisabledUI(userId, isDisabled) {
  try {
    await API.updateUser(userId, { disabled: !isDisabled });
    showToast(`Utilisateur ${!isDisabled ? 'désactivé' : 'réactivé'}`, 'success');
    loadUsersManagementUI();
  } catch (err) {
    showToast(`Erreur: ${err.message}`, 'error');
  }
}

// ── Audit Log View ───────────────────────────────────────────────────────────

function clearAuditFilters() {
  ['#audit-filter-username', '#audit-filter-method', '#audit-filter-from', '#audit-filter-to']
    .forEach((sel) => { const el = qs(sel); if (el) el.value = ''; });
  loadAuditLogView();
}

async function loadAuditLogView() {
  const container = qs('#audit-log-list');
  if (!container) return;
  container.innerHTML = '<div class="text-muted text-sm">Chargement...</div>';
  try {
    const params = {};
    const username = qs('#audit-filter-username')?.value?.trim();
    const method   = qs('#audit-filter-method')?.value;
    const from     = qs('#audit-filter-from')?.value;
    const to       = qs('#audit-filter-to')?.value;
    if (username) params.username = username;
    if (method)   params.method   = method;
    if (from)     params.from     = from;
    if (to)       params.to       = to;
    const { entries } = await API.getAuditLog(params);
    if (!entries || !entries.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>Aucune entrée dans l\'audit log.</p></div>';
      return;
    }
    container.innerHTML = `
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead>
            <tr style="color:var(--text2);border-bottom:1px solid var(--border)">
              <th style="text-align:left;padding:8px 10px;font-weight:500">Date</th>
              <th style="text-align:left;padding:8px 10px;font-weight:500">Utilisateur</th>
              <th style="text-align:left;padding:8px 10px;font-weight:500">Méthode</th>
              <th style="text-align:left;padding:8px 10px;font-weight:500">Route</th>
              <th style="text-align:left;padding:8px 10px;font-weight:500">Status</th>
              <th style="text-align:left;padding:8px 10px;font-weight:500">Durée</th>
              <th style="text-align:left;padding:8px 10px;font-weight:500">IP</th>
              <th style="text-align:left;padding:8px 10px;font-weight:500">User-Agent</th>
            </tr>
          </thead>
          <tbody>
            ${entries.map((e) => `
              <tr style="border-bottom:1px solid var(--border)">
                <td style="padding:7px 10px;color:var(--text2);white-space:nowrap">${new Date(e.createdAt).toLocaleString('fr')}</td>
                <td style="padding:7px 10px;font-weight:500">${escHtml(e.username || '–')}</td>
                <td style="padding:7px 10px"><span class="badge badge-pending">${escHtml(e.method)}</span></td>
                <td style="padding:7px 10px;font-family:var(--mono);font-size:11px">${escHtml(e.path)}</td>
                <td style="padding:7px 10px">
                  <span class="badge ${e.statusCode < 300 ? 'badge-completed' : e.statusCode < 500 ? 'badge-pending' : 'badge-error'}">${e.statusCode}</span>
                </td>
                <td style="padding:7px 10px;color:var(--text2)">${e.durationMs}ms</td>
                <td style="padding:7px 10px;color:var(--text2);font-family:var(--mono);font-size:11px">${escHtml(e.ipAddress || '–')}</td>
                <td style="padding:7px 10px;color:var(--text2);font-size:11px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(e.userAgent || '')}">${escHtml(e.userAgent ? e.userAgent.slice(0, 30) + (e.userAgent.length > 30 ? '…' : '') : '–')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="text-red">Erreur: ${escHtml(err.message)}</div>`;
  }
}

// ── Dashboard ────────────────────────────────────────────────────────────────
async function loadDashboard() {
  try {
    const [stats, execData, memStats, schedData] = await Promise.all([
      API.getDashboardStats(),
      API.getExecutions(),
      API.getMemoryStats().catch(() => ({ total: 0 })),
      API.getSchedules().catch(() => ({ schedules: [] })),
    ]);
    state.executions = execData.executions;

    // Stat cards
    qs('#stat-agents').textContent       = stats.agents.total;
    qs('#stat-executions').textContent   = stats.executions.total;
    qs('#stat-running').textContent      = stats.executions.running;
    qs('#stat-artifacts').textContent    = stats.artifacts.total;
    qs('#stat-workflows').textContent    = stats.workflows.total;
    qs('#stat-success-rate').textContent = stats.executions.successRate != null
      ? `${stats.executions.successRate}%` : '–';

    // System status
    const uptime = stats.uptime;
    const h = Math.floor(uptime / 3600), m = Math.floor((uptime % 3600) / 60), s = uptime % 60;
    qs('#sys-provider').textContent     = stats.provider;
    qs('#sys-concurrency').textContent  = `${stats.concurrency.active}/${stats.concurrency.max} actifs`;
    qs('#sys-logs').textContent         = stats.logsToday;
    qs('#sys-uptime').textContent       = h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;
    qs('#sys-wf-runs').textContent       = stats.workflowRuns.total;
    const memEl = qs('#sys-memory-chunks');
    if (memEl) memEl.textContent = memStats.total;
    const schedEl = qs('#sys-schedules');
    if (schedEl) schedEl.textContent = (schedData.schedules || []).filter((s) => s.enabled).length;
    qs('#sys-last-exec').textContent    = stats.lastExecution
      ? `${escHtml(stats.lastExecution.task)} (${stats.lastExecution.status})`
      : 'Aucune';

    renderRecentExecutions();
  } catch (err) {
    console.error('Dashboard error:', err);
  }
}

function renderRecentExecutions() {
  const container = qs('#recent-executions');
  const recent = state.executions.slice(0, 5);
  if (recent.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><p>Aucune exécution récente</p></div>';
    return;
  }
  container.innerHTML = recent.map((e) => `
    <div class="step-item ${statusClass(e.status)}" style="cursor:pointer" onclick="navigate('executions')">
      <div class="step-num">${statusIcon(e.status)}</div>
      <div style="flex:1;min-width:0">
        <div class="step-agent" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(e.task.substring(0,60))}...</div>
        <div class="text-sm text-muted mt-8">${e.steps?.length || 0} agent(s) • ${formatDate(e.createdAt)}</div>
      </div>
      <span class="badge badge-${e.status.replace(/_.*/, '')}">${e.status}</span>
    </div>
  `).join('');
}

// ── Agents View ──────────────────────────────────────────────────────────────
async function loadAgentsView() {
  const container = qs('#agents-grid');
  container.innerHTML = '<div class="text-muted text-sm" style="padding:20px">Chargement...</div>';
  try {
    const data = await API.getAgents();
    state.agents = data.agents;
    container.innerHTML = state.agents.map((a) => `
      <div class="agent-card" onclick="showAgentModal('${a.id}')">
        <div class="agent-header">
          <div class="agent-emoji">${a.emoji}</div>
          <div class="agent-info">
            <div class="agent-name">${escHtml(a.name)}</div>
            <span class="agent-category">${escHtml(a.category)}</span>
          </div>
        </div>
        <div class="agent-desc">${escHtml(a.description)}</div>
        <div class="agent-caps">
          ${a.capabilities.slice(0,3).map((c) => `<span class="cap-tag">${escHtml(c)}</span>`).join('')}
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<div class="text-red">Erreur: ${escHtml(err.message)}</div>`;
  }
}

function showAgentModal(agentId) {
  const agent = state.agents.find((a) => a.id === agentId);
  if (!agent) return;
  showModal(`
    <div class="modal-header">
      <div class="modal-title">${agent.emoji} ${escHtml(agent.name)}</div>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <span class="agent-category">${escHtml(agent.category)}</span>
    <p style="margin:12px 0;color:var(--text2);font-size:13px">${escHtml(agent.description)}</p>
    <div class="card-title mt-12">⚡ Capacités</div>
    <ul style="padding-left:16px">
      ${agent.capabilities.map((c) => `<li style="color:var(--text2);font-size:13px;margin-bottom:4px">${escHtml(c)}</li>`).join('')}
    </ul>
    <div class="card-title mt-12">📥 Entrées</div>
    <div style="background:var(--bg3);border-radius:8px;padding:12px;font-size:12px;font-family:var(--mono)">
      ${Object.entries(agent.inputSchema).map(([k,v]) => `<div style="margin-bottom:4px"><span style="color:var(--accent)">${k}</span>: <span style="color:var(--text2)">${escHtml(v)}</span></div>`).join('')}
    </div>
    <div class="btn-group mt-12">
      <button class="btn btn-primary" onclick="closeModal();navigate('execute');preselectAgent('${agent.id}')">
        ▶ Utiliser cet agent
      </button>
    </div>
  `);
}

// ── Execute View ─────────────────────────────────────────────────────────────
async function loadExecuteView() {
  if (state.agents.length === 0) {
    const data = await API.getAgents();
    state.agents = data.agents;
  }
  renderAgentChips();
}

function renderAgentChips() {
  const container = qs('#agent-chips');
  if (!container) return;
  container.innerHTML = state.agents.map((a) => `
    <div class="agent-chip ${state.selectedAgentIds.includes(a.id) ? 'selected' : ''}"
         onclick="toggleAgentChip('${a.id}')" data-agent-id="${a.id}">
      <span class="agent-chip-emoji">${a.emoji}</span>
      <span>${escHtml(a.name.split(' – ')[0])}</span>
    </div>
  `).join('');
}

function toggleAgentChip(agentId) {
  const idx = state.selectedAgentIds.indexOf(agentId);
  if (idx === -1) state.selectedAgentIds.push(agentId);
  else state.selectedAgentIds.splice(idx, 1);
  renderAgentChips();
}

function preselectAgent(agentId) {
  if (!state.selectedAgentIds.includes(agentId)) {
    state.selectedAgentIds.push(agentId);
  }
  renderAgentChips();
}

async function submitTask() {
  const taskInput = qs('#task-input');
  const task = taskInput.value.trim();
  if (!task) { showToast('Veuillez saisir une tâche', 'error'); return; }

  const btn = qs('#plan-btn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> Planification...';

  try {
    const taskBody = { task, agentIds: state.selectedAgentIds };
    if (state.auth.mode === 'multi' && state.auth.workspace) {
      taskBody.workspaceId = state.auth.workspace.id;
    }
    const result = await API.createTask(taskBody);
    const plan = result.task.plan;

    qs('#plan-display').style.display = 'block';
    qs('#plan-content').innerHTML = renderMarkdown(plan.planText);
    qs('#plan-agents').innerHTML = plan.agents.map((a) => `
      <div class="agent-chip selected">
        <span>${a.emoji || '🤖'}</span>
        <span>${escHtml(a.name)}</span>
      </div>
    `).join('');

    qs('#run-btn').onclick = () => launchExecution(plan, task);
    qs('#run-btn').style.display = 'inline-flex';

    showToast('Plan généré !', 'success');
  } catch (err) {
    showToast(`Erreur: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '🗺️ Générer le Plan';
  }
}

async function launchExecution(plan, task) {
  const btn = qs('#run-btn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> Lancement...';

  try {
    const execution = await API.createExecution({
      task,
      agentIds: plan.agents.map((a) => a.id),
      planText: plan.planText,
      useMemory: qs('#use-memory-toggle')?.checked || false,
    });
    state.currentExecution = execution;

    qs('#execution-panel').style.display = 'block';
    qs('#exec-task-label').textContent = task.substring(0, 80) + (task.length > 80 ? '...' : '');
    renderSteps(execution.steps);
    clearLogs();

    subscribeToExecution(execution.id);
    showToast('Exécution lancée !', 'success');
    navigate('executions');
  } catch (err) {
    showToast(`Erreur: ${err.message}`, 'error');
    btn.disabled = false;
    btn.innerHTML = '🚀 Lancer l\'Exécution';
  }
}

function subscribeToExecution(executionId) {
  wsClient.on('*', function handler(event) {
    if (event.executionId !== executionId) return;
    if (event.type === 'log') appendLogLine(event.data);
    if (event.type === 'step_start' || event.type === 'step_done' || event.type === 'step_error') {
      refreshExecutionSteps(executionId);
    }
    if (event.type === 'execution_done') {
      showToast(`Exécution terminée: ${event.data.status}`, 'success');
      wsClient.off('*', handler);
      refreshExecutionSteps(executionId);
    }
  });
}

async function refreshExecutionSteps(executionId) {
  try {
    const execution = await API.getExecution(executionId);
    renderSteps(execution.steps);
    const stepsContainer = qs(`#steps-${executionId}`);
    if (stepsContainer) stepsContainer.innerHTML = renderStepsHTML(execution.steps);
    const statusEl = qs(`#status-${executionId}`);
    if (statusEl) statusEl.innerHTML = badgeHtml(execution.status);
  } catch (e) { /* ignore */ }
}

function renderSteps(steps) {
  const container = qs('#steps-timeline');
  if (!container) return;
  container.innerHTML = renderStepsHTML(steps);
}

function renderStepsHTML(steps) {
  return (steps || []).map((s) => `
    <div class="step-item ${s.status}">
      <div class="step-num">${statusIcon(s.status)}</div>
      <div style="flex:1">
        <div class="step-agent">${s.agentEmoji || '🤖'} ${escHtml(s.agentName)}</div>
      </div>
      <span class="step-status">${s.status}</span>
    </div>
  `).join('');
}

function appendLogLine(log) {
  const container = qs('#log-panel');
  if (!container) return;
  const time = new Date(log.timestamp).toLocaleTimeString();
  const line = document.createElement('div');
  line.className = 'log-line';
  line.innerHTML = `
    <span class="log-time">${time}</span>
    <span class="log-level ${log.level}">${log.level.toUpperCase()}</span>
    <span class="log-msg">${escHtml(log.message)}</span>
  `;
  container.appendChild(line);
  container.scrollTop = container.scrollHeight;
}

function clearLogs() {
  const container = qs('#log-panel');
  if (container) container.innerHTML = '';
}

// ── Executions View ──────────────────────────────────────────────────────────
async function loadExecutionsView(resetPage = false) {
  if (resetPage) state.pages.executions.offset = 0;
  const { offset, limit } = state.pages.executions;
  const container = qs('#executions-list');
  container.innerHTML = '<div class="text-muted text-sm" style="padding:20px">Chargement...</div>';
  try {
    const data = await API.getExecutions({ limit, offset });
    state.executions = data.executions;
    state.pages.executions.total = data.total;

    if (data.total === 0) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><p>Aucune exécution.<br>Créez une tâche depuis <a href="#" onclick="navigate('execute')" style="color:var(--accent)">Nouvelle Tâche</a>.</p></div>`;
      return;
    }

    const cards = state.executions.map((e) => `
      <div class="card mb-12">
        <div class="flex items-center justify-between mb-8">
          <div class="flex items-center gap-8">
            <span style="font-size:20px">${statusIcon(e.status)}</span>
            <div>
              <div style="font-weight:600;font-size:14px">${escHtml(e.task.substring(0,80))}${e.task.length > 80 ? '...' : ''}</div>
              <div class="text-sm text-muted">${formatDate(e.createdAt)}</div>
            </div>
          </div>
          <div id="status-${e.id}">${badgeHtml(e.status)}</div>
        </div>
        <div id="steps-${e.id}" class="steps-list mb-8">${renderStepsHTML(e.steps)}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-sm btn-secondary" onclick="showExecutionLogs('${e.id}')">📋 Logs</button>
          <button class="btn btn-sm btn-secondary" onclick="showExecutionArtifacts('${e.id}')">📎 Artefacts</button>
          ${e.status === 'running' ? `<button class="btn btn-sm btn-danger" onclick="cancelExecution('${e.id}')">⛔ Annuler</button>` : ''}
          <button class="btn btn-sm btn-danger" onclick="deleteExecution('${e.id}')">🗑 Supprimer</button>
        </div>
      </div>
    `).join('');

    container.innerHTML = cards + renderPaginationBar('executions', data);
  } catch (err) {
    container.innerHTML = `<div class="text-red">Erreur: ${escHtml(err.message)}</div>`;
  }
}

async function showExecutionLogs(executionId) {
  try {
    const data = await API.getLogs(executionId);
    const logsHTML = data.logs.length === 0
      ? '<div class="text-muted text-sm">Aucun log disponible</div>'
      : `<div class="log-panel" style="height:400px">${data.logs.map((l) => `
          <div class="log-line">
            <span class="log-time">${new Date(l.timestamp).toLocaleTimeString()}</span>
            <span class="log-level ${l.level}">${l.level.toUpperCase()}</span>
            <span class="log-msg">${escHtml(l.message)}</span>
          </div>`).join('')}</div>`;
    showModal(`
      <div class="modal-header">
        <div class="modal-title">📋 Logs de l'exécution</div>
        <button class="modal-close" onclick="closeModal()">×</button>
      </div>
      ${logsHTML}
    `);
  } catch (err) {
    showToast(`Erreur: ${err.message}`, 'error');
  }
}

async function showExecutionArtifacts(executionId) {
  try {
    const data = await API.getArtifacts({ executionId });
    if (data.artifacts.length === 0) { showToast('Aucun artefact pour cette exécution', 'error'); return; }
    showModal(`
      <div class="modal-header">
        <div class="modal-title">📎 Artefacts (${data.artifacts.length})</div>
        <button class="modal-close" onclick="closeModal()">×</button>
      </div>
      ${data.artifacts.map((a) => `
        <div class="card mb-12">
          <div class="flex items-center justify-between mb-8">
            <div class="agent-name">${escHtml(a.agentName)}</div>
            <a href="/api/artifacts/${a.id}/download" class="btn btn-sm btn-secondary" download>⬇ Télécharger</a>
          </div>
          <div class="markdown-content">${renderMarkdown(a.content.substring(0, 500))}${a.content.length > 500 ? '<p style="color:var(--text3);font-size:11px">... (tronqué)</p>' : ''}</div>
        </div>
      `).join('')}
    `);
  } catch (err) {
    showToast(`Erreur: ${err.message}`, 'error');
  }
}

async function cancelExecution(id) {
  if (!confirm('Annuler cette exécution ?')) return;
  try {
    await API.cancelExecution(id);
    showToast('Annulation demandée', 'success');
    loadExecutionsView();
  } catch (err) {
    showToast(`Erreur: ${err.message}`, 'error');
  }
}

async function deleteExecution(id) {
  if (!confirm('Supprimer cette exécution et ses artefacts ?')) return;
  try {
    await API.deleteExecution(id);
    showToast('Exécution supprimée', 'success');
    loadExecutionsView();
  } catch (err) {
    showToast(`Erreur: ${err.message}`, 'error');
  }
}

// ── Artifacts View ───────────────────────────────────────────────────────────
async function loadArtifactsView() {
  const container = qs('#artifacts-grid');
  container.innerHTML = '<div class="text-muted text-sm" style="padding:20px">Chargement...</div>';
  try {
    const data = await API.getArtifacts();
    state.artifacts = data.artifacts;
    if (state.artifacts.length === 0) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><p>Aucun artefact généré.</p></div>`;
      return;
    }
    container.innerHTML = `<div class="artifacts-list">${state.artifacts.map((a) => `
      <div class="artifact-card">
        <div class="artifact-header">
          <div class="artifact-agent">${escHtml(a.agentName)}</div>
          <div class="artifact-date">${formatDate(a.createdAt)}</div>
        </div>
        <div class="artifact-preview">${escHtml(a.content.substring(0, 150))}</div>
        <div class="artifact-actions">
          <button class="btn btn-sm btn-secondary" onclick="showArtifactModal('${a.id}')">👁 Voir</button>
          <a href="/api/artifacts/${a.id}/download" class="btn btn-sm btn-secondary" download>⬇ MD</a>
          <a href="/api/artifacts/${a.id}/export-pdf" class="btn btn-sm btn-secondary" download>📄 PDF</a>
          <button class="btn btn-sm btn-danger" onclick="deleteArtifact('${a.id}')">🗑</button>
        </div>
      </div>
    `).join('')}</div>`;
  } catch (err) {
    container.innerHTML = `<div class="text-red">Erreur: ${escHtml(err.message)}</div>`;
  }
}

async function showArtifactModal(id) {
  try {
    const a = await API.getArtifact(id);
    showModal(`
      <div class="modal-header">
        <div class="modal-title">📄 ${escHtml(a.agentName)}</div>
        <button class="modal-close" onclick="closeModal()">×</button>
      </div>
      <div class="text-sm text-muted mb-12">${formatDate(a.createdAt)}</div>
      <div class="markdown-content">${renderMarkdown(a.content)}</div>
      <div class="btn-group mt-12">
        <a href="/api/artifacts/${a.id}/download" class="btn btn-primary" download>⬇ Markdown</a>
        <a href="/api/artifacts/${a.id}/export-pdf" class="btn btn-secondary" download>📄 PDF</a>
      </div>
    `);
    renderMermaidIn('.modal');
  } catch (err) {
    showToast(`Erreur: ${err.message}`, 'error');
  }
}

async function deleteArtifact(id) {
  if (!confirm('Supprimer cet artefact ?')) return;
  try {
    await API.deleteArtifact(id);
    showToast('Artefact supprimé', 'success');
    loadArtifactsView();
  } catch (err) {
    showToast(`Erreur: ${err.message}`, 'error');
  }
}

// ── Workflows View ───────────────────────────────────────────────────────────
let workflowSteps = [];

async function loadWorkflowsView() {
  const container = qs('#workflows-list');
  try {
    const data = await API.getWorkflows();
    state.workflows = data.workflows;
    if (state.workflows.length === 0) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">🔄</div><p>Aucun workflow. Créez-en un ci-dessus.</p></div>`;
    } else {
      container.innerHTML = state.workflows.map((wf) => `
        <div class="card mb-12">
          <div class="flex items-center justify-between mb-8">
            <div>
              <div style="font-weight:600">${escHtml(wf.name)}</div>
              <div class="text-sm text-muted">${wf.steps.length} étape(s) • ${formatDate(wf.createdAt)}</div>
            </div>
            <div style="display:flex;gap:8px">
              <button class="btn btn-sm btn-success" onclick="runWorkflow('${wf.id}')">▶ Exécuter</button>
              <a href="/api/workflows/${wf.id}/export" class="btn btn-sm btn-secondary" download>📤 Export</a>
              <button class="btn btn-sm btn-danger" onclick="deleteWorkflow('${wf.id}')">🗑</button>
            </div>
          </div>
          <div class="text-sm text-muted">${escHtml(wf.description || '')}</div>
          <div style="margin-top:10px">
            ${wf.steps.map((s, i) => `<span class="badge badge-pending" style="margin-right:4px">${i+1}. ${escHtml(s.name)}</span>`).join('')}
          </div>
        </div>
      `).join('');
    }
  } catch (err) {
    container.innerHTML = `<div class="text-red">Erreur: ${escHtml(err.message)}</div>`;
  }
  renderWorkflowSteps();
}

function renderWorkflowSteps() {
  const container = qs('#wf-steps-builder');
  if (!container) return;
  if (workflowSteps.length === 0) {
    container.innerHTML = '<div class="text-muted text-sm" style="text-align:center;padding:20px">Ajoutez des étapes ci-dessous</div>';
    return;
  }
  const agents = state.agents;
  container.innerHTML = workflowSteps.map((s, i) => `
    <div class="workflow-step">
      <div class="workflow-step-header">
        <div class="step-number-badge">${i + 1}</div>
        <input class="form-input flex-1" value="${escHtml(s.name)}" placeholder="Nom de l'étape"
               oninput="workflowSteps[${i}].name=this.value">
        <label style="display:flex;align-items:center;gap:4px;font-size:12px;color:var(--text2);white-space:nowrap;cursor:pointer">
          <input type="checkbox" ${s.parallel ? 'checked' : ''}
                 onchange="workflowSteps[${i}].parallel=this.checked">
          ⚡ Parallèle
        </label>
        <button class="remove-step-btn" onclick="removeWorkflowStep(${i})">×</button>
      </div>
      <div class="form-group">
        <label class="form-label">Tâche pour cette étape</label>
        <textarea class="form-input" rows="2" placeholder="Description de la tâche..."
                  oninput="workflowSteps[${i}].task=this.value">${escHtml(s.task)}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Agents assignés</label>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${agents.map((a) => `
            <div class="agent-chip ${s.agentIds?.includes(a.id) ? 'selected' : ''}"
                 onclick="toggleWfAgent(${i},'${a.id}')">
              <span>${a.emoji}</span><span style="font-size:11px">${escHtml(a.name.split(' – ')[0])}</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `).join('');
}

function toggleWfAgent(stepIdx, agentId) {
  const step = workflowSteps[stepIdx];
  if (!step.agentIds) step.agentIds = [];
  const idx = step.agentIds.indexOf(agentId);
  if (idx === -1) step.agentIds.push(agentId);
  else step.agentIds.splice(idx, 1);
  renderWorkflowSteps();
}

function addWorkflowStep() {
  workflowSteps.push({ name: `Étape ${workflowSteps.length + 1}`, task: '', agentIds: [] });
  renderWorkflowSteps();
}

function removeWorkflowStep(idx) {
  workflowSteps.splice(idx, 1);
  renderWorkflowSteps();
}

async function saveWorkflow() {
  const name = qs('#wf-name').value.trim();
  const description = qs('#wf-desc').value.trim();
  if (!name) { showToast('Nom du workflow requis', 'error'); return; }
  if (workflowSteps.length === 0) { showToast('Ajoutez au moins une étape', 'error'); return; }
  try {
    await API.createWorkflow({ name, description, steps: workflowSteps });
    showToast('Workflow créé !', 'success');
    qs('#wf-name').value = '';
    qs('#wf-desc').value = '';
    workflowSteps = [];
    loadWorkflowsView();
  } catch (err) {
    showToast(`Erreur: ${err.message}`, 'error');
  }
}

async function runWorkflow(id) {
  try {
    await API.runWorkflow(id);
    showToast('Workflow lancé en arrière-plan !', 'success');
    navigate('executions');
  } catch (err) {
    showToast(`Erreur: ${err.message}`, 'error');
  }
}

async function deleteWorkflow(id) {
  if (!confirm('Supprimer ce workflow ?')) return;
  try {
    await API.deleteWorkflow(id);
    showToast('Workflow supprimé', 'success');
    loadWorkflowsView();
  } catch (err) {
    showToast(`Erreur: ${err.message}`, 'error');
  }
}

// ── Settings View ────────────────────────────────────────────────────────────
async function loadSecurityConfig() {
  const container = qs('#security-config-content');
  if (!container) return;
  try {
    const cfg = await API.getSecurityConfig();
    const row = (label, value, ok) => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">
        <span style="font-size:13px;color:var(--text2)">${label}</span>
        <span style="font-weight:600;color:${ok === true ? 'var(--green)' : ok === false ? 'var(--text3)' : 'var(--text)'}">${value}</span>
      </div>`;
    container.innerHTML =
      row('Mode authentification', state.auth.mode === 'multi' ? '<span class="badge badge-completed">multi</span>' : '<span class="badge badge-pending">single</span>') +
      row('Refresh token HttpOnly cookie', cfg.cookieMode ? '✅ Actif' : '○ Désactivé', cfg.cookieMode) +
      row('Protection CSRF', cfg.csrfProtection ? '✅ Actif' : '○ Désactivé', cfg.csrfProtection) +
      row('Blacklist access tokens', cfg.blacklistEnabled ? '✅ Actif' : '○ Désactivé', cfg.blacklistEnabled) +
      row('Durée access token', `${cfg.accessTokenTtl}s (${Math.round(cfg.accessTokenTtl / 60)} min)`) +
      row('Rate limit login', `${cfg.loginRateLimitMax} req / ${Math.round(cfg.loginRateLimitWindowMs / 60000)} min`);
  } catch {
    if (container) container.innerHTML = '<div class="text-muted text-sm">Non disponible (mode single)</div>';
  }
}

async function loadSettingsView() {
  try {
    const [settings, status] = await Promise.all([API.getSettings(), API.getStatus()]);
    state.settings = settings;
    loadSecurityConfig();

    const provider = settings.currentProvider || 'mock';
    qs('#setting-provider').value = provider;
    // Show Ollama diagnostic card only when Ollama is selected
    const ollamaCard = qs('#ollama-diag-card');
    if (ollamaCard) ollamaCard.style.display = provider === 'ollama' ? 'block' : 'none';
    qs('#setting-claude-model').value = settings.claudeModel || 'claude-sonnet-4-6';
    qs('#setting-openai-model').value = settings.openaiModel || 'gpt-4o';
    qs('#setting-ollama-model').value = settings.ollamaModel || 'llama3.2';
    qs('#setting-ollama-url').value = settings.ollamaBaseUrl || 'http://localhost:11434';

    qs('#status-provider').textContent = status.provider;
    qs('#status-claude-key').textContent = status.hasClaudeKey ? '✅ Configurée' : '❌ Non configurée';
    qs('#status-openai-key').textContent = status.hasOpenAIKey ? '✅ Configurée' : '❌ Non configurée';
    qs('#status-ollama').textContent = status.ollamaUrl;
    qs('#status-mock').textContent = status.mockMode ? '✅ Actif' : '❌ Inactif';

    updateProviderBadge(status.provider);
    loadMigrationControl();
  } catch (err) {
    console.error('Settings error:', err);
  }
}

async function testProvider() {
  const resultEl = qs('#provider-test-result');
  resultEl.style.display = 'block';
  resultEl.style.color = 'var(--text2)';
  resultEl.textContent = 'Test en cours...';
  try {
    const data = await API.testProvider();
    resultEl.style.color = data.success ? 'var(--green)' : 'var(--red)';
    resultEl.textContent = data.success
      ? `✅ ${data.message}${data.preview ? ' – "' + escHtml(data.preview.substring(0, 60)) + '..."' : ''}`
      : `❌ ${escHtml(data.error)}`;
  } catch (err) {
    resultEl.style.color = 'var(--red)';
    resultEl.textContent = `❌ ${escHtml(err.message)}`;
  }
}

async function loadOllamaDiag() {
  const container = qs('#ollama-diag-content');
  container.innerHTML = '<div class="text-muted text-sm">Diagnostic en cours...</div>';
  try {
    const d = await API.getOllamaHealth();
    const icon = d.reachable ? '✅' : '❌';
    const modelsHtml = d.models.length
      ? d.models.map((m) => `<span class="badge badge-pending" style="margin:2px">${escHtml(m)}</span>`).join('')
      : '<span class="text-muted text-sm">Aucun modèle installé</span>';

    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:8px;font-size:13px">
        <div><strong>Statut :</strong> ${icon} ${d.reachable ? 'Accessible' : 'Inaccessible'}</div>
        <div><strong>URL :</strong> <code>${escHtml(d.url)}</code></div>
        <div><strong>Modèle configuré :</strong> <code>${escHtml(d.configuredModel)}</code>
          ${d.modelAvailable ? '✅ disponible' : '⚠️ absent'}</div>
        ${d.error ? `<div style="color:var(--red)">⚠️ ${escHtml(d.error)}</div>` : ''}
        ${d.hint ? `<div style="color:var(--yellow)">💡 ${escHtml(d.hint)}</div>` : ''}
        ${d.pullCommand ? `<div><strong>Commande :</strong> <code>${escHtml(d.pullCommand)}</code></div>` : ''}
        <div><strong>Modèles installés :</strong><div style="margin-top:4px">${modelsHtml}</div></div>
        <button class="btn btn-secondary btn-sm" onclick="loadOllamaDiag()" style="align-self:flex-start;margin-top:4px">🔄 Rafraîchir</button>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="text-red">Erreur: ${escHtml(err.message)}</div>`;
  }
}

async function saveSettings() {
  const body = {
    aiProvider: qs('#setting-provider').value,
    claudeModel: qs('#setting-claude-model').value,
    openaiModel: qs('#setting-openai-model').value,
    ollamaModel: qs('#setting-ollama-model').value,
    ollamaBaseUrl: qs('#setting-ollama-url').value,
  };
  try {
    await API.updateSettings(body);
    showToast('Paramètres sauvegardés !', 'success');
    updateProviderBadge(body.aiProvider);
    loadSettingsView();
  } catch (err) {
    showToast(`Erreur: ${err.message}`, 'error');
  }
}

function updateProviderBadge(provider) {
  const badge = qs('#provider-badge');
  if (!badge) return;
  const dot = badge.querySelector('.provider-dot');
  const label = badge.querySelector('#provider-label');
  if (dot) dot.className = `provider-dot ${provider === 'mock' ? 'mock' : ''}`;
  if (label) label.textContent = provider === 'mock' ? 'Mock Mode' : provider.charAt(0).toUpperCase() + provider.slice(1);
}

// ── Search View ──────────────────────────────────────────────────────────────
async function loadMigrationControl() {
  const container = qs('#migration-control-content');
  const eventsContainer = qs('#migration-events');
  if (!container) return;
  container.innerHTML = '<div class="text-muted text-sm">Chargement...</div>';
  try {
    const [status, eventData] = await Promise.all([
      API.getStorageStatus(),
      API.getStorageEvents().catch(() => ({ events: [] })),
    ]);
    const allowMutations = !!status.admin?.allowMutations;
    const runBtn = qs('#storage-run-migration-btn');
    const rollbackBtn = qs('#storage-rollback-btn');
    if (runBtn) {
      runBtn.disabled = !allowMutations;
      runBtn.title = allowMutations ? 'Confirmation requise' : 'STORAGE_ADMIN_ALLOW_MUTATIONS=false';
    }
    if (rollbackBtn) {
      rollbackBtn.disabled = !allowMutations;
      rollbackBtn.title = allowMutations ? 'Confirmation requise' : 'STORAGE_ADMIN_ALLOW_MUTATIONS=false';
    }
    container.innerHTML = renderStorageStatus(status);
    if (eventsContainer) eventsContainer.innerHTML = renderStorageEvents(eventData.events || []);
  } catch (err) {
    container.innerHTML = `<div class="text-red">Erreur: ${escHtml(err.message)}</div>`;
  }
}

function renderStorageStatus(status) {
  const collections = Object.entries(status.collections || {});
  const warnings = status.warnings || [];
  const lastReport = status.lastValidationReport;
  const reportLink = lastReport
    ? `<a href="/api/storage/validation-reports/${encodeURIComponent(lastReport.filename)}" class="text-blue" download>Telecharger dernier rapport</a>`
    : '';
  return `
    <div class="migration-status">
      <div class="migration-kpi"><span>Mode</span><strong>${escHtml(status.mode)}</strong></div>
      <div class="migration-kpi"><span>Read preference</span><strong>${escHtml(status.readPreference)}</strong></div>
      <div class="migration-kpi"><span>Double-write</span><strong>${status.doubleWrite ? 'ON' : 'OFF'}</strong></div>
      <div class="migration-kpi"><span>SQLite</span><strong>${status.sqlite?.connected ? 'connected' : 'unavailable'}</strong></div>
      <div class="migration-kpi"><span>WAL</span><strong>${status.sqlite?.wal ? 'ON' : 'OFF'}</strong></div>
      <div class="migration-kpi"><span>Mutations UI</span><strong>${status.admin?.allowMutations ? 'enabled' : 'disabled'}</strong></div>
    </div>
    ${warnings.length ? `<div class="migration-warnings">${warnings.map((w) => `<div>${escHtml(w)}</div>`).join('')}</div>` : ''}
    <div class="text-sm text-muted mt-12">
      DB: ${escHtml(status.sqlite?.dbPathSafe || 'n/a')} | last validation: ${escHtml(status.lastValidationAt || '-')}
      ${lastReport ? ` | dernier rapport: ${escHtml(lastReport.filename)}` : ''}
      ${reportLink ? ` &nbsp;${reportLink}` : ''}
    </div>
    <table class="migration-table mt-12">
      <thead><tr><th>Collection</th><th>JSON</th><th>SQLite</th><th>Sync</th></tr></thead>
      <tbody>
        ${collections.map(([name, row]) => `
          <tr>
            <td>${escHtml(name)}</td>
            <td>${row.jsonCount ?? 0}</td>
            <td>${row.sqliteCount ?? 0}</td>
            <td>${row.inSync ? '<span class="text-green">OK</span>' : '<span class="text-red">DIFF</span>'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderStorageEvents(events) {
  if (!events.length) return '<div class="text-muted text-sm">Aucun evenement.</div>';
  return events.slice(0, 20).map((event) => `
    <div class="migration-event ${escHtml(event.severity)}">
      <div style="font-weight:600">${escHtml(event.type)} ${event.collection ? `(${escHtml(event.collection)})` : ''}</div>
      <div class="text-sm text-muted">${escHtml(event.message)} | ${formatDate(event.createdAt)}</div>
    </div>
  `).join('');
}

function setMigrationOutput(data) {
  const out = qs('#migration-control-output');
  if (out) out.innerHTML = `<pre>${escHtml(JSON.stringify(data, null, 2)).slice(0, 5000)}</pre>`;
}

async function runStorageDryRunUI() {
  try {
    const data = await API.runStorageDryRun();
    setMigrationOutput(data);
    showToast('Dry-run termine', 'success');
    loadMigrationControl();
  } catch (err) { showToast(`Erreur: ${err.message}`, 'error'); }
}

async function validateStorageMigrationUI() {
  try {
    const data = await API.validateStorageMigration({ checksums: true, sampleSize: 100 });
    setMigrationOutput(data);
    showToast(data.success ? 'Validation OK' : 'Validation avec ecarts', data.success ? 'success' : 'error');
    loadMigrationControl();
  } catch (err) { showToast(`Erreur: ${err.message}`, 'error'); }
}

async function computeStorageChecksumsUI() {
  try {
    const data = await API.getStorageChecksums();
    setMigrationOutput(data);
    showToast('Checksums calcules', 'success');
    loadMigrationControl();
  } catch (err) { showToast(`Erreur: ${err.message}`, 'error'); }
}

async function exportSqliteDumpUI() {
  try {
    const data = await API.exportSqliteDump();
    setMigrationOutput(data);
    showToast(`Dump exporte: ${data.filename || data.path}`, 'success');
    loadMigrationControl();
  } catch (err) { showToast(`Erreur: ${err.message}`, 'error'); }
}

async function checkSqliteReadinessUI() {
  try {
    const data = await API.getSqliteReadiness();
    setMigrationOutput(data);
    showToast(data.ready ? 'SQLite pret' : 'SQLite non pret', data.ready ? 'success' : 'error');
  } catch (err) { showToast(`Erreur: ${err.message}`, 'error'); }
}

async function checkDesyncAlertsUI() {
  try {
    const data = await API.getDesyncAlerts();
    setMigrationOutput(data);
    showToast(data.desynced === 0 ? 'Pas de desync detecte' : `${data.desynced} desync(s) detecte(s)`, data.desynced === 0 ? 'success' : 'error');
  } catch (err) { showToast(`Erreur: ${err.message}`, 'error'); }
}

async function compareIdsByIdUI() {
  try {
    const data = await API.compareIdsAllCollections();
    setMigrationOutput(data);
    showToast(data.allInSync ? 'Tous les IDs sont syncs' : `Desyncs dans: ${data.desynced.join(', ')}`, data.allInSync ? 'success' : 'error');
    loadMigrationControl();
  } catch (err) { showToast(`Erreur: ${err.message}`, 'error'); }
}

async function listValidationReportsUI() {
  try {
    const data = await API.listValidationReports();
    setMigrationOutput(data);
    showToast(`${(data.reports || []).length} rapport(s) disponible(s)`, 'success');
  } catch (err) { showToast(`Erreur: ${err.message}`, 'error'); }
}

function downloadChecksumReportUI() {
  const a = document.createElement('a');
  a.href = '/api/storage/checksums/report.md';
  a.download = `checksum-report-${new Date().toISOString().slice(0, 10)}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast('Rapport Markdown telecharge', 'success');
}

async function checkReadinessGateUI() {
  try {
    const data = await API.getMigrationReadinessGate();
    setMigrationOutput(data);
    if (data.ready) {
      showToast('Readiness gate OK — basculement possible', 'success');
    } else {
      showToast(`Readiness gate: ${data.blockers.length} bloqueur(s)`, 'error');
    }
  } catch (err) { showToast(`Erreur: ${err.message}`, 'error'); }
}

async function switchStorageModeUI(targetMode) {
  if (!storageRiskConfirmation()) return;
  try {
    const data = await API.switchStorageMode({ mode: targetMode, confirmation: 'I_UNDERSTAND_STORAGE_RISK' });
    setMigrationOutput(data);
    showToast(`Mode bascule vers ${data.mode}`, 'success');
    loadMigrationControl();
  } catch (err) { showToast(`Erreur: ${err.message}`, 'error'); }
}

async function setDoubleWriteUI(enabled) {
  try {
    const data = await API.setDoubleWrite({ enabled, confirmation: 'I_UNDERSTAND_STORAGE_RISK' });
    setMigrationOutput(data);
    showToast(`Double-write ${data.doubleWrite ? 'active' : 'desactive'}`, 'success');
    loadMigrationControl();
  } catch (err) { showToast(`Erreur: ${err.message}`, 'error'); }
}

async function showSwitchHistoryUI() {
  try {
    const data = await API.getSwitchHistory();
    setMigrationOutput(data);
    showToast(`${(data.history || []).length} evenement(s) de switch`, 'success');
  } catch (err) { showToast(`Erreur: ${err.message}`, 'error'); }
}

function storageRiskConfirmation() {
  return prompt('Tapez exactement I_UNDERSTAND_STORAGE_RISK pour confirmer cette action.') === 'I_UNDERSTAND_STORAGE_RISK';
}

async function runStorageMigrationUI() {
  if (!storageRiskConfirmation()) return;
  try {
    const data = await API.runStorageMigration({ confirmation: 'I_UNDERSTAND_STORAGE_RISK' });
    setMigrationOutput(data);
    showToast('Migration lancee', 'success');
    loadMigrationControl();
  } catch (err) { showToast(`Erreur: ${err.message}`, 'error'); }
}

async function rollbackStorageUI() {
  if (!storageRiskConfirmation()) return;
  try {
    const data = await API.rollbackStorage({ confirmation: 'I_UNDERSTAND_STORAGE_RISK', fromSqlite: true });
    setMigrationOutput(data);
    showToast('Rollback demande', 'success');
    loadMigrationControl();
  } catch (err) { showToast(`Erreur: ${err.message}`, 'error'); }
}

function loadSearchView() {
  const container = qs('#search-results');
  if (container) container.innerHTML = '<div class="text-muted text-sm" style="padding:20px">Entrez un terme et cliquez sur Rechercher.</div>';
}

async function performSearch() {
  const input = qs('#search-input');
  const q = input ? input.value.trim() : '';
  if (!q) { showToast('Entrez un terme de recherche', 'error'); return; }

  const container = qs('#search-results');
  container.innerHTML = '<div class="text-muted text-sm" style="padding:20px">Recherche en cours...</div>';

  try {
    const data = await API.search(q);
    if (data.total === 0) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><p>Aucun résultat pour "<strong>${escHtml(q)}</strong>"</p></div>`;
      return;
    }

    const sections = [
      { key: 'workflows', label: '🔄 Workflows', nav: 'workflows' },
      { key: 'executions', label: '📋 Exécutions', nav: 'executions' },
      { key: 'artifacts', label: '📎 Artefacts', nav: 'artifacts' },
      { key: 'tasks', label: '📝 Tâches', nav: 'execute' },
    ];

    container.innerHTML = `
      <div class="text-sm text-muted mb-12">${data.total} résultat(s) pour "<strong>${escHtml(q)}</strong>"</div>
      ${sections.filter((s) => (data.results[s.key] || []).length > 0).map((s) => `
        <div class="card mb-12">
          <div class="card-title">${s.label} (${data.results[s.key].length})</div>
          ${data.results[s.key].map((item) => `
            <div class="step-item" style="cursor:pointer" onclick="navigate('${s.nav}')">
              <div style="flex:1;min-width:0">
                <div class="step-agent" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                  ${escHtml(item.name || item.task || item.agentName || item.id)}
                </div>
                <div class="text-sm text-muted">${formatDate(item.createdAt)}${item.status ? ' • ' + item.status : ''}</div>
              </div>
            </div>
          `).join('')}
        </div>
      `).join('')}
    `;
  } catch (err) {
    container.innerHTML = `<div class="text-red">Erreur: ${escHtml(err.message)}</div>`;
  }
}

// ── Workflow import ───────────────────────────────────────────────────────────
async function importWorkflowFile(input) {
  const file = input.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const workflow = data.workflow || data;
    await API.importWorkflow(workflow);
    showToast('Workflow importé !', 'success');
    input.value = '';
    loadWorkflowsView();
  } catch (err) {
    showToast(`Erreur import: ${err.message}`, 'error');
  }
}

// ── Schedules View ───────────────────────────────────────────────────────────
let schedSelectedAgentIds = [];

async function loadSchedulesView() {
  if (state.agents.length === 0) {
    const data = await API.getAgents().catch(() => ({ agents: [] }));
    state.agents = data.agents;
  }
  renderSchedAgentChips();

  const container = qs('#schedules-list');
  if (!container) return;
  container.innerHTML = '<div class="text-muted text-sm" style="padding:20px">Chargement...</div>';
  try {
    const data = await API.getSchedules();
    if (data.total === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">📅</div><p>Aucun schedule. Créez-en un ci-dessus.</p></div>';
      return;
    }
    container.innerHTML = data.schedules.map((s) => `
      <div class="card mb-12">
        <div class="flex items-center justify-between mb-8">
          <div style="flex:1;min-width:0">
            <div style="font-weight:600">${escHtml(s.name)}</div>
            <div class="text-sm text-muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
              ${escHtml(s.task.substring(0, 80))}${s.task.length > 80 ? '…' : ''}
            </div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;margin-left:12px">
            <label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;white-space:nowrap">
              <input type="checkbox" ${s.enabled ? 'checked' : ''} onchange="toggleSchedule('${s.id}',this.checked)">
              Actif
            </label>
            <button class="btn btn-sm btn-success" onclick="triggerScheduleNow('${s.id}')">▶ Déclencher</button>
            <button class="btn btn-sm btn-danger" onclick="deleteScheduleUI('${s.id}')">🗑</button>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:6px;font-size:12px;color:var(--text2)">
          <div><strong>Intervalle :</strong> ${formatInterval(s.intervalMs)}</div>
          <div><strong>Exécutions :</strong> ${s.runCount}</div>
          <div><strong>Dernière :</strong> ${s.lastRunAt ? formatDate(s.lastRunAt) : 'Jamais'}</div>
          <div><strong>Prochaine :</strong> ${s.nextRunAt ? formatDate(s.nextRunAt) : '–'}</div>
          ${s.agentIds && s.agentIds.length ? `<div><strong>Agents :</strong> ${escHtml(s.agentIds.join(', '))}</div>` : ''}
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<div class="text-red">Erreur: ${escHtml(err.message)}</div>`;
  }
}

function renderSchedAgentChips() {
  const container = qs('#sched-agent-chips');
  if (!container) return;
  container.innerHTML = state.agents.map((a) => `
    <div class="agent-chip ${schedSelectedAgentIds.includes(a.id) ? 'selected' : ''}"
         onclick="toggleSchedAgent('${a.id}')" style="font-size:11px">
      <span>${a.emoji}</span><span>${escHtml(a.name.split(' – ')[0])}</span>
    </div>
  `).join('');
}

function toggleSchedAgent(id) {
  const idx = schedSelectedAgentIds.indexOf(id);
  if (idx === -1) schedSelectedAgentIds.push(id);
  else schedSelectedAgentIds.splice(idx, 1);
  renderSchedAgentChips();
}

function schedIntervalChange() {
  const sel = qs('#sched-interval');
  const custom = qs('#sched-custom-interval');
  if (custom) custom.style.display = sel.value === 'custom' ? 'block' : 'none';
}

async function createSchedule() {
  const name = qs('#sched-name')?.value.trim();
  const task = qs('#sched-task')?.value.trim();
  const intervalSel = qs('#sched-interval')?.value;
  const intervalMs = intervalSel === 'custom'
    ? parseInt(qs('#sched-custom-ms')?.value || '0', 10)
    : parseInt(intervalSel || '3600000', 10);

  if (!name) { showToast('Nom requis', 'error'); return; }
  if (!task) { showToast('Tâche requise', 'error'); return; }
  if (!intervalMs || intervalMs <= 0) { showToast('Intervalle invalide', 'error'); return; }

  try {
    await API.createSchedule({ name, task, agentIds: schedSelectedAgentIds, intervalMs });
    showToast('Schedule créé !', 'success');
    qs('#sched-name').value = '';
    qs('#sched-task').value = '';
    schedSelectedAgentIds = [];
    loadSchedulesView();
  } catch (err) {
    showToast(`Erreur: ${err.message}`, 'error');
  }
}

async function toggleSchedule(id, enabled) {
  try {
    await API.updateSchedule(id, { enabled });
    showToast(enabled ? 'Schedule activé' : 'Schedule désactivé', 'success');
  } catch (err) {
    showToast(`Erreur: ${err.message}`, 'error');
  }
}

async function triggerScheduleNow(id) {
  try {
    const res = await API.triggerSchedule(id);
    showToast(`Exécution lancée (${res.executionId?.slice(0, 8)}…)`, 'success');
    loadSchedulesView();
  } catch (err) {
    showToast(`Erreur: ${err.message}`, 'error');
  }
}

async function deleteScheduleUI(id) {
  if (!confirm('Supprimer ce schedule ?')) return;
  try {
    await API.deleteSchedule(id);
    showToast('Schedule supprimé', 'success');
    loadSchedulesView();
  } catch (err) {
    showToast(`Erreur: ${err.message}`, 'error');
  }
}

// ── Memory View ───────────────────────────────────────────────────────────────
async function loadMemoryView(resetPage = false) {
  if (resetPage) state.pages.memory.offset = 0;
  const { offset, limit } = state.pages.memory;
  try {
    const [statsData, chunksData, embeddingStatus, evalQueries, integrity, latestEval] = await Promise.all([
      API.getMemoryStats(),
      API.getMemory({ limit, offset }),
      API.getMemoryEmbeddingStatus().catch(() => null),
      API.getMemoryEvalQueries().catch(() => ({ queries: [] })),
      API.getMemoryEmbeddingIntegrity().catch(() => null),
      API.getMemoryLatestEvaluation().catch(() => null),
    ]);
    state.pages.memory.total = chunksData.total;
    renderMemoryStats({ ...statsData, embeddingStatus });
    renderMemoryEvalQueries(evalQueries.queries || []);
    renderEmbeddingIntegrity(integrity);
    if (latestEval?.summary) renderMemoryEvaluationResults(latestEval);
    const countEl = qs('#memory-count');
    if (countEl) countEl.textContent = `${chunksData.total} chunk(s)`;

    const container = qs('#memory-chunks-list');
    if (container) {
      if (!chunksData.chunks.length && chunksData.total === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">🧠</div><p>Aucun chunk. Ajoutez du contexte ci-dessus.</p></div>';
      } else {
        container.innerHTML = chunksData.chunks.map((c) => `
          <div class="card mb-8" style="padding:12px">
            <div class="flex items-center justify-between mb-4">
              <div style="display:flex;gap:6px;align-items:center">
                <span class="badge badge-pending">${escHtml(c.source)}</span>
                ${c.agentId ? `<span class="badge badge-running" style="font-size:10px">${escHtml(c.agentId)}</span>` : ''}
              </div>
              <div style="display:flex;gap:6px;align-items:center">
                <span class="text-sm text-muted">${formatDate(c.createdAt)}</span>
                <button class="btn btn-sm btn-danger" onclick="deleteChunkUI('${c.id}')">🗑</button>
              </div>
            </div>
            <div style="font-size:12px;color:var(--text2);font-family:var(--mono);background:var(--bg3);padding:8px;border-radius:6px;white-space:pre-wrap;max-height:100px;overflow:hidden">
              ${escHtml(c.content.substring(0, 300))}${c.content.length > 300 ? '…' : ''}
            </div>
          </div>
        `).join('') + renderPaginationBar('memory', chunksData);
      }
    }
  } catch (err) {
    const c = qs('#memory-stats-content');
    if (c) c.innerHTML = `<div class="text-red">Erreur: ${escHtml(err.message)}</div>`;
  }
}

function renderMemoryStats(s) {
  const c = qs('#memory-stats-content');
  if (!c) return;
  const sources = Object.entries(s.sources || {}).map(([k, v]) => `<span class="badge badge-pending" style="margin:2px">${escHtml(k)}: ${v}</span>`).join('');
  const e = s.embeddingStatus || s.embeddings || {};
  c.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:6px;font-size:13px">
      <div><strong>Chunks :</strong> ${s.total}</div>
      <div><strong>Sources :</strong> ${sources || '<em>-</em>'}</div>
      <div><strong>Embeddings :</strong> ${e.enabled ? '<span class="badge badge-completed">ON</span>' : '<span class="badge badge-pending">OFF</span>'}</div>
      <div><strong>Provider :</strong> ${escHtml(e.provider || 'ollama')} / ${escHtml(e.model || s.embeddingModel || 'nomic-embed-text')}</div>
      <div><strong>Vectorises :</strong> ${e.count ?? s.embeddingsCount ?? 0} / ${s.total}</div>
      ${e.enabled && !e.ollamaReachable ? '<div><span class="badge badge-error">fallback keyword</span></div>' : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">
        <button class="btn btn-sm btn-secondary" onclick="reindexEmbeddingsUI()">Reindex embeddings</button>
        <button class="btn btn-sm btn-danger" onclick="clearEmbeddingsUI()">Clear embeddings</button>
      </div>
    </div>
  `;
}
function renderMemoryChunks(chunks) {
  const container = qs('#memory-chunks-list');
  if (!container) return;
  if (!chunks || chunks.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">🧠</div><p>Aucun chunk. Ajoutez du contexte ci-dessus.</p></div>';
    return;
  }
  container.innerHTML = chunks.map((c) => `
    <div class="card mb-8" style="padding:12px">
      <div class="flex items-center justify-between mb-4">
        <div style="display:flex;gap:6px;align-items:center">
          <span class="badge badge-pending">${escHtml(c.source)}</span>
          ${c.agentId ? `<span class="badge badge-running" style="font-size:10px">${escHtml(c.agentId)}</span>` : ''}
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <span class="text-sm text-muted">${formatDate(c.createdAt)}</span>
          <button class="btn btn-sm btn-danger" onclick="deleteChunkUI('${c.id}')">🗑</button>
        </div>
      </div>
      <div style="font-size:12px;color:var(--text2);font-family:var(--mono);background:var(--bg3);padding:8px;border-radius:6px;white-space:pre-wrap;max-height:100px;overflow:hidden">
        ${escHtml(c.content.substring(0, 300))}${c.content.length > 300 ? '…' : ''}
      </div>
    </div>
  `).join('');
}

async function searchMemoryChunks() {
  const q = qs('#memory-search-input')?.value.trim();
  if (!q) { showToast('Entrez un terme de recherche', 'error'); return; }
  const container = qs('#memory-search-results');
  if (container) container.innerHTML = '<div class="text-muted text-sm">Recherche...</div>';
  const mode = qs('#memory-search-mode')?.value || 'keyword';
  const topK = parseInt(qs('#memory-search-limit')?.value || '5', 10);
  try {
    const data = await API.retrieveMemory({ query: q, topK, mode, useEmbeddings: mode !== 'keyword' });
    if (container) {
      if (!data.results.length) {
        container.innerHTML = '<div class="text-muted text-sm">Aucun resultat</div>';
      } else {
        const fallback = data.modeUsed !== data.modeRequested ? '<span class="badge badge-error">fallback keyword</span>' : '';
        container.innerHTML = `<div class="text-sm text-muted mb-8">Mode utilise: <strong>${escHtml(data.modeUsed)}</strong> ${fallback}</div>` + data.results.map((r) => `
          <div style="background:var(--bg3);border-radius:6px;padding:8px;margin-bottom:6px;font-size:12px">
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:4px">
              <span class="badge badge-running">score ${Number(r.score || 0).toFixed(3)}</span>
              ${r.keywordScore !== undefined ? `<span class="badge badge-pending">kw ${Number(r.keywordScore || 0).toFixed(3)}</span>` : ''}
              ${r.vectorScore !== undefined ? `<span class="badge badge-pending">vec ${Number(r.vectorScore || 0).toFixed(3)}</span>` : ''}
              <span class="text-muted">${escHtml(r.title || r.source || '')}</span>
            </div>
            <div style="color:var(--text2);font-family:var(--mono)">${escHtml((r.excerpt || r.content || '').substring(0, 220))}${(r.excerpt || r.content || '').length > 220 ? '...' : ''}</div>
          </div>
        `).join('');
      }
    }
  } catch (err) {
    if (container) container.innerHTML = `<div class="text-red">${escHtml(err.message)}</div>`;
  }
}

async function reindexEmbeddingsUI() {
  try {
    const res = await API.reindexMemoryEmbeddings();
    showToast(`Embeddings indexes: ${res.indexed}/${res.total}`, 'success');
    loadMemoryView();
  } catch (err) { showToast(`Erreur: ${err.message}`, 'error'); }
}

async function clearEmbeddingsUI() {
  if (!confirm('Supprimer uniquement les embeddings ?')) return;
  try {
    await API.clearMemoryEmbeddings();
    showToast('Embeddings supprimes', 'success');
    loadMemoryView();
  } catch (err) { showToast(`Erreur: ${err.message}`, 'error'); }
}

async function runMemoryBenchmark() {
  const out = qs('#memory-benchmark-results');
  const queries = (qs('#memory-benchmark-queries')?.value || '').split('\n').map((q) => q.trim()).filter(Boolean);
  if (!queries.length) { showToast('Ajoutez au moins une requete', 'error'); return; }
  if (out) out.textContent = 'Benchmark...';
  try {
    const data = await API.benchmarkMemory({ queries, topK: 5 });
    if (out) out.innerHTML = data.results.map((r) => `${escHtml(r.query)}: keyword ${r.keyword.latencyMs}ms / vector ${r.vector.latencyMs}ms / hybrid ${r.hybrid.latencyMs}ms (${escHtml(r.hybrid.modeUsed)})`).join('<br>');
  } catch (err) {
    if (out) out.innerHTML = `<span class="text-red">${escHtml(err.message)}</span>`;
  }
}

function splitCsv(value) {
  return String(value || '').split(',').map((v) => v.trim()).filter(Boolean);
}

function fmtMetric(value) {
  return value == null ? 'n/a' : Number(value).toFixed(3);
}

function renderMemoryEvalQueries(queries) {
  const container = qs('#memory-eval-queries');
  if (!container) return;
  if (!queries.length) {
    container.innerHTML = '<div class="text-muted text-sm">Aucune requete.</div>';
    return;
  }
  container.innerHTML = queries.map((q) => `
    <div class="memory-eval-query">
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:12px">${escHtml(q.query)}</div>
        <div class="text-sm text-muted">${escHtml((q.expectedKeywords || []).join(', '))}</div>
      </div>
      <button class="btn btn-sm btn-danger" onclick="deleteMemoryEvalQueryUI('${q.id}')">Supprimer</button>
    </div>
  `).join('');
}

async function addMemoryEvalQueryUI() {
  const body = {
    query: qs('#memory-eval-query')?.value,
    expectedKeywords: splitCsv(qs('#memory-eval-keywords')?.value),
    expectedTypes: splitCsv(qs('#memory-eval-types')?.value),
    description: qs('#memory-eval-description')?.value,
  };
  if (!body.query || !body.expectedKeywords.length) {
    showToast('Requete et mots-cles requis', 'error');
    return;
  }
  try {
    await API.createMemoryEvalQuery(body);
    ['#memory-eval-query', '#memory-eval-keywords', '#memory-eval-types', '#memory-eval-description'].forEach((id) => { const el = qs(id); if (el) el.value = ''; });
    showToast('Requete evaluation ajoutee', 'success');
    loadMemoryView();
  } catch (err) {
    showToast(`Erreur: ${err.message}`, 'error');
  }
}

async function deleteMemoryEvalQueryUI(id) {
  try {
    await API.deleteMemoryEvalQuery(id);
    showToast('Requete evaluation supprimee', 'success');
    loadMemoryView();
  } catch (err) {
    showToast(`Erreur: ${err.message}`, 'error');
  }
}

async function runMemoryEvaluationUI() {
  const out = qs('#memory-eval-results');
  const topK = parseInt(qs('#memory-eval-topk')?.value || '5', 10);
  if (out) out.innerHTML = '<div class="text-muted text-sm">Evaluation...</div>';
  try {
    const data = await API.runMemoryEvaluation({ topK, modes: ['keyword', 'vector', 'hybrid'] });
    renderMemoryEvaluationResults(data);
  } catch (err) {
    if (out) out.innerHTML = `<div class="text-red">${escHtml(err.message)}</div>`;
  }
}

function renderMemoryEvaluationResults(data) {
  const out = qs('#memory-eval-results');
  if (!out || !data?.summary) return;
  const modes = data.summary.modes || ['keyword', 'vector', 'hybrid'];
  out.innerHTML = `
    <div class="memory-eval-summary">
      <span class="badge badge-completed">best ${escHtml(data.summary.bestMode || 'keyword')}</span>
      <span class="badge badge-pending">${data.summary.totalQueries || 0} requete(s)</span>
      ${!data.summary.embeddingsAvailable ? '<span class="badge badge-error">fallback keyword</span>' : ''}
    </div>
    <table class="memory-eval-table">
      <thead><tr><th>Mode</th><th>precision@K</th><th>recall@K</th><th>nDCG@K</th></tr></thead>
      <tbody>
        ${modes.map((mode) => `
          <tr>
            <td>${escHtml(mode)}</td>
            <td>${fmtMetric(data.summary.averagePrecisionAtK?.[mode])}</td>
            <td>${fmtMetric(data.summary.averageRecallAtK?.[mode])}</td>
            <td>${fmtMetric(data.summary.averageNdcgAtK?.[mode])}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function exportMemoryEvaluationReportUI() {
  try {
    const topK = parseInt(qs('#memory-eval-topk')?.value || '5', 10);
    const res = await API.exportMemoryEvaluationReport({ topK, modes: ['keyword', 'vector', 'hybrid'] });
    showToast(`Rapport exporte: ${res.filename}`, 'success');
  } catch (err) {
    showToast(`Erreur: ${err.message}`, 'error');
  }
}

function renderEmbeddingIntegrity(data) {
  const container = qs('#memory-integrity-content');
  if (!container) return;
  if (!data) {
    container.innerHTML = '<div class="text-muted text-sm">Indisponible</div>';
    return;
  }
  container.innerHTML = `
    <div class="stats-row" style="margin-bottom:0">
      <div class="stat-card"><div class="stat-value">${data.totalEmbeddings || 0}</div><div class="stat-label">Embeddings</div></div>
      <div class="stat-card yellow"><div class="stat-value">${data.orphans || 0}</div><div class="stat-label">Orphelins</div></div>
      <div class="stat-card blue"><div class="stat-value">${data.stale || 0}</div><div class="stat-label">Stale</div></div>
    </div>
    <div class="text-sm text-muted mt-12">Modele actif: ${escHtml(data.activeModel || '-')}</div>
  `;
}

async function loadEmbeddingIntegrityUI() {
  try {
    renderEmbeddingIntegrity(await API.getMemoryEmbeddingIntegrity());
  } catch (err) {
    showToast(`Erreur: ${err.message}`, 'error');
  }
}

async function cleanupEmbeddingsUI() {
  try {
    const res = await API.cleanupMemoryEmbeddings();
    const msg = qs('#memory-integrity-message');
    if (msg) msg.textContent = `${res.removed || 0} embedding(s) supprime(s)`;
    showToast('Cleanup embeddings termine', 'success');
    loadMemoryView();
  } catch (err) {
    showToast(`Erreur: ${err.message}`, 'error');
  }
}
async function addMemoryChunkUI() {
  const content = qs('#memory-content')?.value.trim();
  const source = qs('#memory-source')?.value || 'manual';
  if (!content) { showToast('Contenu requis', 'error'); return; }
  try {
    await API.addMemoryChunk({ content, source });
    showToast('Chunk ajouté (secrets filtrés automatiquement)', 'success');
    qs('#memory-content').value = '';
    loadMemoryView();
  } catch (err) {
    showToast(`Erreur: ${err.message}`, 'error');
  }
}

async function deleteChunkUI(id) {
  try {
    await API.deleteMemoryChunk(id);
    showToast('Chunk supprimé', 'success');
    loadMemoryView();
  } catch (err) {
    showToast(`Erreur: ${err.message}`, 'error');
  }
}

async function clearAllMemory() {
  if (!confirm('Effacer toute la mémoire ?')) return;
  try {
    await API.clearMemory();
    showToast('Mémoire effacée', 'success');
    loadMemoryView();
  } catch (err) {
    showToast(`Erreur: ${err.message}`, 'error');
  }
}

// ── Metrics View ──────────────────────────────────────────────────────────────
async function loadMetricsView() {
  try {
    const data = await API.getMetrics();
    const g = data.global;
    qs('#metric-total').textContent        = g.total;
    qs('#metric-completed').textContent    = g.completed;
    qs('#metric-errors').textContent       = (g.completedWithErrors || 0) + (g.failed || 0);
    qs('#metric-success-rate').textContent = g.successRate != null ? `${g.successRate}%` : '–';
    qs('#metric-avg-duration').textContent = g.avgDurationMs != null
      ? g.avgDurationMs < 1000 ? `${g.avgDurationMs}ms` : `${(g.avgDurationMs / 1000).toFixed(1)}s`
      : '–';

    const table = qs('#metrics-agents-table');
    const agents = Object.values(data.byAgent || {}).sort((a, b) => b.total - a.total);
    if (!agents.length) {
      table.innerHTML = '<div class="text-muted text-sm" style="padding:20px">Aucune donnée par agent (lancez des exécutions).</div>';
      return;
    }
    table.innerHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="color:var(--text3);font-size:11px;text-transform:uppercase;border-bottom:1px solid var(--border)">
            <th style="text-align:left;padding:8px 4px">Agent</th>
            <th style="text-align:center;padding:8px 4px">Total</th>
            <th style="text-align:center;padding:8px 4px">Réussis</th>
            <th style="text-align:center;padding:8px 4px">Erreurs</th>
            <th style="text-align:center;padding:8px 4px">Taux</th>
          </tr>
        </thead>
        <tbody>
          ${agents.map((a) => {
            const rate = a.successRate != null ? a.successRate : null;
            const rateColor = rate == null ? 'var(--text3)' : rate >= 80 ? 'var(--green)' : rate >= 50 ? 'var(--yellow)' : 'var(--red)';
            return `
              <tr style="border-bottom:1px solid var(--border)">
                <td style="padding:8px 4px;font-family:var(--mono);font-size:12px">${escHtml(a.agentId)}</td>
                <td style="text-align:center;padding:8px 4px">${a.total}</td>
                <td style="text-align:center;padding:8px 4px;color:var(--green)">${a.done}</td>
                <td style="text-align:center;padding:8px 4px;color:var(--red)">${a.error}</td>
                <td style="text-align:center;padding:8px 4px;color:${rateColor};font-weight:600">
                  ${rate != null ? rate + '%' : '–'}
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  } catch (err) {
    const t = qs('#metrics-agents-table');
    if (t) t.innerHTML = `<div class="text-red" style="padding:20px">Erreur: ${escHtml(err.message)}</div>`;
  }
}

// ── Utils ────────────────────────────────────────────────────────────────────
function qs(sel) { return document.querySelector(sel); }
function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function statusClass(s) {
  if (s === 'running') return 'running';
  if (s === 'done' || s === 'completed') return 'done';
  if (s === 'error' || s === 'completed_with_errors') return 'error';
  return '';
}

function statusIcon(s) {
  switch (s) {
    case 'running': return '<div class="spinner" style="width:14px;height:14px"></div>';
    case 'done': case 'completed': return '✅';
    case 'error': case 'completed_with_errors': return '❌';
    case 'cancelled': return '⛔';
    default: return '⏳';
  }
}

function badgeHtml(status) {
  return `<span class="badge badge-${status.replace(/_.*/, '')}">${status}</span>`;
}

// ── Pagination ────────────────────────────────────────────────────────────────
function renderPaginationBar(key, data) {
  if (!data || !data.hasMore && data.offset === 0) return '';
  const { offset, limit, total } = data;
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.ceil(total / limit);
  const from = offset + 1, to = Math.min(offset + limit, total);
  return `
    <div style="display:flex;gap:10px;align-items:center;justify-content:center;padding:14px 0;font-size:13px">
      <button class="btn btn-sm btn-secondary" ${offset === 0 ? 'disabled' : ''}
        onclick="changePage('${key}',-1)">◀ Précédent</button>
      <span class="text-muted">${from}–${to} sur ${total} &nbsp;(page ${page}/${pages})</span>
      <button class="btn btn-sm btn-secondary" ${!data.hasMore ? 'disabled' : ''}
        onclick="changePage('${key}',1)">Suivant ▶</button>
    </div>
  `;
}

function changePage(key, dir) {
  const p = state.pages[key];
  if (!p) return;
  p.offset = Math.max(0, p.offset + dir * p.limit);
  if (key === 'executions') loadExecutionsView();
  if (key === 'memory') loadMemoryView();
}

// ── Export / Import ───────────────────────────────────────────────────────────
function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportSchedulesUI() {
  try {
    const data = await API.exportSchedules();
    downloadJson(data, `schedules_${new Date().toISOString().slice(0,10)}.json`);
    showToast(`${data.total} schedule(s) exporté(s)`, 'success');
  } catch (err) { showToast(`Erreur: ${err.message}`, 'error'); }
}

async function importSchedulesFile(input) {
  const file = input.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const schedules = data.schedules || (Array.isArray(data) ? data : []);
    const res = await API.importSchedules(schedules);
    showToast(`${res.imported} schedule(s) importé(s)`, 'success');
    input.value = '';
    loadSchedulesView();
  } catch (err) { showToast(`Erreur import: ${err.message}`, 'error'); }
}

async function exportMemoryUI() {
  try {
    const data = await API.exportMemory();
    downloadJson(data, `memory_${new Date().toISOString().slice(0,10)}.json`);
    showToast(`${data.total} chunk(s) exporté(s)`, 'success');
  } catch (err) { showToast(`Erreur: ${err.message}`, 'error'); }
}

async function importMemoryFile(input) {
  const file = input.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const chunks = data.chunks || (Array.isArray(data) ? data : []);
    const res = await API.importMemory(chunks);
    showToast(`${res.imported} chunk(s) importé(s)`, 'success');
    input.value = '';
    loadMemoryView(true);
  } catch (err) { showToast(`Erreur import: ${err.message}`, 'error'); }
}

function formatInterval(ms) {
  if (!ms) return '–';
  const s = ms / 1000;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86400) return `${Math.round(s / 3600)} h`;
  return `${Math.round(s / 86400)} j`;
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
}

function renderMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/```mermaid\n([\s\S]*?)```/g, (_, diagram) => `<div class="mermaid">${diagram}</div>`)
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => `<pre><code class="language-${lang}">${escHtml(code)}</code></pre>`)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/^\| (.+) \|$/gm, (row) => '<tr>' + row.split('|').slice(1,-1).map((c) => `<td>${c.trim()}</td>`).join('') + '</tr>')
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/^(?!<[h|p|u|o|l|b|c|t|p])/gm, '<p>')
    .replace(/<p>(<[h|u|p|o|t|c|b|l])/g, '$1');
}

function renderMermaidIn(selector) {
  if (typeof mermaid === 'undefined') return;
  const container = typeof selector === 'string' ? document.querySelector(selector) : selector;
  if (!container) return;
  const nodes = container.querySelectorAll('.mermaid');
  if (nodes.length > 0) mermaid.run({ nodes: Array.from(nodes) });
}

let toastTimer = null;
function showToast(msg, type = 'info') {
  let toast = qs('#toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.style.cssText = 'position:fixed;bottom:24px;right:24px;padding:12px 20px;border-radius:10px;font-size:13px;font-weight:600;z-index:9999;animation:slideUp 0.2s;max-width:320px;box-shadow:0 8px 30px rgba(0,0,0,0.3)';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.background = type === 'error' ? 'rgba(239,68,68,0.95)' : type === 'success' ? 'rgba(34,197,94,0.95)' : 'rgba(108,99,255,0.95)';
  toast.style.color = '#fff';
  toast.style.display = 'block';
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { if (toast) toast.style.display = 'none'; }, 3000);
}

function showModal(html) {
  let overlay = qs('#modal-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'modal-overlay';
    overlay.className = 'modal-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `<div class="modal">${html}</div>`;
  overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  const overlay = qs('#modal-overlay');
  if (overlay) { overlay.style.display = 'none'; document.body.style.overflow = ''; }
}

// ── WebSocket Status ─────────────────────────────────────────────────────────
wsClient.on('connected', () => {
  state.wsConnected = true;
  const dot = qs('#ws-dot');
  if (dot) { dot.style.background = 'var(--green)'; dot.title = 'WebSocket connecté'; }
});
wsClient.on('disconnected', () => {
  state.wsConnected = false;
  const dot = qs('#ws-dot');
  if (dot) { dot.style.background = 'var(--red)'; dot.title = 'WebSocket déconnecté'; }
});

// Live execution updates across views
wsClient.on('execution_done', () => {
  if (state.activeView === 'executions') loadExecutionsView();
  if (state.activeView === 'dashboard') loadDashboard();
});

// Storage desync alerts from background monitor
wsClient.on('storage_desync', (event) => {
  const banner = qs('#storage-desync-banner');
  if (!banner) return;
  const count = event.desynced || 0;
  const cols = (event.alerts || []).map((a) => a.collection).join(', ');
  banner.textContent = `⚠️ Desync storage detecte dans ${count} collection(s): ${cols}`;
  banner.style.display = 'block';
  showToast(`Desync storage: ${cols}`, 'error');
});

// ── Init ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  wsClient.connect();
  updateOnboardingVisibility();

  document.querySelectorAll('.nav-item').forEach((el) => {
    el.addEventListener('click', () => navigate(el.dataset.view));
  });

  // Keyboard: press Enter in task textarea = Plan (Shift+Enter for newline)
  const taskInput = qs('#task-input');
  if (taskInput) {
    taskInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitTask(); }
    });
  }

  // When any API call returns 401, redirect to login
  window.addEventListener('auth:unauthorized', () => {
    state.auth = { mode: state.auth.mode, user: null, workspace: null };
    updateAuthUI();
    showLoginOverlay();
    showToast('Session expirée — veuillez vous reconnecter', 'error');
  });

  await initAuth();
});

// ── Sessions View (Phase 6F) ─────────────────────────────────────────────────

function sessionsPage(dir) {
  const p = state.pages.sessions;
  const newOffset = p.offset + dir * p.limit;
  if (newOffset < 0 || newOffset >= p.total) return;
  p.offset = newOffset;
  loadSessionsView();
}

function renderSessionsTable(items, isAdmin, containerId) {
  const container = qs(containerId);
  if (!container) return;
  if (!items || !items.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">🔐</div><p>Aucune session active.</p></div>';
    return;
  }
  container.innerHTML = `
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="color:var(--text2);border-bottom:1px solid var(--border)">
            ${isAdmin ? '<th style="text-align:left;padding:8px 10px;font-weight:500">Utilisateur</th>' : ''}
            <th style="text-align:left;padding:8px 10px;font-weight:500">Créée</th>
            <th style="text-align:left;padding:8px 10px;font-weight:500">Expire</th>
            <th style="text-align:left;padding:8px 10px;font-weight:500">Dernière utilisée</th>
            <th style="text-align:left;padding:8px 10px;font-weight:500">IP</th>
            <th style="text-align:left;padding:8px 10px;font-weight:500">User-Agent</th>
            <th style="text-align:left;padding:8px 10px;font-weight:500">Action</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((s) => `
            <tr style="border-bottom:1px solid var(--border)">
              ${isAdmin ? `<td style="padding:7px 10px;font-weight:500">${escHtml(s.userId || '–')}</td>` : ''}
              <td style="padding:7px 10px;color:var(--text2);white-space:nowrap">${new Date(s.createdAt).toLocaleString('fr')}</td>
              <td style="padding:7px 10px;white-space:nowrap">${new Date(s.expiresAt).toLocaleString('fr')}</td>
              <td style="padding:7px 10px;color:var(--text2);white-space:nowrap">${s.lastUsedAt ? new Date(s.lastUsedAt).toLocaleString('fr') : '–'}</td>
              <td style="padding:7px 10px;color:var(--text2);font-family:var(--mono);font-size:11px">${escHtml(s.ipAddress || '–')}</td>
              <td style="padding:7px 10px;color:var(--text2);font-size:11px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(s.userAgent || '')}">${escHtml(s.userAgent ? s.userAgent.slice(0, 35) + (s.userAgent.length > 35 ? '…' : '') : '–')}</td>
              <td style="padding:7px 10px">
                <button class="btn btn-sm" style="color:var(--red);font-size:11px" onclick="revokeSession('${escHtml(s.id)}')">Révoquer</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function loadSessionsView() {
  const container = qs('#sessions-list');
  if (!container) return;
  container.innerHTML = '<div class="text-muted text-sm">Chargement...</div>';

  const isAdmin = state.auth.user?.role === 'admin';
  const cleanupBtn = qs('#btn-auth-cleanup');
  if (cleanupBtn) cleanupBtn.style.display = isAdmin ? 'inline-flex' : 'none';

  const p = state.pages.sessions;

  try {
    const result = await API.getSessions({ limit: p.limit, offset: p.offset });
    const items = result.items || result.sessions || [];
    p.total = result.total || items.length;

    const prevBtn = qs('#sessions-prev');
    const nextBtn = qs('#sessions-next');
    const info = qs('#sessions-page-info');
    if (prevBtn) prevBtn.disabled = p.offset <= 0;
    if (nextBtn) nextBtn.disabled = !result.hasMore;
    if (info) info.textContent = `${p.offset + 1}–${p.offset + items.length} / ${p.total}`;

    renderSessionsTable(items, isAdmin, '#sessions-list');
  } catch (err) {
    const msg = err.message || '';
    if (msg.includes('401') || msg.includes('Non autorisé')) {
      container.innerHTML = '<div class="text-muted text-sm">Sessions disponibles en mode multi-utilisateur uniquement.</div>';
    } else {
      container.innerHTML = `<div class="text-red">Erreur: ${escHtml(msg)}</div>`;
    }
  }
}

async function revokeSession(id) {
  if (!confirm('Révoquer cette session ?')) return;
  try {
    await API.revokeSession(id);
    showToast('Session révoquée', 'success');
    loadSessionsView();
  } catch (err) {
    showToast(err.message || 'Erreur lors de la révocation', 'error');
  }
}

async function revokeAllOtherSessions() {
  if (!confirm('Révoquer toutes les autres sessions actives ?')) return;
  try {
    const result = await API.revokeAllSessions();
    showToast(`${result.revokedCount ?? 'Toutes les'} sessions révoquées`, 'success');
    loadSessionsView();
  } catch (err) {
    showToast(err.message || 'Erreur', 'error');
  }
}

async function runAdminCleanup() {
  const resultEl = qs('#cleanup-result');
  try {
    const result = await API.runAuthCleanup();
    if (resultEl) {
      resultEl.style.display = 'block';
      resultEl.innerHTML = `<div class="card" style="padding:12px 16px;font-size:12px">
        <div style="font-weight:600;margin-bottom:6px">Résultat cleanup</div>
        <div>Sessions supprimées : <strong>${result.sessionsRemoved ?? 0}</strong></div>
        <div>JTI supprimés : <strong>${result.jtiRemoved ?? 0}</strong></div>
        <div>Audit supprimés : <strong>${result.auditRemoved ?? 0}</strong></div>
        <div>Durée : <strong>${result.durationMs ?? 0}ms</strong></div>
      </div>`;
    }
    loadSessionsView();
  } catch (err) {
    showToast(err.message || 'Erreur cleanup', 'error');
  }
}

// ── Notification center (Phase 7) ────────────────────────────────────────────

function renderNotifications() {
  const list = qs('#notification-list');
  const banner = qs('#notification-banner');
  const historyList = qs('#notif-history-list');
  const notifs = window._notifications || [];

  if (banner) banner.style.display = notifs.length ? 'flex' : 'none';

  const TYPE_LABELS = {
    'auth:session_revoked': '🔐 Session révoquée',
    'auth:cleanup_completed': '🧹 Cleanup terminé',
    'auth:blacklist_updated': '🚫 Blacklist MAJ',
    'storage:desync_detected': '⚠ Désync storage',
    'storage:validation_completed': '✅ Validation storage',
    'rag:evaluation_completed': '📊 Évaluation RAG',
    'scheduler:job_failed': '❌ Job planificateur échoué',
    'system:health_warning': '🩺 Alerte santé',
  };

  if (list) {
    list.innerHTML = notifs.slice(0, 5).map((n) =>
      `<span style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:3px 8px;font-size:11px;white-space:nowrap">${escHtml(TYPE_LABELS[n.type] || n.type)}</span>`
    ).join('');
  }

  if (historyList) {
    if (!notifs.length) {
      historyList.innerHTML = '<div class="text-muted text-sm">Aucune notification.</div>';
    } else {
      historyList.innerHTML = `<div style="display:flex;flex-direction:column;gap:4px">
        ${notifs.map((n) => `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 8px;background:var(--bg3);border-radius:6px;font-size:12px">
            <span>${escHtml(TYPE_LABELS[n.type] || n.type)}</span>
            <span style="color:var(--text3);font-size:11px;white-space:nowrap">${n.timestamp ? new Date(n.timestamp).toLocaleTimeString('fr') : ''}</span>
          </div>
        `).join('')}
      </div>`;
    }
  }
}

function clearNotifications() {
  window._notifications = [];
  renderNotifications();
}

window.addEventListener('ws:notification', () => renderNotifications());

// Alert Center (Phase 7B)
async function loadAlertCenterView() {
  await Promise.all([loadAlertRulesUI(), loadPersistentAlertsUI(), loadReportScheduleUI()]);
}

function renderRuleRow(rule) {
  return `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;background:var(--bg3);border-radius:8px;margin-bottom:8px">
    <div style="min-width:0">
      <div style="font-weight:600;font-size:13px">${escHtml(rule.name)}</div>
      <div style="font-size:11px;color:var(--text2);font-family:var(--mono)">${escHtml(rule.metric)} ${escHtml(rule.operator)} ${escHtml(String(rule.threshold))} - ${escHtml(rule.severity)} - cooldown ${Math.round((rule.cooldownMs || 0) / 1000)}s</div>
      <div style="font-size:11px;color:var(--text3)">Derniere alerte: ${rule.lastTriggeredAt ? new Date(rule.lastTriggeredAt).toLocaleString('fr') : 'jamais'}</div>
    </div>
    <div style="display:flex;gap:6px;flex-shrink:0">
      <button class="btn btn-sm btn-secondary" onclick="toggleAlertRule('${escHtml(rule.id)}', ${rule.enabled !== false})">${rule.enabled !== false ? 'Pause' : 'Activer'}</button>
      <button class="btn btn-sm btn-danger" onclick="deleteAlertRuleUI('${escHtml(rule.id)}')">Supprimer</button>
    </div>
  </div>`;
}

async function loadAlertRulesUI() {
  const el = qs('#alert-rules-list');
  if (!el) return;
  el.innerHTML = '<div class="text-muted text-sm">Chargement...</div>';
  try {
    const { rules } = await API.getAlertRules();
    el.innerHTML = rules && rules.length ? rules.map(renderRuleRow).join('') : '<div class="text-muted text-sm">Aucune regle.</div>';
  } catch (err) {
    el.innerHTML = `<div class="text-red">${escHtml(err.message)}</div>`;
  }
}

async function createAlertRuleUI() {
  const body = {
    name: qs('#alert-rule-name')?.value?.trim(),
    metric: qs('#alert-rule-metric')?.value,
    operator: qs('#alert-rule-operator')?.value,
    threshold: Number(qs('#alert-rule-threshold')?.value || 0),
    severity: qs('#alert-rule-severity')?.value,
    cooldownMs: Number(qs('#alert-rule-cooldown')?.value || 900) * 1000,
  };
  if (!body.name) body.name = `${body.metric} ${body.operator} ${body.threshold}`;
  try {
    await API.createAlertRule(body);
    showToast('Regle ajoutee', 'success');
    loadAlertRulesUI();
  } catch (err) {
    showToast(err.message || 'Erreur', 'error');
  }
}

async function toggleAlertRule(id, enabled) {
  await API.updateAlertRule(id, { enabled: !enabled });
  loadAlertRulesUI();
}

async function deleteAlertRuleUI(id) {
  if (!confirm('Supprimer cette regle ?')) return;
  await API.deleteAlertRule(id);
  loadAlertRulesUI();
}

async function runAlertEvaluationUI() {
  try {
    const result = await API.evaluateAlerts();
    showToast(`${result.triggered.length} alerte(s) declenchee(s)`, result.triggered.length ? 'success' : 'info');
    await Promise.all([loadAlertRulesUI(), loadPersistentAlertsUI()]);
  } catch (err) {
    showToast(err.message || 'Erreur evaluation', 'error');
  }
}

function renderAlertRow(n) {
  return `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;background:${n.read ? 'var(--bg3)' : 'rgba(245,158,11,0.12)'};border:1px solid var(--border);border-radius:8px;margin-bottom:8px">
    <div style="min-width:0">
      <div style="font-weight:600;font-size:13px">${escHtml(n.title || n.type)}</div>
      <div style="font-size:12px;color:var(--text2)">${escHtml(n.message || '')}</div>
      <div style="font-size:11px;color:var(--text3)">${new Date(n.createdAt).toLocaleString('fr')} - ${escHtml(n.severity || 'info')}</div>
    </div>
    ${n.read ? '<span class="badge badge-completed">lu</span>' : `<button class="btn btn-sm btn-secondary" onclick="markAlertReadUI('${escHtml(n.id)}')">Marquer lu</button>`}
  </div>`;
}

async function loadPersistentAlertsUI() {
  const el = qs('#persistent-alerts-list');
  if (!el) return;
  el.innerHTML = '<div class="text-muted text-sm">Chargement...</div>';
  try {
    const data = await API.getAlerts({ limit: 50 });
    const badge = qs('#alert-unread-count');
    if (badge) badge.textContent = String(data.unread || 0);
    el.innerHTML = data.notifications && data.notifications.length ? data.notifications.map(renderAlertRow).join('') : '<div class="text-muted text-sm">Aucune notification persistante.</div>';
  } catch (err) {
    el.innerHTML = `<div class="text-red">${escHtml(err.message)}</div>`;
  }
}

async function markAlertReadUI(id) {
  await API.markAlertRead(id);
  loadPersistentAlertsUI();
}

async function markAllAlertsReadUI() {
  await API.markAllAlertsRead();
  loadPersistentAlertsUI();
}

async function loadReportScheduleUI() {
  const el = qs('#report-schedule-status');
  if (!el) return;
  try {
    const cfg = await API.getAdminReportSchedule();
    qs('#report-schedule-enabled').checked = !!cfg.enabled;
    qs('#report-schedule-interval').value = Math.round((cfg.intervalMs || 86400000) / 60000);
    el.textContent = `Runs: ${cfg.runCount || 0} - prochain: ${cfg.nextRunAt ? new Date(cfg.nextRunAt).toLocaleString('fr') : 'N/A'}`;
  } catch (err) {
    el.textContent = err.message || 'Indisponible';
  }
}

async function saveReportScheduleUI() {
  const enabled = !!qs('#report-schedule-enabled')?.checked;
  const intervalMs = Number(qs('#report-schedule-interval')?.value || 1440) * 60000;
  await API.updateAdminReportSchedule({ enabled, intervalMs });
  showToast('Planification enregistree', 'success');
  loadReportScheduleUI();
}

async function triggerReportScheduleUI() {
  await API.triggerAdminReportSchedule();
  showToast('Rapport genere', 'success');
  loadReportScheduleUI();
}

// ── Admin Health (Phase 7) ───────────────────────────────────────────────────

let _ahState = { sessions: { offset: 0, limit: 10, total: 0 }, audit: { offset: 0, limit: 10, total: 0 } };

function ahSessionsPage(dir) {
  const p = _ahState.sessions;
  const newOffset = p.offset + dir * p.limit;
  if (newOffset < 0 || newOffset >= p.total) return;
  p.offset = newOffset;
  loadAhSessions();
}

function ahAuditPage(dir) {
  const p = _ahState.audit;
  const newOffset = p.offset + dir * p.limit;
  if (newOffset < 0 || newOffset >= p.total) return;
  p.offset = newOffset;
  loadAhAudit();
}

function healthCard(title, items, status) {
  const colors = { ok: 'var(--green)', warning: 'var(--yellow)', critical: 'var(--red)' };
  const statusColor = colors[status] || 'var(--text2)';
  const rows = Object.entries(items).map(([k, v]) =>
    `<div style="display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-bottom:1px solid var(--border);font-size:12px">
       <span style="color:var(--text2)">${escHtml(k)}</span>
       <span style="font-family:var(--mono)">${escHtml(String(v ?? 'N/A'))}</span>
     </div>`
  ).join('');
  return `<div class="card">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
      <h3 style="margin:0;font-size:14px;flex:1">${escHtml(title)}</h3>
      ${status ? `<span style="font-size:11px;font-weight:600;color:${statusColor}">${escHtml(status.toUpperCase())}</span>` : ''}
    </div>
    ${rows}
  </div>`;
}

async function loadAhSessions() {
  const container = qs('#ah-sessions-list');
  if (!container) return;
  container.innerHTML = '<div class="text-muted text-sm">Chargement...</div>';
  const p = _ahState.sessions;
  try {
    const result = await API.getSessions({ limit: p.limit, offset: p.offset });
    const items = result.items || result.sessions || [];
    p.total = result.total || items.length;
    const prevBtn = qs('#ah-sessions-prev');
    const nextBtn = qs('#ah-sessions-next');
    const info = qs('#ah-sessions-info');
    if (prevBtn) prevBtn.disabled = p.offset <= 0;
    if (nextBtn) nextBtn.disabled = !result.hasMore;
    if (info) info.textContent = `${p.offset + 1}–${p.offset + items.length} / ${p.total}`;
    renderSessionsTable(items, true, '#ah-sessions-list');
  } catch (err) {
    container.innerHTML = `<div class="text-muted text-sm">${escHtml(err.message || 'Indisponible')}</div>`;
  }
}

async function loadAhAudit() {
  const container = qs('#ah-audit-list');
  if (!container) return;
  container.innerHTML = '<div class="text-muted text-sm">Chargement...</div>';
  const p = _ahState.audit;
  try {
    const result = await API.getAuditLog({ limit: p.limit, offset: p.offset });
    const items = result.items || result.entries || [];
    p.total = result.total || items.length;
    const prevBtn = qs('#ah-audit-prev');
    const nextBtn = qs('#ah-audit-next');
    const info = qs('#ah-audit-info');
    if (prevBtn) prevBtn.disabled = p.offset <= 0;
    if (nextBtn) nextBtn.disabled = !result.hasMore;
    if (info) info.textContent = `${p.offset + 1}–${p.offset + items.length} / ${p.total}`;
    if (!items.length) {
      container.innerHTML = '<div class="empty-state"><p>Aucune entrée.</p></div>';
      return;
    }
    container.innerHTML = `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11px">
      <thead><tr style="color:var(--text2);border-bottom:1px solid var(--border)">
        <th style="text-align:left;padding:6px 8px">Date</th>
        <th style="text-align:left;padding:6px 8px">Utilisateur</th>
        <th style="text-align:left;padding:6px 8px">Méthode</th>
        <th style="text-align:left;padding:6px 8px">Chemin</th>
        <th style="text-align:left;padding:6px 8px">Statut</th>
        <th style="text-align:left;padding:6px 8px">IP</th>
      </tr></thead>
      <tbody>${items.map((e) => `<tr style="border-bottom:1px solid var(--border)">
        <td style="padding:5px 8px;white-space:nowrap">${new Date(e.createdAt).toLocaleString('fr')}</td>
        <td style="padding:5px 8px">${escHtml(e.username || '–')}</td>
        <td style="padding:5px 8px;font-family:var(--mono)">${escHtml(e.method || '')}</td>
        <td style="padding:5px 8px;font-family:var(--mono);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(e.path || '')}</td>
        <td style="padding:5px 8px;color:${e.statusCode >= 400 ? 'var(--red)' : 'var(--green)'}">${escHtml(String(e.statusCode || ''))}</td>
        <td style="padding:5px 8px;font-family:var(--mono);font-size:10px">${escHtml(e.ipAddress || '–')}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  } catch (err) {
    container.innerHTML = `<div class="text-muted text-sm">${escHtml(err.message || 'Indisponible')}</div>`;
  }
}

async function loadAdminHealthView() {
  const grid = qs('#health-grid');
  if (grid) grid.innerHTML = '<div class="card"><div class="text-muted text-sm">Chargement...</div></div>';

  renderNotifications();

  // Update CSV export link
  const csvLink = qs('#btn-export-audit-csv');
  if (csvLink) {
    const token = window.AuthToken.get();
    csvLink.href = `${window.location.origin}/api/auth/audit-log/export.csv`;
    if (token) csvLink.href += `?_t=${Date.now()}`;
  }

  try {
    const h = await API.getAdminHealth();

    if (grid) {
      grid.innerHTML = [
        healthCard('System', {
          Uptime: `${h.system.uptimeSec}s`,
          'Heap Used': `${h.system.memory.heapUsed} MB`,
          'Heap Total': `${h.system.memory.heapTotal} MB`,
          Node: h.system.nodeVersion,
          Platform: h.system.platform,
        }, h.status),
        healthCard('Storage', {
          Mode: h.storage.mode,
          'SQLite Connected': h.storage.sqliteConnected,
          'Last Validation': h.storage.lastValidationAt || 'N/A',
          'Desync Alerts': h.storage.desyncAlerts,
        }),
        healthCard('Auth', {
          Mode: h.auth.mode,
          'Active Sessions': h.auth.activeSessions,
          'Blacklist Count': h.auth.blacklistCount,
          'Cleanup Enabled': h.auth.cleanupEnabled,
        }),
        healthCard('RAG / Memory', {
          'Memory Items': h.rag.memoryItems,
          'Embeddings Enabled': h.rag.embeddingsEnabled,
          'Embeddings Count': h.rag.embeddingsCount,
          'Last Evaluation': h.rag.lastEvaluationAt || 'N/A',
        }),
        healthCard('Scheduler', {
          Enabled: h.scheduler.enabled,
          'Schedules Count': h.scheduler.schedulesCount,
          'Last Run': h.scheduler.lastRunAt || 'N/A',
        }),
        healthCard('Tests', { 'Last Known Total': h.tests.lastKnownTotal }),
      ].join('');
    }

    _ahState.sessions.offset = 0;
    _ahState.audit.offset = 0;
    await Promise.all([loadAhSessions(), loadAhAudit()]);
  } catch (err) {
    if (grid) grid.innerHTML = `<div class="card"><div class="text-red">Erreur: ${escHtml(err.message || '')}</div></div>`;
  }
}

async function downloadAdminReport(format) {
  const url = format === 'md' ? API.getAdminReportMdUrl() : `${window.location.origin}/api/admin/report.json`;
  const token = window.AuthToken.get();
  try {
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    if (!res.ok) { showToast('Erreur téléchargement rapport', 'error'); return; }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = format === 'md' ? 'admin-report.md' : 'admin-report.json';
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    showToast(err.message || 'Erreur', 'error');
  }
}

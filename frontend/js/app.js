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
  },
};

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
    case 'dashboard': loadDashboard(); break;
    case 'agents': loadAgentsView(); break;
    case 'execute': loadExecuteView(); break;
    case 'executions': loadExecutionsView(); break;
    case 'artifacts': loadArtifactsView(); break;
    case 'workflows': loadWorkflowsView(); break;
    case 'settings': loadSettingsView(); break;
    case 'search': loadSearchView(); break;
    case 'schedules': loadSchedulesView(); break;
    case 'memory': loadMemoryView(); break;
    case 'metrics': loadMetricsView(); break;
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
    const result = await API.createTask({ task, agentIds: state.selectedAgentIds });
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
async function loadSettingsView() {
  try {
    const [settings, status] = await Promise.all([API.getSettings(), API.getStatus()]);
    state.settings = settings;

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

  navigate('dashboard');
});

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
  }
}

// ── Dashboard ────────────────────────────────────────────────────────────────
async function loadDashboard() {
  try {
    const [execData, artData, wfData, agData] = await Promise.all([
      API.getExecutions(),
      API.getArtifacts(),
      API.getWorkflows(),
      API.getAgents(),
    ]);
    state.executions = execData.executions;
    state.artifacts = artData.artifacts;
    state.workflows = wfData.workflows;
    state.agents = agData.agents;

    const running = state.executions.filter((e) => e.status === 'running').length;
    const completed = state.executions.filter((e) => e.status === 'completed' || e.status === 'completed_with_errors').length;

    qs('#stat-agents').textContent = state.agents.length;
    qs('#stat-executions').textContent = state.executions.length;
    qs('#stat-running').textContent = running;
    qs('#stat-artifacts').textContent = state.artifacts.length;

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
async function loadExecutionsView() {
  const container = qs('#executions-list');
  container.innerHTML = '<div class="text-muted text-sm" style="padding:20px">Chargement...</div>';
  try {
    const data = await API.getExecutions();
    state.executions = data.executions;
    if (state.executions.length === 0) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><p>Aucune exécution.<br>Créez une tâche depuis <a href="#" onclick="navigate('execute')" style="color:var(--accent)">Nouvelle Tâche</a>.</p></div>`;
      return;
    }
    container.innerHTML = state.executions.map((e) => `
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
          <a href="/api/artifacts/${a.id}/download" class="btn btn-sm btn-secondary" download>⬇ DL</a>
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
        <a href="/api/artifacts/${a.id}/download" class="btn btn-primary" download>⬇ Télécharger</a>
      </div>
    `);
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

    qs('#setting-provider').value = settings.currentProvider || 'mock';
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
  } catch (err) {
    console.error('Settings error:', err);
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

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
}

function renderMarkdown(text) {
  if (!text) return '';
  return text
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

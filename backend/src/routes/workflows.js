'use strict';

const express = require('express');
const { v4: uuid } = require('uuid');
const { runWorkflow } = require('../engine/workflow-runner');
const storage = require('../storage');

const router = express.Router();

// POST /api/workflows
router.post('/', (req, res) => {
  const { name, description, steps } = req.body;
  if (!name || !steps || !Array.isArray(steps) || steps.length === 0) {
    return res.status(400).json({ error: 'Champs requis: name, steps (array non vide)' });
  }

  const workflow = {
    id: uuid(),
    name,
    description: description || '',
    steps: steps.map((s, i) => ({
      id: uuid(),
      order: i + 1,
      name: s.name || `Étape ${i + 1}`,
      task: s.task || '',
      agentIds: s.agentIds || [],
      parallel: s.parallel === true,
    })),
    createdAt: new Date().toISOString(),
  };
  storage.create('workflows', workflow);
  res.status(201).json(workflow);
});

// GET /api/workflows
router.get('/', (req, res) => {
  const workflows = storage
    .findAll('workflows')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ workflows, total: workflows.length });
});

// GET /api/workflows/export-all – export all workflows as JSON
router.get('/export-all', (req, res) => {
  const workflows = storage.findAll('workflows');
  const ts = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="workflows_${ts}.json"`);
  res.json({ exportedAt: new Date().toISOString(), workflows });
});

// POST /api/workflows/import – create workflow from exported JSON
router.post('/import', (req, res) => {
  const source = req.body.workflow || req.body;
  if (!source || !source.name || !Array.isArray(source.steps) || source.steps.length === 0) {
    return res.status(400).json({ error: 'JSON invalide: name et steps requis' });
  }

  const workflow = {
    id: uuid(),
    name: source.name,
    description: source.description || '',
    steps: source.steps.map((s, i) => ({
      id: uuid(),
      order: i + 1,
      name: s.name || `Étape ${i + 1}`,
      task: s.task || '',
      agentIds: s.agentIds || [],
      parallel: s.parallel === true,
    })),
    importedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
  storage.create('workflows', workflow);
  res.status(201).json(workflow);
});

// GET /api/workflows/:id
router.get('/:id', (req, res) => {
  const wf = storage.findById('workflows', req.params.id);
  if (!wf) return res.status(404).json({ error: 'Workflow introuvable' });
  res.json(wf);
});

// PUT /api/workflows/:id
router.put('/:id', (req, res) => {
  const wf = storage.findById('workflows', req.params.id);
  if (!wf) return res.status(404).json({ error: 'Workflow introuvable' });
  const updated = storage.update('workflows', req.params.id, req.body);
  res.json(updated);
});

// DELETE /api/workflows/:id
router.delete('/:id', (req, res) => {
  const ok = storage.remove('workflows', req.params.id);
  if (!ok) return res.status(404).json({ error: 'Workflow introuvable' });
  res.json({ message: 'Workflow supprimé' });
});

// POST /api/workflows/:id/run
router.post('/:id/run', async (req, res) => {
  const wf = storage.findById('workflows', req.params.id);
  if (!wf) return res.status(404).json({ error: 'Workflow introuvable' });
  try {
    res.json({ message: 'Workflow lancé en arrière-plan', workflowId: wf.id });
    runWorkflow(wf.id).catch(console.error);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/workflows/:id/export – download specific workflow as JSON
router.get('/:id/export', (req, res) => {
  const wf = storage.findById('workflows', req.params.id);
  if (!wf) return res.status(404).json({ error: 'Workflow introuvable' });
  const filename = `workflow_${wf.id.substring(0, 8)}.json`;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.json({ exportedAt: new Date().toISOString(), workflow: wf });
});

// GET /api/workflows/:id/runs
router.get('/:id/runs', (req, res) => {
  const runs = storage
    .findAll('workflow_runs')
    .filter((r) => r.workflowId === req.params.id)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  res.json({ runs, total: runs.length });
});

module.exports = router;

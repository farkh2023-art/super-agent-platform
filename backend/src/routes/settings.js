'use strict';

const express = require('express');
const storage = require('../storage');
const { getProvider } = require('../providers/factory');

const router = express.Router();

const DEFAULTS = {
  aiProvider: 'mock',
  claudeModel: 'claude-sonnet-4-6',
  openaiModel: 'gpt-4o',
  ollamaModel: 'llama3.2',
  ollamaBaseUrl: 'http://localhost:11434',
};

// GET /api/settings
router.get('/', (req, res) => {
  const saved = storage.readRecord('settings');
  const settings = { ...DEFAULTS, ...saved };
  settings.currentProvider = getProvider();
  // Never return API keys
  delete settings.anthropicApiKey;
  delete settings.openaiApiKey;
  res.json(settings);
});

// PUT /api/settings
router.put('/', (req, res) => {
  const allowed = ['aiProvider', 'claudeModel', 'openaiModel', 'ollamaModel', 'ollamaBaseUrl'];
  const patch = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) patch[key] = req.body[key];
  }

  // Apply env vars for provider selection
  if (patch.aiProvider) {
    process.env.AI_PROVIDER = patch.aiProvider;
  }
  if (patch.claudeModel) process.env.CLAUDE_MODEL = patch.claudeModel;
  if (patch.openaiModel) process.env.OPENAI_MODEL = patch.openaiModel;
  if (patch.ollamaModel) process.env.OLLAMA_MODEL = patch.ollamaModel;
  if (patch.ollamaBaseUrl) process.env.OLLAMA_BASE_URL = patch.ollamaBaseUrl;

  const current = storage.readRecord('settings');
  storage.writeRecord('settings', { ...current, ...patch });
  res.json({ message: 'Paramètres mis à jour', settings: patch });
});

// GET /api/settings/status – provider health summary
router.get('/status', (req, res) => {
  res.json({
    provider:     getProvider(),
    hasClaudeKey: !!process.env.ANTHROPIC_API_KEY,
    hasOpenAIKey: !!process.env.OPENAI_API_KEY,
    claudeModel:  process.env.CLAUDE_MODEL  || 'claude-sonnet-4-6',
    openaiModel:  process.env.OPENAI_MODEL  || 'gpt-4o',
    ollamaUrl:    process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    ollamaModel:  process.env.OLLAMA_MODEL  || 'llama3.2',
    mockMode:           getProvider() === 'mock',
    webhookConfigured:  !!process.env.WEBHOOK_URL,
    authEnabled:        !!process.env.API_KEY,
  });
});

// GET /api/settings/ollama-health – detailed Ollama diagnostics
router.get('/ollama-health', async (req, res) => {
  const { diagnoseOllama } = require('../providers/ollama');
  try {
    const diagnosis = await diagnoseOllama();
    res.json(diagnosis);
  } catch (err) {
    res.status(500).json({ reachable: false, error: err.message });
  }
});

// POST /api/settings/test-provider – smoke-test the active provider
router.post('/test-provider', async (req, res) => {
  const provider = getProvider();
  if (provider === 'mock') {
    return res.json({ success: true, provider: 'mock', message: 'Mode Mock actif – aucun appel API réel' });
  }
  const { callAI } = require('../providers/factory');
  try {
    const result = await callAI('test', 'Réponds uniquement le mot: OK', 'Test de connexion.');
    res.json({ success: true, provider, message: 'Connexion réussie', preview: String(result).substring(0, 120) });
  } catch (err) {
    res.status(400).json({ success: false, provider, error: err.message });
  }
});

module.exports = router;

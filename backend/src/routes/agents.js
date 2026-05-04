'use strict';

const express = require('express');
const { getAllAgents, getAgentById, getAgentsByCategory } = require('../agents/registry');

const router = express.Router();

router.get('/', (req, res) => {
  const { category } = req.query;
  const agents = category ? getAgentsByCategory(category) : getAllAgents();
  res.json({ agents, total: agents.length });
});

router.get('/categories', (req, res) => {
  const cats = [...new Set(getAllAgents().map((a) => a.category))];
  res.json({ categories: cats });
});

router.get('/:id', (req, res) => {
  const agent = getAgentById(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent introuvable' });
  res.json(agent);
});

module.exports = router;

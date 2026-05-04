'use strict';

const express = require('express');
const storage = require('../storage');
const { addChunk, search, retrieve, listChunks, removeChunk, clearMemory, stats, reindexEmbeddings } = require('../memory/retriever');
const { getEmbeddingStatus } = require('../memory/embeddings');
const embeddingStore = require('../memory/embeddingStore');
const evaluator = require('../memory/evaluator');

const router = express.Router();

// GET /api/memory/stats
router.get('/stats', async (req, res) => {
  res.json(await stats());
});

// GET /api/memory/search?q=...&limit=5
router.get('/search', async (req, res) => {
  const q = req.query.q;
  if (!q || !q.trim()) return res.status(400).json({ error: 'Paramètre "q" requis' });
  const limit = parseInt(req.query.limit || '5', 10);
  try {
    const results = await search(q.trim(), limit);
    const sanitized = results.map(({ embedding, ...c }) => c);
    res.json({ results: sanitized, total: sanitized.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/memory/retrieve
router.post('/retrieve', async (req, res) => {
  const { query, topK = 5, mode = 'keyword', types, useEmbeddings } = req.body || {};
  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ error: 'Le champ "query" est requis' });
  }
  try {
    const data = await retrieve(query.trim(), { topK, mode, types, useEmbeddings });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/embeddings/status', async (req, res) => {
  res.json(await getEmbeddingStatus());
});

router.post('/embeddings/reindex', async (req, res) => {
  try {
    const result = await reindexEmbeddings();
    res.json({ message: 'Embeddings reindexed', ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/embeddings/reindex/:id', async (req, res) => {
  try {
    const result = await reindexEmbeddings(req.params.id);
    res.json({ message: 'Embedding reindexed', ...result });
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.message });
  }
});

router.delete('/embeddings', (req, res) => {
  embeddingStore.clearEmbeddings();
  res.json({ message: 'Embeddings effaces' });
});

router.get('/embeddings/integrity', (req, res) => {
  const strict = String(req.query.strict || '').toLowerCase() === 'true';
  res.json(embeddingStore.getEmbeddingIntegrityStatus({ strict }));
});

router.post('/embeddings/cleanup', (req, res) => {
  const strict = req.body?.strict === true;
  const result = embeddingStore.cleanupOrphanEmbeddings({ strict });
  res.json({
    totalEmbeddings: result.totalEmbeddings,
    orphans: result.orphans,
    stale: result.stale,
    removed: result.removed,
  });
});

router.get('/evaluation/queries', (req, res) => {
  res.json(evaluator.readEvalQueries());
});

router.post('/evaluation/queries', (req, res) => {
  try {
    const data = evaluator.readEvalQueries();
    const query = evaluator.sanitizeQueryConfig(req.body || {});
    if (data.queries.some((q) => q.id === query.id)) {
      query.id = `eval-${Date.now().toString(36)}`;
    }
    data.queries.push(query);
    evaluator.writeEvalQueries(data.queries);
    res.status(201).json(query);
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.message });
  }
});

router.put('/evaluation/queries/:id', (req, res) => {
  try {
    const data = evaluator.readEvalQueries();
    const idx = data.queries.findIndex((q) => q.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Requete evaluation introuvable' });
    const updated = evaluator.sanitizeQueryConfig({ ...data.queries[idx], ...(req.body || {}) }, req.params.id);
    data.queries[idx] = updated;
    evaluator.writeEvalQueries(data.queries);
    res.json(updated);
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.message });
  }
});

router.delete('/evaluation/queries/:id', (req, res) => {
  const data = evaluator.readEvalQueries();
  const before = data.queries.length;
  const queries = data.queries.filter((q) => q.id !== req.params.id);
  if (queries.length === before) return res.status(404).json({ error: 'Requete evaluation introuvable' });
  evaluator.writeEvalQueries(queries);
  res.json({ message: 'Requete evaluation supprimee' });
});

router.post('/evaluation/run', async (req, res) => {
  try {
    const topK = req.body?.topK || 5;
    const modes = req.body?.modes || ['keyword', 'vector', 'hybrid'];
    const result = await evaluator.evaluateAll({ modes, topK });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/evaluation/latest', (req, res) => {
  const latest = evaluator.getLatestEvaluation();
  if (!latest) return res.json({ summary: null, results: [] });
  res.json(latest);
});

router.post('/evaluation/export-report', async (req, res) => {
  try {
    let latest = evaluator.getLatestEvaluation();
    if (!latest) latest = await evaluator.evaluateAll({ topK: req.body?.topK || 5, modes: req.body?.modes });
    const report = evaluator.exportMarkdownReport(latest);
    res.json({ filename: report.filename, path: report.path, markdown: report.markdown });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/benchmark', async (req, res) => {
  const queries = Array.isArray(req.body?.queries) ? req.body.queries.filter((q) => typeof q === 'string' && q.trim()) : [];
  const topK = req.body?.topK || 5;
  if (queries.length === 0) return res.status(400).json({ error: 'Le champ "queries" doit etre un tableau non vide' });

  const results = [];
  for (const query of queries) {
    const row = { query };
    for (const mode of ['keyword', 'vector', 'hybrid']) {
      const start = Date.now();
      const data = await retrieve(query, { topK, mode, useEmbeddings: mode !== 'keyword' });
      row[mode] = {
        count: data.results.length,
        latencyMs: Date.now() - start,
        available: mode === 'keyword' ? true : data.embeddingsAvailable,
        modeUsed: data.modeUsed,
      };
    }
    results.push(row);
  }
  const hybridUsed = results.filter((r) => r.hybrid.modeUsed === 'hybrid').length;
  res.json({
    queries,
    results,
    summary: {
      bestMode: hybridUsed > 0 ? 'hybrid' : 'keyword',
      embeddingsAvailable: results.some((r) => r.hybrid.available || r.vector.available),
    },
  });
});

// GET /api/memory/export
router.get('/export', (req, res) => {
  const chunks = listChunks().map(({ embedding, ...c }) => c);
  res.setHeader('Content-Disposition', 'attachment; filename="memory_export.json"');
  res.json({ chunks, total: chunks.length, exportedAt: new Date().toISOString() });
});

// POST /api/memory/import
router.post('/import', async (req, res) => {
  const { chunks } = req.body;
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return res.status(400).json({ error: '"chunks" doit être un tableau non vide' });
  }
  const imported = [];
  for (const c of chunks) {
    if (!c.content || typeof c.content !== 'string') continue;
    const chunk = await addChunk({
      content: c.content,
      source: c.source || 'import',
      agentId: c.agentId || null,
      tags: c.tags || [],
    }).catch(() => null);
    if (chunk) { const { embedding, ...safe } = chunk; imported.push(safe); }
  }
  res.json({ imported: imported.length, chunks: imported });
});

// GET /api/memory
router.get('/', (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit  || '50',  10), 200);
  const offset = Math.max(parseInt(req.query.offset || '0',   10), 0);
  const all    = listChunks()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(({ embedding, ...c }) => c);
  const total  = all.length;
  const chunks = all.slice(offset, offset + limit);
  res.json({ chunks, total, limit, offset, hasMore: offset + limit < total });
});

// POST /api/memory
router.post('/', async (req, res) => {
  const { content, source, sourceId, agentId, tags } = req.body;
  if (!content || typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ error: 'Le champ "content" est requis' });
  }
  try {
    const chunk = await addChunk({ content, source, sourceId, agentId, tags });
    const { embedding, ...safe } = chunk;
    res.status(201).json(safe);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/memory (clear all)
router.delete('/', (req, res) => {
  clearMemory();
  res.json({ message: 'Mémoire effacée' });
});

// DELETE /api/memory/:id
router.delete('/:id', (req, res) => {
  const ok = removeChunk(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Chunk introuvable' });
  res.json({ message: 'Chunk supprimé' });
});

module.exports = router;

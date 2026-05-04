'use strict';

const { v4: uuid } = require('uuid');
const storage = require('../storage');
const { sanitizeContent } = require('./sanitize');
const { chunkText, buildChunkTitle } = require('./chunker');
const embeddingStore = require('./embeddingStore');
const {
  isEmbeddingsEnabled,
  getEmbeddingConfig,
  generateEmbedding,
  cosineSimilarity,
  getEmbeddingStatus,
  estimateEmbeddingReadiness,
  contentHash,
} = require('./embeddings');

function tokenize(text) {
  return String(text || '').toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u017f\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function keywordScore(queryTokens, content) {
  const cSet = new Set(tokenize(content));
  let hits = 0;
  for (const t of queryTokens) if (cSet.has(t)) hits++;
  return queryTokens.length > 0 ? hits / queryTokens.length : 0;
}

function toResult(item, scores) {
  const content = item.content || '';
  return {
    id: item.id,
    title: item.title || item.sourcePath || item.sourceId || item.source || 'memory',
    type: item.type || item.source || 'manual_note',
    score: Number((scores.score || 0).toFixed(6)),
    keywordScore: scores.keywordScore != null ? Number(scores.keywordScore.toFixed(6)) : undefined,
    vectorScore: scores.vectorScore != null ? Number(scores.vectorScore.toFixed(6)) : undefined,
    excerpt: content.slice(0, 420),
    content,
    source: item.source,
    sourceId: item.sourceId || null,
    agentId: item.agentId || null,
    tags: item.tags || [],
    metadata: item.metadata || {},
    createdAt: item.createdAt,
  };
}

async function ensureEmbeddingForItem(item, config) {
  const hash = contentHash(item.content);
  const existing = embeddingStore.getEmbedding(item.id, config.model);
  if (existing && existing.contentHash === hash && Array.isArray(existing.embedding)) return existing;
  const embedding = await generateEmbedding(item.content);
  return embeddingStore.upsertEmbedding({
    memoryId: item.id,
    model: config.model,
    embedding,
    contentHash: hash,
    createdAt: new Date().toISOString(),
  });
}

async function addChunk({ content, source = 'manual', sourceId = null, sourcePath = null, agentId = null, tags = [], type = null, title = null, metadata = {} }) {
  const clean = sanitizeContent(content);
  const pieces = chunkText(clean);
  const created = [];
  for (let i = 0; i < pieces.length; i++) {
    const chunk = {
      id: uuid(),
      content: pieces[i],
      title: title || buildChunkTitle({ source, sourceId, sourcePath }, i),
      type: type || (source === 'artifact' ? 'artifact' : 'manual_note'),
      source,
      sourceId,
      sourcePath,
      agentId,
      tags,
      metadata: { ...metadata, chunkIndex: i, chunkCount: pieces.length },
      createdAt: new Date().toISOString(),
    };
    storage.create('memory', chunk);
    created.push(chunk);
  }
  return created[0];
}

async function retrieve(query, options = {}) {
  const modeRequested = ['keyword', 'vector', 'hybrid'].includes(options.mode) ? options.mode : 'keyword';
  const topK = Math.max(1, Math.min(parseInt(options.topK || options.limit || '5', 10), 50));
  const types = Array.isArray(options.types) ? options.types.filter(Boolean) : null;
  const config = getEmbeddingConfig();
  const allItems = storage.findAll('memory')
    .filter((item) => !types || types.includes(item.type) || types.includes(item.source));
  const qTokens = tokenize(query);

  let modeUsed = modeRequested;
  let embeddingsAvailable = false;
  let queryEmbedding = null;
  let fallbackReason = null;
  const wantsVector = modeRequested === 'vector' || modeRequested === 'hybrid' || options.useEmbeddings === true;

  if (wantsVector && isEmbeddingsEnabled()) {
    try {
      queryEmbedding = await generateEmbedding(query);
      embeddingsAvailable = true;
    } catch (err) {
      modeUsed = 'keyword';
      fallbackReason = err.message;
    }
  } else if (wantsVector) {
    modeUsed = 'keyword';
    fallbackReason = 'Embeddings disabled';
  }

  if (!embeddingsAvailable && (modeRequested === 'vector' || modeRequested === 'hybrid')) {
    modeUsed = 'keyword';
  }

  const scored = [];
  for (const item of allItems) {
    const kScore = keywordScore(qTokens, `${item.title || ''} ${item.content || ''} ${(item.tags || []).join(' ')}`);
    let vScore = null;
    if (embeddingsAvailable && queryEmbedding) {
      try {
        const rec = await ensureEmbeddingForItem(item, config);
        vScore = cosineSimilarity(queryEmbedding, rec.embedding);
      } catch (err) {
        vScore = null;
      }
    }

    let score = kScore;
    if (modeUsed === 'vector') score = vScore || 0;
    if (modeUsed === 'hybrid') {
      const alpha = Math.max(0, Math.min(config.hybridAlpha, 1));
      score = alpha * (vScore || 0) + (1 - alpha) * kScore;
    }
    if (score > 0) scored.push(toResult(item, { score, keywordScore: kScore, vectorScore: vScore }));
  }

  scored.sort((a, b) => b.score - a.score);
  return {
    query,
    modeRequested,
    modeUsed,
    embeddingsAvailable,
    fallbackReason,
    results: scored.slice(0, topK),
  };
}

async function search(query, limit = 5) {
  const data = await retrieve(query, { topK: limit, mode: 'keyword' });
  return data.results;
}

function listChunks() {
  return storage.findAll('memory');
}

function removeChunk(id) {
  embeddingStore.removeEmbedding(id);
  return storage.remove('memory', id);
}

function clearMemory() {
  storage.clear('memory');
  embeddingStore.clearEmbeddings();
}

async function reindexEmbeddings(memoryId = null) {
  const config = getEmbeddingConfig();
  if (!isEmbeddingsEnabled()) throw new Error('Memory embeddings disabled');
  const items = listChunks().filter((i) => !memoryId || i.id === memoryId);
  if (memoryId && items.length === 0) {
    const err = new Error('Memory item not found');
    err.statusCode = 404;
    throw err;
  }
  let indexed = 0;
  const errors = [];
  for (const item of items) {
    try {
      await ensureEmbeddingForItem(item, config);
      indexed++;
    } catch (err) {
      errors.push({ memoryId: item.id, error: err.message });
      if (memoryId) throw err;
    }
  }
  const metadata = embeddingStore.markReindexed();
  return { indexed, total: items.length, errors, metadata };
}

async function stats() {
  const chunks = listChunks();
  const sources = {};
  for (const c of chunks) sources[c.source] = (sources[c.source] || 0) + 1;
  const status = await getEmbeddingStatus();
  const readiness = estimateEmbeddingReadiness(chunks);
  return {
    total: chunks.length,
    sources,
    embeddingsEnabled: status.enabled,
    embeddingModel: status.model,
    embeddingsCount: status.count,
    embeddings: { ...status, readiness },
  };
}

module.exports = {
  addChunk,
  search,
  retrieve,
  listChunks,
  removeChunk,
  clearMemory,
  stats,
  reindexEmbeddings,
};

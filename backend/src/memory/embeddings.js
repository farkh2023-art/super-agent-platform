'use strict';

const crypto = require('crypto');
const { sanitizeContent } = require('./sanitize');
const embeddingStore = require('./embeddingStore');
const { generateOllamaEmbedding, diagnoseOllama } = require('../providers/ollama');

function envBool(value) {
  return String(value || '').toLowerCase() === 'true';
}

function isEmbeddingsEnabled() {
  return envBool(process.env.MEMORY_EMBEDDINGS);
}

function getEmbeddingConfig() {
  return {
    enabled: isEmbeddingsEnabled(),
    provider: process.env.MEMORY_EMBEDDING_PROVIDER || 'ollama',
    model: process.env.MEMORY_EMBEDDING_MODEL || 'nomic-embed-text',
    dimensions: process.env.MEMORY_EMBEDDING_DIMENSIONS ? parseInt(process.env.MEMORY_EMBEDDING_DIMENSIONS, 10) : null,
    hybridAlpha: Number.isFinite(parseFloat(process.env.MEMORY_HYBRID_ALPHA)) ? parseFloat(process.env.MEMORY_HYBRID_ALPHA) : 0.65,
    batchSize: parseInt(process.env.MEMORY_REINDEX_BATCH_SIZE || '20', 10),
    timeoutMs: parseInt(process.env.MEMORY_EMBEDDING_TIMEOUT_MS || '15000', 10),
  };
}

function normalizeVector(vector) {
  if (!Array.isArray(vector)) return [];
  const nums = vector.map(Number).filter((n) => Number.isFinite(n));
  const norm = Math.sqrt(nums.reduce((sum, n) => sum + n * n, 0));
  return norm ? nums.map((n) => n / norm) : nums;
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || b.length === 0) return 0;
  const len = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < len; i++) {
    const av = Number(a[i]) || 0;
    const bv = Number(b[i]) || 0;
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

function contentHash(text) {
  return crypto.createHash('sha256').update(sanitizeContent(text || '')).digest('hex');
}

async function generateEmbedding(text) {
  const config = getEmbeddingConfig();
  if (!config.enabled) throw new Error('Memory embeddings disabled');
  if (config.provider !== 'ollama') throw new Error(`Unsupported embedding provider: ${config.provider}`);
  const clean = sanitizeContent(text).slice(0, 8000);
  const embedding = await generateOllamaEmbedding(clean, { model: config.model, timeoutMs: config.timeoutMs });
  if (!Array.isArray(embedding) || embedding.length === 0) throw new Error('Ollama returned an empty embedding');
  return normalizeVector(embedding);
}

async function generateEmbeddingsBatch(items) {
  const results = [];
  for (const item of items || []) {
    try {
      const text = typeof item === 'string' ? item : item.content;
      results.push({ ok: true, embedding: await generateEmbedding(text), item });
    } catch (err) {
      results.push({ ok: false, error: err.message, item });
    }
  }
  return results;
}

async function getEmbeddingStatus() {
  const config = getEmbeddingConfig();
  const store = embeddingStore.readStore();
  let ollamaReachable = false;
  let error = null;
  if (config.enabled && config.provider === 'ollama') {
    const diag = await diagnoseOllama({ model: config.model, timeoutMs: 3000 });
    ollamaReachable = !!diag.reachable;
    error = diag.error || null;
  }
  return {
    enabled: config.enabled,
    provider: config.provider,
    model: config.model,
    dimensions: store.metadata.dimensions || config.dimensions,
    count: store.items.filter((i) => i.model === config.model).length,
    lastReindexAt: store.metadata.lastReindexAt || null,
    ollamaReachable,
    error,
  };
}

function estimateEmbeddingReadiness(memoryItems = []) {
  const config = getEmbeddingConfig();
  const embeddings = embeddingStore.listEmbeddings(config.model);
  const validIds = new Set();
  for (const item of memoryItems) {
    const rec = embeddings.find((e) => e.memoryId === item.id && e.contentHash === contentHash(item.content));
    if (rec) validIds.add(item.id);
  }
  return {
    enabled: config.enabled,
    model: config.model,
    totalMemoryItems: memoryItems.length,
    embeddedItems: validIds.size,
    missingItems: Math.max(0, memoryItems.length - validIds.size),
    ready: config.enabled && memoryItems.length > 0 && validIds.size === memoryItems.length,
  };
}

module.exports = {
  isEmbeddingsEnabled,
  getEmbeddingConfig,
  generateEmbedding,
  generateEmbeddingsBatch,
  cosineSimilarity,
  normalizeVector,
  getEmbeddingStatus,
  estimateEmbeddingReadiness,
  contentHash,
};

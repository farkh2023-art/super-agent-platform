'use strict';

const { v4: uuid } = require('uuid');
const storage = require('../storage');
const { sanitizeContent } = require('./sanitize');

// ── Tokenization ──────────────────────────────────────────────────────────────

function tokenize(text) {
  return String(text).toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function keywordScore(queryTokens, content) {
  const cSet = new Set(tokenize(content));
  let hits = 0;
  for (const t of queryTokens) if (cSet.has(t)) hits++;
  return queryTokens.length > 0 ? hits / queryTokens.length : 0;
}

// ── Ollama embeddings (optional) ──────────────────────────────────────────────

function cosineSim(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return (na && nb) ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

async function getOllamaEmbedding(text) {
  const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const model = process.env.MEMORY_EMBEDDING_MODEL || 'nomic-embed-text';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: text }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Ollama embedding HTTP ${res.status}`);
    const data = await res.json();
    return data.embedding;
  } finally {
    clearTimeout(timer);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

async function addChunk({ content, source = 'manual', sourceId = null, agentId = null, tags = [] }) {
  const clean = sanitizeContent(content);
  let embedding = null;

  if (process.env.MEMORY_EMBEDDINGS === 'ollama') {
    try {
      embedding = await getOllamaEmbedding(clean);
    } catch {
      // Ollama unavailable – store chunk without embedding, keyword search will still work
    }
  }

  const chunk = {
    id: uuid(),
    content: clean,
    source,
    sourceId,
    agentId,
    tags,
    embedding,
    createdAt: new Date().toISOString(),
  };
  storage.create('memory', chunk);
  return chunk;
}

async function search(query, limit = 5) {
  const chunks = storage.findAll('memory');
  if (chunks.length === 0) return [];

  if (process.env.MEMORY_EMBEDDINGS === 'ollama') {
    try {
      const qEmb = await getOllamaEmbedding(query);
      return chunks
        .map((c) => ({
          c,
          score: c.embedding ? cosineSim(qEmb, c.embedding) : keywordScore(tokenize(query), c.content),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(({ c }) => c);
    } catch {
      // Fall through to keyword search
    }
  }

  const qTokens = tokenize(query);
  return chunks
    .map((c) => ({ c, score: keywordScore(qTokens, c.content) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ c }) => c);
}

function listChunks() {
  return storage.findAll('memory');
}

function removeChunk(id) {
  return storage.remove('memory', id);
}

function clearMemory() {
  storage.clear('memory');
}

function stats() {
  const chunks = storage.findAll('memory');
  const sources = {};
  let embeddingsCount = 0;
  for (const c of chunks) {
    sources[c.source] = (sources[c.source] || 0) + 1;
    if (c.embedding) embeddingsCount++;
  }
  return {
    total: chunks.length,
    sources,
    embeddingsEnabled: process.env.MEMORY_EMBEDDINGS === 'ollama',
    embeddingModel: process.env.MEMORY_EMBEDDING_MODEL || 'nomic-embed-text',
    embeddingsCount,
  };
}

module.exports = { addChunk, search, listChunks, removeChunk, clearMemory, stats };

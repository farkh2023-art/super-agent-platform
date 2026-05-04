'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const storage = require('../storage');
const { sanitizeContent } = require('./sanitize');

function storePath() {
  return path.join(storage.DATA_DIR, 'memory', 'embeddings.json');
}

function emptyStore() {
  return {
    items: [],
    metadata: {
      model: process.env.MEMORY_EMBEDDING_MODEL || 'nomic-embed-text',
      dimensions: null,
      lastReindexAt: null,
      count: 0,
    },
  };
}

function readStore() {
  const fp = storePath();
  if (!fs.existsSync(fp)) return emptyStore();
  try {
    const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
    return {
      ...emptyStore(),
      ...data,
      items: Array.isArray(data.items) ? data.items : [],
      metadata: { ...emptyStore().metadata, ...(data.metadata || {}) },
    };
  } catch {
    return emptyStore();
  }
}

function writeStore(data) {
  const fp = storePath();
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  const metadata = {
    ...emptyStore().metadata,
    ...(data.metadata || {}),
    count: (data.items || []).length,
  };
  fs.writeFileSync(fp, JSON.stringify({ items: data.items || [], metadata }, null, 2), 'utf8');
}

function upsertEmbedding(record) {
  const store = readStore();
  const idx = store.items.findIndex((i) => i.memoryId === record.memoryId && i.model === record.model);
  const now = new Date().toISOString();
  const item = { ...record, updatedAt: now, createdAt: record.createdAt || now };
  if (idx === -1) store.items.push(item);
  else store.items[idx] = { ...store.items[idx], ...item, createdAt: store.items[idx].createdAt || now };
  store.metadata.model = record.model;
  store.metadata.dimensions = Array.isArray(record.embedding) ? record.embedding.length : store.metadata.dimensions;
  writeStore(store);
  return item;
}

function getEmbedding(memoryId, model) {
  return readStore().items.find((i) => i.memoryId === memoryId && i.model === model) || null;
}

function listEmbeddings(model) {
  const items = readStore().items;
  return model ? items.filter((i) => i.model === model) : items;
}

function removeEmbedding(memoryId, model) {
  const store = readStore();
  const before = store.items.length;
  store.items = store.items.filter((i) => !(i.memoryId === memoryId && (!model || i.model === model)));
  writeStore(store);
  return store.items.length !== before;
}

function clearEmbeddings() {
  writeStore(emptyStore());
}

function markReindexed() {
  const store = readStore();
  store.metadata.lastReindexAt = new Date().toISOString();
  writeStore(store);
  return store.metadata;
}

function hashContent(text) {
  return crypto.createHash('sha256').update(sanitizeContent(text || '')).digest('hex');
}

function findOrphanEmbeddings(options = {}) {
  const strict = options.strict === true;
  const activeModel = options.model || process.env.MEMORY_EMBEDDING_MODEL || 'nomic-embed-text';
  const store = readStore();
  const memoryItems = storage.findAll('memory');
  const memoryById = new Map(memoryItems.map((item) => [item.id, item]));
  const orphans = [];
  const stale = [];

  for (const item of store.items) {
    const memoryItem = memoryById.get(item.memoryId);
    if (!memoryItem) {
      orphans.push({ ...item, reason: 'missing_memory_item' });
      continue;
    }
    if (item.contentHash && item.contentHash !== hashContent(memoryItem.content)) {
      stale.push({ ...item, reason: 'content_hash_mismatch' });
      continue;
    }
    if (strict && item.model !== activeModel) {
      stale.push({ ...item, reason: 'model_mismatch' });
    }
  }

  return {
    totalEmbeddings: store.items.length,
    orphans: orphans.length,
    stale: stale.length,
    orphanItems: orphans,
    staleItems: stale,
    activeModel,
    strict,
  };
}

function cleanupOrphanEmbeddings(options = {}) {
  const status = findOrphanEmbeddings(options);
  const removeKeys = new Set([...status.orphanItems, ...status.staleItems].map((item) => `${item.memoryId}::${item.model}`));
  if (removeKeys.size === 0) return { ...status, removed: 0 };

  const store = readStore();
  store.items = store.items.filter((item) => !removeKeys.has(`${item.memoryId}::${item.model}`));
  writeStore(store);
  return { ...findOrphanEmbeddings(options), removed: removeKeys.size };
}

function getEmbeddingIntegrityStatus(options = {}) {
  const status = findOrphanEmbeddings(options);
  return {
    totalEmbeddings: status.totalEmbeddings,
    orphans: status.orphans,
    stale: status.stale,
    removed: 0,
    activeModel: status.activeModel,
    strict: status.strict,
  };
}

module.exports = {
  readStore,
  writeStore,
  upsertEmbedding,
  getEmbedding,
  listEmbeddings,
  removeEmbedding,
  clearEmbeddings,
  markReindexed,
  findOrphanEmbeddings,
  cleanupOrphanEmbeddings,
  getEmbeddingIntegrityStatus,
};

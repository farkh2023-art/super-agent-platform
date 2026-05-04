'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(__dirname, '..', '..', process.env.DATA_DIR)
  : path.resolve(__dirname, '..', '..', 'data');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function filePath(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

function readCollection(name) {
  ensureDataDir();
  const fp = filePath(name);
  if (!fs.existsSync(fp)) return [];
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch {
    return [];
  }
}

function writeCollection(name, data) {
  ensureDataDir();
  fs.writeFileSync(filePath(name), JSON.stringify(data, null, 2), 'utf8');
}

function readRecord(name) {
  ensureDataDir();
  const fp = filePath(name);
  if (!fs.existsSync(fp)) return {};
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch {
    return {};
  }
}

function writeRecord(name, data) {
  ensureDataDir();
  fs.writeFileSync(filePath(name), JSON.stringify(data, null, 2), 'utf8');
}

// ── Generic CRUD helpers ──────────────────────────────────────────────────────

function findAll(collection) {
  return readCollection(collection);
}

function findById(collection, id) {
  return readCollection(collection).find((item) => item.id === id) || null;
}

function create(collection, item) {
  const items = readCollection(collection);
  items.push(item);
  writeCollection(collection, items);
  return item;
}

function update(collection, id, patch) {
  const items = readCollection(collection);
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  items[idx] = { ...items[idx], ...patch, updatedAt: new Date().toISOString() };
  writeCollection(collection, items);
  return items[idx];
}

function remove(collection, id) {
  const items = readCollection(collection);
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return false;
  items.splice(idx, 1);
  writeCollection(collection, items);
  return true;
}

function clear(collection) {
  writeCollection(collection, []);
}

module.exports = {
  findAll,
  findById,
  create,
  update,
  remove,
  clear,
  readRecord,
  writeRecord,
  DATA_DIR,
};

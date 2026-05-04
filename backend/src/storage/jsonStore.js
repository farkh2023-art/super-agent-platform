'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(__dirname, '..', '..', process.env.DATA_DIR)
  : path.resolve(__dirname, '..', '..', 'data');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function filePath(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

function readCollection(name) {
  ensureDataDir();
  const fp = filePath(name);
  if (!fs.existsSync(fp)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(fp, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCollection(name, data) {
  ensureDataDir();
  fs.writeFileSync(filePath(name), JSON.stringify(Array.isArray(data) ? data : [], null, 2), 'utf8');
}

function readRecord(name) {
  ensureDataDir();
  const fp = filePath(name);
  if (!fs.existsSync(fp)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(fp, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeRecord(name, data) {
  ensureDataDir();
  fs.writeFileSync(filePath(name), JSON.stringify(data || {}, null, 2), 'utf8');
}

function list(collection) {
  return readCollection(collection);
}

function get(collection, id) {
  return list(collection).find((item) => item.id === id) || null;
}

function create(collection, item) {
  const items = list(collection);
  items.push(item);
  writeCollection(collection, items);
  return item;
}

function update(collection, id, patch) {
  const items = list(collection);
  const idx = items.findIndex((item) => item.id === id);
  if (idx === -1) return null;
  items[idx] = { ...items[idx], ...patch, updatedAt: new Date().toISOString() };
  writeCollection(collection, items);
  return items[idx];
}

function remove(collection, id) {
  const items = list(collection);
  const idx = items.findIndex((item) => item.id === id);
  if (idx === -1) return false;
  items.splice(idx, 1);
  writeCollection(collection, items);
  return true;
}

function clear(collection) {
  writeCollection(collection, []);
}

function search(collection, predicate) {
  const items = list(collection);
  return typeof predicate === 'function' ? items.filter(predicate) : items;
}

function count(collection) {
  return list(collection).length;
}

module.exports = {
  DATA_DIR,
  filePath,
  ensureDataDir,
  readCollection,
  writeCollection,
  readRecord,
  writeRecord,
  list,
  get,
  create,
  update,
  remove,
  clear,
  search,
  count,
};

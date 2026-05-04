'use strict';

const { openDatabase } = require('./sqlite');
const { TABLES, COLLECTIONS } = require('./schema');

function encode(value) {
  return value == null ? null : JSON.stringify(value);
}

function decode(value, fallback) {
  if (value == null || value === '') return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function tableInfo(collection) {
  const info = TABLES[collection];
  if (!info) {
    const err = new Error(`SQLite collection unsupported: ${collection}`);
    err.code = 'SQLITE_COLLECTION_UNSUPPORTED';
    throw err;
  }
  return info;
}

function toDbValue(value) {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (Array.isArray(value) || (value && typeof value === 'object')) return JSON.stringify(value);
  return value == null ? null : value;
}

function rowToItem(row) {
  if (!row) return null;
  return decode(row.raw_json, {});
}

function upsert(collection, item) {
  const info = tableInfo(collection);
  const db = openDatabase();
  const raw = JSON.stringify(item || {});
  const columns = ['raw_json'];
  const values = [raw];
  const placeholders = ['?'];

  for (const [jsonKey, column] of Object.entries(info.columns)) {
    columns.push(column);
    values.push(toDbValue(item ? item[jsonKey] : null));
    placeholders.push('?');
  }

  const updates = columns.filter((c) => c !== 'id').map((c) => `${c}=excluded.${c}`).join(', ');
  const sql = `INSERT INTO ${info.table} (${columns.join(',')}) VALUES (${placeholders.join(',')})
    ON CONFLICT(id) DO UPDATE SET ${updates}`;
  db.prepare(sql).run(...values);
  return item;
}

function list(collection) {
  const info = tableInfo(collection);
  const rows = openDatabase().prepare(`SELECT raw_json FROM ${info.table}`).all();
  return rows.map(rowToItem).filter(Boolean);
}

function get(collection, id) {
  const info = tableInfo(collection);
  return rowToItem(openDatabase().prepare(`SELECT raw_json FROM ${info.table} WHERE id = ?`).get(id));
}

function create(collection, item) {
  return upsert(collection, item);
}

function update(collection, id, patch) {
  const current = get(collection, id);
  if (!current) return null;
  const updated = { ...current, ...patch, updatedAt: new Date().toISOString() };
  upsert(collection, updated);
  return updated;
}

function remove(collection, id) {
  const info = tableInfo(collection);
  const result = openDatabase().prepare(`DELETE FROM ${info.table} WHERE id = ?`).run(id);
  return result.changes > 0;
}

function clear(collection) {
  const info = tableInfo(collection);
  openDatabase().prepare(`DELETE FROM ${info.table}`).run();
}

function search(collection, predicate) {
  const items = list(collection);
  return typeof predicate === 'function' ? items.filter(predicate) : items;
}

function count(collection) {
  const info = tableInfo(collection);
  const row = openDatabase().prepare(`SELECT COUNT(*) AS count FROM ${info.table}`).get();
  return row ? row.count : 0;
}

function readRecord(name) {
  const row = openDatabase().prepare('SELECT value_json FROM settings_kv WHERE key = ?').get(name);
  return decode(row && row.value_json, {});
}

function writeRecord(name, data) {
  openDatabase().prepare(`
    INSERT INTO settings_kv (key, value_json, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at
  `).run(name, JSON.stringify(data || {}), new Date().toISOString());
}

function listSupportedCollections() {
  return COLLECTIONS.slice();
}

module.exports = {
  listSupportedCollections,
  list,
  get,
  create,
  update,
  remove,
  clear,
  search,
  count,
  readRecord,
  writeRecord,
  upsert,
};

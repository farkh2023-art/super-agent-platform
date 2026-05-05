'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const authDb = require('./authDb');

function wsPath() {
  const base = process.env.DATA_DIR
    ? path.resolve(__dirname, '..', '..', process.env.DATA_DIR)
    : path.resolve(__dirname, '..', '..', 'data');
  return path.join(base, 'workspaces.json');
}

function readJson() {
  try {
    const p = wsPath();
    if (!fs.existsSync(p)) return [];
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch { return []; }
}

function writeJson(workspaces) {
  const p = wsPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(workspaces, null, 2), 'utf8');
}

function rowToWs(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    limits: row.limits_json ? JSON.parse(row.limits_json) : { maxTasks: 1000, maxExecutions: 500 },
    createdAt: row.created_at,
  };
}

function createWorkspace({ name, ownerId = null, limits = {} }) {
  const ws = {
    id: crypto.randomUUID(),
    name: String(name || 'workspace').slice(0, 80),
    ownerId,
    limits: {
      maxTasks: Math.max(1, parseInt(limits.maxTasks || 1000, 10)),
      maxExecutions: Math.max(1, parseInt(limits.maxExecutions || 500, 10)),
    },
    createdAt: new Date().toISOString(),
  };

  const db = authDb.getAuthDb();
  if (db) {
    db.prepare(`INSERT INTO auth_workspaces (id, name, owner_id, limits_json, created_at) VALUES (?, ?, ?, ?, ?)`).run(ws.id, ws.name, ws.ownerId, JSON.stringify(ws.limits), ws.createdAt);
    return ws;
  }

  const all = readJson();
  all.push(ws);
  writeJson(all);
  return ws;
}

function findById(id) {
  const db = authDb.getAuthDb();
  if (db) return rowToWs(db.prepare('SELECT * FROM auth_workspaces WHERE id = ?').get(id));
  return readJson().find((w) => w.id === id) || null;
}

function list() {
  const db = authDb.getAuthDb();
  if (db) return db.prepare('SELECT * FROM auth_workspaces ORDER BY created_at ASC').all().map(rowToWs);
  return readJson();
}

function getOrCreate(name = 'default', ownerId = null) {
  const db = authDb.getAuthDb();
  if (db) {
    const row = db.prepare('SELECT * FROM auth_workspaces WHERE name = ?').get(name);
    if (row) return rowToWs(row);
    return createWorkspace({ name, ownerId });
  }
  const existing = readJson().find((w) => w.name === name);
  if (existing) return existing;
  return createWorkspace({ name, ownerId });
}

module.exports = { createWorkspace, findById, list, getOrCreate };

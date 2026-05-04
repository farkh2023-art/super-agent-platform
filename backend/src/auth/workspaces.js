'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function wsPath() {
  const base = process.env.DATA_DIR
    ? path.resolve(__dirname, '..', '..', process.env.DATA_DIR)
    : path.resolve(__dirname, '..', '..', 'data');
  return path.join(base, 'workspaces.json');
}

function read() {
  try {
    const p = wsPath();
    if (!fs.existsSync(p)) return [];
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch { return []; }
}

function write(workspaces) {
  const p = wsPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(workspaces, null, 2), 'utf8');
}

function createWorkspace({ name, ownerId = null, limits = {} }) {
  const all = read();
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
  all.push(ws);
  write(all);
  return ws;
}

function findById(id) {
  return read().find((w) => w.id === id) || null;
}

function list() {
  return read();
}

function getOrCreate(name = 'default', ownerId = null) {
  const existing = read().find((w) => w.name === name);
  if (existing) return existing;
  return createWorkspace({ name, ownerId });
}

module.exports = { createWorkspace, findById, list, getOrCreate };

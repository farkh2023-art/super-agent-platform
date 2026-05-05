'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const authDb = require('./authDb');

function usersPath() {
  const base = process.env.DATA_DIR
    ? path.resolve(__dirname, '..', '..', process.env.DATA_DIR)
    : path.resolve(__dirname, '..', '..', 'data');
  return path.join(base, 'users.json');
}

function readJson() {
  try {
    const p = usersPath();
    if (!fs.existsSync(p)) return [];
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch { return []; }
}

function writeJson(users) {
  const p = usersPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(users, null, 2), 'utf8');
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith('scrypt:')) return false;
  const [, salt, hash] = stored.split(':');
  const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(derived, 'hex'), Buffer.from(hash, 'hex'));
}

function safeUser(user) {
  if (!user) return null;
  const { passwordHash, password_hash, ...safe } = user;
  return safe;
}

// ── SQLite helpers ────────────────────────────────────────────────────────────

function dbRowToUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    role: row.role,
    workspaceId: row.workspace_id,
    disabled: Boolean(row.disabled),
    createdAt: row.created_at,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

function createUser({ username, password, role = 'user', workspaceId = null }) {
  if (!username || !password) throw Object.assign(new Error('username and password required'), { code: 'INVALID_INPUT' });
  const id = crypto.randomUUID();
  const passwordHash = hashPassword(password);
  const safeRole = ['admin', 'user'].includes(role) ? role : 'user';
  const createdAt = new Date().toISOString();

  const db = authDb.getAuthDb();
  if (db) {
    if (db.prepare('SELECT id FROM auth_users WHERE username = ?').get(String(username).slice(0, 80))) {
      throw Object.assign(new Error('Username already exists'), { code: 'DUPLICATE_USERNAME' });
    }
    db.prepare(`INSERT INTO auth_users (id, username, password_hash, role, workspace_id, disabled, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)`).run(id, String(username).slice(0, 80), passwordHash, safeRole, workspaceId, createdAt);
    return { id, username: String(username).slice(0, 80), role: safeRole, workspaceId, disabled: false, createdAt };
  }

  const users = readJson();
  if (users.find((u) => u.username === username)) throw Object.assign(new Error('Username already exists'), { code: 'DUPLICATE_USERNAME' });
  const user = { id, username: String(username).slice(0, 80), passwordHash, role: safeRole, workspaceId, createdAt };
  users.push(user);
  writeJson(users);
  return safeUser(user);
}

function authenticate(username, password) {
  const db = authDb.getAuthDb();
  if (db) {
    const row = db.prepare('SELECT * FROM auth_users WHERE username = ?').get(username);
    if (!row) return null;
    if (!verifyPassword(password, row.password_hash)) return null;
    return safeUser(dbRowToUser(row));
  }

  const user = readJson().find((u) => u.username === username);
  if (!user) return null;
  if (!verifyPassword(password, user.passwordHash)) return null;
  return safeUser(user);
}

function findById(id) {
  const db = authDb.getAuthDb();
  if (db) {
    return safeUser(dbRowToUser(db.prepare('SELECT * FROM auth_users WHERE id = ?').get(id)));
  }
  return safeUser(readJson().find((u) => u.id === id) || null);
}

function listUsers() {
  const db = authDb.getAuthDb();
  if (db) {
    return db.prepare('SELECT * FROM auth_users ORDER BY created_at ASC').all().map((r) => safeUser(dbRowToUser(r)));
  }
  return readJson().map(safeUser);
}

function count() {
  const db = authDb.getAuthDb();
  if (db) {
    return db.prepare('SELECT COUNT(*) AS n FROM auth_users').get().n;
  }
  return readJson().length;
}

function updateUser(id, patch = {}) {
  const db = authDb.getAuthDb();
  if (db) {
    const row = db.prepare('SELECT * FROM auth_users WHERE id = ?').get(id);
    if (!row) throw Object.assign(new Error('User not found'), { code: 'NOT_FOUND' });
    const newRole = patch.role !== undefined ? (['admin', 'user'].includes(patch.role) ? patch.role : row.role) : row.role;
    const newDisabled = patch.disabled !== undefined ? (Boolean(patch.disabled) ? 1 : 0) : row.disabled;
    const newWs = patch.workspaceId !== undefined ? patch.workspaceId : row.workspace_id;
    db.prepare(`UPDATE auth_users SET role = ?, disabled = ?, workspace_id = ? WHERE id = ?`).run(newRole, newDisabled, newWs, id);
    return safeUser(dbRowToUser({ ...row, role: newRole, disabled: newDisabled, workspace_id: newWs }));
  }

  const users = readJson();
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) throw Object.assign(new Error('User not found'), { code: 'NOT_FOUND' });
  if (patch.role !== undefined) users[idx].role = ['admin', 'user'].includes(patch.role) ? patch.role : users[idx].role;
  if (patch.disabled !== undefined) users[idx].disabled = Boolean(patch.disabled);
  if (patch.workspaceId !== undefined) users[idx].workspaceId = patch.workspaceId;
  writeJson(users);
  return safeUser(users[idx]);
}

function deleteUser(id) {
  const db = authDb.getAuthDb();
  if (db) {
    const info = db.prepare('DELETE FROM auth_users WHERE id = ?').run(id);
    if (info.changes === 0) throw Object.assign(new Error('User not found'), { code: 'NOT_FOUND' });
    return;
  }

  const users = readJson();
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) throw Object.assign(new Error('User not found'), { code: 'NOT_FOUND' });
  users.splice(idx, 1);
  writeJson(users);
}

module.exports = { createUser, authenticate, findById, listUsers, count, updateUser, deleteUser, hashPassword, verifyPassword };

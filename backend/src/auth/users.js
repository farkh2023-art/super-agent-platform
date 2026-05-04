'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function usersPath() {
  const base = process.env.DATA_DIR
    ? path.resolve(__dirname, '..', '..', process.env.DATA_DIR)
    : path.resolve(__dirname, '..', '..', 'data');
  return path.join(base, 'users.json');
}

function readUsers() {
  try {
    const p = usersPath();
    if (!fs.existsSync(p)) return [];
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch { return []; }
}

function writeUsers(users) {
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
  const { passwordHash, ...safe } = user;
  return safe;
}

function createUser({ username, password, role = 'user', workspaceId = null }) {
  if (!username || !password) throw Object.assign(new Error('username and password required'), { code: 'INVALID_INPUT' });
  const users = readUsers();
  if (users.find((u) => u.username === username)) throw Object.assign(new Error('Username already exists'), { code: 'DUPLICATE_USERNAME' });
  const user = {
    id: crypto.randomUUID(),
    username: String(username).slice(0, 80),
    passwordHash: hashPassword(password),
    role: ['admin', 'user'].includes(role) ? role : 'user',
    workspaceId,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  writeUsers(users);
  return safeUser(user);
}

function authenticate(username, password) {
  const user = readUsers().find((u) => u.username === username);
  if (!user) return null;
  if (!verifyPassword(password, user.passwordHash)) return null;
  return safeUser(user);
}

function findById(id) {
  return safeUser(readUsers().find((u) => u.id === id) || null);
}

function listUsers() {
  return readUsers().map(safeUser);
}

function count() {
  return readUsers().length;
}

function updateUser(id, patch = {}) {
  const users = readUsers();
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) throw Object.assign(new Error('User not found'), { code: 'NOT_FOUND' });
  if (patch.role !== undefined) users[idx].role = ['admin', 'user'].includes(patch.role) ? patch.role : users[idx].role;
  if (patch.disabled !== undefined) users[idx].disabled = Boolean(patch.disabled);
  if (patch.workspaceId !== undefined) users[idx].workspaceId = patch.workspaceId;
  writeUsers(users);
  return safeUser(users[idx]);
}

function deleteUser(id) {
  const users = readUsers();
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) throw Object.assign(new Error('User not found'), { code: 'NOT_FOUND' });
  users.splice(idx, 1);
  writeUsers(users);
}

module.exports = { createUser, authenticate, findById, listUsers, count, updateUser, deleteUser, hashPassword, verifyPassword };

'use strict';

const { v4: uuid } = require('uuid');
const storage = require('../storage');
const { emit } = require('../notifications/wsNotifications');

const RULES = 'alert_rules';
const NOTIFICATIONS = 'notifications';

const DEFAULT_COOLDOWN_MS = 15 * 60 * 1000;
const MAX_NOTIFICATION_MESSAGE = 500;

const OPERATORS = new Set(['>', '>=', '<', '<=', '==', '!=']);

function nowIso() {
  return new Date().toISOString();
}

function sanitizeText(value, fallback = '') {
  return String(value == null ? fallback : value)
    .replace(/authorization|cookie|password|token/ig, '[redacted]')
    .slice(0, MAX_NOTIFICATION_MESSAGE);
}

function compare(left, operator, right) {
  switch (operator) {
    case '>': return left > right;
    case '>=': return left >= right;
    case '<': return left < right;
    case '<=': return left <= right;
    case '==': return left === right;
    case '!=': return left !== right;
    default: return false;
  }
}

function snapshotFromReport(report = {}) {
  const heapUsed = Number(report.system?.memory?.heapUsed || 0);
  const heapTotal = Number(report.system?.memory?.heapTotal || 0);
  return {
    statusCode: report.status === 'critical' ? 2 : report.status === 'warning' ? 1 : 0,
    heapUsedMb: heapUsed,
    heapUsedRatio: heapTotal > 0 ? heapUsed / heapTotal : 0,
    rssMb: Number(report.system?.memory?.rss || 0),
    desyncAlerts: Number(report.storage?.desyncAlerts || 0),
    activeSessions: Number(report.auth?.activeSessions || 0),
    blacklistCount: Number(report.auth?.blacklistCount || 0),
    memoryItems: Number(report.rag?.memoryItems || 0),
    embeddingsCount: Number(report.rag?.embeddingsCount || 0),
    schedulesCount: Number(report.scheduler?.schedulesCount || 0),
    warningsCount: Array.isArray(report.warnings) ? report.warnings.length : 0,
  };
}

function validateRuleInput(input = {}, existing = null) {
  const metric = input.metric !== undefined ? String(input.metric).trim() : existing?.metric;
  const operator = input.operator !== undefined ? String(input.operator).trim() : existing?.operator;
  const threshold = input.threshold !== undefined ? Number(input.threshold) : Number(existing?.threshold);
  if (!metric) throw Object.assign(new Error('metric is required'), { statusCode: 400 });
  if (!OPERATORS.has(operator)) throw Object.assign(new Error('operator is invalid'), { statusCode: 400 });
  if (!Number.isFinite(threshold)) throw Object.assign(new Error('threshold must be numeric'), { statusCode: 400 });
  return { metric, operator, threshold };
}

function listRules() {
  return storage.findAll(RULES).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function createRule(input = {}) {
  const condition = validateRuleInput(input);
  const ts = nowIso();
  const rule = {
    id: uuid(),
    name: sanitizeText(input.name || condition.metric, 'Alert rule').slice(0, 120),
    description: sanitizeText(input.description || '').slice(0, 240),
    severity: ['info', 'warning', 'critical'].includes(input.severity) ? input.severity : 'warning',
    enabled: input.enabled !== false,
    cooldownMs: Number.isFinite(Number(input.cooldownMs)) && Number(input.cooldownMs) >= 0 ? Number(input.cooldownMs) : DEFAULT_COOLDOWN_MS,
    metric: condition.metric,
    operator: condition.operator,
    threshold: condition.threshold,
    lastTriggeredAt: null,
    createdAt: ts,
    updatedAt: ts,
  };
  storage.create(RULES, rule);
  return rule;
}

function updateRule(id, input = {}) {
  const current = storage.findById(RULES, id);
  if (!current) return null;
  const condition = validateRuleInput(input, current);
  const patch = {
    ...condition,
    updatedAt: nowIso(),
  };
  if (input.name !== undefined) patch.name = sanitizeText(input.name, current.name).slice(0, 120);
  if (input.description !== undefined) patch.description = sanitizeText(input.description, '').slice(0, 240);
  if (input.severity !== undefined && ['info', 'warning', 'critical'].includes(input.severity)) patch.severity = input.severity;
  if (input.enabled !== undefined) patch.enabled = input.enabled !== false;
  if (input.cooldownMs !== undefined) {
    const ms = Number(input.cooldownMs);
    if (!Number.isFinite(ms) || ms < 0) throw Object.assign(new Error('cooldownMs must be positive'), { statusCode: 400 });
    patch.cooldownMs = ms;
  }
  return storage.update(RULES, id, patch);
}

function deleteRule(id) {
  return storage.remove(RULES, id);
}

function createNotification(input = {}) {
  const ts = nowIso();
  const notification = {
    id: input.id || uuid(),
    type: sanitizeText(input.type || 'alert:created').slice(0, 80),
    title: sanitizeText(input.title || 'Alert').slice(0, 160),
    message: sanitizeText(input.message || '').slice(0, MAX_NOTIFICATION_MESSAGE),
    severity: ['info', 'warning', 'critical'].includes(input.severity) ? input.severity : 'info',
    source: sanitizeText(input.source || 'alert-center').slice(0, 80),
    ruleId: input.ruleId || null,
    read: false,
    createdAt: ts,
  };
  storage.create(NOTIFICATIONS, notification);
  emit('alert:created', { notification });
  return notification;
}

function listNotifications({ unreadOnly = false, limit = 100 } = {}) {
  const items = storage.findAll(NOTIFICATIONS)
    .filter((n) => !unreadOnly || !n.read)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, Math.max(1, Math.min(Number(limit) || 100, 200)));
  return { notifications: items, total: items.length, unread: storage.findAll(NOTIFICATIONS).filter((n) => !n.read).length };
}

function markNotificationRead(id) {
  const updated = storage.update(NOTIFICATIONS, id, { read: true, readAt: nowIso() });
  if (updated) emit('alert:read', { notificationId: id });
  return updated;
}

function markAllRead() {
  const items = storage.findAll(NOTIFICATIONS).filter((n) => !n.read);
  for (const n of items) storage.update(NOTIFICATIONS, n.id, { read: true, readAt: nowIso() });
  if (items.length) emit('alert:read', { all: true, count: items.length });
  return items.length;
}

function evaluateAlertRules(report) {
  const snapshot = snapshotFromReport(report);
  const triggered = [];
  const now = Date.now();
  for (const rule of listRules()) {
    if (rule.enabled === false) continue;
    const value = Number(snapshot[rule.metric]);
    if (!Number.isFinite(value)) continue;
    if (!compare(value, rule.operator, Number(rule.threshold))) continue;
    const last = rule.lastTriggeredAt ? new Date(rule.lastTriggeredAt).getTime() : 0;
    if (last && now - last < Number(rule.cooldownMs || DEFAULT_COOLDOWN_MS)) continue;
    const notification = createNotification({
      type: 'alert:created',
      title: rule.name,
      message: `${rule.metric}=${value} matched ${rule.operator} ${rule.threshold}`,
      severity: rule.severity,
      source: 'alert-rule',
      ruleId: rule.id,
    });
    storage.update(RULES, rule.id, { lastTriggeredAt: notification.createdAt, lastValue: value });
    triggered.push({ ruleId: rule.id, notificationId: notification.id, metric: rule.metric, value });
  }
  return { evaluated: listRules().length, triggered, snapshot };
}

module.exports = {
  createRule,
  updateRule,
  deleteRule,
  listRules,
  createNotification,
  listNotifications,
  markNotificationRead,
  markAllRead,
  evaluateAlertRules,
  snapshotFromReport,
};

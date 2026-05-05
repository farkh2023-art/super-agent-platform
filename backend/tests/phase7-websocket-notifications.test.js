'use strict';

describe('Phase 7 — WebSocket Notifications', () => {
  beforeEach(() => {
    jest.resetModules();
    delete process.env.AUTH_MODE;
  });

  test('wsNotifications module exports setBroadcastFn, emit, notify', () => {
    const ws = require('../src/notifications/wsNotifications');
    expect(typeof ws.setBroadcastFn).toBe('function');
    expect(typeof ws.emit).toBe('function');
    expect(typeof ws.notify).toBe('object');
  });

  test('emit does nothing when no broadcast function set', () => {
    const ws = require('../src/notifications/wsNotifications');
    expect(() => ws.emit('test:event', { foo: 'bar' })).not.toThrow();
  });

  test('setBroadcastFn wires up broadcast', () => {
    const ws = require('../src/notifications/wsNotifications');
    const received = [];
    ws.setBroadcastFn((msg) => received.push(msg));
    ws.emit('test:event', { value: 42 });
    expect(received).toHaveLength(1);
    expect(received[0].type).toBe('test:event');
    expect(received[0].value).toBe(42);
    expect(received[0].timestamp).toBeDefined();
  });

  test('notify.sessionRevoked emits auth:session_revoked', () => {
    const ws = require('../src/notifications/wsNotifications');
    const received = [];
    ws.setBroadcastFn((msg) => received.push(msg));
    ws.notify.sessionRevoked({ sessionId: 'abc' });
    expect(received[0].type).toBe('auth:session_revoked');
    expect(received[0].sessionId).toBe('abc');
  });

  test('notify.cleanupCompleted emits auth:cleanup_completed', () => {
    const ws = require('../src/notifications/wsNotifications');
    const received = [];
    ws.setBroadcastFn((msg) => received.push(msg));
    ws.notify.cleanupCompleted({ sessionsRemoved: 3 });
    expect(received[0].type).toBe('auth:cleanup_completed');
  });

  test('notify.blacklistUpdated emits auth:blacklist_updated', () => {
    const ws = require('../src/notifications/wsNotifications');
    const received = [];
    ws.setBroadcastFn((msg) => received.push(msg));
    ws.notify.blacklistUpdated({});
    expect(received[0].type).toBe('auth:blacklist_updated');
  });

  test('notify.storageDesync emits storage:desync_detected', () => {
    const ws = require('../src/notifications/wsNotifications');
    const received = [];
    ws.setBroadcastFn((msg) => received.push(msg));
    ws.notify.storageDesync({ collection: 'tasks' });
    expect(received[0].type).toBe('storage:desync_detected');
  });

  test('notify.storageValidation emits storage:validation_completed', () => {
    const ws = require('../src/notifications/wsNotifications');
    const received = [];
    ws.setBroadcastFn((msg) => received.push(msg));
    ws.notify.storageValidation({});
    expect(received[0].type).toBe('storage:validation_completed');
  });

  test('notify.ragEvaluation emits rag:evaluation_completed', () => {
    const ws = require('../src/notifications/wsNotifications');
    const received = [];
    ws.setBroadcastFn((msg) => received.push(msg));
    ws.notify.ragEvaluation({ score: 0.9 });
    expect(received[0].type).toBe('rag:evaluation_completed');
  });

  test('notify.schedulerJobFailed emits scheduler:job_failed', () => {
    const ws = require('../src/notifications/wsNotifications');
    const received = [];
    ws.setBroadcastFn((msg) => received.push(msg));
    ws.notify.schedulerJobFailed({ jobId: 'j1' });
    expect(received[0].type).toBe('scheduler:job_failed');
  });

  test('notify.healthWarning emits system:health_warning', () => {
    const ws = require('../src/notifications/wsNotifications');
    const received = [];
    ws.setBroadcastFn((msg) => received.push(msg));
    ws.notify.healthWarning({ warnings: [{ level: 'warning', component: 'system' }] });
    expect(received[0].type).toBe('system:health_warning');
  });

  test('broadcast errors do not throw (non-blocking)', () => {
    const ws = require('../src/notifications/wsNotifications');
    ws.setBroadcastFn(() => { throw new Error('broadcast failed'); });
    expect(() => ws.emit('test:event', {})).not.toThrow();
  });

  test('emit payload is spread into broadcast message', () => {
    const ws = require('../src/notifications/wsNotifications');
    const received = [];
    ws.setBroadcastFn((msg) => received.push(msg));
    ws.emit('my:event', { a: 1, b: 'hello' });
    expect(received[0].a).toBe(1);
    expect(received[0].b).toBe('hello');
    expect(received[0].type).toBe('my:event');
  });
});

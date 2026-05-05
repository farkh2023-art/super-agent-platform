'use strict';

let _broadcast = null;

function setBroadcastFn(fn) {
  _broadcast = fn;
}

function emit(type, payload = {}) {
  if (!_broadcast) return;
  try {
    _broadcast({ type, ...payload, timestamp: new Date().toISOString() });
  } catch { /* non-blocking */ }
}

// Typed helpers
const notify = {
  sessionRevoked:      (data = {}) => emit('auth:session_revoked', data),
  cleanupCompleted:    (data = {}) => emit('auth:cleanup_completed', data),
  blacklistUpdated:    (data = {}) => emit('auth:blacklist_updated', data),
  storageDesync:       (data = {}) => emit('storage:desync_detected', data),
  storageValidation:   (data = {}) => emit('storage:validation_completed', data),
  ragEvaluation:       (data = {}) => emit('rag:evaluation_completed', data),
  schedulerJobFailed:  (data = {}) => emit('scheduler:job_failed', data),
  healthWarning:       (data = {}) => emit('system:health_warning', data),
};

module.exports = { setBroadcastFn, emit, notify };

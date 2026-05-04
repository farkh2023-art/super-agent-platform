'use strict';

const INTERVAL_MS = parseInt(process.env.SQLITE_DESYNC_INTERVAL_MS || '30000', 10);

let _timer = null;
let _broadcast = null;

function enabled() {
  return String(process.env.SQLITE_DESYNC_MONITOR_ENABLED || 'false').toLowerCase() === 'true';
}

function runCheck() {
  if (!enabled()) return;
  try {
    const { detectAndAlertDesyncs } = require('../storage/checksums');
    const events = require('../storage/storageEvents');
    const result = detectAndAlertDesyncs();
    if (result.desynced > 0) {
      events.createEvent({
        type: 'desync_detected',
        severity: 'warning',
        message: `Monitor: desync in ${result.desynced} collection(s)`,
        metadata: { collections: result.alerts.map((a) => a.collection) },
      });
      if (_broadcast) {
        _broadcast({ type: 'storage_desync', desynced: result.desynced, alerts: result.alerts });
      }
    }
  } catch {
    // non-blocking: SQLite may not exist yet
  }
}

function start(broadcast) {
  if (_timer) return;
  _broadcast = broadcast || null;
  if (!enabled()) return;
  _timer = setInterval(runCheck, INTERVAL_MS);
  if (_timer.unref) _timer.unref();
}

function stop() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

function setBroadcast(fn) { _broadcast = fn; }

module.exports = { start, stop, setBroadcast, runCheck };

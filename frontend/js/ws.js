// WebSocket Client for real-time execution logs
class WSClient {
  constructor() {
    this.ws = null;
    this.listeners = {};
    this.reconnectTimer = null;
    this.connected = false;
  }

  connect() {
    const wsUrl = `ws://${window.location.host}/ws`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.connected = true;
      this._emit('connected', {});
      if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this._emit(data.type, data);
        this._emit('*', data);
      } catch (e) {
        // ignore parse errors
      }
    };

    this.ws.onclose = () => {
      this.connected = false;
      this._emit('disconnected', {});
      this.reconnectTimer = setTimeout(() => this.connect(), 3000);
    };

    this.ws.onerror = () => {
      this.ws.close();
    };
  }

  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter((cb) => cb !== callback);
  }

  _emit(event, data) {
    (this.listeners[event] || []).forEach((cb) => cb(data));
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) this.ws.close();
  }
}

window.wsClient = new WSClient();

// ── Notification center ───────────────────────────────────────────────────
const NOTIFY_EVENTS = new Set([
  'auth:session_revoked', 'auth:cleanup_completed', 'auth:blacklist_updated',
  'storage:desync_detected', 'storage:validation_completed',
  'rag:evaluation_completed', 'scheduler:job_failed', 'system:health_warning',
  'alert:created', 'alert:read',
]);
const MAX_NOTIFICATIONS = 50;
window._notifications = [];

wsClient.on('*', (data) => {
  if (!data || !NOTIFY_EVENTS.has(data.type)) return;
  window._notifications.unshift({ ...data, seen: false, id: Date.now() + Math.random() });
  if (window._notifications.length > MAX_NOTIFICATIONS) window._notifications.length = MAX_NOTIFICATIONS;
  window.dispatchEvent(new CustomEvent('ws:notification', { detail: data }));
});

wsClient.on('update_available', (data) => {
  const payload = data && data.payload ? data.payload : data;
  const version = payload && (payload.latestVersion || payload.version);
  if (!version) return;
  if (typeof window.showUpdateBanner === 'function') {
    window.showUpdateBanner({ ...payload, latestVersion: payload.latestVersion || version, updateAvailable: true });
  }
});

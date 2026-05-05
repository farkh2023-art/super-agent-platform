# Phase 7 — Observabilité et Rapports Admin

## Résumé

Phase 7 ajoute une observabilité globale, des notifications WebSocket pour les événements critiques, la pagination des sessions/audit, et des rapports admin consolidés.

---

## 1. Admin Health Center

### GET /api/admin/health

Retourne un tableau de santé consolidé de tous les composants.

- **Single mode**: accessible sans auth
- **Multi mode**: admin uniquement

**Réponse:**
```json
{
  "status": "ok|warning|critical",
  "generatedAt": "2026-05-05T...",
  "system": {
    "uptimeSec": 3600,
    "memory": { "rss": 80, "heapUsed": 45, "heapTotal": 100 },
    "nodeVersion": "v22.0.0",
    "platform": "win32"
  },
  "storage": {
    "mode": "json",
    "sqliteConnected": false,
    "lastValidationAt": null,
    "desyncAlerts": 0
  },
  "auth": {
    "mode": "multi",
    "activeSessions": 2,
    "blacklistCount": 5,
    "cleanupEnabled": false
  },
  "rag": {
    "memoryItems": 10,
    "embeddingsEnabled": false,
    "embeddingsCount": 0,
    "lastEvaluationAt": null
  },
  "scheduler": {
    "enabled": true,
    "schedulesCount": 3,
    "lastRunAt": "2026-05-05T10:00:00Z"
  },
  "tests": { "lastKnownTotal": 427 },
  "warnings": []
}
```

---

## 2. Admin Reports

### GET /api/admin/report.json

Génère et sauvegarde un rapport JSON dans `backend/data/admin-reports/`.

**Requis**: admin en multi mode.

### GET /api/admin/report.md

Génère et retourne un rapport Markdown en téléchargement (`admin-report.md`).

**Requis**: admin en multi mode.

### GET /api/admin/reports

Liste les 20 derniers rapports sauvegardés.

---

## 3. WebSocket Notifications

Les événements critiques sont diffusés via WebSocket à tous les clients connectés.

| Type | Déclencheur |
|------|-------------|
| `auth:session_revoked` | Session révoquée |
| `auth:cleanup_completed` | Cleanup terminé |
| `auth:blacklist_updated` | Blacklist mise à jour |
| `storage:desync_detected` | Désynchronisation storage |
| `storage:validation_completed` | Validation terminée |
| `rag:evaluation_completed` | Évaluation RAG terminée |
| `scheduler:job_failed` | Job planificateur échoué |
| `system:health_warning` | Avertissement santé système |

**Module**: `backend/src/notifications/wsNotifications.js`

---

## 4. Pagination Sessions

### GET /api/auth/sessions

**Nouveaux paramètres**:
- `limit` — nombre par page (défaut: 50, max: 500)
- `offset` — position de départ
- `active` — `true|false` (défaut: true)
- `userId` — filtre par utilisateur (admin seulement)

**Réponse**:
```json
{
  "sessions": [...],
  "items": [...],
  "total": 25,
  "limit": 50,
  "offset": 0,
  "hasMore": false
}
```

Note: `sessions` est conservé pour la rétrocompatibilité.

---

## 5. Pagination Audit Log

### GET /api/auth/audit-log

**Nouveaux paramètres** (en plus des existants):
- `limit`, `offset` — pagination
- `action` — filtre sur le chemin
- `statusCode` — filtre par code HTTP
- `ip` — filtre par adresse IP
- `userAgent` — filtre par User-Agent (partiel)

**Réponse**:
```json
{
  "entries": [...],
  "items": [...],
  "total": 100,
  "limit": 100,
  "offset": 0,
  "hasMore": true
}
```

Note: `entries` est conservé pour la rétrocompatibilité.

---

## 6. Export CSV Audit Log

### GET /api/auth/audit-log/export.csv

**Requis**: admin en multi mode.

Mêmes filtres que `GET /api/auth/audit-log`.

**Colonnes**: `createdAt`, `username`, `userId`, `workspaceId`, `method`, `action`, `statusCode`, `ip`, `userAgent`, `resourceType`, `resourceId`

**Sécurité**: aucun token, mot de passe, header Authorization ou Cookie dans l'export.

---

## 7. last_used_at au Refresh

`verifyRefreshToken()` met à jour `last_used_at` dans `auth_refresh_tokens` à chaque refresh réussi.

- SQLite: `UPDATE auth_refresh_tokens SET last_used_at = ? WHERE id = ?`
- JSON: met à jour `lastUsedAt` dans le fichier

---

## 8. Rate Limit revoke-all

### POST /api/auth/sessions/revoke-all

Rate limité par userId (ou IP en fallback).

**Variables d'environnement**:
```
REVOKE_ALL_RATE_LIMIT_WINDOW_MS=900000   # 15 min
REVOKE_ALL_RATE_LIMIT_MAX=5              # 5 tentatives max
```

Retourne `429` avec `{ error: "Too many attempts", retryAfter: <seconds> }` en cas de dépassement.

---

## 9. UI Admin Health

Vue "Admin Health" accessible depuis la sidebar (admin uniquement en multi mode).

**Sections**:
- Bandeau de notifications en temps réel
- Grille de cartes health (System, Storage, Auth, RAG, Scheduler, Tests)
- Sessions paginées (admin)
- Audit Log paginé (admin)
- Bouton Export CSV audit
- Boutons Download rapport MD/JSON
- Historique des notifications récentes

---

## 10. Backup

Le backup ZIP inclut maintenant les 3 derniers rapports admin JSON:
```
admin-reports/admin-report-<timestamp>.json
```

---

## Fichiers créés/modifiés

### Créés
- `backend/src/notifications/wsNotifications.js`
- `backend/src/reports/adminReport.js`
- `backend/src/routes/admin.js`
- `backend/tests/phase7-admin-health.test.js`
- `backend/tests/phase7-websocket-notifications.test.js`
- `backend/tests/phase7-pagination.test.js`
- `backend/tests/phase7-audit-export.test.js`
- `backend/tests/phase7-admin-report.test.js`
- `backend/tests/phase7-security.test.js`
- `backend/tests/phase7-frontend-smoke.test.js`
- `docs/PHASE7.md`

### Modifiés
- `backend/src/server.js` — mount /api/admin, wire wsNotifications
- `backend/src/routes/auth.js` — pagination, CSV export, rate limit, WS events
- `backend/src/routes/backup.js` — include admin reports
- `backend/src/middleware/authRateLimiter.js` — revokeAllRateLimit
- `backend/src/middleware/auditLog.js` — pagination + extra filters
- `backend/src/auth/refreshTokens.js` — last_used_at on verify, paginated listActiveSessions
- `frontend/index.html` — Admin Health view, notification banner
- `frontend/js/api.js` — new admin endpoints
- `frontend/js/ws.js` — notification center
- `frontend/js/app.js` — Admin Health view, pagination functions
- `.env.example` — new rate limit vars
- `docs/API.md`, `SECURITY.md`

---

## Variables d'environnement ajoutées

```
REVOKE_ALL_RATE_LIMIT_WINDOW_MS=900000
REVOKE_ALL_RATE_LIMIT_MAX=5
```

---

## Limites

- Les rapports admin ne sont pas chiffrés — répertoire `data/` protégé par défaut
- La pagination JSON (sans SQLite) charge tout en mémoire avant de découper
- Les notifications WS ne sont pas persistées — historique perdu au redémarrage
- L'export CSV n'a pas de limite supérieure autre que `limit=5000` par défaut

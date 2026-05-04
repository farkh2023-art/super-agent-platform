# Phase 5D — Basculement contrôlé vers SQLite

Phase 5D introduit le basculement contrôlé du mode de stockage (JSON → hybrid → SQLite) sans redémarrage serveur, avec une gate de readiness, un historique de switch, un toggle double-write, et une surveillance désync en temps réel via WebSocket.

## Nouvelles fonctionnalités

### runtimeConfig — persistance du mode sans redémarrage
Le fichier `data/storage-runtime.json` stocke le mode actif et l'état double-write. Il survit aux redémarrages serveur et prend priorité sur la variable d'environnement `STORAGE_MODE`. Le switch est donc immédiat et persistant.

### Readiness gate — vérifications pré-basculement
`GET /api/storage/migration/readiness-gate` vérifie :
- SQLite existe et est accessible
- La migration a été exécutée (événement `migration_completed` présent)
- Une validation a été enregistrée (événement `validation_completed` présent)
- Retourne `ready: true/false`, liste des `blockers` et `warnings`
- Retourne 200 si prêt, 409 sinon

### Basculement contrôlé — switch-mode
`POST /api/storage/switch-mode` bascule le mode de stockage actif :
- Protégé par `mutationsAllowed` + token de confirmation `I_UNDERSTAND_STORAGE_RISK`
- Vérifie la readiness gate avant de passer en mode `sqlite` ou `hybrid`
- Enregistre un événement `storage_mode_switched` avec `from`/`to`
- Retourne le mode précédent et le nouveau mode

### Toggle double-write
`POST /api/storage/set-double-write` active ou désactive l'écriture simultanée JSON+SQLite :
- Même protection que switch-mode
- Enregistre un événement `double_write_changed`
- Visible dans l'historique de switch

### Historique de switch
`GET /api/storage/switch-history` retourne l'historique des événements `storage_mode_switched` et `double_write_changed`.

### Surveillance désync WebSocket
`src/engine/storageMonitor.js` — démon optionnel activé via `SQLITE_DESYNC_MONITOR_ENABLED=true` :
- Vérifie les désyncs toutes les `SQLITE_DESYNC_INTERVAL_MS` ms (défaut : 30 000 ms)
- Diffuse `{ type: 'storage_desync', desynced, alerts }` via WebSocket
- Crée un événement `desync_detected` dans le journal

### UI — panneau basculement guidé
Trois groupes de boutons dans Migration Control :
- **Observation** : dry-run, validation, checksums, readiness, désync, compare IDs, rapports, dump
- **Basculement contrôlé** : readiness gate, historique switch, double-write, → hybrid, → SQLite, → JSON
- **Actions dangereuses** : run migration, rollback

Bannière rouge `#storage-desync-banner` s'affiche automatiquement à la réception d'un événement WebSocket `storage_desync`.

## Configuration

```env
SQLITE_DESYNC_MONITOR_ENABLED=false   # activer la surveillance en arrière-plan
SQLITE_DESYNC_INTERVAL_MS=30000       # intervalle de vérification (ms)
```

## Endpoints Phase 5D

| Méthode | Endpoint | Description |
|---|---|---|
| GET | `/api/storage/migration/readiness-gate` | Gate pré-basculement (200 OK / 409 bloqué) |
| POST | `/api/storage/switch-mode` | Bascule le mode (json/sqlite/hybrid) |
| POST | `/api/storage/set-double-write` | Active/désactive le double-write |
| GET | `/api/storage/switch-history` | Historique des switchs de mode |

## Fichiers modifiés

- `src/storage/runtimeConfig.js` — nouveau module (persistance mode+doubleWrite)
- `src/engine/storageMonitor.js` — nouveau démon WebSocket désync
- `src/storage/migrations.js` — `getMigrationReadinessGate()`
- `src/storage/index.js` — `mode()` et `doubleWrite` via runtimeConfig
- `src/storage/hybridStore.js` — `doubleWriteEnabled()` via runtimeConfig
- `src/routes/storage.js` — 4 nouveaux endpoints
- `src/server.js` — démarrage du storageMonitor
- `frontend/js/api.js` — 4 nouvelles méthodes
- `frontend/js/app.js` — 4 nouvelles fonctions UI + handler WS désync
- `frontend/index.html` — panneau basculement guidé + bannière désync
- `tests/phase5d-controlled-switch.test.js` — 25 nouveaux tests

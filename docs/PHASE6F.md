# Phase 6F — JTI Blacklist SQLite, Sessions UI, Cleanup, Audit IP/UA, Backup Auth Sécurisé

## Résumé

Phase 6F renforce l'exploitation multi-utilisateur avec :

- **Blacklist JTI persistante** (SQLite ou mémoire, sélection automatique)
- **UI Sessions** : visualisation, révocation unitaire, révocation globale
- **Cleanup automatique** : sessions expirées, JTI expirés, logs anciens
- **Audit logs enrichis** : IP client et User-Agent capturés optionnellement
- **Backup auth sécurisé** : auth.sqlite exclu par défaut, summary sans secrets inclus

## Variables d'environnement

| Variable | Défaut | Description |
|---|---|---|
| `ACCESS_BLACKLIST_STORE` | `auto` | Store JTI : `auto`, `memory`, `sqlite` |
| `ACCESS_BLACKLIST_CLEANUP_INTERVAL_MS` | `21600000` | Intervalle cleanup JTI (ms) |
| `AUTH_CLEANUP_INTERVAL_MS` | `21600000` | Intervalle cleanup global (ms) |
| `AUTH_CLEANUP_ENABLED` | `false` | Activer cleanup automatique au démarrage |
| `BACKUP_INCLUDE_AUTH_DB` | `false` | Inclure auth.sqlite dans le backup |
| `BACKUP_INCLUDE_AUTH_SUMMARY` | `true` | Inclure auth_summary.json (sans secrets) |
| `AUDIT_CAPTURE_IP` | `true` | Capturer IP client dans audit log |
| `AUDIT_CAPTURE_USER_AGENT` | `true` | Capturer User-Agent dans audit log |

## Endpoints ajoutés

| Méthode | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/api/auth/cleanup/status` | admin | Statut du service cleanup |
| `POST` | `/api/auth/cleanup` | admin | Déclencher cleanup manuel |
| `POST` | `/api/auth/sessions/revoke-all` | user | Révoquer toutes ses sessions |
| `DELETE` | `/api/auth/sessions/:id` | user/admin | Révoquer une session (propre ou toutes pour admin) |

### Format de réponse cleanup

```json
{
  "success": true,
  "sessionsRemoved": 3,
  "jtiRemoved": 12,
  "auditRemoved": 0,
  "durationMs": 45,
  "runAt": "2026-05-05T10:00:00.000Z"
}
```

### Format auth_summary.json (backup)

```json
{
  "usersCount": 5,
  "activeSessionsCount": 8,
  "revokedSessionsCount": 2,
  "auditEventsCount": 150,
  "blacklistCount": 3,
  "generatedAt": "2026-05-05T10:00:00.000Z"
}
```

## Architecture

### JTI Blacklist

```
tokenBlacklist.js
  └─ accessBlacklistStore.js (factory)
       ├─ accessBlacklistMemory.js  (Set en mémoire, hashage SHA-256)
       └─ accessBlacklistSqlite.js  (table auth_jti_blacklist, hashage SHA-256)
```

Le JTI n'est jamais stocké en clair. Seul son hash SHA-256 est persisté.

### Table auth_jti_blacklist

```sql
CREATE TABLE auth_jti_blacklist (
  jti_hash TEXT PRIMARY KEY,
  user_id TEXT,
  expires_at TEXT NOT NULL,
  revoked_at TEXT NOT NULL,
  reason TEXT,
  metadata_json TEXT,
  raw_json TEXT  -- toujours NULL
);
```

### Cleanup automatique

`authCleanup.js` gère un intervalle `.unref()` qui :
1. Supprime les sessions refresh expirées ou révoquées
2. Supprime les entrées JTI expirées
3. Nettoie les audit logs anciens (optionnel)

Protection contre les exécutions concurrentes via flag `_running`.

## UI Sessions

La vue **Sessions** (accessible en mode multi-utilisateur) affiche :
- Date de création, expiration
- IP client et User-Agent si disponibles
- Bouton de révocation par session
- Bouton "Révoquer autres sessions"
- Bouton Cleanup (admin uniquement)

Les tokens bruts, hashes et mots de passe ne sont jamais exposés.

## Sécurité

- Aucun JTI brut en DB — hash SHA-256 uniquement
- Aucun token brut en DB — hash SHA-256 uniquement
- Aucun `Authorization` ni `Cookie` capturé dans les audit logs
- User-Agent tronqué à 256 caractères max
- IP extraite de `X-Forwarded-For` ou `req.ip`
- `auth.sqlite` exclu du backup par défaut
- `password_hash`, `token_hash`, `jti_hash` absents du backup summary

## Limites restantes

- `last_used_at` des sessions est mis à jour à la création, pas à chaque refresh
- La blacklist mémoire est perdue au redémarrage (normal — tokens courte durée)
- Le cleanup des audit logs est désactivé dans `runCleanup` par défaut (`skipAudit`)
- Pas de pagination sur la liste de sessions

## Recommandation Phase 7

- Implémenter WebSocket notifications pour révocations temps réel
- Ajouter pagination sur sessions et audit log
- Mettre à jour `last_used_at` lors de chaque vérification de refresh token
- Rate limiting sur `POST /api/auth/sessions/revoke-all`
- Export audit log CSV

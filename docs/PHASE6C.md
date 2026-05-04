# Phase 6C — Refresh Token, Rotation et UI Admin Avancée

Phase 6C complète le cycle de session : access token court (15 min), refresh token rotatif (7 jours), révocation serveur au logout ou désactivation compte, session timer visible, gestion admin des utilisateurs et filtres d'audit log.

## Refresh Token — design

| Propriété | Valeur |
|---|---|
| Access token TTL | `ACCESS_TOKEN_TTL_SECONDS` (défaut 900 = 15 min) |
| Refresh token TTL | 7 jours (hardcodé) |
| Stockage | `data/refresh-tokens.json` (exclu git via `data/`) |
| Format | 32 octets aléatoires hex (64 chars) |
| Rotation | Chaque `/refresh` révoque l'ancien token et en émet un nouveau |
| Révocation logout | `POST /api/auth/logout { refreshToken }` révoque côté serveur |
| Révocation désactivation | `PUT /api/auth/users/:id { disabled: true }` révoque tous les tokens |

## Nouveaux endpoints

| Méthode | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/refresh` | Public | Échange refresh token → nouveau access + refresh (rotation) |
| PUT | `/api/auth/users/:id` | Admin | Modifier rôle / disabled / workspaceId |
| DELETE | `/api/auth/users/:id` | Admin | Supprimer utilisateur (révoque tous les tokens) |

## Endpoints modifiés

| Endpoint | Modification |
|---|---|
| `POST /api/auth/login` | Retourne `{ token, refreshToken, expiresIn, user }` — access token 15 min |
| `POST /api/auth/logout` | Accepte `{ refreshToken }` pour révocation serveur |
| `GET /api/auth/audit-log` | Query params `?username=&method=&from=&to=` |

## Session timer (frontend)

Le JWT payload est décodé côté client (base64, sans vérification — le backend valide) pour extraire `exp`. Un `setInterval` toutes les secondes met à jour l'affichage dans la sidebar :

- Couleur normale : `> 2 min`
- Couleur jaune : `≤ 2 min`
- Auto-refresh silencieux : déclenché à `≤ 60 s`
- Couleur rouge : `Expirée`

Le timer est lancé au login et à la restauration de session (`initAuth`), et stoppé au logout.

## Auto-refresh transparent (frontend)

Sur réception d'une réponse `401` dans `apiFetch` :

1. Tente un refresh silencieux avec le `sap_refresh` stocké dans localStorage
2. Si le refresh réussit → stocke les nouveaux tokens, relance la requête originale
3. Si le refresh échoue → supprime les tokens, dispatch `auth:unauthorized`, affiche le login overlay

Le flag `_refreshing` empêche les appels concurrents au refresh.

## Admin Users UI

Accessible dans la vue **Workspaces** (admin uniquement) — section "Gestion des utilisateurs" :

- Table de tous les utilisateurs avec badge rôle et badge "Désactivé"
- Bouton **Promouvoir/Rétrograder** : bascule `user ↔ admin`
- Bouton **Désactiver/Activer** : flag `disabled`, révoque tous les refresh tokens
- Protection : impossible de modifier son propre compte via ces boutons

## Audit Log Filters

La vue **Audit Log** présente un formulaire de filtrage :

| Filtre | Type | Comportement |
|---|---|---|
| Utilisateur | text | Filtre exact sur `username` |
| Méthode | select | POST / PUT / PATCH / DELETE |
| Depuis | date | `createdAt >= from` |
| Jusqu'à | date | `createdAt <= to 23:59:59` |

Filtres envoyés côté backend, filtrés avant la pagination `limit`.

## Nouveaux fichiers

| Fichier | Rôle |
|---|---|
| `backend/src/auth/refreshTokens.js` | Store de refresh tokens (issue, verify, revoke, revokeAllForUser) |
| `backend/tests/phase6c-refresh-token.test.js` | 25 tests Phase 6C |
| `docs/PHASE6C.md` | Documentation |

## Fichiers modifiés

| Fichier | Modification |
|---|---|
| `backend/src/auth/users.js` | `updateUser(id, patch)`, `deleteUser(id)` |
| `backend/src/middleware/requireAuth.js` | `/auth/refresh` dans PUBLIC_PATHS, check user.disabled |
| `backend/src/middleware/auditLog.js` | `listAuditLog` filtre par username/method/from/to |
| `backend/src/routes/auth.js` | login + refresh token, `POST /refresh`, `PUT/DELETE /users/:id`, logout révocation |
| `frontend/js/api.js` | `AuthToken.getRefresh/setRefresh/clearRefresh`, auto-refresh sur 401, `API.refresh`, `API.updateUser`, `API.deleteUser`, `API.getAuditLog(params)`, `API.logout(rt)` |
| `frontend/js/app.js` | Session timer, `doSilentRefresh`, admin users UI, audit log filters |
| `frontend/index.html` | `#session-timer`, `#admin-users-section`, filtres audit log |

## Variables .env

```env
ACCESS_TOKEN_TTL_SECONDS=900    # durée access token en secondes (défaut 15 min)
```

## Données non trackées

- `data/refresh-tokens.json` — exclu par `data/` dans `.gitignore`

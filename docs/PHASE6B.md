# Phase 6B — Frontend Auth UI & Session Management

Phase 6B ajoute l'interface utilisateur d'authentification dans le SPA : login overlay, indicateur utilisateur, sélecteur de workspace, badge workspace dans le Command Center, UI admin de l'audit log — sans casser la rétrocompatibilité mode single.

## Mode de fonctionnement

| Mode | Comportement UI |
|---|---|
| `single` (défaut) | Aucun login affiché, accès direct à l'application comme avant |
| `multi` | Login overlay au démarrage si pas de token valide, nav items workspace/audit-log visibles |

## Nouvelles fonctionnalités UI

### Login Overlay
- S'affiche en mode multi si aucun token JWT valide dans localStorage
- Champs `username` / `password` (type="password" — jamais loggé)
- Soumission par bouton ou touche Entrée
- Message d'erreur inline (jamais de token dans les messages)
- Après login réussi : token stocké dans `localStorage.sap_jwt`, overlay masqué

### User Pill (sidebar footer)
- Visible uniquement en mode multi et connecté
- Affiche : `username (role)` et nom du workspace courant
- Bouton "Déco." → logout immédiat, overlay réaffiché

### Workspace Selector
- Nav item `🏢 Workspaces` visible en mode multi
- Liste tous les workspaces accessibles
- Workspace sélectionné mis en évidence (bordure accent)
- Admin : formulaire de création de workspace (nom + limite maxTasks)

### Command Center (execute view)
- Badge "Workspace actif" visible en mode multi quand workspace sélectionné
- `POST /api/tasks` reçoit automatiquement `workspaceId` si workspace sélectionné
- La task créée apparaît dans la liste workspace (`GET /api/workspaces/:id/tasks`)

### Audit Log (admin)
- Nav item `🔎 Audit Log` visible uniquement pour les admin en mode multi
- Tableau : date, utilisateur, méthode, route, status HTTP, durée
- Aucun token ni password dans les entrées (sanitisé côté backend Phase 6A)

## Injection JWT automatique

Toutes les requêtes `apiFetch` injectent automatiquement `Authorization: Bearer <token>` si un token est présent. Sur réception d'un 401 :
- Token supprimé de localStorage
- Événement `auth:unauthorized` dispatché
- Login overlay réaffiché avec message "Session expirée"

## Backend — workspaceId dans les tâches

`POST /api/tasks` accepte désormais un champ optionnel `workspaceId` dans le corps. Si fourni, il est stocké dans la tâche et la tâche apparaît automatiquement dans `GET /api/workspaces/:id/tasks` (via le filtre `forWorkspace`).

## Aucun token/password loggé

- `apiFetch` n'appelle jamais `console.log` avec les headers d'autorisation
- Le champ `login-password` est de type `password` (masqué à l'écran)
- Après login réussi, le champ password est vidé
- L'audit log backend sanitise les valeurs sensibles (Phase 6A)

## Fichiers modifiés

| Fichier | Modification |
|---|---|
| `frontend/js/api.js` | Token management (`AuthToken`), injection header Authorization, handle 401, API auth+workspace |
| `frontend/js/app.js` | `initAuth`, `doLogin`, `doLogout`, `loadWorkspacesView`, `selectWorkspace`, `loadAuditLogView`, `updateAuthUI`, `navigate` étendu, `submitTask` workspace-aware |
| `frontend/index.html` | Login overlay, user pill sidebar, nav workspaces/audit-log, badge execute view, views workspaces et audit-log |
| `backend/src/routes/tasks.js` | Accepte et stocke `workspaceId` optionnel depuis le body |

## Tests ajoutés : 16

- Auth mode endpoint public (2)
- workspaceId dans tasks (3)
- Single-user backward compat (3)
- Login multi-user flow (4)
- Workspace-scoped task creation (3)
- Audit log sans secrets exposés (1)

## Variables .env — aucune nouvelle

Phase 6B est 100% frontend + une extension du backend existant. Les variables Phase 6A (`AUTH_MODE`, `JWT_SECRET`, `RATE_LIMIT_*`) restent inchangées.

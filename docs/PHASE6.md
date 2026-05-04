# Phase 6A — Authentification multi-utilisateur locale et workspaces

Phase 6A introduit un système d'authentification local optionnel (JWT, mots de passe hashés avec scrypt), des workspaces isolés, des audit logs, un rate limiter par workspace et un rollback vers le mode mono-utilisateur — le tout sans dépendance npm supplémentaire.

## Mode de fonctionnement

| Variable | Valeur | Comportement |
|---|---|---|
| `AUTH_MODE` | `single` (défaut) | Aucune auth requise, toutes les routes accessibles comme avant |
| `AUTH_MODE` | `multi` | JWT obligatoire sur toutes les routes, isolation workspace active |

Le mode peut aussi être persisté dans `data/auth-runtime.json` (priorité sur env var) via `POST /api/auth/set-mode`.

## Aucune nouvelle dépendance npm

- Hachage : `crypto.scryptSync` (Node.js natif)
- JWT : HMAC-SHA256 via `crypto.createHmac` (Node.js natif)
- Signature en temps constant : `crypto.timingSafeEqual`

## Nouveaux modules

| Fichier | Rôle |
|---|---|
| `src/auth/jwt.js` | Sign/verify JWT HS256 sans bibliothèque externe |
| `src/auth/users.js` | Store local (data/users.json), scrypt, jamais de hash exposé |
| `src/auth/workspaces.js` | Store workspaces avec limites configurables |
| `src/auth/authConfig.js` | Persistance du mode auth (auth-runtime.json) |
| `src/middleware/requireAuth.js` | Vérification JWT, public paths, requireRole() |
| `src/middleware/auditLog.js` | Log de toutes les mutations en mode multi |
| `src/middleware/rateLimiter.js` | Rate limit par workspaceId ou IP |
| `src/storage/workspaceStorage.js` | Façade de storage filtrée par workspaceId |

## Endpoints Phase 6A

| Méthode | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/auth/mode` | Public | Mode actuel (single/multi) |
| POST | `/api/auth/login` | Public | Login → JWT |
| POST | `/api/auth/register` | Admin | Créer un utilisateur |
| GET | `/api/auth/me` | JWT | Infos utilisateur courant |
| GET | `/api/auth/users` | Admin | Liste des utilisateurs (sans hash) |
| GET | `/api/auth/audit-log` | Admin | Journal d'audit |
| POST | `/api/auth/set-mode` | Admin | Switch single↔multi (confirmation requise) |
| POST | `/api/auth/logout` | JWT | Invalide côté client |
| GET | `/api/workspaces` | Admin | Liste des workspaces |
| POST | `/api/workspaces` | Admin | Créer un workspace |
| GET | `/api/workspaces/:id` | Member | Détail workspace |
| GET | `/api/workspaces/:id/tasks` | Member | Tasks du workspace (isolation) |
| POST | `/api/workspaces/:id/tasks` | Member | Créer une task (respect limite) |
| GET | `/api/workspaces/:id/executions` | Member | Executions du workspace |
| GET | `/api/workspaces/:id/artifacts` | Member | Artifacts du workspace |

## Isolation workspace

Chaque item créé via les routes workspace-scoped reçoit un champ `workspaceId`. La façade `forWorkspace(id)` filtre automatiquement toutes les lectures. Un utilisateur du workspace B ne peut pas accéder aux ressources du workspace A (403 Access denied).

## Limites workspace

```json
{
  "limits": {
    "maxTasks": 1000,
    "maxExecutions": 500
  }
}
```

Configurables à la création du workspace. Retourne 429 si la limite est atteinte.

## Audit log

Active uniquement en mode multi. Enregistre toutes les requêtes mutantes (POST, PUT, PATCH, DELETE) dans `data/audit-log.json` (max 1000 entrées). Les secrets (passwordHash, tokens) sont purgés via `sanitizeValue`.

Chaque entrée contient : `id, userId, username, workspaceId, method, path, statusCode, durationMs, createdAt`.

## Rate limiter

Active uniquement en mode multi. Limite par `workspaceId` (ou IP si non authentifié). Retourne 429 avec `retryAfter`.

```env
RATE_LIMIT_WINDOW_MS=60000       # fenêtre (ms)
RATE_LIMIT_MAX_REQUESTS=200      # max requêtes par fenêtre
```

## Rollback vers mode mono-utilisateur

```bash
# Via API (admin requis)
POST /api/auth/set-mode
{ "mode": "single", "confirmation": "I_UNDERSTAND_AUTH_RISK" }

# Via env var (redémarrage)
AUTH_MODE=single
```

Après rollback, toutes les routes redeviennent accessibles sans token. Le fichier `auth-runtime.json` prend priorité sur l'env var.

## Variables .env Phase 6A

```env
AUTH_MODE=single                  # single (défaut) ou multi
JWT_SECRET=CHANGE-IN-PRODUCTION   # secret HMAC-SHA256 (obligatoire en production)
RATE_LIMIT_WINDOW_MS=60000        # fenêtre rate limit (ms)
RATE_LIMIT_MAX_REQUESTS=200       # max requêtes par fenêtre
```

## Données sensibles non trackées

- `data/users.json` — exclu par `backend/data/` dans `.gitignore`
- `data/workspaces.json` — idem
- `data/audit-log.json` — idem
- `data/auth-runtime.json` — idem
- Aucun mot de passe en clair ni token JWT dans les logs ni dans git

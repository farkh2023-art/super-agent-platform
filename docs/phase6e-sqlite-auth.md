# Phase 6E — SQLite persistence pour l'auth

## 1. Objectif

Migrer le stockage des données d'authentification (utilisateurs, sessions, audit, workspaces, config) de fichiers JSON vers SQLite, avec fallback automatique vers JSON quand SQLite est désactivé. Aucun token brut ne doit apparaître en base, dans les logs ou dans les backups.

---

## 2. Architecture

### Base de données dédiée : `auth.sqlite`

Séparée de la base principale (`super-agent-platform.sqlite`), elle contient les tables d'auth uniquement :

| Table | Contenu |
|---|---|
| `auth_users` | Comptes utilisateurs (password_hash, role, disabled…) |
| `auth_refresh_tokens` | Sessions actives — **token stocké hashé SHA-256** |
| `auth_audit_log` | Événements mutants tracés |
| `auth_workspaces` | Espaces de travail |
| `auth_config` | Paramètres runtime (mode auth…) |

### Activation

```env
AUTH_SQLITE=true          # Active la persistance SQLite pour l'auth
AUTH_SQLITE=false         # Force le mode JSON (défaut si non défini)
# ou implicitement via :
STORAGE_MODE=sqlite       # Active SQLite auth aussi
STORAGE_MODE=hybrid
```

Si `AUTH_SQLITE` n'est pas défini ou est `false`, tous les modules retombent sur les fichiers JSON existants (`users.json`, `refresh-tokens.json`, `audit-log.json`, etc.).

---

## 3. Sécurité des tokens

Les refresh tokens ne sont **jamais** stockés en clair. À l'émission :

```
raw_token  = randomBytes(32).toString('hex')   ← envoyé au client
token_hash = SHA-256(raw_token)                ← stocké en DB/JSON
```

La vérification hash le candidat entrant et cherche le hash. Résultat : même si la DB ou un backup est compromis, les tokens sont inutilisables.

---

## 4. Nouveaux fichiers

| Fichier | Rôle |
|---|---|
| `src/auth/authDb.js` | Connexion SQLite auth, schéma, `getAuthDb()`, `isAvailable()` |
| `src/auth/sessionManager.js` | `migrateJsonToSqlite()`, `runCleanup()` |

---

## 5. Fichiers modifiés

| Fichier | Changement |
|---|---|
| `src/auth/refreshTokens.js` | Hash SHA-256, SQLite, `listActiveSessions()`, `revokeSessionById()`, `cleanupExpiredTokens()` |
| `src/auth/users.js` | SQLite avec fallback JSON |
| `src/auth/workspaces.js` | SQLite avec fallback JSON |
| `src/auth/authConfig.js` | SQLite avec fallback JSON |
| `src/middleware/auditLog.js` | SQLite avec fallback JSON, `cleanupOldAuditEntries()` |
| `src/routes/auth.js` | 5 nouvelles routes (sessions, cleanup, migrate, db-status) |

---

## 6. Nouvelles routes API

| Méthode | Route | Accès | Description |
|---|---|---|---|
| `GET` | `/api/auth/sessions` | auth | Liste les sessions actives (admin : tous, user : les siennes) |
| `DELETE` | `/api/auth/sessions/:id` | admin | Révoque une session par son ID |
| `POST` | `/api/auth/cleanup` | admin | Purge tokens expirés + anciens audit (90 j par défaut) |
| `POST` | `/api/auth/migrate` | admin | Importe JSON existants → SQLite |
| `GET` | `/api/auth/db-status` | admin | Statut de la connexion auth SQLite |

---

## 7. Tests ajoutés

Fichier : `tests/phase6e-sqlite-auth.test.js`

**38 tests** répartis en 8 suites :

| Suite | Tests |
|---|---|
| authDb availability | 5 |
| Token hashing (no raw token in DB) | 6 |
| Sessions in SQLite | 5 |
| Audit log in SQLite | 3 |
| Users in SQLite | 4 |
| Cleanup | 4 |
| Migration JSON → SQLite | 3 |
| Sessions API endpoint | 5 |
| Fallback JSON mode | 2 |
| db-status endpoint | 1 |

---

## 8. Nombre total de tests

| Phase | Tests |
|---|---|
| Avant Phase 6E | 331 |
| Phase 6E ajoutés | 38 |
| **Total** | **369** |

---

## 9. Résultats

```
Test Suites: 31 passed, 31 total
Tests:       369 passed, 369 total
```

Toutes les suites existantes restent vertes. Aucune régression.

---

## 10. Limites restantes

- Le frontend n'affiche pas encore la liste des sessions (`/api/auth/sessions`) — un composant dédié reste à créer.
- La rotation automatique des refresh tokens à l'expiration (cron nightly cleanup) n'est pas encore planifiée — elle doit être déclenchée via `POST /api/auth/cleanup` ou un cron applicatif.
- `tokenBlacklist` (JTI) reste en mémoire : redémarrage server = JTI perdus. Acceptable car les access tokens sont courts (15 min par défaut). Une persistance SQLite des JTI pourrait être ajoutée en Phase 6F.
- La backup ZIP inclut la base `auth.sqlite` — les tokens y sont hashés donc sûrs, mais la DB contient les password_hash (scrypt). À exclure ou chiffrer si le backup est hébergé.

---

## 11. Recommandation Phase 6F

**Phase 6F — Persistance JTI blacklist + UI sessions + chiffrement backup auth**

Priorités suggérées :

1. **SQLite JTI blacklist** — persister les JTI révoqués en base pour survivre aux redémarrages. Table `auth_jti_blacklist(jti TEXT PK, revoked_at TEXT, expires_at TEXT)` avec TTL = durée access token.
2. **UI sessions** — page `/settings/sessions` listant les sessions actives avec bouton "Révoquer" pour chaque ligne.
3. **Cleanup automatique** — cron interne (ex. toutes les 6h) appelant `runCleanup()` sans intervention manuelle.
4. **Chiffrement sélectif backup** — exclure ou AES-chiffrer `auth.sqlite` dans les exports ZIP.
5. **Audit enrichi** — ajouter IP, User-Agent dans `auth_audit_log` pour détection d'anomalies.

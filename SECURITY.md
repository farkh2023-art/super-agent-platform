# Politique de Sécurité – Super-Agent Platform

## Gestion des secrets

### Ce qui NE DOIT PAS être commis dans git

| Type | Exemples | Protection |
|------|----------|------------|
| Clés API | `sk-ant-...`, `sk-...` | `.gitignore` → `.env` ignoré |
| Credentials OAuth | tokens, refresh tokens | `.gitignore` → `.env` ignoré |
| Certificats | `*.pem`, `*.key` | `.gitignore` |
| Données runtime | `backend/data/` | `.gitignore` |

### Flux de configuration sécurisé

```
.env.example  ──(copier)──▶  .env  ──(jamais commité)──▶ git
     ↑                         ↓
 commité dans git          chargé par dotenv
 (placeholders uniquement)  (clés réelles)
```

**Règle absolue** : le fichier `.env` ne doit jamais être commité. Le `.gitignore` le protège, mais vérifiez toujours avant un `git push`.

---

## Architecture de sécurité de l'application

### Clés API

- Les clés API sont **exclusivement lues depuis les variables d'environnement** (`process.env`)
- Elles ne transitent **jamais** par l'API REST (`GET /api/settings` et `GET /api/settings/status` masquent les clés)
- `POST /api/settings/test-provider` ne retourne jamais la clé, seulement un booléen de succès
- Le frontend n'a **jamais** accès aux clés — elles restent dans le processus Node.js backend

### Fichier `backend/src/routes/settings.js`
```js
// Les clés API sont SUPPRIMÉES avant la réponse
delete settings.anthropicApiKey;
delete settings.openaiApiKey;
```

### Stockage des données

- Les données sont stockées localement dans `backend/data/` (JSON)
- Ce répertoire est dans `.gitignore` — il n'est jamais commité
- Aucune donnée utilisateur n'est envoyée vers des services tiers (sauf si un fournisseur IA est configuré)

---

## Sauvegarde ZIP (`GET /api/backup/download`)

La sauvegarde ZIP exclut systématiquement les secrets :

```js
const SENSITIVE_FIELDS = ['anthropicApiKey', 'openaiApiKey', 'password', 'token', 'secret'];
function sanitize(obj) {
  const copy = { ...obj };
  for (const field of SENSITIVE_FIELDS) delete copy[field];
  return copy;
}
```

- Le `settings.json` dans le ZIP est **sanitisé** avant inclusion
- Les collections de données (tasks, executions, artifacts, workflows) ne contiennent pas de clés API
- Les logs JSONL (`data/logs/`) contiennent uniquement des messages de log sans secrets
- Le ZIP inclut un `manifest.json` avec un avertissement explicite : *"No API keys are stored in this backup"*

---

## Validation des entrées

| Couche | Protection |
|--------|-----------|
| `POST /api/tasks` | Validation `task` requis, non vide, type string |
| `POST /api/workflows` | Validation `name` + `steps` non vides |
| `POST /api/workflows/import` | Validation structure JSON : `name` + `steps` requis |
| `GET /api/search` | Paramètre `q` requis et non vide |
| Frontend | `escHtml()` sur toutes les données affichées (prévention XSS) |
| Providers IA | Les clés API sont validées avant appel, erreurs propagées proprement |

---

## Prévention des injections

### XSS (Cross-Site Scripting)
Toutes les données affichées dans le frontend passent par `escHtml()` :
```js
function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
```

### Injection de commandes
- Les providers IA reçoivent des prompts en clair, pas des commandes système
- Aucun `exec()` ou `spawn()` n'est utilisé avec des entrées utilisateur

### Injection de prompt (pour les fournisseurs IA réels)
- Les prompts système sont définis statiquement dans `registry.js`
- Le contenu utilisateur est inséré dans le message `user`, pas dans le `system`
- Suivre les recommandations Anthropic / OpenAI pour la séparation system/user

---

## Authentification par clé API (Phase 3)

Lorsque `API_KEY` est défini dans `.env`, tous les endpoints `/api/*` exigent un token :

```
Authorization: Bearer <API_KEY>
# ou
X-Api-Key: <API_KEY>
```

- Routes **toujours publiques** : `GET /api/health`, `GET /api/health/detailed`
- Si `API_KEY` est vide, l'authentification est désactivée (mode local sans friction)
- La valeur de `API_KEY` n'est **jamais retournée** par l'API – `GET /api/settings/status` retourne uniquement `authEnabled: bool`
- La valeur de `API_KEY` n'est **jamais incluse** dans le backup ZIP (non stockée en JSON)

**Génération d'une clé sécurisée :**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Protection contre les abus

### Limite de concurrence (`MAX_CONCURRENT_EXECUTIONS`)
- Par défaut : 3 exécutions simultanées maximum
- Les exécutions supplémentaires sont **mises en file d'attente** (jamais rejetées)
- Configurable via `.env` : `MAX_CONCURRENT_EXECUTIONS=3`
- Prévient la saturation des ressources serveur et les abus de rate limit API

### Import de workflows
- L'import JSON valide la structure avant création (nom + étapes requis)
- De nouveaux IDs sont assignés à l'import (aucune collision avec les workflows existants)
- Les agentIds importés sont acceptés tels quels ; la validation a lieu à l'exécution

---

## Dépendances

Les dépendances sont auditées régulièrement :

```bash
cd backend
npm audit                  # Vérifier les CVE
npm audit fix              # Corriger les CVE automatiquement
```

Dépendances de production (sans bloat) :
- `express` — serveur web
- `ws` — WebSocket
- `uuid` — génération d'IDs
- `dotenv` — chargement `.env`
- `cors` — headers CORS
- `pdfkit` — export PDF des artefacts
- `archiver` — sauvegarde ZIP
- `@anthropic-ai/sdk` — Claude (optionnel)
- `openai` — OpenAI (optionnel)

---

## Phase 6F — Sécurité renforcée

### Blacklist JTI persistante
- Le JTI (JWT ID) est hashé en SHA-256 avant stockage (jamais en clair)
- Store auto : SQLite si disponible, mémoire sinon (`ACCESS_BLACKLIST_STORE=auto`)
- Les entrées expirées sont nettoyées par le service cleanup

### Audit logs
- IP client capturée depuis `X-Forwarded-For` ou `req.ip`
- User-Agent capturé et tronqué à 256 caractères
- Désactivables via `AUDIT_CAPTURE_IP=false` / `AUDIT_CAPTURE_USER_AGENT=false`
- **Jamais** stocké : header `Authorization`, header `Cookie`, mots de passe, tokens

### Sessions
- Révocables individuellement depuis l'UI
- Révocation de toutes ses sessions possible
- Sessions enrichies avec IP et User-Agent pour détection d'activité suspecte

### Backup
- `auth.sqlite` exclu par défaut (`BACKUP_INCLUDE_AUTH_DB=false`)
- Un `auth_summary.json` est inclus avec uniquement des compteurs (sans hash)
- `password_hash`, `token_hash`, `jti_hash` jamais présents dans le summary

---

## Phase 7 — Observabilité et Rapports Admin

### Admin Health (`GET /api/admin/health`)
- Aucun secret retourné — uniquement des compteurs et statuts
- En mode multi: admin uniquement; en mode single: accessible sans auth
- Les avertissements diffusés via WebSocket ne contiennent pas de secrets

### Export CSV Audit Log
- L'export CSV n'inclut jamais les headers `Authorization`, `Cookie`, mots de passe ou tokens
- Colonnes exposées: createdAt, username, userId, workspaceId, method, action, statusCode, ip, userAgent
- Admin uniquement en mode multi

### Rapports Admin
- Les fichiers générés dans `backend/data/admin-reports/` sont sanitisés — pas de secrets
- Inclus dans le backup ZIP (3 derniers) sans contenu sensible
- Les patterns `password`, `apiKey`, `token_hash`, `jti_hash`, `sk-ant` ne doivent jamais apparaître

### Rate Limit revoke-all
- `POST /api/auth/sessions/revoke-all` est limité par userId
- Par défaut: 5 tentatives / 15 minutes
- Configurable via `REVOKE_ALL_RATE_LIMIT_WINDOW_MS` et `REVOKE_ALL_RATE_LIMIT_MAX`

### WebSocket Notifications
- Les événements WS ne contiennent pas de secrets
- Le payload inclut uniquement des compteurs et identifiants non-sensibles
- L'historique en mémoire frontend est perdu à la déconnexion

---

## Signalement de vulnérabilités

Si vous découvrez une vulnérabilité de sécurité, **ne créez pas d'issue publique**. Contactez directement le mainteneur du projet.

---

## Checklist avant déploiement

- [ ] `.env` absent du dépôt git (`git status` ne le montre pas)
- [ ] `npm audit` retourne 0 vulnérabilités critiques/hautes
- [ ] Aucune clé API en dur dans le code (`grep -r "sk-ant-\|sk-[a-zA-Z]" src/`)
- [ ] `data/` absent du dépôt git
- [ ] Variables d'environnement de production configurées séparément
- [ ] CORS restreint à l'origine frontend uniquement (variable `FRONTEND_URL`)
- [ ] `MAX_CONCURRENT_EXECUTIONS` adapté à la capacité serveur
- [ ] Sauvegarde ZIP testée : aucune clé API dans le contenu

## Memoire RAG et embeddings locaux

- Les embeddings peuvent encoder indirectement du contenu sensible ; ils sont stockes localement et exclus du backup complet par defaut.
- Le contenu memoire est filtre avant stockage et avant generation d'embedding (`sk-ant`, `sk-`, `Bearer`, `API_KEY` et champs sensibles).
- Le provider d'embedding par defaut est Ollama local. Ne configurez pas de service distant sans revue de securite.
- La memoire injectee dans les prompts est du contexte non fiable : elle ne doit jamais etre executee comme instruction systeme.
- Les artefacts importes peuvent contenir des injections indirectes ; les agents recoivent une mention explicite que la memoire est non fiable.
- `DELETE /api/memory/embeddings` supprime les vecteurs sans supprimer les items memoire ; un reindex regenere les vecteurs apres filtrage.

## Evaluation RAG Phase 4E

- Les requetes d'evaluation peuvent contenir des extraits sensibles ; `query`, `expectedKeywords` et `description` sont sanitises avant stockage.
- Les rapports Markdown ne doivent jamais exporter de secrets bruts. Les patterns connus sont remplaces par `[REDACTED]`.
- Les scores `precision@K`, `recall@K` et `nDCG@K` sont des indicateurs de qualite locale, pas une verite absolue.
- Les elements memoire restent du contexte non fiable, meme lorsqu'ils obtiennent un bon score de retrieval.
- Le backup inclut les requetes d'evaluation et quelques rapports Markdown, mais exclut toujours `.env`, les secrets et les vecteurs complets.

## SQLite et Migration Control Phase 5B

- Le fichier `.sqlite` peut contenir artefacts, memoire et logs ; il doit rester local, protege et ignore par Git.
- Les dumps logiques SQLite sont sanitises contre les patterns de secrets connus et n'incluent pas les vecteurs complets.
- Les routes `/api/storage/migration/run` et `/api/storage/rollback` sont refusees par defaut via `STORAGE_ADMIN_ALLOW_MUTATIONS=false`.
- Toute mutation admin exige la confirmation exacte `I_UNDERSTAND_STORAGE_RISK`.
- Les storage events ne doivent jamais stocker de secrets ; les champs `secret`, `token`, `password` et `apiKey` sont rediges.
- Avant tout passage a `STORAGE_MODE=sqlite`, lancer dry-run, migration avec backup, validation et checksums.

## Phase 8 - Packaging local securise

- `release/create-release.ps1` genere un ZIP dans `dist/releases/` avec `MANIFEST.json` et checksum SHA256.
- Les packages excluent `.env`, `node_modules`, `backend/data`, `backend/data-test*`, `dist`, SQLite brut, logs runtime, `github_pat*.txt` et fichiers de tokens.
- `release/demo.ps1` et `release/start.ps1 -Mode demo` utilisent uniquement des variables de session PowerShell et ne modifient pas `.env`.
- `release/backup.ps1` prefere l'endpoint `/api/backup/download`; le fallback local exclut les secrets connus et SQLite brut sauf demande explicite.
- Voir [docs/SECURITY_CHECKLIST.md](docs/SECURITY_CHECKLIST.md) avant toute distribution locale.

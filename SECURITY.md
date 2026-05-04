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

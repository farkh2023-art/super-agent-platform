# Phase 3 – Sécurité, Déploiement & Notifications

## Nouvelles fonctionnalités

### 1. Authentification par clé API (`API_KEY`)

Protection optionnelle de tous les endpoints `/api/*` par un token statique.

**Configuration (`.env`) :**
```bash
API_KEY=votre-cle-secrete-longue-et-aleatoire
```

**Utilisation :**
```bash
# Header Authorization
curl -H "Authorization: Bearer votre-cle" http://localhost:3001/api/agents

# Header alternatif
curl -H "X-Api-Key: votre-cle" http://localhost:3001/api/agents
```

**Routes toujours publiques (pas d'auth) :**
- `GET /api/health`
- `GET /api/health/detailed`
- Tous les assets statiques frontend (`/`, `/js/*`, `/css/*`)

**Désactivation :** Laisser `API_KEY` vide (défaut) → aucune authentification.

---

### 2. Notifications Webhook

Appel HTTP automatique vers une URL externe à chaque fin d'exécution.

**Configuration (`.env`) :**
```bash
WEBHOOK_URL=https://hooks.example.com/superagent
WEBHOOK_SECRET=secret-partage-optionnel   # envoyé dans X-Webhook-Secret
```

**Format du payload POST :**
```json
{
  "event": "execution_done",
  "payload": {
    "executionId": "uuid",
    "task": "Analyser la base SQL...",
    "status": "completed"
  },
  "timestamp": "2026-05-04T02:00:00.000Z"
}
```

**Statuts possibles :** `completed`, `completed_with_errors`, `cancelled`

**Comportement :** timeout 10s, échec silencieux (ne crashe jamais l'app).

**Vérification :**
```bash
curl http://localhost:3001/api/settings/status | jq .webhookConfigured
```

---

### 3. Déploiement Docker

#### Build & Run rapide
```bash
# Copier la config
cp .env.example .env
# Éditer .env (AI_PROVIDER, API_KEY, etc.)

# Lancer avec Docker Compose
docker compose up -d

# Vérifier
curl http://localhost:3001/api/health
```

#### Build manuel
```bash
docker build -t super-agent-platform .
docker run -d \
  --name superagent \
  -p 3001:3001 \
  --env-file .env \
  -v superagent_data:/app/backend/data \
  super-agent-platform
```

#### Volumes
Les données persistentes sont dans le volume `superagent_data` monté sur `/app/backend/data`.

**Backup depuis Docker :**
```bash
# Via l'API (données sans secrets)
curl -o backup.zip http://localhost:3001/api/backup/download

# Ou directement le volume
docker run --rm -v superagent_data:/data -v $(pwd):/out alpine \
  tar czf /out/data_backup.tar.gz /data
```

#### Health check automatique
Le conteneur vérifie `GET /api/health` toutes les 30 secondes. Si 3 checks échouent, Docker redémarre le conteneur.

---

### 4. Statut enrichi des settings

`GET /api/settings/status` retourne désormais :

```json
{
  "provider": "mock",
  "hasClaudeKey": false,
  "hasOpenAIKey": false,
  "claudeModel": "claude-sonnet-4-6",
  "openaiModel": "gpt-4o",
  "ollamaUrl": "http://localhost:11434",
  "ollamaModel": "llama3.2",
  "mockMode": true,
  "webhookConfigured": false,
  "authEnabled": false
}
```

---

## Variables d'environnement Phase 3

| Variable | Défaut | Description |
|:---------|:-------|:------------|
| `API_KEY` | *(vide)* | Clé d'auth statique – vide = pas d'auth |
| `WEBHOOK_URL` | *(vide)* | URL appelée à chaque fin d'exécution |
| `WEBHOOK_SECRET` | *(vide)* | Secret partagé envoyé dans `X-Webhook-Secret` |

---

## Sécurité Phase 3

- `API_KEY` n'est jamais retournée par l'API (la route `/api/settings/status` retourne `authEnabled: bool`)
- Le backup ZIP ne contient ni `API_KEY` ni `WEBHOOK_SECRET` (champs épurés par `sanitize()`)
- Le Dockerfile n'embarque jamais `.env` (protégé par `.dockerignore`)
- Les volumes Docker isolent les données du système hôte

---

## Tests

```bash
cd backend
npm test   # 82 tests (6 suites + phase3)
```

Suite `tests/phase3.test.js` (10 tests) :
- Auth : 401 sans clé, 200 avec clé correcte, 401 avec mauvaise clé
- Health toujours public (200 sans auth)
- X-Api-Key header supporté
- `webhookConfigured` dans settings/status
- Backup ZIP sans secrets (régression)
- Fichiers Docker présents

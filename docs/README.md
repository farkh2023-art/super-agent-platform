# Super-Agent Platform

> Phase 10: public-release documentation portal with `/api/docs`, Documentation Center, local HTML guide generation and controlled release checks.

## Quick Start Windows

```powershell
.\release\install.ps1
.\release\start.ps1 -Mode demo
.\release\health-check.ps1
.\release\local-ci.ps1 -Version v2.9.0-phase-10 -Strict
```

Demo mode forces `AI_PROVIDER=mock`, `AUTH_MODE=single` and `STORAGE_MODE=json`. No API key is required.

## Scripts Phase 8

| Script | Role |
|:--|:--|
| `release/install.ps1` | Checks Node/npm, installs backend dependencies and prepares `.env` if missing |
| `release/start.ps1` | Starts the local server and records a PID |
| `release/stop.ps1` | Stops the recorded local server process |
| `release/demo.ps1` | Starts demo mode without API keys |
| `release/health-check.ps1` | Checks local health endpoints |
| `release/backup.ps1` | Creates a secure local backup |
| `release/create-release.ps1` | Generates a release ZIP and manifest in `dist/releases/` |
| `release/verify-release.ps1` | Verifies ZIP checksum, structure, forbidden files and sensitive patterns |
| `release/sign-release.ps1` | Generates a local SHA256 checksum signature |
| `release/local-ci.ps1` | Runs tests, release build, verification, signature and extracted ZIP test |
| `release/test-release.ps1` | Tests a release ZIP in a fresh temp directory |
| `release/cleanup-release-test.ps1` | Cleans release-test temp directories safely |
| `release/generate-docs.ps1` | Generates public guide HTML files and `DOCS_MANIFEST.json` |
| `release/release-public-check.ps1` | Runs the controlled pre-publication release gate |

## Packaging Release

```powershell
.\release\create-release.ps1 -Version v2.9.0-phase-10 -Verify -Strict
.\release\local-ci.ps1 -Version v2.9.0-phase-10 -Strict
.\release\release-public-check.ps1 -Offline -Json -Strict
```

The release package excludes `.env`, `node_modules`, runtime data, SQLite/database files, logs, local-only settings and token-like files. Local CI writes `LOCAL_CI_REPORT.json` and `LOCAL_CI_REPORT.md`.

Plateforme web locale pour gérer et orchestrer 10 agents IA spécialisés.

[![Tests](https://img.shields.io/badge/tests-Phase%2010-brightgreen)]()
[![Mode Mock](https://img.shields.io/badge/mode-mock%20(sans%20clé%20API)-yellow)]()
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-blue)]()
[![Phase](https://img.shields.io/badge/phase-10-blue)]()

---

## Démarrage rapide

```bash
# 1. Copier la configuration (ne jamais commiter .env)
cp .env.example .env

# 2. Installer les dépendances backend
cd backend && npm install

# 3. Démarrer le serveur
npm start        # ou: node src/server.js

# 4. Ouvrir dans le navigateur
#    http://localhost:3001
```

> **Mode Mock actif par défaut** — aucune clé API requise pour tester la plateforme.

---

## Sécurité

- Le fichier `.env` est **protégé par `.gitignore`** — il n'est jamais commité
- Les clés API ne transitent **jamais** par l'API REST (`GET /api/settings` masque les clés)
- Toutes les entrées HTML sont échappées (`escHtml()`) pour prévenir les injections XSS
- Voir [SECURITY.md](../SECURITY.md) pour la politique complète

---

## Fonctionnalités

| Feature | Statut |
|:--------|:------:|
| 10 agents spécialisés | ✅ |
| Mode Mock (sans clé API) | ✅ |
| Génération de plan d'exécution | ✅ |
| Exécution multi-agents séquentielle | ✅ |
| Logs temps réel (WebSocket) | ✅ |
| Artefacts téléchargeables (Markdown) | ✅ |
| Export PDF des artefacts | ✅ |
| Diagrammes Mermaid.js dans l'Artifact Viewer | ✅ |
| Logs structurés JSONL (`data/logs/YYYY-MM-DD.jsonl`) | ✅ |
| Dashboard stats (`GET /api/dashboard/stats`) | ✅ |
| Workflows multi-étapes | ✅ |
| Exécution parallèle de steps workflow | ✅ |
| Limite de concurrence (`MAX_CONCURRENT_EXECUTIONS`) | ✅ |
| Historique des workflow runs (`GET /api/workflow-runs`) | ✅ |
| Import / Export de workflows (JSON) | ✅ |
| Recherche globale (`GET /api/search?q=...`) | ✅ |
| Health détaillé (`GET /api/health/detailed`) | ✅ |
| Sauvegarde ZIP sans secrets (`GET /api/backup/download`) | ✅ |
| Test connexion provider (`POST /api/settings/test-provider`) | ✅ |
| Diagnostic Ollama (`GET /api/settings/ollama-health`) | ✅ |
| Dashboard enrichi (taux de réussite, statut système, concurrence) | ✅ |
| Erreurs providers enrichies (codes HTTP, messages actionables) | ✅ |
| Authentification par clé API (`API_KEY`, optionnelle) | ✅ |
| Notifications webhook (`WEBHOOK_URL` + `WEBHOOK_SECRET`) | ✅ |
| Déploiement Docker (`Dockerfile` + `docker-compose.yml`) | ✅ |
| Support Claude / OpenAI / Ollama | ✅ |
| Interface web SPA complète | ✅ |
| Dépôt git initialisé + `.gitignore` | ✅ |
| Scheduling de tâches (`POST /api/schedules`) | ✅ |
| Déclenchement manuel (`POST /api/schedules/:id/trigger`) | ✅ |
| Métriques par agent (`GET /api/metrics`) | ✅ |
| Backup ZIP inclut schedules + metrics | ✅ |
| Mémoire persistante (`POST /api/memory`) | ✅ |
| Recherche RAG (`GET /api/memory/search`) | ✅ |
| Injection de contexte mémoire dans les exécutions | ✅ |
| Filtrage des secrets avant indexation | ✅ |
| Embeddings Ollama optionnels (`MEMORY_EMBEDDINGS=ollama`) | ✅ |
| Backup ZIP inclut memory sans secrets | ✅ |
| Docs API (`GET /api/docs`) | ✅ |
| Documentation Center local | ✅ |
| Public release check script | ✅ |

---

## Architecture

```
super-agent-platform/
├── .env.example          ← Template de config (commité)
├── .env                  ← Config réelle (JAMAIS commité)
├── .gitignore            ← Protège .env, node_modules, data/
├── .gitattributes        ← Fins de ligne LF normalisées
├── SECURITY.md           ← Politique de sécurité
├── backend/
│   ├── src/
│   │   ├── agents/registry.js    # 10 définitions d'agents
│   │   ├── engine/               # Planificateur + Exécuteur + Concurrence + Workflows
│   │   ├── logging/jsonl.js      # Logs structurés JSONL
│   │   ├── providers/            # Claude, OpenAI, Ollama, Mock
│   │   ├── routes/               # API REST (agents, tasks, executions, search, backup…)
│   │   └── server.js             # Express + WebSocket
│   ├── tests/                    # 58 tests Jest (5 suites)
│   └── data/                     # Stockage JSON + logs JSONL (auto-créé, git-ignoré)
├── frontend/
│   ├── index.html                # SPA (7 vues : dashboard, agents, execute…)
│   ├── css/styles.css            # Thème sombre
│   └── js/                       # Client API + WebSocket + App
└── docs/
    ├── README.md                 # Ce fichier
    ├── AGENTS.md                 # Détail des 10 agents
    └── API.md                    # Référence API REST + WebSocket
```

---

## Connexion d'un fournisseur IA

Modifiez `.env` (ne pas commiter ce fichier) :

### Claude (Anthropic)
```bash
AI_PROVIDER=claude
ANTHROPIC_API_KEY=<votre_clé>
CLAUDE_MODEL=claude-sonnet-4-6
```

### OpenAI
```bash
AI_PROVIDER=openai
OPENAI_API_KEY=<votre_clé>
OPENAI_MODEL=gpt-4o
```

### Ollama (local, gratuit)
```bash
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
```

Vous pouvez aussi changer le fournisseur depuis l'interface web → **Paramètres**.

---

## Les 10 Agents

| # | Agent | ID | Domaine |
|:--:|:------|:---|:--------|
| 1 | SimAgent 🔬 | `sim-fdtd` | Simulations FDTD, nanoparticules |
| 2 | DataLineage-FR 🗄️ | `data-lineage-fr` | Lignée de données SQL (FR) |
| 3 | DataLineage-EN 📊 | `data-lineage-en` | Data lineage SQL (EN) |
| 4 | BACKLOG-FORGE 📋 | `backlog-forge` | Gestion de projet Agile |
| 5 | LettaBuilder 🤖 | `letta-builder` | Création d'agents Letta |
| 6 | LettaManager ⚙️ | `letta-manager` | Gestion d'agents Letta |
| 7 | RepoIndexer 🗂️ | `repo-indexer` | Analyse de codebase |
| 8 | ShellSpecialist 💻 | `shell-specialist` | Scripts shell POSIX |
| 9 | DevOpsManager 📦 | `devops-deps` | Gestion de dépendances |
| 10 | XScraper 🐦 | `x-scraper` | API X/Twitter (Xquik) |

---

## Tests

```bash
cd backend
npm test                   # Full backend test suite
npm run test:coverage      # Avec rapport de couverture
```

Suites :
- `tests/agents.test.js` — Registry des 10 agents (10 tests)
- `tests/planner.test.js` — Planificateur automatique (8 tests)
- `tests/api.test.js` — API REST end-to-end (18 tests)
- `tests/dashboard.test.js` — Dashboard stats endpoint (6 tests)
- `tests/phase2c.test.js` — Santé détaillée, recherche, import/export, backup (16 tests)
- `tests/phase2d.test.js` — Test provider, Ollama health, dashboard enrichi, audit secrets (14 tests)
- `tests/phase3.test.js` — Auth API key, webhook, Docker files, backup regression (15 tests)
- `tests/phase4a.test.js` — Schedules CRUD, trigger, métriques, backup (22 tests)
- `tests/phase4b.test.js` — Mémoire CRUD, secrets, RAG search, injection, backup (20 tests)

---

## API & Documentation

- **API REST** → [docs/API.md](API.md)
- **Agents** → [docs/AGENTS.md](AGENTS.md)
- **Sécurité** → [SECURITY.md](../SECURITY.md)

## Phase 10 - Documentation Portal

- **Phase 9 Distribution CI** -> [PHASE9.md](PHASE9.md)
- **Phase 10 Public Release Docs Portal** -> [PHASE10.md](PHASE10.md)

The local documentation API exposes `GET /api/docs` and `GET /api/docs/:id`.
The frontend Documentation Center consumes these endpoints from the app sidebar.
`release/generate-docs.ps1` exports public guides to `dist/docs/`, and `release/release-public-check.ps1` validates the controlled public-release gate.

## Phase 4D - RAG hybride

La memoire supporte maintenant la recherche `keyword`, `vector` et `hybrid` avec embeddings Ollama locaux optionnels. Voir [PHASE4D.md](PHASE4D.md) pour l'installation Ollama, le reindex, le benchmark et les limites de securite.

## Phase 4E - Evaluation RAG

La memoire inclut maintenant un jeu local de requetes d'evaluation, les metriques `precision@K`, `recall@K`, `nDCG@K`, un export Markdown et le nettoyage des embeddings invalides. Voir [PHASE4E.md](PHASE4E.md).

## Phase 5 / 5B - SQLite et Migration Control

Le stockage JSON reste le mode par defaut. SQLite est disponible comme backend optionnel avec migration, validation, rollback et dump logique. La vue Parametres inclut un panneau Migration Control pour status avance, checksums, dry-run, validation et export dump. Voir [PHASE5.md](PHASE5.md) et [PHASE5B.md](PHASE5B.md).

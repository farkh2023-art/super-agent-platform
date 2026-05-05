# API Reference – Super-Agent Platform

**Base URL**: `http://localhost:3001/api`  
**Format**: JSON  
**WebSocket**: `ws://localhost:3001/ws`

---

## Agents

### GET /api/agents
Liste tous les agents disponibles.

**Response**:
```json
{
  "agents": [...],
  "total": 10
}
```

### GET /api/agents/:id
Retourne un agent par son ID.

### GET /api/agents/categories
Liste toutes les catégories d'agents.

---

## Tâches

### POST /api/tasks
Crée une tâche et génère un plan d'exécution.

**Body**:
```json
{
  "task": "Description de la tâche (requis)",
  "agentIds": ["agent-id-1", "agent-id-2"],  // optionnel
  "autoRun": false  // true = lance immédiatement
}
```

**Response** (201):
```json
{
  "task": {
    "id": "uuid",
    "task": "...",
    "plan": {
      "agents": [...],
      "planText": "Markdown plan...",
      "estimatedDuration": "4–10 min"
    },
    "createdAt": "ISO8601"
  }
}
```

### GET /api/tasks
Liste toutes les tâches.

### GET /api/tasks/:id
Retourne une tâche par ID.

### DELETE /api/tasks/:id
Supprime une tâche.

---

## Exécutions

### POST /api/executions
Crée et lance une exécution.

**Body**:
```json
{
  "task": "Description (requis)",
  "agentIds": ["agent-id-1"],  // optionnel
  "planText": "..."  // optionnel
}
```

### POST /api/executions/:id/run
Lance une exécution existante en statut `pending`.

### POST /api/executions/:id/cancel
Annule une exécution en cours.

### GET /api/executions
Liste toutes les exécutions.

### GET /api/executions/:id
Retourne une exécution avec ses étapes et logs.

### GET /api/executions/:id/logs
Retourne uniquement les logs d'une exécution.

### DELETE /api/executions/:id
Supprime une exécution.

---

## Artefacts

### GET /api/artifacts
Liste tous les artefacts. Filtres: `?executionId=...` `?agentId=...`

### GET /api/artifacts/:id
Retourne un artefact.

### GET /api/artifacts/:id/download
Télécharge l'artefact en Markdown.

### DELETE /api/artifacts/:id
Supprime un artefact.

---

## Workflows

### POST /api/workflows
Crée un workflow multi-agent.

**Body**:
```json
{
  "name": "Mon Workflow (requis)",
  "description": "...",
  "steps": [
    {
      "name": "Étape 1",
      "task": "Description de la tâche",
      "agentIds": ["agent-id"]
    }
  ]
}
```

### GET /api/workflows
Liste les workflows.

### GET /api/workflows/:id
Retourne un workflow.

### PUT /api/workflows/:id
Met à jour un workflow.

### DELETE /api/workflows/:id
Supprime un workflow.

### POST /api/workflows/:id/run
Lance l'exécution d'un workflow.

### GET /api/workflows/:id/runs
Liste les exécutions d'un workflow.

---

## Paramètres

### GET /api/settings
Retourne les paramètres actuels (sans les clés API).

### PUT /api/settings
Met à jour les paramètres.

**Body** (tous optionnels):
```json
{
  "aiProvider": "mock | claude | openai | ollama",
  "claudeModel": "claude-sonnet-4-6",
  "openaiModel": "gpt-4o",
  "ollamaModel": "llama3.2",
  "ollamaBaseUrl": "http://localhost:11434"
}
```

### GET /api/settings/status
Statut des fournisseurs (clés configurées, mode actif).

---

## WebSocket Events

Se connecter à `ws://localhost:3001/ws` pour recevoir les événements en temps réel.

| Type | Description | Data |
|:-----|:------------|:-----|
| `connected` | Connexion établie | `{ message }` |
| `execution_start` | Exécution démarrée | `{ executionId }` |
| `step_start` | Étape démarrée | `{ stepId, agentId, agentName }` |
| `step_done` | Étape terminée | `{ stepId, agentId, artifactId }` |
| `step_error` | Étape en erreur | `{ stepId, agentId, error }` |
| `log` | Nouveau log | `{ level, message, timestamp }` |
| `artifact` | Artefact créé | `{ id, agentId, agentName, content }` |
| `execution_done` | Exécution terminée | `{ executionId, status }` |

---

## Santé

### GET /api/health
```json
{
  "status": "ok",
  "version": "1.0.0",
  "provider": "mock",
  "uptime": 42,
  "timestamp": "2026-05-04T..."
}
```

---

## Memoire / RAG Phase 4D

### POST /api/memory/retrieve
Recherche dans la memoire en mode `keyword`, `vector` ou `hybrid`.

```json
{
  "query": "workflow phase 4C",
  "topK": 5,
  "mode": "hybrid",
  "types": ["artifact", "manual_note"],
  "useEmbeddings": true
}
```

### GET /api/memory/embeddings/status
Retourne `enabled`, `provider`, `model`, `count`, `lastReindexAt`, `ollamaReachable`.

### POST /api/memory/embeddings/reindex
Recalcule les embeddings locaux Ollama pour tous les items memoire.

### POST /api/memory/embeddings/reindex/:id
Recalcule un seul item memoire.

### DELETE /api/memory/embeddings
Supprime les embeddings sans supprimer les items memoire.

### POST /api/memory/benchmark
Compare la latence et le nombre de resultats pour `keyword`, `vector` et `hybrid`.

---

## Memoire / RAG Phase 4E

### GET /api/memory/evaluation/queries
Liste les requetes locales d'evaluation RAG.

### POST /api/memory/evaluation/queries
Cree une requete d'evaluation. Les champs `query`, `expectedKeywords` et `description` sont sanitises.

```json
{
  "query": "erreur Jest async warning",
  "expectedKeywords": ["jest", "async", "warning", "worker"],
  "expectedTypes": ["artifact", "execution", "manual_note"],
  "description": "Doit retrouver les corrections Jest."
}
```

### PUT /api/memory/evaluation/queries/:id
Met a jour une requete d'evaluation.

### DELETE /api/memory/evaluation/queries/:id
Supprime une requete d'evaluation.

### POST /api/memory/evaluation/run
Calcule `precision@K`, `recall@K` et `nDCG@K` pour `keyword`, `vector` et `hybrid`.

```json
{
  "topK": 5,
  "modes": ["keyword", "vector", "hybrid"]
}
```

Si les embeddings sont indisponibles, `vector` est marque `unavailable` et `hybrid` replie sur `keyword`.

### GET /api/memory/evaluation/latest
Retourne la derniere evaluation executee en memoire process.

### POST /api/memory/evaluation/export-report
Exporte un rapport Markdown dans `backend/data/memory/evaluation-reports/`.

### GET /api/memory/embeddings/integrity
Retourne l'integrite des embeddings.

```json
{
  "totalEmbeddings": 0,
  "orphans": 0,
  "stale": 0,
  "removed": 0
}
```

### POST /api/memory/embeddings/cleanup
Supprime les embeddings orphelins ou stale. Les items memoire ne sont pas supprimes.

---

## Storage / Migration Control Phase 5B

### GET /api/storage/status
Retourne le mode `json|sqlite|hybrid`, la preference de lecture, le double-write, le statut SQLite masque et les counts JSON/SQLite par collection.

### GET /api/storage/checksums
Compare les checksums normalises par collection.

### GET /api/storage/events
Liste les derniers evenements de synchronisation, migration, validation ou rollback.

### DELETE /api/storage/events
Efface l'historique. Requiert `API_KEY`.

### POST /api/storage/migration/dry-run
Simule la migration JSON vers SQLite sans ecriture.

### POST /api/storage/migration/validate
Valide counts, IDs et checksums optionnels.

```json
{
  "checksums": true,
  "sampleSize": 100
}
```

### POST /api/storage/sqlite/export-dump
Exporte un dump logique SQLite sans secrets connus et sans vecteurs complets.

### POST /api/storage/migration/run
Refuse par defaut si `STORAGE_ADMIN_ALLOW_MUTATIONS=false`. Si active, exige :

```json
{
  "confirmation": "I_UNDERSTAND_STORAGE_RISK"
}
```

### POST /api/storage/rollback
Rollback protege avec la meme confirmation. Ne supprime jamais la base SQLite.

---

## Auth — Phase 6F (Sessions, Cleanup, Audit enrichi)

### GET /api/auth/sessions
Retourne les sessions actives. Admin : toutes sessions. Utilisateur : ses propres sessions.

```json
{
  "sessions": [
    {
      "id": "uuid",
      "userId": "...",
      "expiresAt": "...",
      "createdAt": "...",
      "ipAddress": "127.0.0.1",
      "userAgent": "Mozilla/5.0...",
      "lastUsedAt": "..."
    }
  ]
}
```

### DELETE /api/auth/sessions/:id
Révoque une session. Admin : n'importe quelle session. Utilisateur : seulement ses propres sessions.

### POST /api/auth/sessions/revoke-all
Révoque toutes les sessions de l'utilisateur courant.

Body optionnel :
```json
{ "exceptSessionId": "uuid-to-keep" }
```

Réponse :
```json
{ "success": true, "revokedCount": 3 }
```

### GET /api/auth/cleanup/status
Statut du service cleanup (admin uniquement).

```json
{
  "running": false,
  "autoEnabled": false,
  "intervalMs": 21600000,
  "lastResult": { ... }
}
```

### POST /api/auth/cleanup
Déclenche un cleanup manuel (admin uniquement).

```json
{
  "success": true,
  "sessionsRemoved": 5,
  "jtiRemoved": 12,
  "auditRemoved": 0,
  "durationMs": 30,
  "runAt": "2026-05-05T10:00:00.000Z"
}
```

### GET /api/auth/audit-log
Retourne les entrées du journal d'audit. Phase 6F ajoute les champs `ipAddress` et `userAgent`.

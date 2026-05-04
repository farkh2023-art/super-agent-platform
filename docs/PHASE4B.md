# Phase 4B – Mémoire Persistante & RAG

## Vue d'ensemble

La mémoire persistante permet aux agents de bénéficier du contexte de leurs exécutions passées. Les artefacts produits sont automatiquement indexés, et une recherche par similarité (RAG) injecte le contexte pertinent avant chaque exécution.

---

## Configuration

```bash
# .env
MEMORY_ENABLED=false               # false (défaut) → mémoire désactivée
                                   # true  → indexation auto + injection de contexte

# Embeddings Ollama (optionnel – OFF par défaut)
# MEMORY_EMBEDDINGS=ollama         # active les embeddings vectoriels
# MEMORY_EMBEDDING_MODEL=nomic-embed-text  # modèle d'embedding (à puller dans Ollama)
```

---

## Endpoints

| Méthode | Route | Description |
|:--------|:------|:------------|
| `GET` | `/api/memory` | Lister tous les chunks |
| `POST` | `/api/memory` | Ajouter un chunk manuellement |
| `GET` | `/api/memory/search?q=...&limit=5` | Recherche RAG |
| `GET` | `/api/memory/stats` | Statistiques de la mémoire |
| `DELETE` | `/api/memory/:id` | Supprimer un chunk |
| `DELETE` | `/api/memory` | Vider toute la mémoire |

---

## Ajouter un chunk

```bash
curl -X POST http://localhost:3001/api/memory \
  -H "Content-Type: application/json" \
  -d '{
    "content": "La table orders contient order_id, user_id, amount, status",
    "source": "manual",
    "agentId": "data-lineage-fr",
    "tags": ["sql", "schema"]
  }'
```

**Champs :**
- `content` (requis) — texte à indexer (les secrets sont filtrés automatiquement)
- `source` — `"manual"` | `"artifact"` | autre (défaut: `"manual"`)
- `agentId` — agent d'origine (optionnel)
- `tags` — tableau de tags (optionnel)

**Réponse :** chunk sans le champ `embedding` (jamais exposé par l'API).

---

## Recherche RAG

```bash
curl "http://localhost:3001/api/memory/search?q=table+orders&limit=3"
```

**Réponse :**
```json
{
  "results": [
    {
      "id": "uuid",
      "content": "La table orders contient order_id, user_id, amount, status",
      "source": "manual",
      "agentId": "data-lineage-fr",
      "tags": ["sql", "schema"],
      "createdAt": "2026-05-04T..."
    }
  ],
  "total": 1
}
```

**Algorithme de recherche :**
- **Mode par défaut (OFF)** : score de similarité par chevauchement de tokens (keyword search)
- **Mode Ollama (ON)** : cosinus entre les embeddings vectoriels ; repli sur keyword search si Ollama est indisponible

---

## Statistiques

```bash
curl http://localhost:3001/api/memory/stats
```

```json
{
  "total": 42,
  "sources": { "artifact": 38, "manual": 4 },
  "embeddingsEnabled": false,
  "embeddingModel": "nomic-embed-text",
  "embeddingsCount": 0
}
```

---

## Injection de contexte dans les exécutions

Quand `MEMORY_ENABLED=true`, avant chaque step d'agent :
1. La mémoire est interrogée avec la tâche comme requête (top-3 chunks)
2. Le contexte est préfixé au message utilisateur :

```
--- Contexte mémoire pertinent ---
[artifact · data-lineage-fr]: La table orders contient...
---

Tâche globale: Analyser les jointures entre orders et users
```

### Activer / désactiver par exécution

```bash
# Utiliser la mémoire pour cette exécution (override MEMORY_ENABLED)
curl -X POST http://localhost:3001/api/executions \
  -H "Content-Type: application/json" \
  -d '{"task": "Analyser SQL", "useMemory": true}'

# Désactiver la mémoire pour cette exécution
curl -X POST http://localhost:3001/api/executions \
  -d '{"task": "Analyser SQL", "useMemory": false}'
```

Le champ `useMemory` est stocké sur l'objet execution pour traçabilité.

### Indexation automatique des artefacts

Quand `useMemory: true` sur une exécution, chaque artefact produit est automatiquement indexé en mémoire (après filtrage des secrets) avec `source: "artifact"` et l'`agentId` de l'agent producteur.

---

## Filtrage des secrets

Avant toute indexation, le contenu passe par `sanitizeContent()` :

| Pattern | Remplacement |
|:--------|:------------|
| `sk-ant-...` | `[REDACTED]` |
| `sk-XXXX...` (≥20 chars) | `[REDACTED]` |
| `Bearer XXXX...` (≥20 chars) | `[REDACTED]` |
| `"anthropicApiKey": "..."` | `"anthropicApiKey": "[REDACTED]"` |
| `"openaiApiKey": "..."` | `"openaiApiKey": "[REDACTED]"` |
| autres champs sensibles | `[REDACTED]` |

Les embeddings (vecteurs float) ne sont jamais exposés par l'API ni inclus dans le backup.

---

## Embeddings Ollama (optionnel)

```bash
# 1. Démarrer Ollama
ollama serve

# 2. Puller le modèle d'embedding
ollama pull nomic-embed-text

# 3. Configurer .env
MEMORY_EMBEDDINGS=ollama
MEMORY_EMBEDDING_MODEL=nomic-embed-text
MEMORY_ENABLED=true
```

Quand Ollama est activé :
- Chaque chunk reçoit un embedding vectoriel au moment de l'indexation
- La recherche utilise la similarité cosinus (plus précise que le keyword match)
- Si Ollama est indisponible, le chunk est stocké sans embedding et la recherche replie sur keyword

---

## Backup ZIP

`GET /api/backup/download` inclut désormais `memory.json` :
- Les embeddings sont **exclus** (trop volumineux, recalculables)
- Le contenu est déjà sanitisé (secrets filtrés à l'indexation)
- Aucune clé API ni secret n'est présent

---

## Variables d'environnement Phase 4B

| Variable | Défaut | Description |
|:---------|:-------|:------------|
| `MEMORY_ENABLED` | `false` | Active l'indexation auto + injection de contexte |
| `MEMORY_EMBEDDINGS` | *(vide)* | `"ollama"` pour activer les embeddings vectoriels |
| `MEMORY_EMBEDDING_MODEL` | `nomic-embed-text` | Modèle Ollama pour les embeddings |

---

## Tests

```bash
cd backend
npm test   # 129 tests (9 suites)
```

Suite `tests/phase4b.test.js` (20 tests) :
- Memory CRUD : list, add, stats, delete par id, 404 (6 tests)
- Filtrage secrets : Anthropic key, OpenAI key, champs JSON (3 tests)
- RAG search : validation, résultats, limit, pas d'embedding exposé (4 tests)
- Injection : useMemory:true, useMemory:false, défaut depuis MEMORY_ENABLED (3 tests)
- Clear : DELETE /api/memory efface tout (1 test)
- Backup : memory.json présent, sans secrets, validation content (3 tests)

# Phase 4D - RAG hybride avec embeddings Ollama

La Phase 4D ajoute des embeddings locaux Ollama au RAG existant, sans remplacer la recherche keyword. Les embeddings sont desactivees par defaut et le backend replie sur keyword si Ollama est indisponible.

## Configuration

```bash
MEMORY_ENABLED=true
MEMORY_EMBEDDINGS=true
MEMORY_EMBEDDING_PROVIDER=ollama
MEMORY_EMBEDDING_MODEL=nomic-embed-text
MEMORY_HYBRID_ALPHA=0.65
MEMORY_REINDEX_BATCH_SIZE=20
MEMORY_EMBEDDING_TIMEOUT_MS=15000
```

Installation Ollama :

```bash
ollama pull nomic-embed-text
ollama serve
```

## Recherche

`POST /api/memory/retrieve` accepte `mode: "keyword" | "vector" | "hybrid"` et retourne `modeRequested`, `modeUsed`, `embeddingsAvailable`, `score`, `keywordScore` et `vectorScore`.

## Endpoints

| Methode | Route | Description |
|:--|:--|:--|
| `POST` | `/api/memory/retrieve` | Recherche keyword/vector/hybrid |
| `GET` | `/api/memory/embeddings/status` | Statut embeddings et Ollama |
| `POST` | `/api/memory/embeddings/reindex` | Reindex complet |
| `POST` | `/api/memory/embeddings/reindex/:id` | Reindex d'un item |
| `DELETE` | `/api/memory/embeddings` | Supprime les embeddings uniquement |
| `POST` | `/api/memory/benchmark` | Compare keyword/vector/hybrid |

Les vecteurs sont stockes separement dans `backend/data/memory/embeddings.json`, avec un `contentHash` pour invalider les embeddings si un item memoire change. Les vecteurs complets ne sont pas inclus dans le backup par defaut.

## Securite

Le contenu est filtre par `sanitizeContent()` avant stockage et avant embedding. Les embeddings peuvent encoder indirectement du contenu sensible ; ils restent locaux, recalculables, et exclus du backup complet. La memoire injectee dans les agents est toujours traitee comme du contexte non fiable.

## Limites

- Pas de base vectorielle externe : scan JSON local, adapte au volume local.
- Pas de migration React ni de migration stockage.
- Vector/hybrid necessitent `MEMORY_EMBEDDINGS=true`, Ollama lance, et le modele present.

## Suite Phase 4E

La Phase 4E ajoute l'evaluation qualitative du RAG (`precision@K`, `recall@K`, `nDCG@K`), l'export Markdown des rapports et le nettoyage des embeddings orphelins ou stale. Voir [PHASE4E.md](PHASE4E.md).

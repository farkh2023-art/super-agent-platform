# Phase 4E - Evaluation RAG et nettoyage embeddings

La Phase 4E ajoute une evaluation qualitative locale du RAG et un controle d'integrite des embeddings, sans rendre Ollama obligatoire.

## Evaluation RAG

Le jeu de requetes est stocke dans `backend/data/memory/eval-queries.json`.

Chaque requete contient :

```json
{
  "id": "eval-001",
  "query": "erreur Jest async warning",
  "expectedKeywords": ["jest", "async", "warning", "worker"],
  "expectedTypes": ["artifact", "execution", "manual_note"],
  "description": "Doit retrouver les elements lies a la correction du warning async Jest."
}
```

## Metriques

- `precision@K` : nombre de resultats pertinents dans le top K divise par K.
- `recall@K` : nombre de mots-cles attendus retrouves dans le top K divise par le nombre total de mots-cles attendus.
- `nDCG@K` : score de ranking binaire qui valorise les resultats pertinents places plus haut.

Un resultat est pertinent si son titre, extrait, contenu ou metadata contient au moins un mot-cle attendu.

## Comparaison des modes

`POST /api/memory/evaluation/run` compare `keyword`, `vector` et `hybrid`.

Si `MEMORY_EMBEDDINGS=false` ou Ollama est indisponible :

- `vector` est marque `unavailable`;
- `hybrid` replie proprement sur `keyword`;
- l'evaluation ne provoque pas d'erreur.

## Rapport Markdown

`POST /api/memory/evaluation/export-report` genere un rapport dans :

```text
backend/data/memory/evaluation-reports/rag-evaluation-YYYY-MM-DD-HH-mm.md
```

Le rapport inclut la date, les modes compares, les moyennes `precision@K`, `recall@K`, `nDCG@K`, la meilleure strategie, les details par requete et une mention du fallback keyword si necessaire.

## Nettoyage embeddings

Endpoints :

| Methode | Route | Description |
|:--|:--|:--|
| `GET` | `/api/memory/embeddings/integrity` | Compte total, embeddings orphelins et stale |
| `POST` | `/api/memory/embeddings/cleanup` | Supprime les embeddings orphelins ou stale |

Un embedding est invalide si le `memoryId` n'existe plus, si le `contentHash` ne correspond plus au contenu memoire, ou si le modele differe du modele actif avec `strict=true`.

## Backup

La sauvegarde ZIP inclut `memory_eval_queries.json` et les 5 derniers rapports Markdown si presents. Les vecteurs complets restent exclus.

## Limites

- Les scores RAG sont des indicateurs locaux, pas une verite absolue.
- Les mots-cles attendus simplifient la pertinence et ne remplacent pas une annotation humaine.
- Les elements memoire restent du contexte non fiable.
- Le scan JSON local reste adapte a un volume local, pas a une base vectorielle massive.

## Tests Windows

```powershell
cd backend
node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern=tests/ --runInBand
```

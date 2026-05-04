\# Release Notes — v1.0.0-phase-4d



\## État

\- Version stable locale.

\- 161/161 tests passent.

\- RAG avancé Ollama optionnel.

\- Fallback keyword si Ollama indisponible.



\## Fonctionnalités majeures

\- 10 agents spécialisés.

\- Super-Agent orchestrateur.

\- Workflows séquentiels/parallèles.

\- Visual Builder.

\- Scheduler.

\- Métriques.

\- Mémoire persistante.

\- RAG keyword/vector/hybrid.

\- Embeddings Ollama optionnels.

\- Benchmark retrieval.

\- Backup sécurisé.



\## Commande de test Windows

```powershell

cd backend

node --experimental-vm-modules node\_modules/jest/bin/jest.js --testPathPattern=tests/ --runInBand


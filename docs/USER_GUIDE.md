# Super-Agent Platform - User Guide

## Quick Start

On Windows PowerShell:

```powershell
.\release\install.ps1
.\release\start.ps1 -Mode demo
```

Then open `http://localhost:3001`. Demo mode uses the mock provider, single-user auth and JSON storage, so no API key is required.

## Command Center

The dashboard is the command center. It shows execution stats, recent runs, system status and quick actions. Start with **Nouvelle Tache** to describe a task, select agents if needed, review the generated plan and run it.

## Agents

The platform includes 10 specialized agents. Use **Mes Agents** to inspect capabilities and choose agent IDs before launching tasks or workflows.

## Workflows

Workflows chain multiple steps. Create a workflow from the **Workflows** view, assign task descriptions and agents per step, then run it and inspect generated runs.

## Memory and RAG

The **Memoire** view stores reusable context. Keyword search is always available. Embeddings and hybrid retrieval are optional and require local Ollama configuration.

## Alert Center

Admins can create alert rules, evaluate current health metrics, review persistent notifications and schedule admin reports. In single mode the API remains accessible locally.

## Admin Health

Admin Health summarizes system, storage, auth, RAG, scheduler, alert and test status. Reports can be exported as JSON or Markdown.

## Backup

Use **Parametres** -> backup link or:

```powershell
.\release\backup.ps1
```

Backups are written to `backups/local/` and exclude raw secrets by default.

## Single vs Multi

- `AUTH_MODE=single`: local, low-friction mode, recommended for demo and personal testing.
- `AUTH_MODE=multi`: requires users, sessions and a strong `JWT_SECRET`; recommended for shared machines.

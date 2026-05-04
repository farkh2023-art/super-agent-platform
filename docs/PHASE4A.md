# Phase 4A – Scheduling & Métriques

## Nouvelles fonctionnalités

### 1. Scheduling de tâches

Planifiez l'exécution automatique de tâches à intervalles réguliers.

**Configuration (`.env`) :**
```bash
SCHEDULER_INTERVAL_MS=60000   # vérification toutes les 60s (défaut)
```

#### Endpoints

| Méthode | Route | Description |
|:--------|:------|:------------|
| `GET` | `/api/schedules` | Lister tous les schedules |
| `POST` | `/api/schedules` | Créer un schedule |
| `GET` | `/api/schedules/:id` | Obtenir un schedule |
| `PUT` | `/api/schedules/:id` | Modifier un schedule |
| `DELETE` | `/api/schedules/:id` | Supprimer un schedule |
| `POST` | `/api/schedules/:id/trigger` | Déclenchement manuel immédiat |

#### Création d'un schedule

```bash
curl -X POST http://localhost:3001/api/schedules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Analyse SQL quotidienne",
    "task": "Analyser la base de données SQL de production",
    "agentIds": ["data-lineage-fr"],
    "intervalMs": 86400000,
    "enabled": true
  }'
```

**Champs requis :**
- `name` (string) — libellé du schedule
- `task` (string) — description de la tâche à exécuter
- `intervalMs` (number > 0) — intervalle en millisecondes

**Champs optionnels :**
- `agentIds` (array) — liste d'agents à impliquer (défaut: planificateur automatique)
- `enabled` (boolean) — actif par défaut (`true`)

**Réponse :**
```json
{
  "id": "uuid",
  "name": "Analyse SQL quotidienne",
  "task": "Analyser la base de données SQL de production",
  "agentIds": ["data-lineage-fr"],
  "intervalMs": 86400000,
  "enabled": true,
  "lastRunAt": null,
  "nextRunAt": "2026-05-05T00:00:00.000Z",
  "runCount": 0,
  "lastExecutionId": null,
  "createdAt": "2026-05-04T00:00:00.000Z"
}
```

#### Déclenchement manuel

```bash
curl -X POST http://localhost:3001/api/schedules/<id>/trigger
```

Crée et lance immédiatement une exécution, met à jour `lastRunAt`, `runCount` et `nextRunAt`.

#### Activer / désactiver un schedule

```bash
curl -X PUT http://localhost:3001/api/schedules/<id> \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'
```

---

### 2. Moteur de scheduling

Le module `engine/scheduler.js` tourne en arrière-plan dès le démarrage du serveur :

- Vérifie toutes les `SCHEDULER_INTERVAL_MS` (défaut: 60s) quels schedules sont échus (`nextRunAt ≤ now`)
- Lance une exécution pour chaque schedule échu via `generatePlan()` + `createExecution()` + `limiter.run()`
- Met à jour `lastRunAt`, `nextRunAt` et `runCount` après chaque déclenchement
- Échecs silencieux : une erreur sur un schedule ne bloque pas les autres
- Le timer utilise `.unref()` pour ne pas bloquer l'arrêt du processus

---

### 3. Métriques par agent

Métriques calculées à la volée depuis la collection `executions`.

#### Endpoints

| Méthode | Route | Description |
|:--------|:------|:------------|
| `GET` | `/api/metrics` | Métriques globales + détail par agent |
| `GET` | `/api/metrics/agents` | Détail par agent uniquement |

#### Exemple de réponse (`GET /api/metrics`)

```json
{
  "global": {
    "total": 42,
    "completed": 38,
    "completedWithErrors": 2,
    "failed": 1,
    "cancelled": 1,
    "running": 0,
    "pending": 0,
    "successRate": 90,
    "avgDurationMs": 1340
  },
  "byAgent": {
    "data-lineage-fr": {
      "agentId": "data-lineage-fr",
      "total": 15,
      "done": 14,
      "error": 1,
      "successRate": 93
    },
    "sim-fdtd": {
      "agentId": "sim-fdtd",
      "total": 8,
      "done": 8,
      "error": 0,
      "successRate": 100
    }
  }
}
```

**`successRate` global** = `completed / (completed + completedWithErrors + failed + cancelled) × 100`

**`successRate` par agent** = `done / (done + error) × 100`

Valeur `null` si aucune exécution terminée.

---

### 4. Backup ZIP enrichi

`GET /api/backup/download` inclut désormais :

| Fichier | Contenu |
|:--------|:--------|
| `schedules.json` | Tous les schedules |
| `metrics.json` | Snapshot des métriques calculées |

Aucun secret n'est présent dans ces fichiers :
- `schedules.json` ne contient pas de clés API
- `metrics.json` est un calcul dérivé sans donnée sensible

---

## Variables d'environnement Phase 4A

| Variable | Défaut | Description |
|:---------|:-------|:------------|
| `SCHEDULER_INTERVAL_MS` | `60000` | Intervalle de vérification des schedules (ms) |

---

## Sécurité

- Les schedules ne stockent aucune clé API
- Le backup ZIP inclut les schedules et métriques sans aucun secret
- Les schedules échus sont traités séquentiellement pour éviter les surcharges
- La limite `MAX_CONCURRENT_EXECUTIONS` s'applique aussi aux exécutions planifiées

---

## Tests

```bash
cd backend
npm test   # 103 tests (8 suites)
```

Suite `tests/phase4a.test.js` (16 tests) :
- Schedules CRUD complet (7 tests)
- Validation des champs requis (7 tests)
- Déclenchement manuel et vérification runCount (3 tests)
- Structure des métriques (3 tests)
- Backup ZIP inclut schedules.json + metrics.json sans secrets (2 tests)

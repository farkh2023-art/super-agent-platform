# Phase 5C — SQLite Operations Stabilization

Phase 5C etend le panneau Migration Control avec des rapports de validation persistants, une comparaison ID par ID exhaustive, un rapport de checksums Markdown teleChargeable, un endpoint de readiness SQLite et des alertes de desynchronisation.

## Nouvelles fonctionnalites

### Validation reports persistants
Chaque appel a `POST /api/storage/migration/validate` sauvegarde automatiquement le rapport JSON dans `data/validation-reports/`. Les secrets sont elagues avant l'ecriture. Les 50 derniers rapports sont conserves.

### Comparaison ID par ID exhaustive
`GET /api/storage/compare-ids` parcourt l'integralite des collections sans limite d'echantillon et retourne pour chaque collection :
- `missingInSqlite` — IDs presents en JSON absents de SQLite
- `extraInSqlite` — IDs presents en SQLite absents de JSON
- `checksumMismatches` — IDs dont le contenu differe entre JSON et SQLite
- `allInSync` — booleen global

### Rapport checksums Markdown
`GET /api/storage/checksums/report.md` genere et retourne un rapport Markdown telechargeable recapitulant l'etat de chaque collection.

### Download securise
`GET /api/storage/validation-reports/:filename` sert un rapport de validation JSON en telechargement. Le nom de fichier est valide par regex avant toute lecture (protection contre path traversal).
`GET /api/storage/validation-reports` liste les rapports disponibles.

### SQLite readiness
`GET /api/storage/sqlite/readiness` retourne 200 si SQLite est connecte, 503 sinon. Inclut les details `exists`, `connected`, `wal`, `error`.

### Alertes desync
`GET /api/storage/checksums/desync-alerts` detecte les desynchronisations entre JSON et SQLite et cree un evenement `desync_detected` dans le journal de stockage si des ecarts sont trouves.

### Dashboard storage enrichi
`GET /api/storage/status` inclut desormais `lastValidationReport` : nom de fichier et taille du dernier rapport de validation disponible.

### Migration Control UI enrichie
Nouveaux boutons dans le panneau Migration Control :
- **SQLite readiness** — verifie la disponibilite de SQLite
- **Alertes desync** — detecte les desynchronisations
- **Comparer IDs** — comparaison ID par ID exhaustive
- **Rapports validation** — liste les rapports persistants
- **Rapport checksum .md** — telechargement du rapport Markdown

Le panneau affiche egalement un lien de telechargement direct vers le dernier rapport de validation.

### Backup inclut rapports sans secrets
Le ZIP de backup (`GET /api/backup/download`) inclut les 5 derniers rapports de validation depuis `data/validation-reports/`. Les rapports sont deja sans secrets (sanitizes a l'ecriture).

### Protection .sqlite dans git
Le `.gitignore` a la racine du projet contient `*.sqlite`, `*.sqlite-wal` et `*.sqlite-shm`. Aucun fichier SQLite ne peut etre commite accidentellement.

## Endpoints Phase 5C

| Methode | Endpoint | Description |
|---|---|---|
| GET | `/api/storage/sqlite/readiness` | Readiness check SQLite |
| GET | `/api/storage/checksums/report.md` | Rapport checksums Markdown |
| GET | `/api/storage/checksums/desync-alerts` | Detection alertes desync |
| GET | `/api/storage/compare-ids` | Comparaison ID par ID toutes collections |
| GET | `/api/storage/validation-reports` | Liste des rapports de validation |
| GET | `/api/storage/validation-reports/:filename` | Telechargement securise d'un rapport |

## Fichiers modifies

- `src/storage/validationReports.js` — nouveau module (save/list/load reports)
- `src/storage/checksums.js` — ajout `generateChecksumReportMarkdown`, `detectAndAlertDesyncs`
- `src/storage/migrations.js` — sauvegarde rapport apres validation, `compareIdByIdAllCollections`
- `src/storage/index.js` — `lastValidationReport` dans `getStorageStatus`
- `src/routes/storage.js` — 6 nouveaux endpoints
- `src/routes/backup.js` — inclusion des rapports de validation
- `frontend/js/api.js` — 4 nouvelles methodes API
- `frontend/js/app.js` — 5 nouvelles fonctions UI, status enrichi
- `frontend/index.html` — 5 nouveaux boutons Migration Control
- `tests/phase5c-sqlite-operations.test.js` — 18 nouveaux tests

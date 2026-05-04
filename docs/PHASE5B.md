# Phase 5B - Migration Control Admin

Phase 5B ajoute un panneau admin local pour surveiller la migration JSON / SQLite sans basculer le stockage par defaut.

## Configuration

```env
STORAGE_ADMIN_ENABLED=true
STORAGE_ADMIN_ALLOW_MUTATIONS=false
STORAGE_ADMIN_REQUIRE_CONFIRMATION=true
STORAGE_CHECKSUM_SAMPLE_SIZE=100
STORAGE_SYNC_HISTORY_LIMIT=100
```

Les actions dangereuses restent refusees tant que `STORAGE_ADMIN_ALLOW_MUTATIONS=false`.

## Endpoints

- `GET /api/storage/status` : statut avance, counts JSON vs SQLite, WAL, warnings.
- `GET /api/storage/checksums` : checksums normalises par collection.
- `GET /api/storage/events` : historique des evenements storage.
- `DELETE /api/storage/events` : suppression protegee par `API_KEY`.
- `POST /api/storage/migration/dry-run` : simulation sans ecriture SQLite.
- `POST /api/storage/migration/validate` : validation counts, IDs et checksums optionnels.
- `POST /api/storage/sqlite/export-dump` : export logique SQLite sans secrets connus.
- `POST /api/storage/migration/run` : migration reelle, desactivee par defaut.
- `POST /api/storage/rollback` : rollback, desactive par defaut.

## Confirmation

Si les mutations sont activees volontairement :

```env
STORAGE_ADMIN_ALLOW_MUTATIONS=true
```

Le body doit inclure :

```json
{
  "confirmation": "I_UNDERSTAND_STORAGE_RISK"
}
```

## UI

La vue `Parametres` contient `Migration Control` avec :

- mode storage courant ;
- SQLite connected / WAL ;
- double-write et read preference ;
- counts JSON vs SQLite ;
- warnings ;
- dry-run, validation, checksums et export dump ;
- migration reelle et rollback desactives par defaut ;
- storage events.

## Recommandation avant `STORAGE_MODE=sqlite`

1. Lancer `dry-run`.
2. Lancer migration avec backup depuis CLI.
3. Lancer validation avec checksums.
4. Activer `STORAGE_MODE=hybrid` et `SQLITE_DOUBLE_WRITE=true`.
5. Surveiller `GET /api/storage/events`.
6. Basculer `STORAGE_MODE=sqlite` uniquement apres une validation recente.

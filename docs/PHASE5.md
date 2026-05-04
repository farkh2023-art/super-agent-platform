# Phase 5 - SQLite Storage

Phase 5 introduit SQLite comme stockage durable optionnel sans supprimer le JSON local.

## Modes

- `STORAGE_MODE=json` : mode par defaut, lectures et ecritures en JSON.
- `STORAGE_MODE=hybrid` : lecture selon `SQLITE_READ_PREFERENCE`, double-ecriture si `SQLITE_DOUBLE_WRITE=true`.
- `STORAGE_MODE=sqlite` : lecture/ecriture SQLite, a activer seulement apres validation.

## Commandes Windows

```powershell
cd backend
node scripts/migrate-json-to-sqlite.js --dry-run
node scripts/migrate-json-to-sqlite.js --backup
node scripts/validate-sqlite-migration.js
node scripts/export-sqlite-dump.js
node scripts/rollback-sqlite-to-json.js --from-sqlite --dry-run
```

## Rollback

Le JSON n'est jamais supprime. Le rollback peut restaurer les collections JSON depuis SQLite ou depuis un backup manuel. Le fichier SQLite reste disponible pour analyse.

## Backup

Par defaut, le backup inclut un dump logique SQLite si la base existe (`BACKUP_INCLUDE_SQLITE_DUMP=true`) et n'inclut pas le fichier `.sqlite` brut (`BACKUP_INCLUDE_SQLITE_DB=false`).

Voir [PHASE5B.md](PHASE5B.md) pour le pilotage admin Migration Control.

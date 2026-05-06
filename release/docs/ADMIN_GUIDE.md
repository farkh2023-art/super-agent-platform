# Admin Guide

Keep JSON storage as the default unless SQLite migration has been validated. Use `AUTH_MODE=multi` only with a strong `JWT_SECRET`. Review sessions, audit logs, storage status, admin reports, Alert Center and backups before shared use.

Important defaults: `BACKUP_INCLUDE_AUTH_DB=false`, `BACKUP_INCLUDE_SQLITE_DB=false`, and no real provider key is required in demo mode.

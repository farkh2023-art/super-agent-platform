# Super-Agent Platform - Admin Guide

## Auth Mode

`AUTH_MODE=single` keeps local development friction low. `AUTH_MODE=multi` enables login, users, roles, sessions, audit logs and workspace controls. Use a strong `JWT_SECRET` before enabling multi-user mode.

## Sessions

Active sessions are visible in the Sessions view and Admin Health. Users can revoke their own sessions; admins can review all sessions. Phase 6F cleanup removes expired sessions and JTI blacklist entries.

## Workspaces

Workspaces isolate user activity in multi-user mode. Admins create and manage workspaces from the Workspaces view.

## Storage

JSON storage remains the default. SQLite is optional and controlled by:

- `STORAGE_MODE=json|sqlite|hybrid`
- `SQLITE_DB_PATH`
- `SQLITE_DOUBLE_WRITE`
- `SQLITE_READ_PREFERENCE`

Do not switch production data to SQLite without dry-run, migration, validation and backup.

## Migration and Rollback

Use Migration Control for dry-run, checksums, validation reports, readiness gates, controlled switch and rollback. Mutating storage routes are disabled unless `STORAGE_ADMIN_ALLOW_MUTATIONS=true` and require explicit confirmation.

## Audit Logs

Audit logs record mutating API requests in multi-user mode. IP and User-Agent capture are controlled by `AUDIT_CAPTURE_IP` and `AUDIT_CAPTURE_USER_AGENT`. Sensitive headers and tokens are not stored.

## Admin Reports

Use `/api/admin/report.json`, `/api/admin/report.md` or the UI buttons to generate reports. Scheduled reports are configured in Alert Center and written under backend data.

## Security Defaults

Keep `.env`, runtime data, SQLite files and backups out of Git. Prefer `REFRESH_TOKEN_TRANSPORT=cookie` and enable CSRF protection for shared deployments.

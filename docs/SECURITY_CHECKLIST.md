# Security Checklist

- [ ] `.env` is never committed and is absent from release ZIPs.
- [ ] Rotate any API key that may have been pasted in chat, logs or screenshots.
- [ ] `github_pat*.txt` and token-like files stay ignored and outside releases.
- [ ] `BACKUP_INCLUDE_AUTH_DB=false` unless you explicitly need `auth.sqlite`.
- [ ] Tokens, passwords, cookies and authorization headers are never logged.
- [ ] `AUTH_MODE=multi` uses a strong `JWT_SECRET`.
- [ ] `REFRESH_TOKEN_TRANSPORT=cookie` is preferred for multi-user mode.
- [ ] `CSRF_PROTECTION=true` is considered for shared environments.
- [ ] Backups are stored in a protected location.
- [ ] Local-only use is recommended unless a full deployment review is done.
- [ ] SQLite files are treated as sensitive runtime data.
- [ ] Release ZIP excludes `.env`, `node_modules`, runtime data, SQLite and token files.

# Security Checklist

- `.env` stays local and is excluded from packages.
- Release ZIP excludes `node_modules`, runtime data, SQLite and token files.
- Rotate exposed provider keys.
- Use a strong `JWT_SECRET` in multi-user mode.
- Prefer cookie refresh token transport.
- Protect backups and release archives.

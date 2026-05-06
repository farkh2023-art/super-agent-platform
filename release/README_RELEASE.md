# Super-Agent Platform - Local Release

This folder contains the Windows scripts used to install, run, back up, check and package the local Super-Agent Platform.

## Quick Start

```powershell
.\release\install.ps1
.\release\start.ps1 -Mode demo
.\release\health-check.ps1
```

Open `http://localhost:3001`.

## Scripts

- `install.ps1` checks Node/npm, installs backend dependencies and creates `.env` from `.env.example` only when missing.
- `start.ps1` starts the backend and records the PID in `backend\data\super-agent.pid`.
- `stop.ps1` stops only the recorded local server process.
- `demo.ps1` starts with session-only demo variables: mock provider, single auth, JSON storage.
- `health-check.ps1` checks local API endpoints and can print JSON with `-Json`.
- `backup.ps1` downloads the secure backup endpoint or creates a local fallback archive.
- `create-release.ps1` builds `dist/releases/super-agent-platform-<version>.zip` with a manifest and checksum.

## Security

Release ZIPs exclude `.env`, `node_modules`, runtime data, SQLite files, logs and token-like files. Keep generated backups and release packages protected because they may still contain local task content and artifacts.

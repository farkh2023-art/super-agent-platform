# Installation Windows

## Prerequisites

- Windows PowerShell 5.1 or PowerShell 7+
- Node.js LTS installed and available as `node`
- npm available as `npm`

## Install

From the repository root:

```powershell
.\release\install.ps1
```

The script checks Node/npm, runs `npm install` in `backend`, creates `.env` from `.env.example` only if absent, and creates runtime folders.

## Start

```powershell
.\release\start.ps1
.\release\start.ps1 -Mode demo
.\release\start.ps1 -NoBrowser
```

Demo mode forces mock provider, single auth and JSON storage for the current PowerShell session.

## Health Check

```powershell
.\release\health-check.ps1
.\release\health-check.ps1 -Json
```

## Backup

```powershell
.\release\backup.ps1
```

The script uses the secure API backup if the server is running, otherwise it creates a fallback archive from allowed data files.

## Common Issues

- Port already used: set `PORT=3002` in the session or stop the existing process.
- `.env` missing: run `install.ps1` or start with `-Mode demo`.
- npm install failure: verify internet access and Node.js version, then retry from `backend`.

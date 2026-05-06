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

## Verify a Release ZIP

```powershell
.\release\verify-release.ps1 -ZipPath .\dist\releases\super-agent-platform-v2.6.0-phase-8c.zip -Strict
.\release\sign-release.ps1 -ZipPath .\dist\releases\super-agent-platform-v2.6.0-phase-8c.zip
```

This creates verification reports and a local checksum signature. It is not certificate-backed code signing.

## Local Reproducible CI

```powershell
.\release\local-ci.ps1 -Version v2.6.0-phase-8c -Strict
```

This runs backend tests, builds the ZIP, verifies forbidden files, signs the ZIP by SHA256, extracts it to a clean temp directory, runs `install.ps1`, starts demo mode, checks health and writes:

- `dist/releases/LOCAL_CI_REPORT.json`
- `dist/releases/LOCAL_CI_REPORT.md`

To test an existing ZIP only:

```powershell
.\release\test-release.ps1 -ZipPath .\dist\releases\super-agent-platform-v2.6.0-phase-8c.zip
.\release\cleanup-release-test.ps1 -DryRun
```

## Optional Windows Service

Preview service installation:

```powershell
.\release\install-service.ps1 -DryRun
```

Install or uninstall requires an elevated PowerShell prompt. The service is optional and not enabled by default.

## Uninstall

```powershell
.\release\uninstall.ps1
```

By default, `.env`, backend data and backups are kept.

## Common Issues

- Port already used: set `PORT=3002` in the session or stop the existing process.
- `.env` missing: run `install.ps1` or start with `-Mode demo`.
- npm install failure: verify internet access and Node.js version, then retry from `backend`.

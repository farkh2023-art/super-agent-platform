# Super-Agent Platform
[![Release](https://github.com/farkh2023-art/super-agent-platform/actions/workflows/release.yml/badge.svg)](https://github.com/farkh2023-art/super-agent-platform/actions/workflows/release.yml)

Local multi-agent orchestration platform for Windows and Node.js.

Current release target: `v3.0.0-phase-12`.

## Quick Start Windows

```powershell
.\release\install.ps1
.\release\start.ps1 -Mode demo
.\release\health-check.ps1
```

Open `http://localhost:3001`.

## Demo Mode

Demo mode uses `AI_PROVIDER=mock`, `AUTH_MODE=single` and `STORAGE_MODE=json`. No provider key is required.

## Release Packaging

```powershell
.\release\create-release.ps1 -Version v3.0.0-phase-12
```

The ZIP is written to `dist/releases/` and excludes `.env`, dependency folders, runtime data, SQLite files and token-like files.

Verify and create a local checksum signature:

```powershell
.\release\create-release.ps1 -Version v3.0.0-phase-12 -Verify -Strict
.\release\sign-release.ps1 -ZipPath .\dist\releases\super-agent-platform-v3.0.0-phase-12.zip
.\release\local-ci.ps1 -Version v3.0.0-phase-12 -Strict
```

Release distribution is also covered by GitHub Actions: CI runs through `.github/workflows/ci.yml`, and tagged releases use `.github/workflows/release.yml`.

Before public release, run the controlled gate:

```powershell
.\release\release-public-check.ps1 -Offline -Json -Strict
```

The local Documentation Center is available in the app sidebar and is backed by `/api/docs`.

## Controlled Auto-update

Phase 12 adds a controlled Update Center, release monitoring and Windows verification/install scripts. The platform can check an HTTPS update feed and notify users through `update_available`, but automatic installation is never triggered without explicit operator consent. See [Phase 12](docs/PHASE12.md).

Optional Windows service and shortcuts are available through dry-run safe scripts:

```powershell
.\release\install-service.ps1 -DryRun
.\release\create-shortcuts.ps1 -DryRun
```

## Documentation

- [User Guide](docs/USER_GUIDE.md)
- [Admin Guide](docs/ADMIN_GUIDE.md)
- [Windows Installation](docs/INSTALLATION_WINDOWS.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Security Checklist](docs/SECURITY_CHECKLIST.md)
- [Non-Technical Installation](docs/INSTALLATION_NON_TECHNIQUE.md)
- [Phase 8C Local CI](docs/PHASE8C.md)
- [Phase 9 Distribution CI](docs/PHASE9.md)
- [Phase 10 Public Release Docs Portal](docs/PHASE10.md)
- [Phase 12 Controlled Auto-update](docs/PHASE12.md)
- [API Reference](docs/API.md)

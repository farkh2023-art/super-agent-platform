# Super-Agent Platform

Local multi-agent orchestration platform for Windows and Node.js.

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
.\release\create-release.ps1 -Version v2.7.0-phase-8d
```

The ZIP is written to `dist/releases/` and excludes `.env`, dependency folders, runtime data, SQLite files and token-like files.

Verify and create a local checksum signature:

```powershell
.\release\create-release.ps1 -Version v2.7.0-phase-8d -Verify -Strict
.\release\sign-release.ps1 -ZipPath .\dist\releases\super-agent-platform-v2.7.0-phase-8d.zip
.\release\local-ci.ps1 -Version v2.7.0-phase-8d -Strict
```

Release distribution is also covered by GitHub Actions: CI runs through `.github/workflows/ci.yml`, and tagged releases use `.github/workflows/release.yml`.

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
- [API Reference](docs/API.md)

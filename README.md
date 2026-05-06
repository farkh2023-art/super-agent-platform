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
.\release\create-release.ps1 -Version v2.4.0-phase-8
```

The ZIP is written to `dist/releases/` and excludes `.env`, dependency folders, runtime data, SQLite files and token-like files.

## Documentation

- [User Guide](docs/USER_GUIDE.md)
- [Admin Guide](docs/ADMIN_GUIDE.md)
- [Windows Installation](docs/INSTALLATION_WINDOWS.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Security Checklist](docs/SECURITY_CHECKLIST.md)
- [API Reference](docs/API.md)

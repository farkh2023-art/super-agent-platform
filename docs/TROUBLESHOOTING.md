# Troubleshooting

## Port Already Used

Set another port before starting:

```powershell
$env:PORT="3002"
.\release\start.ps1 -Mode demo
```

## npm install Fails

Check Node/npm versions:

```powershell
node --version
npm --version
```

Delete only dependency folders you own if needed, then rerun `.\release\install.ps1`.

## Jest on Windows

Use the explicit command:

```powershell
cd backend
node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern=tests/ --runInBand
```

## punycode Warning

The Node.js `punycode` deprecation warning comes from dependencies and is non-blocking while tests pass.

## Claude/Codex Usage Limits

Provider limits are external. Switch to `AI_PROVIDER=mock` or local Ollama for demos.

## Missing .env

Run `.\release\install.ps1` or copy `.env.example` to `.env`. Never commit `.env`.

## SQLite Locked

Stop the server, close tools that hold the database file, then restart. SQLite is optional; return to `STORAGE_MODE=json` if needed.

## Ollama Missing

Use demo mode or set `AI_PROVIDER=mock`. For local embeddings, install Ollama, start it, and pull the configured models.

## Release Verification Fails

Run:

```powershell
.\release\verify-release.ps1 -ZipPath .\dist\releases\super-agent-platform-v2.6.0-phase-8c.zip -Strict
```

Check `dist/releases/VERIFY_REPORT.md`. Common causes are accidental `.env`, SQLite files, runtime data or token files in the package source.

## Local CI Fails

Run:

```powershell
.\release\local-ci.ps1 -Version v2.6.0-phase-8c -Strict
```

Then inspect `dist/releases/LOCAL_CI_REPORT.md`. If the failure happens during the extracted release test, retry:

```powershell
.\release\test-release.ps1 -ZipPath .\dist\releases\super-agent-platform-v2.6.0-phase-8c.zip -KeepTemp
.\release\cleanup-release-test.ps1 -DryRun
```

`install.ps1` inside the extracted ZIP may need network access or an npm cache because `node_modules` is never packaged.

## Windows Service Install Fails

Service install requires Administrator PowerShell. First run:

```powershell
.\release\install-service.ps1 -DryRun
```

Then retry in an elevated shell only if you really want the optional service.

## Shortcuts Not Created

Shortcut creation uses Windows Script Host. If it is disabled by policy, run the scripts directly from the `release` folder.

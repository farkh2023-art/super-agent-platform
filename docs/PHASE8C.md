# Phase 8C - Local Reproducible CI

Phase 8C adds a local Windows CI flow that validates a complete release ZIP from source to extracted demo startup.

## Commands

```powershell
.\release\local-ci.ps1 -Version v2.6.0-phase-8c -Strict
.\release\test-release.ps1 -ZipPath .\dist\releases\super-agent-platform-v2.6.0-phase-8c.zip
.\release\cleanup-release-test.ps1 -DryRun
```

## Local CI Workflow

`release/local-ci.ps1` runs:

1. Git working tree check.
2. Node.js and npm check.
3. Backend Jest tests unless `-SkipTests` is used.
4. Release ZIP dry-run.
5. Release ZIP build.
6. Strict ZIP verification with `verify-release.ps1`.
7. Local checksum signature with `sign-release.ps1`.
8. Clean extraction test with `test-release.ps1`.
9. Report generation.

Reports are written to:

- `dist/releases/LOCAL_CI_REPORT.json`
- `dist/releases/LOCAL_CI_REPORT.md`

## Extracted Release Test

`release/test-release.ps1` extracts the ZIP into:

```text
$env:TEMP\super-agent-platform-release-test\<timestamp>
```

It verifies the ZIP entries before install, runs `release/install.ps1` inside the extracted folder, starts demo mode with `release/start.ps1 -Mode demo -NoBrowser`, checks `/api/health`, runs `release/health-check.ps1 -Json`, stops the server and removes the temp directory unless `-KeepTemp` is set.

The test uses a random local port and does not touch the repository's real runtime data.

## Cleanup

`release/cleanup-release-test.ps1` removes old release test folders and stops only PIDs recorded under the release-test temp root. It does not delete `.env`, `backend/data` or backups from the real repository.

## Sensitive Exclusions

Phase 8C keeps the Phase 8B exclusions and also blocks runtime databases, runtime auth/storage snapshots, backup files, local-only settings and GitHub PAT files. Source files that implement token logic remain allowed.

## Limits

- This is local CI, not a hosted CI runner.
- `install.ps1` may need network or an npm cache when testing a fresh ZIP because `node_modules` is intentionally excluded.
- `test-release.ps1` clears inherited npm offline mode for that process and disables npm lifecycle scripts for demo-mode smoke validation only. Normal user installs still run the standard `npm install`.
- The signature is a local SHA256 checksum signature, not certificate-backed Windows code signing.

# Phase 9 - Distribution CI

Phase 9 adds hosted CI and release distribution controls around the existing local Windows release flow.

## Version Source

The repository root `VERSION` file is the distribution version source. For this phase it contains:

```text
2.7.0-phase-8d
```

`backend/package.json` remains on the runtime package version `2.7.0`. Release tags use the `v` prefix, for example `v2.7.0-phase-8d`.

## Version API

`/api/version` exposes the application version for clients and release checks. It is covered by Phase 9 backend tests and should remain aligned with the root `VERSION` file.

## CI Workflow

`.github/workflows/ci.yml` runs backend CI on Windows with Node.js 20. It installs backend dependencies and runs the backend test suite.

## Release Workflow

`.github/workflows/release.yml` runs on tag pushes matching `v*` and on manual dispatch. It:

- checks out the repository;
- installs backend dependencies with Node.js 20;
- runs backend Jest tests;
- creates the release ZIP with `release/create-release.ps1 -Verify -Strict`;
- signs and verifies the package;
- uploads ZIP, checksum, manifest, signature and verification reports;
- creates a GitHub Release through GitHub Actions using the workflow token.

## Publish Script

`release/publish-release.ps1` is the local operator entry point for publishing. It reads `VERSION` when no version is passed, checks version consistency, runs `release/local-ci.ps1` unless `-SkipCI` is set, prepares `git tag v$Version`, pushes the tag, and prepares `gh release create` with the release artifacts.

Use `-DryRun` to print commands without creating tags, pushing, or publishing.

## Version Check Script

`release/check-version.ps1` reads the local `VERSION` file. In offline mode it returns `OFFLINE`. Otherwise it queries:

```text
https://api.github.com/repos/$Repo/releases/latest
```

It reports `UP_TO_DATE` when the latest release matches the local version and `UPDATE_AVAILABLE` otherwise. It does not require a token.

## Publication Workflow

Recommended local publication sequence:

```powershell
.\release\check-version.ps1 -Offline -Json
.\release\publish-release.ps1 -DryRun -SkipCI -SkipGitHubRelease
.\release\local-ci.ps1 -Version v2.7.0-phase-8d -Strict
.\release\publish-release.ps1 -Version 2.7.0-phase-8d
```

The non-dry-run publish command should only be used by a release operator after the local CI output and artifacts have been reviewed.

## Limits

- `publish-release.ps1` depends on local Git and GitHub CLI availability for real publication.
- `check-version.ps1` compares version strings directly and does not implement semantic precedence sorting.
- The current local signature is checksum-based, not certificate-backed code signing.
- Manual workflow dispatch should be run from a release tag to keep artifact names and release metadata aligned.

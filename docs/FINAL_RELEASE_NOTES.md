# Final Release Notes - v3.0.0-phase-12

## v3.0.0-phase-12

Phase 12 adds controlled auto-update support without automatic installation.

Lots completed:

- Lot 2: update backend API with `/api/update/check`, `/api/update/history`, `/api/update/dismiss` and semver comparison.
- Lot 3: frontend Update Center, update banner and WebSocket `update_available` handling.
- Lot 4: Windows scripts `release/update-check.ps1` and `release/update-install.ps1`.
- Lot 5: disabled-by-default local `updateMonitor`, `/api/update/monitor/status` and `/api/update/check-now`.
- Lot 6: operator configuration, public update manifest example, rollback guide and final docs.

Remaining limits:

- No release is published by this phase.
- No GitHub release is created automatically.
- `UPDATE_MONITOR_ENABLED=false` remains the safe default.
- Operators must verify SHA256 and use explicit consent before installation.

---

# Previous Release Notes - v2.9.0-phase-10

## Highlights

- Windows install/start/stop/demo/backup/health-check/release scripts.
- Demo mode with mock provider, single auth and JSON storage.
- Local release ZIP generation with manifest and SHA256 checksum.
- User onboarding banner and reset action.
- User, admin, installation, troubleshooting and security documentation.
- Phase 8 smoke tests for packaging, release security and onboarding.
- Release verification reports with strict forbidden-file checks.
- Local checksum signature files for ZIP distribution.
- Optional Windows service install/uninstall dry-run support.
- Local uninstall and shortcut creation scripts.
- Non-technical installation guide.
- Reproducible local CI with `local-ci.ps1`.
- Clean extracted ZIP validation with `test-release.ps1`.
- Release-test cleanup with `cleanup-release-test.ps1`.
- `LOCAL_CI_REPORT.json` and `LOCAL_CI_REPORT.md` generated in `dist/releases/`.
- Stronger release exclusions for runtime DB files, backups, local settings and GitHub PAT files.
- Phase 8D completed with release signing, strict verification reports and packaging alignment.
- Phase 9 distribution CI added GitHub Actions CI, automated release workflow, publish dry-run flow and version checks.
- Phase 10 adds the local documentation API, frontend Documentation Center, HTML guide generation and a controlled public release gate.

## Current Version

`3.0.0-phase-12`

## Known Limits

- The app remains a local Node.js product; Windows service mode is optional.
- SQLite is optional and must be enabled deliberately after migration checks.
- Demo mode uses mock AI outputs and does not validate real provider credentials.
- The generated signature is checksum-based and local, not certificate-backed code signing.
- GitHub Actions release publication should be triggered from release tags to keep artifact metadata aligned.
- Version checks compare release strings directly and do not implement semantic precedence sorting.
- PDF guide export depends on local tools and is skipped gracefully when unavailable.
- Public publication remains controlled by `release-public-check.ps1` and GitHub Actions; Phase 10 does not publish automatically.

## Next Steps

Phase 11 should focus on richer documentation rendering, signed public installers and post-release update UX.

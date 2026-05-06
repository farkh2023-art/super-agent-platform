# Final Release Notes - v2.7.0-phase-8d

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

## Current Version

`2.7.0-phase-8d`

## Known Limits

- The app remains a local Node.js product; Windows service mode is optional.
- SQLite is optional and must be enabled deliberately after migration checks.
- Demo mode uses mock AI outputs and does not validate real provider credentials.
- The generated signature is checksum-based and local, not certificate-backed code signing.
- GitHub Actions release publication should be triggered from release tags to keep artifact metadata aligned.
- Version checks compare release strings directly and do not implement semantic precedence sorting.

## Next Steps

Phase 10 should focus on certificate-backed signing, optional MSI/MSIX packaging hardening and operator release validation.

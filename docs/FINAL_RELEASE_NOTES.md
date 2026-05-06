# Final Release Notes - v2.5.0-phase-8b

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

## Known Limits

- The app remains a local Node.js product; Windows service mode is optional.
- SQLite is optional and must be enabled deliberately after migration checks.
- Demo mode uses mock AI outputs and does not validate real provider credentials.
- The generated signature is checksum-based and local, not certificate-backed code signing.

## Next Steps

Phase 8C should add certificate-backed signing, CI release verification and optional MSI/MSIX packaging.

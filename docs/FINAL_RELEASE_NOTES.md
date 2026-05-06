# Final Release Notes - v2.4.0-phase-8

## Highlights

- Windows install/start/stop/demo/backup/health-check/release scripts.
- Demo mode with mock provider, single auth and JSON storage.
- Local release ZIP generation with manifest and SHA256 checksum.
- User onboarding banner and reset action.
- User, admin, installation, troubleshooting and security documentation.
- Phase 8 smoke tests for packaging, release security and onboarding.

## Known Limits

- The app remains a local Node.js product, not a native Windows service.
- SQLite is optional and must be enabled deliberately after migration checks.
- Demo mode uses mock AI outputs and does not validate real provider credentials.

## Next Steps

Phase 8B should add signed release archives, optional Windows service registration, and automated release verification in CI.

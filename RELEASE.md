# Release Notes — Super-Agent Platform

## v2.6.0-phase-8d

**Date:** 2026-05-06

### New in this release

- **MSI/MSIX packaging** — `release/packaging-tools.ps1` builds Windows installer packages via WiX Toolset (MSI) and Windows SDK (MSIX)
- **Code signing** — Authenticode support via `signtool.exe`; local-checksum fallback when no certificate is provided
- **Signature verification** — `release/verify-signature.ps1` checks `.msi`/`.msix` packages with `Get-AuthenticodeSignature`
- **WiX template** — `release/wix/product.wxs` defines the MSI product, features and component tree
- **MSIX manifest** — `release/msix/AppxManifest.xml` declares package identity, capabilities and visual assets
- **Packaging config** — `release/config/packaging.example.json` provides reference values for MSI/MSIX/signing

### Packaging prerequisites

| Tool | Purpose | Download |
|------|---------|----------|
| WiX Toolset v3.11+ | Build `.msi` with `candle.exe` + `light.exe` | https://wixtoolset.org/ |
| Windows SDK 10.0.19041+ | Build `.msix` with `makeappx.exe` | https://developer.microsoft.com/windows/downloads/windows-sdk/ |
| `signtool.exe` | Sign packages (bundled with Windows SDK) | — |

### Quick start

```powershell
# MSI only (requires WiX)
.\release\packaging-tools.ps1 -Version v2.6.0 -BuildMsi

# MSIX only (requires Windows SDK)
.\release\packaging-tools.ps1 -Version v2.6.0 -BuildMsix

# Both, with Authenticode certificate
.\release\packaging-tools.ps1 -Version v2.6.0 -BuildMsi -BuildMsix -CertificatePath cert.pfx

# Full local CI including packaging
.\release\local-ci.ps1 -Version v2.6.0 -BuildMsi -BuildMsix
```

### .gitignore protection

Binary installer artefacts (`*.msi`, `*.msix`, `*.appxbundle`) are excluded from version control.

---

## v2.5.0-phase-8c

Local CI pipeline (`local-ci.ps1`), reproducible release build, test-release extraction, cleanup script.

## v2.4.0-phase-8b

Release verification (`verify-release.ps1`), SHA-256 checksum, local signature JSON, Windows service scripts.

## v2.3.0-phase-8

Local packaging, user guide, admin guide, security checklist, install/uninstall/start/stop scripts.

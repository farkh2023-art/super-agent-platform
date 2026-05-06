# Phase 10 - Public Release Docs Portal

Phase 10 closes the public-release documentation layer for Super-Agent Platform. It adds a local documentation API, a frontend Documentation Center, local HTML guide generation, and a pre-publication gate for controlled public releases.

## Backend Documentation API

The backend exposes:

- `GET /api/docs` returns the public documentation manifest.
- `GET /api/docs/:id` returns one Markdown document by stable manifest id.

The manifest is defined in `backend/src/docs/docsManifest.js` and is served through `backend/src/routes/docs.js`. It only references public Markdown files under `docs/` and avoids absolute paths, runtime data and secret files.

## Documentation Center

The frontend includes a Documentation Center view that consumes `/api/docs` and `/api/docs/:id`.

It provides:

- documentation navigation entry;
- categorized guide list;
- simple search by title, category and description;
- safe text rendering of Markdown content.

## Local Docs Generation

`release/generate-docs.ps1` generates local HTML exports for the public guides:

```powershell
.\release\generate-docs.ps1 -Json
.\release\generate-docs.ps1 -DryRun -Json
.\release\generate-docs.ps1 -IncludePdf
```

Output is written to `dist/docs/` and includes `DOCS_MANIFEST.json`. PDF export is optional and skipped gracefully when `wkhtmltopdf` or `pandoc` is not available.

## Public Release Gate

`release/release-public-check.ps1` is the controlled pre-publication gate:

```powershell
.\release\release-public-check.ps1 -DryRun -Offline -Json -SkipTests -SkipDocs -SkipReleaseBuild
.\release\release-public-check.ps1 -Offline -Json -Strict
```

It checks version alignment, documentation API files, Documentation Center markers, release scripts, local docs generation, local CI and release packaging unless skipped.

## Controlled Publication Workflow

Recommended final workflow before a public tag:

```powershell
.\release\generate-docs.ps1 -Json
.\release\release-public-check.ps1 -Offline -Json -Strict
cd backend
node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern=tests/ --runInBand
cd ..
.\release\create-release.ps1 -Version v2.9.0-phase-10 -Verify -Strict
```

Only after reviewing the reports should a release operator create and publish tag `v2.9.0-phase-10`.

## Public Checklist

- [ ] `VERSION` is `2.9.0-phase-10`.
- [ ] `backend/package.json` is `2.9.0`.
- [ ] `/api/version` returns the release version.
- [ ] `/api/docs` returns the public docs manifest.
- [ ] Documentation Center loads the guide list and content.
- [ ] `generate-docs.ps1` produces `dist/docs/DOCS_MANIFEST.json`.
- [ ] `release-public-check.ps1 -Strict` passes.
- [ ] Full backend test suite passes.
- [ ] Release ZIP verifies with `verify-release.ps1 -Strict`.
- [ ] ZIP, SHA256, signature and reports are reviewed before publication.

## Limits

- Markdown in the Documentation Center is displayed as safe text, not rich HTML.
- PDF generation is optional and depends on local tools.
- `release-public-check.ps1` is a gate, not a publishing command.
- No real publication or tag push is performed by Phase 10 docs tooling.

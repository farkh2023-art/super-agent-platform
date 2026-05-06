'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const PUBLISH_PATH = path.join(ROOT, 'release', 'publish-release.ps1');
const CHECK_PATH = path.join(ROOT, 'release', 'check-version.ps1');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

describe('Phase 9 Lot 4 - publish and version check scripts', () => {
  test('publish-release.ps1 exists', () => {
    expect(fs.existsSync(PUBLISH_PATH)).toBe(true);
  });

  test('publish-release supports dry run and reads VERSION', () => {
    const content = read(PUBLISH_PATH);

    expect(content).toMatch(/DryRun/);
    expect(content).toMatch(/VERSION/);
    expect(content).toMatch(/Get-Content/);
  });

  test('publish-release runs local CI, tags, pushes and prepares GitHub release', () => {
    const content = read(PUBLISH_PATH);

    expect(content).toMatch(/local-ci\.ps1/);
    expect(content).toMatch(/git .*tag|git tag/);
    expect(content).toMatch(/git .*push|git push/);
    expect(content).toMatch(/gh release create/);
  });

  test('check-version.ps1 exists', () => {
    expect(fs.existsSync(CHECK_PATH)).toBe(true);
  });

  test('check-version reads VERSION and checks GitHub releases API', () => {
    const content = read(CHECK_PATH);

    expect(content).toMatch(/VERSION/);
    expect(content).toMatch(/Get-Content/);
    expect(content).toMatch(/api\.github\.com/);
  });

  test('check-version exposes expected statuses', () => {
    const content = read(CHECK_PATH);

    expect(content).toMatch(/UP_TO_DATE/);
    expect(content).toMatch(/UPDATE_AVAILABLE/);
    expect(content).toMatch(/OFFLINE/);
  });

  test('scripts do not hardcode credentials', () => {
    const content = `${read(PUBLISH_PATH)}\n${read(CHECK_PATH)}`;

    expect(content).not.toMatch(/github_pat/i);
    expect(content).not.toMatch(/sk-/i);
    expect(content).not.toMatch(/password/i);

    const withoutAllowedWords = content.replace(/\bGITHUB_TOKEN\b/g, '');
    expect(withoutAllowedWords).not.toMatch(/\b[A-Z0-9_]*TOKEN[A-Z0-9_]*\s*[:=]\s*['"]?[A-Za-z0-9_\-.]{8,}/i);
  });
});

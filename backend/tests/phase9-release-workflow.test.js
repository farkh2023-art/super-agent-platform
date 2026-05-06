'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const WORKFLOW_PATH = path.join(ROOT, '.github', 'workflows', 'release.yml');

function readWorkflow() {
  return fs.readFileSync(WORKFLOW_PATH, 'utf8');
}

describe('Phase 9 Lot 3B - GitHub Actions release workflow', () => {
  test('release.yml exists', () => {
    expect(fs.existsSync(WORKFLOW_PATH)).toBe(true);
  });

  test('workflow has required triggers and permissions', () => {
    const content = readWorkflow();

    expect(content).toMatch(/push:\s*\n\s*tags:\s*\n\s*-\s*['"]?v\*['"]?/);
    expect(content).toMatch(/workflow_dispatch:/);
    expect(content).toMatch(/permissions:\s*\n\s*contents:\s*write/);
  });

  test('workflow runs on Windows and sets up backend tests', () => {
    const content = readWorkflow();

    expect(content).toMatch(/windows-latest/);
    expect(content).toMatch(/actions\/checkout/);
    expect(content).toMatch(/actions\/setup-node/);
    expect(content).toMatch(/node-version:\s*['"]?20['"]?/);
    expect(content).toMatch(/npm (?:ci|install)\b/);
    expect(content).toMatch(/jest/);
  });

  test('workflow creates, signs and verifies release package in strict mode', () => {
    const content = readWorkflow();

    expect(content).toMatch(/create-release\.ps1/);
    expect(content).toMatch(/-Verify/);
    expect(content).toMatch(/-Strict/);
    expect(content).toMatch(/sign-release\.ps1/);
    expect(content).toMatch(/verify-release\.ps1/);
  });

  test('workflow uploads artifacts and creates a GitHub Release', () => {
    const content = readWorkflow();

    expect(content).toMatch(/upload-artifact/);
    expect(content).toMatch(/super-agent-platform-\$\{\{\s*github\.ref_name\s*\}\}\.zip/);
    expect(content).toMatch(/\.sha256/);
    expect(content).toMatch(/RELEASE_SIGNATURE\.json/);
    expect(content).toMatch(/MANIFEST\.json/);
    expect(content).toMatch(/VERIFY_REPORT\.json/);
    expect(content).toMatch(/VERIFY_REPORT\.md/);
    expect(content).toMatch(/softprops\/action-gh-release|gh release create/);
  });

  test('workflow does not hardcode credentials', () => {
    const content = readWorkflow();

    expect(content).not.toMatch(/github_pat/i);
    expect(content).not.toMatch(/sk-/i);
    expect(content).not.toMatch(/password/i);

    const withoutAllowedGithubToken = content.replace(/\bGITHUB_TOKEN\b/g, '');
    expect(withoutAllowedGithubToken).not.toMatch(/\b[A-Z0-9_]*TOKEN[A-Z0-9_]*\s*[:=]\s*['"]?[A-Za-z0-9_\-.]{8,}/i);
  });
});

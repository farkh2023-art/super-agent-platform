'use strict';

const docsManifest = Object.freeze([
  {
    id: 'user-guide',
    title: 'User Guide',
    category: 'guides',
    format: 'markdown',
    public: true,
    source: 'docs/USER_GUIDE.md',
    description: 'End-user guide for running the local platform and core workflows.'
  },
  {
    id: 'admin-guide',
    title: 'Admin Guide',
    category: 'guides',
    format: 'markdown',
    public: true,
    source: 'docs/ADMIN_GUIDE.md',
    description: 'Administration notes for auth, sessions, storage and security defaults.'
  },
  {
    id: 'installation-windows',
    title: 'Windows Installation',
    category: 'installation',
    format: 'markdown',
    public: true,
    source: 'docs/INSTALLATION_WINDOWS.md',
    description: 'Windows setup and local installation instructions.'
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    category: 'support',
    format: 'markdown',
    public: true,
    source: 'docs/TROUBLESHOOTING.md',
    description: 'Common local runtime issues and diagnostic steps.'
  },
  {
    id: 'security-checklist',
    title: 'Security Checklist',
    category: 'security',
    format: 'markdown',
    public: true,
    source: 'docs/SECURITY_CHECKLIST.md',
    description: 'Release and local deployment security checklist.'
  },
  {
    id: 'api',
    title: 'API Reference',
    category: 'reference',
    format: 'markdown',
    public: true,
    source: 'docs/API.md',
    description: 'Backend REST and WebSocket API reference.'
  },
  {
    id: 'phase9',
    title: 'Phase 9 Distribution CI',
    category: 'release',
    format: 'markdown',
    public: true,
    source: 'docs/PHASE9.md',
    description: 'Phase 9 release distribution, CI and publication workflow notes.'
  }
]);

function getDocsManifest() {
  return docsManifest.map((entry) => ({ ...entry }));
}

function findDocById(id) {
  return docsManifest.find((entry) => entry.id === id) || null;
}

module.exports = {
  docsManifest,
  getDocsManifest,
  findDocById
};

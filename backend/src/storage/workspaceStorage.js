'use strict';

const storage = require('./index');

function forWorkspace(workspaceId) {
  if (!workspaceId) return storage;

  return {
    list: (col) => storage.list(col).filter((i) => i.workspaceId === workspaceId),
    findAll: (col) => storage.list(col).filter((i) => i.workspaceId === workspaceId),
    get: (col, id) => {
      const item = storage.get(col, id);
      return item && item.workspaceId === workspaceId ? item : null;
    },
    findById: (col, id) => {
      const item = storage.get(col, id);
      return item && item.workspaceId === workspaceId ? item : null;
    },
    create: (col, item) => storage.create(col, { ...item, workspaceId }),
    update: (col, id, patch) => {
      const existing = storage.get(col, id);
      if (!existing || existing.workspaceId !== workspaceId) return null;
      return storage.update(col, id, patch);
    },
    remove: (col, id) => {
      const existing = storage.get(col, id);
      if (!existing || existing.workspaceId !== workspaceId) return false;
      return storage.remove(col, id);
    },
    count: (col) => storage.list(col).filter((i) => i.workspaceId === workspaceId).length,
  };
}

module.exports = { forWorkspace };

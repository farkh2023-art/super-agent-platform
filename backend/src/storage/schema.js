'use strict';

const TABLES = {
  tasks: {
    table: 'tasks',
    columns: {
      id: 'id',
      task: 'task',
      status: 'status',
      createdAt: 'created_at',
    },
  },
  executions: {
    table: 'executions',
    columns: {
      id: 'id',
      task: 'task',
      planText: 'plan_text',
      status: 'status',
      createdAt: 'created_at',
      startedAt: 'started_at',
      finishedAt: 'finished_at',
      durationMs: 'duration_ms',
      useMemory: 'use_memory',
      provider: 'provider',
    },
  },
  artifacts: {
    table: 'artifacts',
    columns: {
      id: 'id',
      executionId: 'execution_id',
      filename: 'filename',
      format: 'format',
      path: 'path',
      content: 'content',
      createdAt: 'created_at',
    },
  },
  workflows: {
    table: 'workflows',
    columns: {
      id: 'id',
      name: 'name',
      description: 'description',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },
  workflow_runs: {
    table: 'workflow_runs',
    columns: {
      id: 'id',
      workflowId: 'workflow_id',
      status: 'status',
      startedAt: 'started_at',
      finishedAt: 'finished_at',
      durationMs: 'duration_ms',
    },
  },
  schedules: {
    table: 'schedules',
    columns: {
      id: 'id',
      name: 'name',
      enabled: 'enabled',
      cron: 'cron',
      targetType: 'target_type',
      targetId: 'target_id',
      lastRunAt: 'last_run_at',
      nextRunAt: 'next_run_at',
    },
  },
  memory: {
    table: 'memory_items',
    columns: {
      id: 'id',
      type: 'type',
      title: 'title',
      content: 'content',
      summary: 'summary',
      sourceId: 'source_id',
      sourcePath: 'source_path',
      tags: 'tags_json',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },
  memory_eval_queries: {
    table: 'memory_eval_queries',
    columns: {
      id: 'id',
      query: 'query',
      expectedKeywords: 'expected_keywords_json',
      expectedTypes: 'expected_types_json',
      description: 'description',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },
  notifications: {
    table: 'notifications',
    columns: {
      id: 'id',
      type: 'type',
      title: 'title',
      message: 'message',
      read: 'read',
      createdAt: 'created_at',
    },
  },
};

const COLLECTIONS = Object.keys(TABLES);

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  task TEXT,
  status TEXT,
  created_at TEXT,
  raw_json TEXT
);
CREATE TABLE IF NOT EXISTS executions (
  id TEXT PRIMARY KEY,
  task TEXT,
  plan_text TEXT,
  status TEXT,
  created_at TEXT,
  started_at TEXT,
  finished_at TEXT,
  duration_ms INTEGER,
  use_memory INTEGER,
  provider TEXT,
  raw_json TEXT
);
CREATE TABLE IF NOT EXISTS execution_steps (
  id TEXT PRIMARY KEY,
  execution_id TEXT,
  agent_id TEXT,
  agent_name TEXT,
  status TEXT,
  started_at TEXT,
  finished_at TEXT,
  duration_ms INTEGER,
  output_artifact_id TEXT,
  raw_json TEXT
);
CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  execution_id TEXT,
  filename TEXT,
  format TEXT,
  path TEXT,
  content TEXT,
  created_at TEXT,
  raw_json TEXT
);
CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY,
  name TEXT,
  description TEXT,
  created_at TEXT,
  updated_at TEXT,
  raw_json TEXT
);
CREATE TABLE IF NOT EXISTS workflow_runs (
  id TEXT PRIMARY KEY,
  workflow_id TEXT,
  status TEXT,
  started_at TEXT,
  finished_at TEXT,
  duration_ms INTEGER,
  raw_json TEXT
);
CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY,
  name TEXT,
  enabled INTEGER,
  cron TEXT,
  target_type TEXT,
  target_id TEXT,
  last_run_at TEXT,
  next_run_at TEXT,
  raw_json TEXT
);
CREATE TABLE IF NOT EXISTS memory_items (
  id TEXT PRIMARY KEY,
  type TEXT,
  title TEXT,
  content TEXT,
  summary TEXT,
  source_id TEXT,
  source_path TEXT,
  tags_json TEXT,
  created_at TEXT,
  updated_at TEXT,
  raw_json TEXT
);
CREATE TABLE IF NOT EXISTS memory_embeddings (
  memory_id TEXT,
  model TEXT,
  content_hash TEXT,
  embedding_json TEXT,
  created_at TEXT,
  updated_at TEXT,
  PRIMARY KEY(memory_id, model)
);
CREATE TABLE IF NOT EXISTS memory_eval_queries (
  id TEXT PRIMARY KEY,
  query TEXT,
  expected_keywords_json TEXT,
  expected_types_json TEXT,
  description TEXT,
  created_at TEXT,
  updated_at TEXT,
  raw_json TEXT
);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  type TEXT,
  title TEXT,
  message TEXT,
  read INTEGER,
  created_at TEXT,
  raw_json TEXT
);
CREATE TABLE IF NOT EXISTS settings_kv (
  key TEXT PRIMARY KEY,
  value_json TEXT,
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS storage_events (
  id TEXT PRIMARY KEY,
  type TEXT,
  collection TEXT,
  severity TEXT,
  message TEXT,
  created_at TEXT,
  metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_executions_created_at ON executions(created_at);
CREATE INDEX IF NOT EXISTS idx_executions_status ON executions(status);
CREATE INDEX IF NOT EXISTS idx_artifacts_execution_id ON artifacts(execution_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow_id ON workflow_runs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_schedules_enabled ON schedules(enabled);
CREATE INDEX IF NOT EXISTS idx_memory_items_type ON memory_items(type);
CREATE INDEX IF NOT EXISTS idx_memory_items_source_id ON memory_items(source_id);
CREATE INDEX IF NOT EXISTS idx_memory_embeddings_memory_id ON memory_embeddings(memory_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_storage_events_created_at ON storage_events(created_at);
`;

module.exports = { TABLES, COLLECTIONS, SCHEMA_SQL };

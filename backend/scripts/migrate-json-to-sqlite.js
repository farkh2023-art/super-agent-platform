#!/usr/bin/env node
'use strict';

const { migrateJsonToSqlite } = require('../src/storage/migrations');

function parseArgs(argv) {
  return {
    dryRun: argv.includes('--dry-run'),
    backup: argv.includes('--backup'),
    force: argv.includes('--force'),
    dbPath: argv.includes('--db') ? argv[argv.indexOf('--db') + 1] : undefined,
  };
}

function run(options = {}) {
  return migrateJsonToSqlite(options);
}

if (require.main === module) {
  const result = run(parseArgs(process.argv.slice(2)));
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.errors && result.errors.length ? 1 : 0);
}

module.exports = { run };

#!/usr/bin/env node
'use strict';

const { rollbackSqliteToJson } = require('../src/storage/migrations');

function parseArgs(argv) {
  return {
    dryRun: argv.includes('--dry-run'),
    fromBackup: argv.includes('--from-backup'),
    fromSqlite: argv.includes('--from-sqlite') || !argv.includes('--from-backup'),
  };
}

function run(options = {}) {
  return rollbackSqliteToJson(options);
}

if (require.main === module) {
  const result = run(parseArgs(process.argv.slice(2)));
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.errors && result.errors.length ? 1 : 0);
}

module.exports = { run };

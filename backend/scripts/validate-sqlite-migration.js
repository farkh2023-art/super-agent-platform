#!/usr/bin/env node
'use strict';

const { validateSqliteMigration } = require('../src/storage/migrations');

function parseArgs(argv) {
  return {
    dbPath: argv.includes('--db') ? argv[argv.indexOf('--db') + 1] : undefined,
    sampleSize: argv.includes('--sample-size') ? parseInt(argv[argv.indexOf('--sample-size') + 1], 10) : 100,
  };
}

function run(options = {}) {
  return validateSqliteMigration(options);
}

if (require.main === module) {
  const result = run(parseArgs(process.argv.slice(2)));
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
}

module.exports = { run };

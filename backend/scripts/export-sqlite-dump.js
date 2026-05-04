#!/usr/bin/env node
'use strict';

const { createSqliteDump } = require('../src/storage/sqliteDump');

function parseArgs(argv) {
  return {
    dbPath: argv.includes('--db') ? argv[argv.indexOf('--db') + 1] : undefined,
    outputDir: argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : undefined,
  };
}

function run(options = {}) {
  return createSqliteDump(options);
}

if (require.main === module) {
  const result = run(parseArgs(process.argv.slice(2)));
  console.log(JSON.stringify({ path: result.path, filename: result.filename }, null, 2));
}

module.exports = { run };

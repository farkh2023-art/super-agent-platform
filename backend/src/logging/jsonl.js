'use strict';

const fs = require('fs');
const path = require('path');

function getLogsDir() {
  const base = process.env.DATA_DIR
    ? path.resolve(__dirname, '..', '..', process.env.DATA_DIR)
    : path.resolve(__dirname, '..', '..', 'data');
  return path.join(base, 'logs');
}

function getLogFile() {
  const logsDir = getLogsDir();
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  return path.join(logsDir, `${date}.jsonl`);
}

function writeLog(entry) {
  try {
    fs.appendFileSync(getLogFile(), JSON.stringify(entry) + '\n', 'utf8');
  } catch {
    // fail silently — logging must never crash the app
  }
}

module.exports = { writeLog };

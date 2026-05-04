'use strict';

const fs = require('fs');
const path = require('path');
const { sanitizeValue } = require('./storageEvents');

function reportsDir() {
  const base = process.env.DATA_DIR
    ? path.resolve(__dirname, '..', '..', process.env.DATA_DIR)
    : path.resolve(__dirname, '..', '..', 'data');
  return path.join(base, 'validation-reports');
}

function saveValidationReport(result) {
  const dir = reportsDir();
  fs.mkdirSync(dir, { recursive: true });
  const ts = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '-');
  const filename = `validation-${ts}.json`;
  const safe = sanitizeValue(result);
  fs.writeFileSync(path.join(dir, filename), JSON.stringify(safe, null, 2), 'utf8');
  return filename;
}

function listValidationReports() {
  const dir = reportsDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => /^validation-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\.json$/.test(name))
    .sort()
    .reverse()
    .slice(0, 50)
    .map((name) => {
      try {
        const stat = fs.statSync(path.join(dir, name));
        return { filename: name, size: stat.size, createdAt: stat.mtime.toISOString() };
      } catch {
        return { filename: name, size: 0, createdAt: null };
      }
    });
}

function loadValidationReport(filename) {
  if (!/^validation-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\.json$/.test(filename)) {
    throw Object.assign(new Error('Invalid report filename'), { code: 'INVALID_FILENAME' });
  }
  const fullPath = path.join(reportsDir(), filename);
  if (!fs.existsSync(fullPath)) throw Object.assign(new Error('Report not found'), { code: 'NOT_FOUND' });
  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

module.exports = { reportsDir, saveValidationReport, listValidationReports, loadValidationReport };

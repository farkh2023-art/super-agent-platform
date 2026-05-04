'use strict';

const fs = require('fs');
const path = require('path');
const { v4: uuid } = require('uuid');
const storage = require('../storage');
const { retrieve } = require('./retriever');
const { sanitizeContent } = require('./sanitize');

const VALID_MODES = ['keyword', 'vector', 'hybrid'];
const DEFAULT_QUERIES = [
  {
    id: 'eval-001',
    query: 'erreur Jest async warning',
    expectedKeywords: ['jest', 'async', 'warning', 'worker'],
    expectedTypes: ['artifact', 'execution', 'manual_note'],
    description: 'Doit retrouver les elements lies a la correction du warning async Jest.',
  },
];

let latestEvaluation = null;

function evalQueriesPath() {
  return path.join(storage.DATA_DIR, 'memory', 'eval-queries.json');
}

function reportsDir() {
  return path.join(storage.DATA_DIR, 'memory', 'evaluation-reports');
}

function sanitizeText(value, max = 500) {
  return sanitizeContent(String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim()).slice(0, max);
}

function sanitizeKeywords(values) {
  const list = Array.isArray(values) ? values : String(values || '').split(',');
  return [...new Set(list.map((v) => sanitizeText(v, 80).toLowerCase()).filter(Boolean))].slice(0, 20);
}

function sanitizeTypes(values) {
  const list = Array.isArray(values) ? values : String(values || '').split(',');
  return [...new Set(list.map((v) => sanitizeText(v, 60)).filter(Boolean))].slice(0, 12);
}

function sanitizeQueryConfig(input, existingId = null) {
  const query = sanitizeText(input.query, 300);
  const expectedKeywords = sanitizeKeywords(input.expectedKeywords);
  if (!query) {
    const err = new Error('Le champ "query" est requis');
    err.statusCode = 400;
    throw err;
  }
  if (expectedKeywords.length === 0) {
    const err = new Error('"expectedKeywords" doit contenir au moins un mot-cle');
    err.statusCode = 400;
    throw err;
  }
  return {
    id: existingId || sanitizeText(input.id, 80) || `eval-${uuid().slice(0, 8)}`,
    query,
    expectedKeywords,
    expectedTypes: sanitizeTypes(input.expectedTypes),
    description: sanitizeText(input.description, 600),
  };
}

function ensureEvalQueriesFile() {
  const fp = evalQueriesPath();
  if (!fs.existsSync(fp)) {
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, JSON.stringify({ queries: DEFAULT_QUERIES }, null, 2), 'utf8');
  }
}

function readEvalQueries() {
  ensureEvalQueriesFile();
  try {
    const data = JSON.parse(fs.readFileSync(evalQueriesPath(), 'utf8'));
    return { queries: Array.isArray(data.queries) ? data.queries.map((q) => sanitizeQueryConfig(q, q.id)) : [] };
  } catch {
    return { queries: [] };
  }
}

function writeEvalQueries(queries) {
  const fp = evalQueriesPath();
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, JSON.stringify({ queries }, null, 2), 'utf8');
  return { queries };
}

function resultText(result) {
  return [
    result.title,
    result.excerpt,
    result.content,
    JSON.stringify(result.metadata || {}),
  ].join(' ').toLowerCase();
}

function matchingKeywords(result, expectedKeywords) {
  const text = resultText(result);
  return expectedKeywords.filter((kw) => text.includes(String(kw || '').toLowerCase()));
}

function isRelevant(result, expectedKeywords) {
  return matchingKeywords(result, expectedKeywords).length > 0;
}

function precisionAtK(results, expectedKeywords, k) {
  const top = (results || []).slice(0, k);
  if (!k) return 0;
  return top.filter((r) => isRelevant(r, expectedKeywords)).length / k;
}

function recallAtK(results, expectedKeywords, k) {
  const expected = sanitizeKeywords(expectedKeywords);
  if (expected.length === 0) return 0;
  const found = new Set();
  for (const result of (results || []).slice(0, k)) {
    for (const kw of matchingKeywords(result, expected)) found.add(kw);
  }
  return found.size / expected.length;
}

function ndcgAtK(results, expectedKeywords, k) {
  const gains = (results || []).slice(0, k).map((r) => isRelevant(r, expectedKeywords) ? 1 : 0);
  const dcg = gains.reduce((sum, gain, idx) => sum + gain / Math.log2(idx + 2), 0);
  const idealRelevant = Math.min(k, sanitizeKeywords(expectedKeywords).length);
  const idcg = Array.from({ length: idealRelevant }, (_, idx) => 1 / Math.log2(idx + 2))
    .reduce((sum, v) => sum + v, 0);
  return idcg ? dcg / idcg : 0;
}

function roundMetric(value) {
  return value == null ? null : Number(value.toFixed(4));
}

async function evaluateQuery(queryConfig, mode = 'keyword', topK = 5) {
  const clean = sanitizeQueryConfig(queryConfig, queryConfig.id);
  const safeMode = VALID_MODES.includes(mode) ? mode : 'keyword';
  const k = Math.max(1, Math.min(parseInt(topK || 5, 10), 50));
  const start = Date.now();
  const data = await retrieve(clean.query, {
    topK: k,
    mode: safeMode,
    types: clean.expectedTypes,
    useEmbeddings: safeMode !== 'keyword',
  });
  const unavailable = safeMode === 'vector' && !data.embeddingsAvailable;
  const metrics = unavailable ? {
    precisionAtK: null,
    recallAtK: null,
    ndcgAtK: null,
  } : {
    precisionAtK: roundMetric(precisionAtK(data.results, clean.expectedKeywords, k)),
    recallAtK: roundMetric(recallAtK(data.results, clean.expectedKeywords, k)),
    ndcgAtK: roundMetric(ndcgAtK(data.results, clean.expectedKeywords, k)),
  };
  return {
    queryId: clean.id,
    query: clean.query,
    mode: safeMode,
    modeUsed: data.modeUsed,
    available: !unavailable,
    unavailable,
    embeddingsAvailable: data.embeddingsAvailable,
    fallbackReason: data.fallbackReason || null,
    latencyMs: Date.now() - start,
    topK: k,
    expectedKeywords: clean.expectedKeywords,
    expectedTypes: clean.expectedTypes,
    metrics,
    results: data.results.map(({ content, ...r }) => r),
  };
}

async function compareModes(queryConfig, topK = 5) {
  const modes = {};
  for (const mode of VALID_MODES) modes[mode] = await evaluateQuery(queryConfig, mode, topK);
  return modes;
}

function averageFor(results, mode, metric) {
  const rows = results.map((r) => r.modes[mode]).filter((r) => r && r.available && r.metrics[metric] != null);
  if (rows.length === 0) return null;
  return roundMetric(rows.reduce((sum, r) => sum + r.metrics[metric], 0) / rows.length);
}

function bestModeFromAverages(avgNdcg, avgPrecision) {
  const candidates = VALID_MODES
    .filter((m) => avgNdcg[m] != null)
    .sort((a, b) => (avgNdcg[b] - avgNdcg[a]) || ((avgPrecision[b] || 0) - (avgPrecision[a] || 0)));
  return candidates[0] || 'keyword';
}

async function evaluateAll({ modes = VALID_MODES, topK = 5 } = {}) {
  const safeModes = (Array.isArray(modes) ? modes : VALID_MODES).filter((m) => VALID_MODES.includes(m));
  const activeModes = safeModes.length ? safeModes : VALID_MODES;
  const queries = readEvalQueries().queries;
  const results = [];
  for (const query of queries) {
    const row = {
      queryId: query.id,
      query: query.query,
      description: query.description,
      expectedKeywords: query.expectedKeywords,
      modes: {},
    };
    for (const mode of activeModes) row.modes[mode] = await evaluateQuery(query, mode, topK);
    results.push(row);
  }
  const averagePrecisionAtK = {};
  const averageRecallAtK = {};
  const averageNdcgAtK = {};
  for (const mode of activeModes) {
    averagePrecisionAtK[mode] = averageFor(results, mode, 'precisionAtK');
    averageRecallAtK[mode] = averageFor(results, mode, 'recallAtK');
    averageNdcgAtK[mode] = averageFor(results, mode, 'ndcgAtK');
  }
  const summary = {
    totalQueries: queries.length,
    topK: Math.max(1, Math.min(parseInt(topK || 5, 10), 50)),
    modes: activeModes,
    bestMode: bestModeFromAverages(averageNdcgAtK, averagePrecisionAtK),
    averagePrecisionAtK,
    averageRecallAtK,
    averageNdcgAtK,
    embeddingsAvailable: results.some((r) => Object.values(r.modes).some((m) => m.embeddingsAvailable)),
    fallbackKeyword: results.some((r) => Object.values(r.modes).some((m) => m.mode !== m.modeUsed)),
    evaluatedAt: new Date().toISOString(),
  };
  latestEvaluation = { summary, results };
  return latestEvaluation;
}

function reportFilename(date = new Date()) {
  const stamp = date.toISOString().slice(0, 16).replace('T', '-').replace(':', '-');
  return `rag-evaluation-${stamp}.md`;
}

function metricCell(value) {
  return value == null ? 'unavailable' : value.toFixed ? value.toFixed(4) : String(value);
}

function generateMarkdownReport(evaluation) {
  const { summary, results } = evaluation;
  const lines = [
    '# RAG Evaluation Report',
    '',
    `Date: ${summary.evaluatedAt}`,
    `Modes compares: ${summary.modes.join(', ')}`,
    `TopK: ${summary.topK}`,
    `Nombre de requetes: ${summary.totalQueries}`,
    `Meilleure strategie: ${summary.bestMode}`,
    `Embeddings disponibles: ${summary.embeddingsAvailable ? 'oui' : 'non'}`,
  ];
  if (!summary.embeddingsAvailable || summary.fallbackKeyword) {
    lines.push('Note: embeddings indisponibles ou partiels, fallback keyword utilise quand necessaire.');
  }
  lines.push('', '## Moyennes', '', '| Mode | precision@K | recall@K | nDCG@K |', '|:--|--:|--:|--:|');
  for (const mode of summary.modes) {
    lines.push(`| ${mode} | ${metricCell(summary.averagePrecisionAtK[mode])} | ${metricCell(summary.averageRecallAtK[mode])} | ${metricCell(summary.averageNdcgAtK[mode])} |`);
  }
  lines.push('', '## Details par requete', '');
  for (const row of results) {
    lines.push(`### ${row.queryId} - ${sanitizeText(row.query, 120)}`);
    if (row.description) lines.push(sanitizeText(row.description, 300));
    lines.push(`Expected keywords: ${row.expectedKeywords.join(', ')}`, '');
    lines.push('| Mode | Mode utilise | Disponible | precision@K | recall@K | nDCG@K | Resultats |');
    lines.push('|:--|:--|:--:|--:|--:|--:|--:|');
    for (const mode of summary.modes) {
      const m = row.modes[mode];
      lines.push(`| ${mode} | ${m.modeUsed} | ${m.available ? 'oui' : 'non'} | ${metricCell(m.metrics.precisionAtK)} | ${metricCell(m.metrics.recallAtK)} | ${metricCell(m.metrics.ndcgAtK)} | ${m.results.length} |`);
    }
    lines.push('');
  }
  return sanitizeContent(lines.join('\n'));
}

function exportMarkdownReport(evaluation = latestEvaluation) {
  if (!evaluation) {
    const err = new Error('Aucune evaluation disponible');
    err.statusCode = 404;
    throw err;
  }
  fs.mkdirSync(reportsDir(), { recursive: true });
  const filename = reportFilename(new Date(evaluation.summary.evaluatedAt));
  const fp = path.join(reportsDir(), filename);
  const markdown = generateMarkdownReport(evaluation);
  fs.writeFileSync(fp, markdown, 'utf8');
  return { filename, path: fp, markdown };
}

function getLatestEvaluation() {
  return latestEvaluation;
}

module.exports = {
  VALID_MODES,
  evalQueriesPath,
  reportsDir,
  readEvalQueries,
  writeEvalQueries,
  sanitizeQueryConfig,
  evaluateQuery,
  evaluateAll,
  precisionAtK,
  recallAtK,
  ndcgAtK,
  compareModes,
  exportMarkdownReport,
  generateMarkdownReport,
  getLatestEvaluation,
};

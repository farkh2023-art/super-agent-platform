'use strict';

function estimateTokens(text) {
  return Math.ceil(String(text || '').trim().split(/\s+/).filter(Boolean).length * 1.3);
}

function chunkText(text, options = {}) {
  const content = String(text || '').trim();
  if (!content) return [];

  const maxChars = Math.max(200, options.maxChars || 1500);
  const overlap = Math.min(Math.max(0, options.overlap || 200), Math.floor(maxChars / 2));
  if (content.length <= maxChars) return [content];

  const chunks = [];
  let start = 0;
  while (start < content.length) {
    let end = Math.min(start + maxChars, content.length);
    if (end < content.length) {
      const boundary = content.lastIndexOf('\n', end);
      const sentence = content.lastIndexOf('. ', end);
      const splitAt = Math.max(boundary, sentence);
      if (splitAt > start + Math.floor(maxChars * 0.55)) end = splitAt + 1;
    }
    const chunk = content.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= content.length) break;
    start = Math.max(0, end - overlap);
  }
  return chunks;
}

function buildChunkTitle(memoryItem, index) {
  const base = memoryItem.title || memoryItem.sourcePath || memoryItem.sourceId || memoryItem.source || 'memory';
  return index > 0 ? `${base} #${index + 1}` : String(base);
}

module.exports = { chunkText, buildChunkTitle, estimateTokens };

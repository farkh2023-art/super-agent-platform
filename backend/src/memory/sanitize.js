'use strict';

const SECRET_PATTERNS = [
  /sk-ant-[A-Za-z0-9\-_]{10,}/g,
  /sk-[A-Za-z0-9]{20,}/g,
  /Bearer\s+[A-Za-z0-9\-_\.]{20,}/g,
  /API_KEY\s*=\s*[A-Za-z0-9\-_\.]{8,}/g,
];

const SENSITIVE_KEYS = [
  'anthropicApiKey', 'openaiApiKey', 'password', 'token',
  'secret', 'apiKey', 'api_key', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY',
];

function sanitizeContent(text) {
  let clean = String(text || '');
  for (const pattern of SECRET_PATTERNS) {
    clean = clean.replace(new RegExp(pattern.source, 'gi'), '[REDACTED]');
  }
  for (const key of SENSITIVE_KEYS) {
    clean = clean.replace(
      new RegExp(`"${key}"\\s*:\\s*"[^"]*"`, 'gi'),
      `"${key}": "[REDACTED]"`
    );
  }
  return clean;
}

module.exports = { sanitizeContent };

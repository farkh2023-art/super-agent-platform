'use strict';

let Anthropic;
try {
  Anthropic = require('@anthropic-ai/sdk');
} catch {
  Anthropic = null;
}

async function callClaude(systemPrompt, userMessage, options = {}) {
  if (!Anthropic) throw new Error('Package @anthropic-ai/sdk non installé');
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY non définie');

  const client = new Anthropic.default({ apiKey });
  const model = options.model || process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';

  const response = await client.messages.create({
    model,
    max_tokens: options.maxTokens || 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  return response.content[0]?.text || '';
}

module.exports = { callClaude };

'use strict';

let Anthropic;
try {
  Anthropic = require('@anthropic-ai/sdk');
} catch {
  Anthropic = null;
}

async function callClaude(systemPrompt, userMessage, options = {}) {
  if (!Anthropic) throw new Error('Package @anthropic-ai/sdk non installé. Lancez: npm install @anthropic-ai/sdk');
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY non définie dans .env');

  const client = new Anthropic.default({ apiKey });
  const model = options.model || process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';

  try {
    const response = await client.messages.create({
      model,
      max_tokens: options.maxTokens || 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });
    return response.content[0]?.text || '';
  } catch (err) {
    if (err.status === 401) throw new Error('Clé ANTHROPIC_API_KEY invalide ou expirée');
    if (err.status === 403) throw new Error('Accès refusé – vérifiez les permissions de votre clé Anthropic');
    if (err.status === 429) throw new Error('Rate limit Anthropic atteint – réessayez dans quelques secondes');
    if (err.status === 529) throw new Error('Anthropic API surchargée – réessayez plus tard');
    if (err.status === 400) throw new Error(`Claude – requête invalide: ${err.message}`);
    throw new Error(`Claude API: ${err.message}`);
  }
}

module.exports = { callClaude };

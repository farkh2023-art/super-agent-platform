'use strict';

let OpenAI;
try {
  OpenAI = require('openai');
} catch {
  OpenAI = null;
}

async function callOpenAI(systemPrompt, userMessage, options = {}) {
  if (!OpenAI) throw new Error('Package openai non installé');
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY non définie');

  const client = new OpenAI.default({ apiKey });
  const model = options.model || process.env.OPENAI_MODEL || 'gpt-4o';

  const response = await client.chat.completions.create({
    model,
    max_tokens: options.maxTokens || 4096,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
  });

  return response.choices[0]?.message?.content || '';
}

module.exports = { callOpenAI };

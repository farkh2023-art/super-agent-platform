'use strict';

let OpenAI;
try {
  OpenAI = require('openai');
} catch {
  OpenAI = null;
}

async function callOpenAI(systemPrompt, userMessage, options = {}) {
  if (!OpenAI) throw new Error('Package openai non installé. Lancez: npm install openai');
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY non définie dans .env');

  const client = new OpenAI.default({ apiKey });
  const model = options.model || process.env.OPENAI_MODEL || 'gpt-4o';

  try {
    const response = await client.chat.completions.create({
      model,
      max_tokens: options.maxTokens || 4096,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    });
    return response.choices[0]?.message?.content || '';
  } catch (err) {
    if (err.status === 401) throw new Error('Clé OPENAI_API_KEY invalide ou expirée');
    if (err.status === 403) throw new Error('Accès refusé – vérifiez les permissions de votre clé OpenAI');
    if (err.status === 429) throw new Error('Rate limit OpenAI atteint – réessayez dans quelques secondes');
    if (err.status === 400) throw new Error(`OpenAI – requête invalide: ${err.message}`);
    if (err.code === 'model_not_found') throw new Error(`Modèle OpenAI "${model}" introuvable`);
    throw new Error(`OpenAI API: ${err.message}`);
  }
}

module.exports = { callOpenAI };

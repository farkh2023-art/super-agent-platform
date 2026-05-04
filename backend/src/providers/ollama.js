'use strict';

async function callOllama(systemPrompt, userMessage, options = {}) {
  const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const model = options.model || process.env.OLLAMA_MODEL || 'llama3.2';

  const body = JSON.stringify({
    model,
    prompt: `System: ${systemPrompt}\n\nUser: ${userMessage}`,
    stream: false,
    options: { num_predict: options.maxTokens || 4096 },
  });

  const response = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.response || '';
}

module.exports = { callOllama };

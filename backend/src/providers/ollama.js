'use strict';

async function callOllama(systemPrompt, userMessage, options = {}) {
  const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const model   = options.model || process.env.OLLAMA_MODEL || 'llama3.2';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);

  try {
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        prompt: `System: ${systemPrompt}\n\nUser: ${userMessage}`,
        stream: false,
        options: { num_predict: options.maxTokens || 4096 },
      }),
    });
    clearTimeout(timer);

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      if (response.status === 404) {
        throw new Error(`Modèle "${model}" introuvable – lancez: ollama pull ${model}`);
      }
      throw new Error(`Ollama HTTP ${response.status}: ${text || response.statusText}`);
    }

    const data = await response.json();
    return data.response || '';
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new Error('Ollama timeout (>120s) – modèle trop lent ou non disponible');
    }
    if (err.message.includes('fetch failed') || err.message.includes('ECONNREFUSED')) {
      throw new Error(`Ollama inaccessible sur ${baseUrl} – lancez: ollama serve`);
    }
    throw err;
  }
}

async function diagnoseOllama() {
  const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const model   = process.env.OLLAMA_MODEL   || 'llama3.2';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) {
      return {
        reachable: false, url: baseUrl, configuredModel: model,
        error: `HTTP ${res.status} – Ollama a retourné une erreur`,
        models: [], modelAvailable: false,
        hint: 'Vérifiez les logs Ollama',
      };
    }

    const data = await res.json();
    const models = (data.models || []).map((m) => m.name);
    const modelAvailable = models.some((m) => m === model || m.startsWith(model + ':'));

    return {
      reachable: true, url: baseUrl, configuredModel: model,
      models, modelAvailable,
      pullCommand: !modelAvailable ? `ollama pull ${model}` : null,
      hint: !modelAvailable ? `Modèle "${model}" absent – lancez la commande ci-dessus` : null,
      error: null,
    };
  } catch (err) {
    clearTimeout(timer);
    const isTimeout = err.name === 'AbortError';
    return {
      reachable: false, url: baseUrl, configuredModel: model,
      error: isTimeout
        ? `Timeout (>5s) – Ollama non démarré sur ${baseUrl}`
        : `Connexion impossible: ${err.message}`,
      hint: isTimeout ? 'Lancez: ollama serve' : `Vérifiez OLLAMA_BASE_URL dans .env`,
      models: [], modelAvailable: false,
    };
  }
}

module.exports = { callOllama, diagnoseOllama };

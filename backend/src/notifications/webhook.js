'use strict';

async function sendWebhook(event, payload) {
  const url = process.env.WEBHOOK_URL;
  if (!url) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const headers = { 'Content-Type': 'application/json', 'User-Agent': 'SuperAgent-Platform/1.0' };
    if (process.env.WEBHOOK_SECRET) headers['X-Webhook-Secret'] = process.env.WEBHOOK_SECRET;

    await fetch(url, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({ event, payload, timestamp: new Date().toISOString() }),
    });
  } catch (err) {
    if (err.name !== 'AbortError') console.warn(`[webhook] ${event} failed: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { sendWebhook };

// Where the aids' thinking and the pictures come from: the commander's own OpenRouter, if
// they've connected it (straight from this browser, billed to them); otherwise the server's
// relay, when the server has a key and lends it (a local install); otherwise nowhere yet,
// and the lab asks them to connect.

import { ART_MODEL, MODEL, complete, key } from './openrouter.js';

let relay = null;
const relayOn = () => (relay ??= fetch('/api/relay').then((r) => (r.ok ? r.json() : {})).then((j) => !!j.thinking).catch(() => false));

/** 'yours', 'server', or null. */
export async function source() { return key() ? 'yours' : (await relayOn()) ? 'server' : null; }

export class NotConnected extends Error {}

const post = (path, body) => fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  .then((r) => r.json()).then((j) => { if (j.error) throw new Error(j.error); return j; });

export async function think({ messages, tools }) {
  if (key()) return complete({ model: MODEL, messages, tools, max_tokens: 4000, usage: { include: true }, provider: { order: ['anthropic'], allow_fallbacks: true } });
  if (await relayOn()) return post('/api/relay/think', { messages, tools });
  throw new NotConnected('connect OpenRouter first');
}

/** A picture, drawn and kept: returns its address. */
export async function draw(prompt) {
  if (key()) {
    const json = await complete({ model: ART_MODEL, modalities: ['image', 'text'], messages: [{ role: 'user', content: prompt }] });
    const image = json.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!image) throw new Error('no picture came back');
    return (await post('/api/art', { image })).url;   // kept with everyone's, where it's scanned
  }
  if (await relayOn()) return (await post('/api/relay/art', { prompt })).url;
  throw new NotConnected('connect OpenRouter first');
}

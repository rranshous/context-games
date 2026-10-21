// OpenRouter: how a person brings their own thinking. Connecting is OpenRouter's OAuth
// (PKCE): they approve gactant on openrouter.ai and come back with a key billed to their
// own account. The key is kept in this site's storage, in the frame's page; the sandbox,
// with its opaque origin, can't reach it. The frame calls OpenRouter straight from the
// browser (OpenRouter allows that), so the key never touches our server.
//
// Connecting happens in a popup, so the sitting in progress isn't lost: the popup lands on
// /connected.html, trades the code for a key, stores it and closes. Pages hear about it
// through the storage event.
//
// Without a key of their own, the frame falls back to the server's relay, if the server
// has a key (a local install with OPENROUTER_API_KEY in .env).

const KEY = 'gactant-openrouter-key';
const VERIFIER = 'gactant-pkce-verifier';
const AUTH = 'https://openrouter.ai/auth';
const KEYS = 'https://openrouter.ai/api/v1/auth/keys';
const COMPLETIONS = 'https://openrouter.ai/api/v1/chat/completions';

/** The request for a think: the same whoever sends it, browser or relay. */
export function buildRequest({ model, messages, tools, max_tokens }) {
  return {
    model,
    messages,
    // Room for a ludant to rewrite a whole game in one write_section.
    max_tokens: max_tokens || 32000,
    usage: { include: true },
    // Prefer one provider: each keeps its own prompt cache, and bouncing between them
    // turns every other call into a cache write.
    provider: { order: ['anthropic'], allow_fallbacks: true },
    ...(tools?.length ? { tools } : {}),
  };
}

export function key() { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } }
export function disconnect() { try { localStorage.removeItem(KEY); } catch {} }

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Open OpenRouter's approval page in a popup. Resolves once a key has arrived (or the
 *  popup closes without one). */
export async function connect() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  // S256 needs crypto.subtle, which browsers give only to secure pages (https, localhost).
  // A phone reaching lilg over plain http falls back to plain.
  let challenge = verifier, method = 'plain';
  if (crypto.subtle) {
    challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    method = 'S256';
  }
  try { localStorage.setItem(VERIFIER, JSON.stringify({ verifier, method })); } catch {}
  const callback = `${location.origin}/connected.html`;
  const url = `${AUTH}?callback_url=${encodeURIComponent(callback)}&code_challenge=${encodeURIComponent(challenge)}&code_challenge_method=${method}`;
  const popup = open(url, 'gactant-openrouter', 'width=520,height=720');
  if (!popup) { location.href = url; return new Promise(() => {}); }   // popups blocked: go there instead
  return new Promise((resolve) => {
    const done = () => { clearInterval(watch); removeEventListener('storage', heard); resolve(Boolean(key())); };
    const heard = (e) => { if (e.key === KEY && e.newValue) done(); };
    addEventListener('storage', heard);
    const watch = setInterval(() => { if (popup.closed) done(); }, 500);
  });
}

/** On /connected.html: trade the code OpenRouter sent back for a key. */
export async function finishConnect(code) {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(VERIFIER) || '{}'); } catch {}
  if (!saved.verifier) throw new Error('this browser didn\'t start a connection (or it was already finished)');
  const res = await fetch(KEYS, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, code_verifier: saved.verifier, code_challenge_method: saved.method }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.key) throw new Error(json.error?.message || json.error || `OpenRouter said ${res.status}`);
  try { localStorage.setItem(KEY, json.key); localStorage.removeItem(VERIFIER); } catch {}
  return true;
}

/** One completion, straight from this browser on the person's key. Retries what the relay
 *  retries: dropped connections and busy providers. */
export async function complete(request) {
  for (let attempt = 0; ; attempt++) {
    let res, text;
    try {
      res = await fetch(COMPLETIONS, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key()}`, 'Content-Type': 'application/json', 'X-Title': 'gactant', 'HTTP-Referer': location.origin },
        body: JSON.stringify(request),
      });
      text = await res.text();
      if ((res.status === 429 || res.status >= 500) && attempt < 3) throw new Error(`status ${res.status}`);
    } catch (err) {
      if (attempt >= 3) throw new Error(`OpenRouter unreachable: ${err.message}`);
      await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
      continue;
    }
    let json;
    try { json = JSON.parse(text); } catch { throw new Error(`OpenRouter: ${text.slice(0, 300)}`); }
    if (res.status === 401) { disconnect(); throw new Error('OpenRouter refused the key (it may have been revoked); connect again'); }
    if (res.status === 402) throw new Error('OpenRouter says the account is out of credit');
    if (!res.ok || json.error) throw new Error(`OpenRouter ${res.status}: ${JSON.stringify(json.error ?? json).slice(0, 400)}`);
    return json;
  }
}

// Mantle's API, the same wherever it runs: server.mjs (Node, files on disk) and worker.mjs
// (Cloudflare: a Durable Object's SQLite for documents, R2 for pictures). It takes a web
// Request and gives back a Response; each host brings its own store and art.
//
// Commanders: each browser gets a commander id the first time it asks, in a signed cookie.
// Designs are tied to the commander who made them (`by`) but aren't private: anyone can
// see them (multiplayer will need that), and only their maker can change or delete them.
//
// Pictures: every picture is kept in `art` and served from `artBase`. On Cloudflare that's
// R2 behind a custom domain, so it goes through Cloudflare's cache, where the CSAM Scanning
// Tool sees it. Pictures drawn by anyone's key end up there, so all of them get scanned.
//
//   store   { get(kind, id), put(kind, id, doc), list(kind), remove(kind, id) }
//   art     { put(name, bytes, type), get(name) → { body, type } | null }
//   settings { key, model, artModel, public, secret, artBase, log }

const COOKIE = 'mantle-commander';
const MAX_ART = 4 * 1024 * 1024;           // bytes in one picture
const ART_PER_DAY = 200;                   // pictures one commander may keep in a day
const DESIGNS_PER_COMMANDER = 300;

const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json', ...headers } });
const safe = (id) => String(id ?? '').replace(/[^a-z0-9-]/gi, '').slice(0, 64);
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function createCore({ store, art, settings }) {
  const { key, model, artModel, secret, artBase = '/art/' } = settings;
  const relay = Boolean(key) && !settings.public;
  const log = settings.log ?? (() => {});
  let hmac = null;

  async function sign(id) {
    hmac ??= await crypto.subtle.importKey('raw', new TextEncoder().encode(secret || 'mantle-local'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return b64url(await crypto.subtle.sign('HMAC', hmac, new TextEncoder().encode(id))).slice(0, 32);
  }

  /** Who's asking: the commander in their cookie, or a new one (with the cookie to set). */
  async function commander(request) {
    const cookie = (request.headers.get('cookie') ?? '').split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
    const [id, sig] = (cookie ?? '').split('.');
    if (id && sig && sig === await sign(id)) return { id };
    const fresh = crypto.randomUUID();
    const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
    return { id: fresh, set: `${COOKIE}=${fresh}.${await sign(fresh)}; Path=/; Max-Age=${60 * 60 * 24 * 400}; HttpOnly; SameSite=Lax${secure}` };
  }

  async function openrouter(body) {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', 'x-title': 'Mantle' },
      body: JSON.stringify(body),
    }).catch((err) => ({ ok: false, status: 599, json: async () => ({ error: { message: err.message } }) }));
    const out = await res.json().catch(() => ({ error: { message: `OpenRouter answered ${res.status}` } }));
    if (!res.ok || out.error) throw new Error(out.error?.message ?? `OpenRouter answered ${res.status}`);
    return out;
  }

  /** Keep a picture (a data URL) for a commander: checked, counted, stored, and its address. */
  async function keepArt(who, image) {
    const m = String(image).match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!m) throw Object.assign(new Error('not a picture'), { status: 400 });
    const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
    if (bytes.length > MAX_ART) throw Object.assign(new Error('picture too big'), { status: 413 });
    const day = new Date().toISOString().slice(0, 10);
    const tally = (await store.get('tally', `${who}-${day}`)) ?? { art: 0 };
    if (tally.art >= ART_PER_DAY) throw Object.assign(new Error('that\'s a lot of pictures for one day: try again tomorrow'), { status: 429 });
    await store.put('tally', `${who}-${day}`, { art: tally.art + 1 });
    const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
    const name = `${crypto.randomUUID()}.${ext}`;
    await art.put(name, bytes, `image/${m[1]}`);
    await store.put('art', name, { name, by: who, at: new Date().toISOString() });
    return { url: `${artBase}${name}` };
  }

  const routes = {
    'GET /api/me': async ({ who }) => ({ id: who }),
    'GET /api/relay': async () => ({ thinking: relay }),

    // Designs: everyone's can be seen; `?by=me` is just yours, `?by=<id>` someone's.
    'GET /api/designs': async ({ who, url }) => {
      const by = url.searchParams.get('by');
      const all = await store.list('designs');
      return all.filter((d) => !by || d.by === (by === 'me' ? who : by)).sort((a, b) => (b.kept ?? '').localeCompare(a.kept ?? ''));
    },
    'POST /api/designs': async ({ who, body }) => {
      const old = body.id && (await store.get('designs', safe(body.id)));
      // Yours: kept over the old one. Someone else's, or new: a design of your own.
      const id = old && old.by === who ? old.id : crypto.randomUUID();
      if (!old || old.by !== who) {
        const mine = (await store.list('designs')).filter((d) => d.by === who).length;
        if (mine >= DESIGNS_PER_COMMANDER) throw Object.assign(new Error('your roster of designs is full: delete some first'), { status: 429 });
      }
      const { name, description, look, gait, spec, aid, art: pic } = body;
      if (!name || !spec || !aid) throw Object.assign(new Error('a design needs a name, a spec and an aid'), { status: 400 });
      const design = { id, by: who, name: String(name).slice(0, 80), description: String(description ?? '').slice(0, 600), look: String(look ?? '').slice(0, 1200), gait, spec, aid, art: typeof pic === 'string' ? pic.slice(0, 300) : null, kept: new Date().toISOString() };
      await store.put('designs', id, design);
      return design;
    },
    'DELETE /api/designs': async ({ who, body }) => {
      const d = await store.get('designs', safe(body.id));
      if (!d) return { ok: true };
      if (d.by !== who) throw Object.assign(new Error('only its maker can delete a design'), { status: 403 });
      await store.remove('designs', d.id);
      return { ok: true };
    },

    // A picture drawn on the commander's own key, kept with everyone's (and scanned).
    'POST /api/art': async ({ who, body }) => keepArt(who, body.image),

    // The relay: this server's key, lent to commanders who haven't connected their own
    // (a local install only; never when public).
    'POST /api/relay/think': async ({ who, body }) => {
      if (!relay) throw Object.assign(new Error('this server lends no thinking: connect your own OpenRouter'), { status: 403 });
      const out = await openrouter({ model, messages: body.messages, tools: body.tools, max_tokens: 4000 });
      log({ kind: 'think', who, model, usage: out.usage, last: body.messages?.findLast?.((m) => m.role !== 'system'), reply: out.choices?.[0]?.message });
      return out;
    },
    'POST /api/relay/art': async ({ who, body }) => {
      if (!relay) throw Object.assign(new Error('this server lends no thinking: connect your own OpenRouter'), { status: 403 });
      const t = Date.now();
      const out = await openrouter({ model: artModel, modalities: ['image', 'text'], messages: [{ role: 'user', content: body.prompt }] });
      const image = out.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      if (!image) throw new Error('no picture came back');
      const kept = await keepArt(who, image);
      log({ kind: 'art', who, model: artModel, prompt: body.prompt, seconds: (Date.now() - t) / 1000, cost: out.usage?.cost, art: kept.url });
      return kept;
    },
  };

  return {
    /** Answer an /api/* or /art/* request, or null if it's not ours. */
    async handle(request) {
      const url = new URL(request.url);
      if (request.method === 'GET' && url.pathname.startsWith('/art/')) {
        const pic = await art.get(safe(url.pathname.slice(5).replace(/\.(png|jpg|webp)$/, '')) + (url.pathname.match(/\.(png|jpg|webp)$/)?.[0] ?? ''));
        return pic ? new Response(pic.body, { headers: { 'content-type': pic.type, 'cache-control': 'public, max-age=31536000, immutable', 'access-control-allow-origin': '*' } }) : new Response('not here', { status: 404 });
      }
      const route = routes[`${request.method} ${url.pathname}`];
      if (!route) return null;
      // Only this site's own pages may call the API.
      const origin = request.headers.get('origin');
      if (request.method !== 'GET' && origin && origin !== url.origin) return json({ error: 'not from here' }, 403);
      const who = await commander(request);
      const headers = who.set ? { 'set-cookie': who.set } : {};
      try {
        const body = request.method === 'GET' ? {} : await request.json().catch(() => ({}));
        return json(await route({ who: who.id, body, url }), 200, headers);
      } catch (err) {
        return json({ error: err.message }, err.status ?? 500, headers);
      }
    },
  };
}

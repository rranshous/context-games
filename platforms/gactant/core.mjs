// gactant's core: everything the API does, whatever keeps the data. Two hosts run it:
//   server.mjs   Node, files on disk, no dependencies (local use)
//   worker.mjs   Cloudflare: a Worker, with one Durable Object holding the data (hosted)
// Each hands the core a store and its settings.
//
//   const core = createCore({ store, settings })
//   await core.route(method, ['ludants', id], body, searchParams)   -> JSON-able, or throws { code }
//
// A store keeps JSON documents by kind and id, and is async whether or not it needs to be:
//   get(kind, id) -> doc | null     put(kind, id, doc)     list(kind) -> [doc]
// Kinds: ludants, published, checkpoints (one soma per doc, `${ludant}-${n}`), names (given
// names in use, so a new seed's is fresh), thumbs (a small picture of a ludant's or a
// publication's stage, `l-<id>` or `p-<id>`, kept apart so lists stay light).
//
// settings: { model, key (OpenRouter, or ''), public (bool), sandbox (origin of the sandbox
//             page, or '' for this one), log(who, record), tail(who, n) }
//   adminToken: lets tools/push.mjs bring publications here from another install.
//   public: the install is open to anyone. Then nobody can list every ludant (a ludant is
//   reached by its link, or published), and inference isn't logged.
//
// Words
//   ludant      a game-shaped actant: a soma (its sections) plus the state of the surfaces
//               it lives with. Played and shaped by whoever sits with it; there are no modes.
//               Its name is a given name plus its game's title: Georina-Monopoly-Clone.
//               Each published name belongs to exactly one snapshot.
//   checkpoint  a frozen copy of a ludant's soma, numbered. One is taken automatically
//               whenever someone sits down, so anything changed while they're there can be undone.
//   publication a checkpoint offered to anyone. Taking a copy makes a new ludant whose
//               lineage points back; that copy can be published again.
//
// API (JSON, under /api)
//   GET  config                                  -> { model, hasKey, logs, public, sandbox }
//   GET  ludants?ids=a,b                         -> [{ id, name, updated, checkpoints, lineage, people, cost }]
//                                                   (without ids: every ludant, unless the install is public)
//   POST ludants        { by }                   -> { id }          seed a new one, with a fresh given name
//   GET  ludants/<id>                            -> { id, soma, surfaces, lineage, visitors, checkpoints, restored, fresh, familyNames }
//   PUT  ludants/<id>   { soma, surfaces, token } -> {}            409 unless this window holds it
//   POST ludants/<id>/hold { token, who, takeOver? } -> { held, tookFrom }   409 { heldBy, since } if another window does
//   POST ludants/<id>/heartbeat { token, seconds, spent } -> { held } 409 once another window took it
//   POST ludants/<id>/release { token }          -> {}
//   POST ludants/<id>/arrive { who }             -> { firstVisit, visits, checkpoint, people }
//   GET  ludants/<id>/checkpoints                -> [{ n, label, by, at }]
//   POST ludants/<id>/checkpoints { label, by }  -> { n }           no-op if nothing changed
//   POST ludants/<id>/restore { n, by }          -> { restored }     checkpoints the present first
//   GET  published                               -> [{ id, name, given, title, by, note, ludant, n, from, fromName, at, copies, cost }]
//   POST published      { ludant, by, note? }    -> { id, name }    publishes it as it is now, under its name;
//                                                   409 if this snapshot or this name is already published
//   GET  published/<id>                          -> metadata
//   POST published/<id>/copy { by }              -> { id }          a new ludant, descended from it
//   POST ludants/<id>/thumb { token, image }     -> {}             a picture of its stage now (a small JPEG data URL)
//   GET  thumbs/<l|p>/<id>                       -> { image }       (null if there's none yet)
//   POST admin/import { token, published: [...] } -> { imported }  publications brought from another install
//                                                   (tools/push.mjs); needs settings.adminToken
//   POST infer          { who, messages, tools? } -> OpenRouter chat completion, on the install's key
//                                                   (people with their own OpenRouter key call it from the browser)
//   POST log/<who>      { record }               -> {}             a think the browser made itself
//   GET  log/<who>?n=20                          -> last n inference records

import { nameOf, randomGiven, titleSlug } from './public/js/names.js';
import { buildRequest } from './public/js/openrouter.js';
import { seedSoma } from './public/js/seed.js';

const OPENROUTER = 'https://openrouter.ai/api/v1/chat/completions';
const HOLD_STALE_MS = 20000;
const MAX_LUDANT = 1_500_000;    // characters of JSON in a save: soma and surfaces together
const FLUSH_PLAY_MS = 60000;     // how often what play costs is written down
const MAX_THUMB = 60_000;        // characters of data URL

export function httpError(code, message, extra) { return Object.assign(new Error(message), { code, extra }); }

const now = () => new Date().toISOString();
const slug = (s) => String(s || 'actant').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'actant';
const hex = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('');
const newId = (name) => `${slug(name)}-${hex(3)}`;
export const safe = (id) => { if (!/^[a-z0-9-]+$/.test(String(id))) throw httpError(400, 'bad id'); return id; };
const sameSoma = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** Same body, ignoring title and memory: a new name or remembering being published
 *  doesn't make a different ludant. Something else has to change. */
const sameBody = (a, b) => {
  const strip = (x) => ({ ...x, sections: { ...x?.sections, memory: undefined, title: undefined } });
  return sameSoma(strip(a), strip(b));
};

/** Keep logs readable: drop image bytes. */
export function summarize(message) {
  if (!message) return null;
  if (!Array.isArray(message.content)) return message;
  return { ...message, content: message.content.map((p) => (p.type === 'image_url' ? { type: 'image_url', bytes: p.image_url?.url?.length } : p)) };
}

export function createCore({ store, settings }) {
  const { model, key, log = () => {}, tail = () => [] } = settings;
  const isPublic = Boolean(settings.public);

  const read = async (kind, id) => {
    const doc = await store.get(kind, safe(id));
    if (!doc) throw httpError(404, `no ${kind.replace(/s$/, '')} ${id}`);
    return doc;
  };

  // ---------- checkpoints: somas kept apart from the ludant, which holds the list ----------

  /** Take a checkpoint, unless the soma is exactly what the last one holds. */
  async function checkpoint(ludant, label, by) {
    const last = ludant.checkpoints.at(-1);
    if (last) {
      const kept = await store.get('checkpoints', `${ludant.id}-${last.n}`);
      if (kept && sameSoma(kept.soma, ludant.soma)) return last.n;
    }
    const n = (last?.n ?? 0) + 1;
    await store.put('checkpoints', `${ludant.id}-${n}`, { soma: structuredClone(ludant.soma) });
    ludant.checkpoints.push({ n, label: label || '', by: by || null, at: now() });
    return n;
  }
  const checkpointSoma = async (ludant, n) => (await store.get('checkpoints', `${ludant.id}-${n}`))?.soma;

  /** A given name no lineage here uses yet. */
  async function freshGiven() {
    for (let i = 0; i < 1000; i++) {
      const g = randomGiven();
      if (!(await store.get('names', g.toLowerCase()))) { await store.put('names', g.toLowerCase(), { given: g, at: now() }); return g; }
    }
    throw httpError(500, 'ran out of names');
  }

  // ---------- holds: one window at a time ----------
  //
  // Each frame saves the whole soma, so two windows on one ludant would overwrite each
  // other. A window must hold the ludant to save it. A second window can take the hold;
  // the first finds out on its next heartbeat or save and stops. Holds live in memory: a
  // restart forgets them, and the next heartbeat simply takes the hold again.

  /** @type {Map<string, { token: string, who: string, since: string, seen: number }>} */
  const holds = new Map();

  function holdState(id) {
    const h = holds.get(id);
    return h && Date.now() - h.seen < HOLD_STALE_MS ? h : null;
  }

  function requireHold(id, token) {
    const h = holdState(id);
    if (h && h.token === token) { h.seen = Date.now(); return; }
    if (!h && token) { holds.set(id, { token, who: '?', since: now(), seen: Date.now() }); return; }
    throw httpError(409, `${h?.who ?? 'another window'} is holding this ludant`, { heldBy: h?.who ?? null, since: h?.since ?? null });
  }

  // ---------- what play costs ----------
  //
  // Heartbeats carry how long a sitting was watched and what its thinking cost since the
  // last one. They add up in memory and are written down once a minute: on the ludant and,
  // while it's still exactly a published snapshot, on that publication, so anyone about to
  // play it can see its cost per hour of play.

  const add = (stats, seconds, spent) => ({ seconds: (stats?.seconds ?? 0) + seconds, spent: (stats?.spent ?? 0) + spent, sittings: stats?.sittings ?? 0 });
  const unwritten = new Map();   // ludant id -> { seconds, spent, since }

  async function played(id, seconds, spent) {
    if (!(seconds > 0 || spent > 0)) return;
    const u = unwritten.get(id) ?? { seconds: 0, spent: 0, since: Date.now() };
    u.seconds += Math.min(seconds, 60); u.spent += Math.min(Math.max(spent, 0), 5);   // one heartbeat's worth, at most
    unwritten.set(id, u);
    if (Date.now() - u.since >= FLUSH_PLAY_MS) await writePlay(id);
  }

  async function writePlay(id) {
    const u = unwritten.get(id);
    if (!u) return;
    unwritten.delete(id);
    const ludant = await store.get('ludants', id);
    if (!ludant) return;
    ludant.stats = add(ludant.stats, u.seconds, u.spent);
    await store.put('ludants', id, ludant);
    const pub = (await store.list('published')).find((p) => sameBody(p.soma, ludant.soma));
    if (pub) { pub.stats = add(pub.stats, u.seconds, u.spent); await store.put('published', pub.id, pub); }
  }

  const perHour = (stats) => (stats?.seconds > 600 ? { rate: stats.spent / (stats.seconds / 3600), hours: stats.seconds / 3600 } : null);

  const summary = (x) => ({
    id: x.id, name: nameOf(x.soma), given: x.soma?.given, updated: x.updated, checkpoints: x.checkpoints?.length ?? 0,
    lineage: x.lineage ?? {}, people: Object.keys(x.visitors ?? {}), cost: perHour(x.stats),
  });

  // ---------- inference on the install's key ----------

  async function infer(body) {
    if (!key) throw httpError(503, 'this install has no OpenRouter key: connect your own OpenRouter account');
    const who = body.who ? safe(body.who) : 'anon';
    const request = buildRequest({ ...body, model });
    const started = Date.now();
    // A dropped connection or a busy provider shouldn't end someone's sitting: retry those.
    let res, text;
    for (let attempt = 0; ; attempt++) {
      try {
        res = await fetch(OPENROUTER, {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'gactant' },
          body: JSON.stringify(request),
        });
        text = await res.text();
        if ((res.status === 429 || res.status >= 500) && attempt < 3) throw new Error(`status ${res.status}`);
        break;
      } catch (err) {
        if (attempt >= 3) throw httpError(502, `openrouter unreachable: ${err.message}`);
        console.warn(`[gactant] infer attempt ${attempt + 1} failed (${err.message}); retrying`);
        await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
      }
    }
    let json;
    try { json = JSON.parse(text); } catch { throw httpError(502, `openrouter: ${text.slice(0, 300)}`); }
    if (!isPublic) {
      await log(who, {
        at: now(), ms: Date.now() - started, model: request.model, status: res.status, usage: json.usage, error: json.error,
        // The last message is what woke this turn (an event, or tool results); the reply is what came back.
        last: summarize(request.messages.at(-1)), reply: json.choices?.[0]?.message,
      });
    }
    if (!res.ok || json.error) throw httpError(502, `openrouter ${res.status}: ${JSON.stringify(json.error ?? json).slice(0, 500)}`);
    return json;
  }

  // ---------- routes ----------

  async function route(method, parts, body, query) {
    const [a, b, c] = parts;
    if (a === 'config') return { model, hasKey: Boolean(key), logs: !isPublic, public: isPublic, sandbox: settings.sandbox || '' };
    if (a === 'infer' && method === 'POST') return infer(body);
    if (a === 'log' && b && method === 'POST') { if (!isPublic) await log(safe(b), { ...body, last: summarize(body.last) }); return {}; }
    if (a === 'log' && b) return isPublic ? [] : tail(safe(b), Number(query.get('n')) || 20);
    if (a === 'admin' && b === 'import' && method === 'POST') {
      if (!settings.adminToken || body.token !== settings.adminToken) throw httpError(403, 'not allowed');
      let imported = 0;
      for (const p of body.published ?? []) {
        if (!p?.id || !p.soma?.given || !p.name) continue;
        safe(p.id);
        if (await store.get('published', p.id)) continue;
        await store.put('published', p.id, { ...p, copies: 0, stats: undefined });
        await store.put('names', p.soma.given.toLowerCase(), { given: p.soma.given, at: now() });
        imported++;
      }
      return { imported };
    }
    if (a === 'thumbs' && (b === 'l' || b === 'p') && c) return { image: (await store.get('thumbs', `${b}-${safe(c)}`))?.image ?? null };

    if (a === 'ludants') {
      if (!b && method === 'GET') {
        // A public install lists only the ludants asked for by id (the ones this browser
        // has sat with): an unpublished ludant is reached by its link.
        const ids = (query.get('ids') || '').split(',').filter(Boolean).slice(0, 100);
        let found;
        if (ids.length) found = (await Promise.all(ids.map((id) => store.get('ludants', safe(id))))).filter(Boolean);
        else found = isPublic ? [] : await store.list('ludants');
        return found.map(summary).sort((x, y) => (y.updated || '').localeCompare(x.updated || ''));
      }
      if (!b && method === 'POST') {
        const given = await freshGiven();
        const id = newId(given);
        const ludant = { id, soma: seedSoma(given, body.by), surfaces: {}, checkpoints: [], visitors: {}, lineage: { seededBy: body.by || null }, fresh: true, created: now(), updated: now() };
        await checkpoint(ludant, 'as seeded', body.by);
        await store.put('ludants', id, ludant);
        return { id };
      }
      const ludant = await read('ludants', b);
      if (!c && method === 'GET') {
        // The names its family has already published under, so it knows which are taken.
        const familyNames = (await store.list('published')).filter((p) => p.given === ludant.soma?.given).map((p) => p.name);
        const { stats, ...rest } = ludant;
        return { ...rest, familyNames };
      }
      if (!c && method === 'PUT') {
        requireHold(b, body.token);
        const size = JSON.stringify(body.soma).length + JSON.stringify(body.surfaces).length;
        if (size > MAX_LUDANT) throw httpError(413, `too big to keep: ${size} characters of soma and surfaces (the limit is ${MAX_LUDANT})`);
        await store.put('ludants', b, { ...ludant, soma: body.soma, surfaces: body.surfaces, fresh: false, updated: now() });
        return {};
      }
      if (c === 'hold' && method === 'POST') {
        const h = holdState(b);
        if (h && h.token !== body.token && !body.takeOver) throw httpError(409, `${h.who} is holding this ludant in another window`, { heldBy: h.who, since: h.since });
        holds.set(b, { token: body.token, who: String(body.who || 'someone').slice(0, 40), since: h?.token === body.token ? h.since : now(), seen: Date.now() });
        return { held: true, tookFrom: h && h.token !== body.token ? h.who : null };
      }
      if (c === 'heartbeat' && method === 'POST') {
        requireHold(b, body.token);
        await played(b, Number(body.seconds) || 0, Number(body.spent) || 0);
        return { held: true };
      }
      if (c === 'thumb' && method === 'POST') {
        requireHold(b, body.token);
        const image = String(body.image ?? '');
        if (!image.startsWith('data:image/') || image.length > MAX_THUMB) throw httpError(400, 'a thumb is a small image data URL');
        await store.put('thumbs', `l-${b}`, { image, at: now() });
        // A publication without a picture takes its first player's, while their copy is
        // still exactly what was published.
        const from = ludant.lineage?.from?.published;
        if (from && !(await store.get('thumbs', `p-${from}`))) {
          const pub = await store.get('published', from);
          if (pub && sameBody(pub.soma, ludant.soma)) await store.put('thumbs', `p-${from}`, { image, at: now() });
        }
        return {};
      }
      if (c === 'release' && method === 'POST') {
        if (holds.get(b)?.token === body.token) holds.delete(b);
        await writePlay(b);
        return {};
      }
      // Someone sits down. Remember them, and keep the ludant as it was right now, so
      // whatever changes while they're here can be undone.
      if (c === 'arrive' && method === 'POST') {
        const who = String(body.who || 'someone').slice(0, 40);
        const seen = ludant.visitors[who];
        ludant.visitors[who] = { first: seen?.first ?? now(), last: now(), visits: (seen?.visits ?? 0) + 1 };
        ludant.stats = { ...add(ludant.stats, 0, 0), sittings: (ludant.stats?.sittings ?? 0) + 1 };
        const n = await checkpoint(ludant, `as it was when ${who} sat down`, who);
        await store.put('ludants', b, ludant);
        return { firstVisit: !seen, visits: ludant.visitors[who].visits, checkpoint: n, people: Object.keys(ludant.visitors) };
      }
      if (c === 'checkpoints' && method === 'GET') return ludant.checkpoints;
      if (c === 'checkpoints' && method === 'POST') {
        const n = await checkpoint(ludant, body.label, body.by);
        await store.put('ludants', b, ludant);
        return { n };
      }
      if (c === 'restore' && method === 'POST') {
        const cp = ludant.checkpoints.find((x) => x.n === Number(body.n));
        const soma = cp && await checkpointSoma(ludant, cp.n);
        if (!soma) throw httpError(404, `no checkpoint ${body.n}`);
        await checkpoint(ludant, `how it was just before ${body.by || 'someone'} went back to #${cp.n}`, body.by);
        // The body goes back; the memory stays. Being put back is something that happened to
        // it, and a ludant that forgot every restore would be forever surprised.
        const memory = ludant.soma.sections?.memory;
        ludant.soma = structuredClone(soma);
        if (memory != null) ludant.soma.sections.memory = memory;
        ludant.restored = { n: cp.n, label: cp.label, by: body.by || null, at: now() };
        ludant.updated = now();
        await store.put('ludants', b, ludant);
        return { restored: cp.n };
      }
    }

    // Publishing: anyone sitting with a ludant can publish it. Anyone can take a copy of a
    // publication, and that copy can be published again.
    if (a === 'published') {
      if (!b && method === 'GET') {
        return (await store.list('published')).map(({ soma, stats, ...p }) => ({ ...p, copies: p.copies ?? 0, cost: perHour(stats) }))
          .sort((x, y) => y.at.localeCompare(x.at));
      }
      if (!b && method === 'POST') {
        // A published name belongs to exactly one snapshot. So a snapshot can't be published
        // twice, and publishing again takes both a change and a new title.
        const ludant = await read('ludants', body.ludant);
        const name = nameOf(ludant.soma);
        if (!titleSlug(ludant.soma.sections?.title)) throw httpError(400, `${name} needs a title before it can be published: its name is its given name and its game's title together`);
        const pubs = await store.list('published');
        const same = pubs.find((p) => sameBody(p.soma, ludant.soma));
        if (same) throw httpError(409, `this exact ${same.given} is already published as ${same.name}. Change something first, then give it a new title`);
        const clash = pubs.find((p) => p.name.toLowerCase() === name.toLowerCase());
        if (clash) throw httpError(409, `${name} already names another snapshot. It has changed since, so it needs a new title`);
        const n = await checkpoint(ludant, `published as ${name}`, body.by);
        await store.put('ludants', ludant.id, ludant);
        const id = newId(name);
        await store.put('published', id, {
          id, name, given: ludant.soma.given, title: ludant.soma.sections.title.trim(), by: body.by || null, note: body.note || '',
          ludant: ludant.id, n, from: ludant.lineage?.from?.published ?? null, fromName: ludant.lineage?.from?.name ?? null, at: now(),
          copies: 0, soma: structuredClone(ludant.soma),
        });
        // Its picture is the ludant's latest, so the lobby can show what it looks like.
        const thumb = await store.get('thumbs', `l-${ludant.id}`);
        if (thumb) await store.put('thumbs', `p-${id}`, thumb);
        return { id, name };
      }
      const pub = await read('published', b);
      if (!c && method === 'GET') { const { soma, stats, ...meta } = pub; return { ...meta, cost: perHour(stats) }; }
      if (c === 'copy' && method === 'POST') {
        const id = newId(pub.given);
        // The soma comes whole; the surfaces start fresh. What was said and sketched belonged
        // to the people who were there.
        const ludant = {
          id, soma: structuredClone(pub.soma), surfaces: {}, checkpoints: [], visitors: {}, fresh: true, created: now(), updated: now(),
          lineage: { from: { published: pub.id, name: pub.name, by: pub.by, ludant: pub.ludant }, takenBy: body.by || null },
        };
        await checkpoint(ludant, `as received: ${pub.name}`, body.by);
        await store.put('ludants', id, ludant);
        pub.copies = (pub.copies ?? 0) + 1;
        await store.put('published', pub.id, pub);
        return { id };
      }
    }

    throw httpError(404, `no route ${method} /api/${parts.join('/')}`);
  }

  return { route };
}

// ---------- shared by both hosts ----------

/** The API answers only the platform's own pages. A request from a sandbox (Origin: null)
 *  or another site is refused, so the relay can't be spent from anywhere else. */
export function sameOrigin(origin, host) {
  if (!origin) return true;   // same-origin GETs don't say
  try { return new URL(origin).host === host; } catch { return false; }
}

// The sandbox page: its iframe has an opaque origin, and this policy takes away the
// network (no fetch, no sockets, no images from elsewhere), so the ludant's code can't
// reach the relay, OpenRouter, or anywhere to send what it sees. It may load the
// platform's own scripts ('self' is the page's own URL, even with an opaque origin), and
// must be allowed eval: its code sections are compiled.
export const SANDBOX_POLICY = [
  "default-src 'none'",
  "script-src 'self' 'unsafe-eval'",
  'img-src data: blob:',
  "style-src 'unsafe-inline'",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join('; ');

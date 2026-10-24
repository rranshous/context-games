// gactant's core: everything the API does, whatever keeps the data. Two hosts run it:
//   server.mjs   Node, files on disk, no dependencies (local use)
//   worker.mjs   Cloudflare: a Worker, with one Durable Object holding the data (hosted)
// Each hands the core a store and its settings.
//
//   const core = createCore({ store, settings })
//   await core.route(method, ['ludants', id], body, searchParams, { ip })   -> JSON-able, or throws { code }
//   await core.checkSome(n)   publish checks for publications that haven't had one (hourly, hosted)
//
// A store keeps JSON documents by kind and id, and is async whether or not it needs to be:
//   get(kind, id) -> doc | null     put(kind, id, doc)     list(kind) -> [doc]     remove(kind, id)
// Kinds: assets (its art: `l-<ludant>-<name>` / `p-<publication>-<name>`), ludants, published, checkpoints (one soma per doc, `${ludant}-${n}`), names (given
// names in use, so a new seed's is fresh), thumbs (a small picture of a ludant's or a
// publication's stage, `l-<id>` or `p-<id>`, kept apart so lists stay light).
//
// settings: { model, key (OpenRouter, or ''), public (bool), sandbox (origin of the sandbox
//             page, or '' for this one), log(who, record), tail(who, n), opsLog(record) }
//   opsLog: where trouble is also written as it happens (the Worker: Cloudflare's logs).
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
//   GET  config                                  -> { version, model, hasKey, logs, public, sandbox }   version: what's running (hosted)
//   GET  ludants?mine=1                          -> [{ id, name, updated, checkpoints, lineage, people, spent }]   mine: and
//                                                   every one the person asking owns
//                                                   (without ids: every ludant, unless the install is public)
//   POST ludants        { by }                   -> { id }          seed a new one, with a fresh given name, owned by the
//                                                   person asking
//   POST ludants/<id>/copy { by }                -> { id }          your own copy of someone else's ludant, as it is now
//   GET  ludants/<id>                            -> { id, soma, surfaces, lineage, visitors, checkpoints, restored, fresh, familyNames, yours }
//                                                   surfaces (chat, whiteboard, store) and visitors only for its owner
//   PUT  ludants/<id>   { soma, surfaces, token } -> {}            409 unless this window holds it
//   POST ludants/<id>/hold { token, who, takeOver? } -> { held, tookFrom }   409 { heldBy, since } if another of the owner's
//                                                   windows does; 403 { notYours } if the person asking doesn't own it
//   Every other change (PUT, heartbeat, arrive, checkpoints, restore, abandon, assets, thumb,
//   publishing) needs the owner, and { token } of the window holding it.
//   Who's asking comes from the X-Gactant-Pass header (people.mjs): POST people/challenge,
//   people (a new person), people/pass, people/join, people/pair, people/name, people/remove,
//   people/recovery; GET people/me.
//   POST ludants/<id>/heartbeat { token, seconds, spent } -> { held } 409 once another window took it
//   POST ludants/<id>/release { token }          -> {}
//   POST ludants/<id>/arrive { who }             -> { firstVisit, visits, checkpoint, people }
//   GET  ludants/<id>/checkpoints                -> [{ n, label, by, at }]
//   POST ludants/<id>/checkpoints { label, by }  -> { n }           no-op if nothing changed
//   POST ludants/<id>/restore { n, by }          -> { restored }     checkpoints the present first
//   POST ludants/<id>/abandon { token, by }      -> { abandoned }    let it go: it, its checkpoints, art and
//                                                   chat are no longer kept; what it was published as stays.
//                                                   Its link then answers 410 { abandoned: { by, at, name } }
//   GET  published                               -> [{ id, name, given, title, by, note, ludant, n, from, fromName, at, copies, cost }]   cost: per hour of play, from copies
//   POST published      { ludant, by, note? }    -> { id, name, held? }   publishes it as it is now, under its name
//                                                   (held: the publish check hid it until someone looks);
//                                                   409 if this snapshot or this name is already published
//   GET  published/<id>                          -> metadata
//   POST published/<id>/copy { by }              -> { id }          a new ludant, descended from it
//   POST ludants/<id>/thumb { token, image }     -> {}             a picture of its stage now (a small JPEG data URL)
//   GET  ludants/<id>/assets                     -> [{ name, w, h, prompt, by, at, image }]   its art
//   POST ludants/<id>/assets { token, name, image, w, h, prompt, by } -> meta   keep a picture (replaces one of that name)
//   POST ludants/<id>/unasset { token, name }    -> { removed }
//   (publishing copies a ludant's art to the publication; taking a copy copies it on)
//   GET  thumbs/<l|p>/<id>                       -> { image }       (null if there's none yet)
//   POST reports        { id?, report }          -> { id }          what a device's check page found (/check.html);
//                                                   with an id, updates that report as the check goes on
//   POST admin/reports { token, n? }             -> newest reports (needs settings.adminToken; tools/reports.mjs)
//   POST events { browser, mobile, events: [...] } -> {}           what a page noticed: trouble and how the stage runs (ops.mjs)
//   POST flags { ludant?, published?, reason, note, by, image? } -> { id }   someone reports content (frame.js);
//                                                   a publication flagged by enough people is hidden until looked at
//   POST admin/flags { token, all? }             -> open reports (or the latest 200)        tools/moderate.mjs
//   POST admin/moderate { token, action: hide|restore|approve|remove|dismiss, published?, ludant?, flag?, note? } -> { done }
//   POST admin/owners { token }                  -> [{ id, name, owned, owner, ownedAt, by, from, updated, people }]
//   POST admin/own { token, ludant, person }     -> { id, owner }   gives a ludant no person owns to a person (tools/own.mjs)
//   POST admin/people { token }                  -> [{ id, name, created, devices }]
//   POST admin/ops { token, days? }              -> { traffic, trouble, held }   what's going on (tools/ops.mjs)
//   POST admin/import { token, published: [...] } -> { imported }  publications brought from another install
//                                                   (tools/push.mjs); needs settings.adminToken
//   POST infer          { who, messages, tools? } -> OpenRouter chat completion, on the install's key
//                                                   (people with their own OpenRouter key call it from the browser)
//   POST log/<who>      { record }               -> {}             a think the browser made itself
//   GET  log/<who>?n=20                          -> last n inference records

import { nameOf, randomGiven, titleSlug } from './public/js/names.js';
import { ART_MODELS, buildRequest } from './public/js/openrouter.js';
import { seedSoma } from './public/js/seed.js';
import { publicText } from './check.mjs';
import { createOps } from './ops.mjs';
import { createPeople } from './people.mjs';

const OPENROUTER = 'https://openrouter.ai/api/v1/chat/completions';
const HOLD_STALE_MS = 20000;
const MAX_LUDANT = 1_500_000;    // characters of JSON in a save: soma and surfaces together
const FLUSH_PLAY_MS = 60000;     // how often what play costs is written down
const MAX_THUMB = 60_000;        // characters of data URL
const MAX_REPORT = 60_000;       // characters of JSON in a check report
const MAX_FLAGS_A_DAY = 300;     // reports of content the install takes in a day
const MAX_CHECKS_A_DAY = 200;    // publish checks a day (settings.check; each costs a little)
const PUBLISH_A_DAY = 10;        // publications one address may make in a day
const SEED_A_DAY = 20;           // new ludants one address may seed in a day
const COPY_A_DAY = 40;           // copies one address may take in a day
const ART_BUDGET = 20_000_000;   // characters of pictures one ludant keeps, all told
const CHECKPOINTS_KEPT = 50;     // a ludant's newest checkpoints kept (and its first)
// Ludants nobody came back to: still exactly as they began (one checkpoint), with no save
// and nobody sitting down this long, they're cleared away. A seed is a pulsing dot; a copy can be taken again.
const UNTOUCHED_SEED_MS = 7 * 86400_000;
const UNTOUCHED_COPY_MS = 30 * 86400_000;
const TRUSTED_AFTER_MS = 24 * 3600_000;   // a checked publication with no reports earns the front page after this
const MAX_ASSET = 1_500_000;     // characters of data URL in one picture
const MAX_ASSETS = 60;           // pictures per ludant
const assetName = (n) => { if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(String(n))) throw httpError(400, `art names are lowercase words joined by -, up to 40 characters: ${n}`); return n; };

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
  const pic = (p) => (p.type === 'image_url' ? { type: 'image_url', bytes: p.image_url?.url?.length } : p);
  const out = { ...message };
  if (Array.isArray(message.content)) out.content = message.content.map(pic);
  if (Array.isArray(message.images)) out.images = message.images.map(pic);
  return out;
}

export function createCore({ store, settings }) {
  const { model, key, log = () => {}, tail = () => [] } = settings;
  const isPublic = Boolean(settings.public);
  const ops = createOps({ store, log: settings.opsLog });
  const people = createPeople({ store, settings, httpError, limit: (...a) => limit(...a) });

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
    // The newest are kept, and the first (how it began).
    while (ludant.checkpoints.length > CHECKPOINTS_KEPT + 1) {
      const [old] = ludant.checkpoints.splice(1, 1);
      await store.remove('checkpoints', `${ludant.id}-${old.n}`);
    }
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

  // ---------- whose it is ----------
  //
  // A ludant belongs to the person who seeded or copied it (people.mjs: a person is their
  // devices' keys, and a request says who it's from with a pass). Changing a ludant takes
  // the window's hold, and taking the hold takes being its owner. Anyone else with the
  // link can look at its game, or take a copy.

  const owns = (ludant, from) => Boolean(from?.person) && ludant.owner === from.person;
  const ownedBy = (ludant, from) => {
    if (!from?.person) throw httpError(401, 'sign in first (your pass may have expired)');
    ludant.owner = from.person; ludant.ownedAt = now();
  };
  const notYours = (ludant) => (ludant.owner
    ? httpError(403, `${nameOf(ludant.soma)} belongs to someone else`, { notYours: true })
    : httpError(403, `${nameOf(ludant.soma)} hasn't been claimed by its owner yet`, { notYours: true, unclaimed: true }));

  /** The window must hold the ludant, and be its owner's. A hold that has lapsed (or was
   *  forgotten, when the server restarted) comes back to the owner's window. */
  async function requireHold(ludant, body, from) {
    const id = ludant.id, token = body.token, h = holdState(id);
    if (!owns(ludant, from)) throw notYours(ludant);   // first: a window's token alone proves nothing
    if (h && h.token === token) { h.seen = Date.now(); return; }
    if (!h && token) { holds.set(id, { token, who: '?', since: now(), seen: Date.now() }); return; }
    throw httpError(409, `${h?.who ?? 'another window'} is holding this ludant`, { heldBy: h?.who ?? null, since: h?.since ?? null });
  }

  // ---------- what play costs ----------
  //
  // Heartbeats carry how long a sitting was watched and what its thinking cost since the
  // last one. They add up in memory and are written down once a minute: on the ludant
  // (all its sittings, shaping included), and on a publication only from **play**: copies
  // taken of it, while they're still exactly what was published. Its maker's own sittings
  // don't count there, being mostly shaping. So a publication's cost per hour starts unknown
  // and means what it says: what playing it has cost.

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
    if (!ludant || ludant.abandoned) return;
    ludant.stats = add(ludant.stats, u.seconds, u.spent);
    await store.put('ludants', id, ludant);
    const from = ludant.lineage?.from?.published;
    const pub = from && await store.get('published', from);
    if (pub && sameBody(pub.soma, ludant.soma)) { pub.play = add(pub.play, u.seconds, u.spent); await store.put('published', pub.id, pub); }
  }

  const perHour = (stats) => (stats?.seconds > 600 ? { rate: stats.spent / (stats.seconds / 3600), hours: stats.seconds / 3600 } : null);

  const summary = (x) => ({
    id: x.id, name: nameOf(x.soma), given: x.soma?.given, updated: x.updated, checkpoints: x.checkpoints?.length ?? 0,
    lineage: x.lineage ?? {}, people: Object.keys(x.visitors ?? {}), spent: +(x.stats?.spent ?? 0).toFixed(4),
  });

  // ---------- inference on the install's key ----------

  async function infer(body) {
    if (!key) throw httpError(503, 'this install has no OpenRouter key: connect your own OpenRouter account');
    const who = body.who ? safe(body.who) : 'anon';
    // Thinking uses the install's model; painting may use one of the art models.
    const chosen = Object.values(ART_MODELS).includes(body.model) ? body.model : model;
    const request = buildRequest({ ...body, model: chosen });
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
        last: summarize(request.messages.at(-1)), reply: summarize(json.choices?.[0]?.message),
      });
    }
    if (!res.ok || json.error) throw httpError(502, `openrouter ${res.status}: ${JSON.stringify(json.error ?? json).slice(0, 500)}`);
    return json;
  }

  /** A ludant stops being kept: its checkpoints, art and picture go, and a note of it stays
   *  so its link can say what happened. (Abandoned by someone, or taken down.) */
  async function letGo(ludant, how) {
    const id = ludant.id;
    for (const cp of ludant.checkpoints ?? []) await store.remove('checkpoints', `${id}-${cp.n}`);
    for (const a of ludant.assets ?? []) await store.remove('assets', `l-${id}-${a.name}`);
    await store.remove('thumbs', `l-${id}`);
    const abandoned = { name: nameOf(ludant.soma), at: now(), ...how };
    await store.put('ludants', id, { id, abandoned, lineage: ludant.lineage ?? {} });
    holds.delete(id);
    unwritten.delete(id);
    return abandoned;
  }

  // ---------- flags: someone says what they saw doesn't belong here ----------

  const FLAG_REASONS = ['illegal', 'sexual', 'hateful', 'violent', 'other'];
  let flagDay = '', flagsToday = 0;

  /** A report of content. A publication enough different people flag is hidden at once,
   *  until someone looks: a strong word ('illegal') from two, any word from three. */
  async function flag(body, from) {
    const today = now().slice(0, 10);
    if (today !== flagDay) { flagDay = today; flagsToday = 0; }
    if (++flagsToday > MAX_FLAGS_A_DAY) throw httpError(429, 'too many reports today; please try again tomorrow');
    const reason = FLAG_REASONS.includes(body.reason) ? body.reason : 'other';
    const ludant = body.ludant ? safe(body.ludant) : null;
    const published = body.published ? safe(body.published) : null;
    if (!ludant && !published) throw httpError(400, 'a report says what it is about');
    const image = typeof body.image === 'string' && body.image.startsWith('data:image/') && body.image.length <= MAX_THUMB ? body.image : null;
    const id = `f-${hex(4)}`;
    const doc = { id, at: now(), status: 'open', reason, note: String(body.note ?? '').slice(0, 1000), by: String(body.by || 'someone').slice(0, 40), person: from.person ?? null, ludant, published, image };
    await store.put('flags', id, doc);
    ops.count(`flag ${reason}`);
    settings.opsLog?.({ flag: reason, ludant, published });
    if (published) {
      const pub = await store.get('published', published);
      if (pub && !pub.hidden && !pub.cleared) {
        const open = (await store.list('flags')).filter((f) => f.published === published && f.status === 'open');
        // Different people: by who they are when they're signed in, else by the name they gave.
        const who = (f) => f.person ?? `name:${f.by.toLowerCase()}`;
        const reporters = new Set(open.map(who)).size;
        const strong = new Set(open.filter((f) => f.reason === 'illegal').map(who)).size;
        if (strong >= 2 || reporters >= 3) { pub.hidden = { by: 'reports', at: now() }; await store.put('published', published, pub); }
      }
    }
    return { id };
  }

  // What one address has done today, for the daily limits. In memory only: an address is
  // never written down.
  const today = new Map();   // `${day} ${what} ${ip}` -> count
  function limit(what, ip, max, saying) {
    const day = now().slice(0, 10), k = `${day} ${what} ${ip ?? 'here'}`;
    if (!today.has(k)) for (const old of today.keys()) if (!old.startsWith(day)) today.delete(old);
    const n = today.get(k) ?? 0;
    if (n >= max) throw httpError(429, saying);
    return () => today.set(k, n + 1);   // count it once it's done
  }
  let checkDay = '', checksToday = 0;

  /** The publish check, if this install has one, within the day's allowance. */
  async function lookAt(pub, images) {
    if (!settings.check) return { checked: 'unchecked' };
    const today = now().slice(0, 10);
    if (today !== checkDay) { checkDay = today; checksToday = 0; }
    if (++checksToday > MAX_CHECKS_A_DAY) { ops.count('check over the day\'s allowance'); return { checked: 'unchecked' }; }
    try {
      const verdict = await settings.check({ text: publicText(pub), images: images.filter(Boolean) });
      ops.count(`check ${verdict.flagged ? 'flagged' : 'clean'}`);
      return verdict.flagged ? { checked: 'flagged', why: `the publish check: ${verdict.why}` } : { checked: 'clean' };
    } catch (err) {
      await ops.trouble({ kind: 'server', where: 'publish check', message: err.message, sample: err.stack }).catch(() => {});
      return { checked: 'unchecked' };
    }
  }

  async function recheck(pub) {
    const images = [(await store.get('thumbs', `p-${pub.id}`))?.image];
    for (const m of pub.assets ?? []) images.push((await store.get('assets', `p-${pub.id}-${m.name}`))?.image);
    const look = await lookAt(pub, images);
    if (look.checked === 'unchecked') return;
    pub.checked = look.checked;
    if (look.why) {
      pub.hidden = { by: 'check', at: now(), note: look.why };
      const fid = `f-${hex(4)}`;
      await store.put('flags', fid, { id: fid, at: now(), status: 'open', reason: 'check', note: look.why.replace(/^the publish check: /, ''), by: 'the publish check', ludant: pub.ludant, published: pub.id, image: null });
    }
    await store.put('published', pub.id, pub);
  }

  /** What the moderator can do (tools/moderate.mjs). */
  async function moderate({ action, flag: flagId, published, ludant, note }) {
    const done = [];
    if (published) {
      const pub = await read('published', published);
      if (action === 'hide') { pub.hidden = { by: 'moderator', at: now(), note: String(note ?? '').slice(0, 200) }; delete pub.cleared; done.push(`hid ${pub.name}`); }
      if (action === 'restore' || action === 'approve') { delete pub.hidden; pub.cleared = now(); done.push(`${action === 'approve' ? 'approved' : 'restored'} ${pub.name}: it can be featured, and reports won't hide it again by themselves`); }
      await store.put('published', published, pub);
    }
    if (ludant && action === 'remove') {
      const l = await store.get('ludants', safe(ludant));
      if (l && !l.abandoned) { await letGo(l, { by: 'gactant', takenDown: true }); done.push(`took down ${ludant}`); }
    }
    for (const f of await store.list('flags')) {
      const ours = flagId ? f.id === flagId : (published && f.published === published) || (ludant && f.ludant === ludant);
      if (ours && f.status === 'open') { f.status = ['restore', 'approve', 'dismiss'].includes(action) ? 'dismissed' : 'acted'; f.closed = now(); await store.put('flags', f.id, f); done.push(`closed ${f.id}`); }
    }
    return { done };
  }

  // ---------- routes ----------

  /** Every request is counted, and one that fails on our side is kept as trouble.
   *  from: { ip } of who's asking, for limits (never kept). */
  async function route(method, parts, body, query, from = {}) {
    const started = Date.now();
    let status = 200;
    // Who's asking: the person and device their pass names (people.mjs), if it's good.
    from = { ...from, ...((await people.whoIs(from.pass)) ?? {}) };
    try { return await answer(method, parts, body, query, from); }
    catch (err) {
      status = typeof err.code === 'number' ? err.code : 500;
      if (status >= 500) await ops.trouble({ kind: 'server', where: `${method} ${parts.slice(0, 1).join('/')}${parts[2] ? `/:id/${parts[2]}` : parts[1] ? '/:id' : ''}`, message: err.message, sample: err.stack }).catch(() => {});
      throw err;
    } finally {
      ops.request(method, parts, status, Date.now() - started);
      ops.flush().catch(() => {});
    }
  }

  async function answer(method, parts, body, query, from) {
    const [a, b, c] = parts;
    // What pages noticed (no names, chat, prompts or keys), and reading it all back.
    if (a === 'people') return people.route(method, parts, body, from);
    if (a === 'events' && method === 'POST') return ops.events(body);
    if (a === 'flags' && method === 'POST') return flag(body, from);
    if (a === 'admin' && (b === 'flags' || b === 'moderate') && method === 'POST') {
      if (!settings.adminToken || body.token !== settings.adminToken) throw httpError(403, 'not allowed');
      if (b === 'moderate') return moderate(body);
      const all = (await store.list('flags')).sort((x, y) => y.at.localeCompare(x.at));
      return body.all ? all.slice(0, 200) : all.filter((f) => f.status === 'open');
    }
    // Owners, for whoever runs the install: which ludants have one, and a key for one that
    // doesn't (a ludant from before owners). An owned ludant's key is never replaced here.
    if (a === 'admin' && (b === 'owners' || b === 'own' || b === 'people') && method === 'POST') {
      if (!settings.adminToken || body.token !== settings.adminToken) throw httpError(403, 'not allowed');
      if (b === 'people') return (await store.list('people')).map((p) => ({ id: p.id, name: p.name, created: p.created, devices: p.devices.map((d) => `${d.label} (last ${d.seen})`) }));
      const isPerson = (o) => /^p-[a-f0-9]{16}$/.test(String(o ?? ''));
      if (b === 'owners') {
        const named = new Map((await store.list('people')).map((p) => [p.id, p.name]));
        return (await store.list('ludants')).filter((l) => !l.abandoned).map((l) => ({ id: l.id, name: nameOf(l.soma), owned: isPerson(l.owner), owner: isPerson(l.owner) ? `${named.get(l.owner) ?? '?'} (${l.owner})` : null, ownedAt: l.ownedAt ?? null,
          by: l.lineage?.takenBy ?? l.lineage?.seededBy ?? null, from: l.lineage?.from?.name ?? null, updated: l.updated, people: Object.keys(l.visitors ?? {}) }))
          .sort((x, y) => (y.updated || '').localeCompare(x.updated || ''));
      }
      // A ludant with no person owning it (from before owners, or owned by a key from before
      // people) goes to a person.
      const l = await read('ludants', body.ludant);
      if (l.abandoned) throw httpError(410, 'abandoned');
      if (isPerson(l.owner)) throw httpError(409, `${nameOf(l.soma)} already belongs to a person${l.ownedAt ? ` (since ${l.ownedAt})` : ''}`);
      if (!await people.get(body.person)) throw httpError(404, `no person ${body.person}`);
      l.owner = body.person; l.ownedAt = now();
      await store.put('ludants', l.id, l);
      return { id: l.id, owner: l.owner };
    }
    if (a === 'admin' && b === 'ops' && method === 'POST') {
      if (!settings.adminToken || body.token !== settings.adminToken) throw httpError(403, 'not allowed');
      return { ...(await ops.read({ days: Number(body.days) || 2 })), held: [...holds.keys()].length, storage: await store.size?.(), flagsOpen: (await store.list('flags')).filter((f) => f.status === 'open').length };
    }
    if (a === 'config') return { version: settings.version ?? null, model, hasKey: Boolean(key), logs: !isPublic, public: isPublic, sandbox: settings.sandbox || '' };
    if (a === 'infer' && method === 'POST') return infer(body);
    if (a === 'log' && b && method === 'POST') { if (!isPublic) await log(safe(b), { ...body, last: summarize(body.last) }); return {}; }
    if (a === 'log' && b) return isPublic ? [] : tail(safe(b), Number(query.get('n')) || 20);
    // A device's check: what its browser can do (controllers, voice, pictures across the
    // sandbox). Saved as it goes, so whoever is building can read it without anyone relaying.
    if (a === 'reports' && method === 'POST') {
      const report = body.report ?? {};
      if (JSON.stringify(report).length > MAX_REPORT) throw httpError(413, 'report too big');
      const id = body.id && /^r-[a-f0-9]{8}$/.test(body.id) && await store.get('reports', body.id) ? body.id : `r-${hex(4)}`;
      await store.put('reports', id, { id, at: now(), report });
      return { id };
    }
    if (a === 'admin' && b === 'reports' && method === 'POST') {
      if (!settings.adminToken || body.token !== settings.adminToken) throw httpError(403, 'not allowed');
      return (await store.list('reports')).sort((x, y) => y.at.localeCompare(x.at)).slice(0, Number(body.n) || 10);
    }
    if (a === 'admin' && b === 'import' && method === 'POST') {
      if (!settings.adminToken || body.token !== settings.adminToken) throw httpError(403, 'not allowed');
      let imported = 0;
      for (const p of body.published ?? []) {
        if (!p?.id || !p.soma?.given || !p.name) continue;
        safe(p.id);
        if (await store.get('published', p.id)) continue;
        await store.put('published', p.id, { ...p, copies: 0, stats: undefined, play: undefined });
        await store.put('names', p.soma.given.toLowerCase(), { given: p.soma.given, at: now() });
        imported++;
      }
      return { imported };
    }
    if (a === 'thumbs' && (b === 'l' || b === 'p') && c) {
      if (b === 'p' && (await store.get('published', safe(c)))?.hidden) return { image: null };
      return { image: (await store.get('thumbs', `${b}-${safe(c)}`))?.image ?? null };
    }

    if (a === 'ludants') {
      if (!b && method === 'GET') {
        // mine=1: every ludant the person asking owns, whichever device they made it on. A
        // public install lists nothing else: anyone else's unpublished ludant is reached by its link.
        let found;
        if (query.get('mine')) found = from.person ? (await store.list('ludants')).filter((l) => l.owner === from.person && !l.abandoned) : [];
        else found = isPublic ? [] : (await store.list('ludants')).filter((l) => !l.abandoned);
        return found.map(summary).sort((x, y) => (y.updated || '').localeCompare(x.updated || ''));
      }
      if (!b && method === 'POST') {
        const counted = limit('seed', from.ip, SEED_A_DAY, `that's ${SEED_A_DAY} new ludants from here today; more tomorrow`);
        counted();
        const given = await freshGiven();
        const id = newId(given);
        const ludant = { id, soma: seedSoma(given, body.by), surfaces: {}, checkpoints: [], visitors: {}, lineage: { seededBy: body.by || null }, fresh: true, created: now(), updated: now() };
        ownedBy(ludant, from);
        await checkpoint(ludant, 'as seeded', body.by);
        await store.put('ludants', id, ludant);
        return { id };
      }
      const ludant = await read('ludants', b);
      // An abandoned ludant leaves only a note of it, so its link says what happened.
      if (ludant.abandoned) throw httpError(410, `${ludant.abandoned.name} was abandoned`, { abandoned: ludant.abandoned });
      if (c === 'abandon' && method === 'POST') {
        await requireHold(ludant, body, from);
        return { abandoned: await letGo(ludant, { by: String(body.by || 'someone').slice(0, 40) }) };
      }
      if (!c && method === 'GET') {
        // The names its family has already published under, so it knows which are taken.
        const familyNames = (await store.list('published')).filter((p) => p.given === ludant.soma?.given).map((p) => p.name);
        const { stats, owner, ownedAt, ...rest } = ludant;
        // What was said, sketched and saved is for its owners (every device with its key).
        // Anyone else with the link sees what a copy would get: its game and its art.
        if (!owns(ludant, from)) {
          return { ...rest, surfaces: rest.surfaces?.stage ? { stage: rest.surfaces.stage } : {}, visitors: {}, familyNames, yours: false, unclaimed: !ludant.owner };
        }
        return { ...rest, familyNames, yours: true };
      }
      if (!c && method === 'PUT') {
        await requireHold(ludant, body, from);
        const size = JSON.stringify(body.soma).length + JSON.stringify(body.surfaces).length;
        if (size > MAX_LUDANT) throw httpError(413, `too big to keep: ${size} characters of soma and surfaces (the limit is ${MAX_LUDANT})`);
        await store.put('ludants', b, { ...ludant, soma: body.soma, surfaces: body.surfaces, fresh: false, updated: now() });
        return {};
      }
      if (c === 'hold' && method === 'POST') {
        // A ludant from before owners belongs to nobody until it's claimed (admin/own): no
        // one can change it in the meantime, so no one can take it by opening it first.
        if (!owns(ludant, from)) throw notYours(ludant);
        const h = holdState(b);
        if (h && h.token !== body.token && !body.takeOver) throw httpError(409, `${h.who} is holding this ludant in another window`, { heldBy: h.who, since: h.since });
        holds.set(b, { token: body.token, who: String(body.who || 'someone').slice(0, 40), since: h?.token === body.token ? h.since : now(), seen: Date.now() });
        return { held: true, tookFrom: h && h.token !== body.token ? h.who : null };
      }
      if (c === 'heartbeat' && method === 'POST') {
        await requireHold(ludant, body, from);
        await played(b, Number(body.seconds) || 0, Number(body.spent) || 0);
        return { held: true };
      }
      // Art: pictures made for the ludant, kept apart from it (they're big) and listed on it.
      if (c === 'assets' && method === 'GET') {
        return (await Promise.all((ludant.assets ?? []).map(async (m) => ({ ...m, image: (await store.get('assets', `l-${b}-${m.name}`))?.image ?? null })))).filter((a) => a.image);
      }
      if (c === 'assets' && method === 'POST') {
        await requireHold(ludant, body, from);
        const name = assetName(body.name), image = String(body.image ?? '');
        if (!image.startsWith('data:image/') || image.length > MAX_ASSET) throw httpError(400, `a picture is an image data URL, up to ${MAX_ASSET} characters`);
        const list = (ludant.assets ?? []).filter((m) => m.name !== name);
        if (list.length >= MAX_ASSETS) throw httpError(413, `a ludant keeps up to ${MAX_ASSETS} pictures; remove one first`);
        const kept = list.reduce((n, m) => n + (m.bytes ?? 0), 0);
        if (kept + image.length > ART_BUDGET) throw httpError(413, `its pictures would be over the ${Math.round(ART_BUDGET / 1e6)} MB a ludant keeps (${Math.round(kept / 1e6)} MB now); remove some first, or make smaller ones`);
        const meta = { name, w: Number(body.w) || 0, h: Number(body.h) || 0, prompt: String(body.prompt ?? '').slice(0, 1000), by: String(body.by ?? '').slice(0, 60), at: now(), bytes: image.length };
        await store.put('assets', `l-${b}-${name}`, { image });
        ludant.assets = [...list, meta];
        await store.put('ludants', b, ludant);
        return meta;
      }
      if (c === 'unasset' && method === 'POST') {
        await requireHold(ludant, body, from);
        const name = assetName(body.name);
        ludant.assets = (ludant.assets ?? []).filter((m) => m.name !== name);
        await store.put('ludants', b, ludant);
        return { removed: name };
      }
      if (c === 'thumb' && method === 'POST') {
        await requireHold(ludant, body, from);
        const image = String(body.image ?? '');
        if (!image.startsWith('data:image/') || image.length > MAX_THUMB) throw httpError(400, 'a thumb is a small image data URL');
        await store.put('thumbs', `l-${b}`, { image, at: now() });
        // A publication without a picture takes its first player's, while their copy is
        // still exactly what was published.
        const source = ludant.lineage?.from?.published;
        if (source && !(await store.get('thumbs', `p-${source}`))) {
          const pub = await store.get('published', source);
          if (pub && sameBody(pub.soma, ludant.soma)) await store.put('thumbs', `p-${source}`, { image, at: now() });
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
      if (c === 'copy' && method === 'POST') {
        limit('copy', from.ip, COPY_A_DAY, `that's ${COPY_A_DAY} copies from here today; more tomorrow`)();
        const id = newId(ludant.soma.given);
        const copy = {
          id, soma: structuredClone(ludant.soma), surfaces: {}, checkpoints: [], visitors: {}, fresh: true, created: now(), updated: now(),
          lineage: { from: { ludant: b, name: nameOf(ludant.soma) }, takenBy: body.by || null },
        };
        await checkpoint(copy, `copied from ${nameOf(ludant.soma)}`, body.by);
        for (const m of ludant.assets ?? []) {
          const a = await store.get('assets', `l-${b}-${m.name}`);
          if (a) await store.put('assets', `l-${id}-${m.name}`, a);
        }
        copy.assets = ludant.assets ?? [];
        ownedBy(copy, from);
        await store.put('ludants', id, copy);
        return { id };
      }
      if (c === 'arrive' && method === 'POST') {
        await requireHold(ludant, body, from);
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
        await requireHold(ludant, body, from);
        const n = await checkpoint(ludant, body.label, body.by);
        await store.put('ludants', b, ludant);
        return { n };
      }
      if (c === 'restore' && method === 'POST') {
        await requireHold(ludant, body, from);
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
        // Trusted: a person cleared it, or it passed the check and has been up a day with no
        // reports. The lobby features only these to strangers.
        const reported = new Set((await store.list('flags')).filter((f) => f.status !== 'dismissed').map((f) => f.published));
        const trusted = (p) => Boolean(p.cleared) || (p.checked === 'clean' && !reported.has(p.id) && Date.now() - Date.parse(p.at) > TRUSTED_AFTER_MS);
        return (await store.list('published')).filter((p) => !p.hidden).map(({ soma, stats, play, assets, cleared, checked, ...p }) => ({ ...p, copies: p.copies ?? 0, cost: perHour(play), trusted: trusted({ ...p, cleared, checked }) }))
          .sort((x, y) => y.at.localeCompare(x.at));
      }
      if (!b && method === 'POST') {
        const counted = limit('publish', from.ip, PUBLISH_A_DAY, `that's ${PUBLISH_A_DAY} publications from here today; more can go up tomorrow`);
        // A published name belongs to exactly one snapshot. So a snapshot can't be published
        // twice, and publishing again takes both a change and a new title.
        const ludant = await read('ludants', body.ludant);
        await requireHold(ludant, body, from);
        const name = nameOf(ludant.soma);
        if (!titleSlug(ludant.soma.sections?.title)) throw httpError(400, `${name} needs a title before it can be published: its name is its given name and its game's title together`);
        const pubs = await store.list('published');
        const same = pubs.find((p) => sameBody(p.soma, ludant.soma));
        if (same) throw httpError(409, `this exact ${same.given} is already published as ${same.name}. Change something first, then give it a new title`);
        const clash = pubs.find((p) => p.name.toLowerCase() === name.toLowerCase());
        if (clash) throw httpError(409, `${name} already names another snapshot. It has changed since, so it needs a new title`);
        // A look before it goes public: its words and pictures (check.mjs). Something the
        // check doesn't like is published but hidden, waiting for a person to look.
        const title = ludant.soma.sections.title.trim(), note = String(body.note || '').slice(0, 500);
        const images = [(await store.get('thumbs', `l-${ludant.id}`))?.image];
        for (const m of ludant.assets ?? []) images.push((await store.get('assets', `l-${ludant.id}-${m.name}`))?.image);
        const look = await lookAt({ name, title, note, soma: ludant.soma }, images);
        counted();
        const n = await checkpoint(ludant, `published as ${name}`, body.by);
        await store.put('ludants', ludant.id, ludant);
        const id = newId(name);
        await store.put('published', id, {
          id, name, given: ludant.soma.given, title, by: body.by || null, note,
          ludant: ludant.id, n, from: ludant.lineage?.from?.published ?? null, fromName: ludant.lineage?.from?.name ?? null, at: now(),
          copies: 0, soma: structuredClone(ludant.soma), checked: look.checked,
          ...(look.why ? { hidden: { by: 'check', at: now(), note: look.why } } : {}),
        });
        if (look.why) {
          const fid = `f-${hex(4)}`;
          await store.put('flags', fid, { id: fid, at: now(), status: 'open', reason: 'check', note: look.why.replace(/^the publish check: /, ''), by: 'the publish check', ludant: ludant.id, published: id, image: null });
        }
        // Its art goes with it: the snapshot draws with the pictures it had.
        for (const m of ludant.assets ?? []) {
          const a = await store.get('assets', `l-${ludant.id}-${m.name}`);
          if (a) await store.put('assets', `p-${id}-${m.name}`, a);
        }
        const pubDoc = await store.get('published', id);
        pubDoc.assets = ludant.assets ?? [];
        await store.put('published', id, pubDoc);
        // Its picture is the ludant's latest, so the lobby can show what it looks like.
        const thumb = await store.get('thumbs', `l-${ludant.id}`);
        if (thumb) await store.put('thumbs', `p-${id}`, thumb);
        return { id, name, ...(look.why ? { held: look.why } : {}) };
      }
      const pub = await read('published', b);
      if (pub.hidden) throw httpError(451, `${pub.name} has been taken down`, { hidden: true });
      if (!c && method === 'GET') { const { soma, stats, play, ...meta } = pub; return { ...meta, cost: perHour(play) }; }
      if (c === 'copy' && method === 'POST') {
        limit('copy', from.ip, COPY_A_DAY, `that's ${COPY_A_DAY} copies from here today; more tomorrow`)();
        const id = newId(pub.given);
        // The soma comes whole; the surfaces start fresh. What was said and sketched belonged
        // to the people who were there.
        const ludant = {
          id, soma: structuredClone(pub.soma), surfaces: {}, checkpoints: [], visitors: {}, fresh: true, created: now(), updated: now(),
          lineage: { from: { published: pub.id, name: pub.name, by: pub.by, ludant: pub.ludant }, takenBy: body.by || null },
        };
        await checkpoint(ludant, `as received: ${pub.name}`, body.by);
        for (const m of pub.assets ?? []) {
          const a = await store.get('assets', `p-${pub.id}-${m.name}`);
          if (a) await store.put('assets', `l-${id}-${m.name}`, a);
        }
        ludant.assets = pub.assets ?? [];
        ownedBy(ludant, from);
        await store.put('ludants', id, ludant);
        pub.copies = (pub.copies ?? 0) + 1;
        await store.put('published', pub.id, pub);
        return { id };
      }
    }

    throw httpError(404, `no route ${method} /api/${parts.join('/')}`);
  }

  /** Publications that haven't had their look (made before there was a check, or when it
   *  couldn't run) get it, a few at a time: the Worker calls this hourly. */
  async function checkSome(n = 10) {
    if (!settings.check) return { checked: 0 };
    const due = (await store.list('published')).filter((p) => !p.hidden && !p.cleared && (p.checked ?? 'unchecked') === 'unchecked').slice(0, n);
    for (const p of due) await recheck(p);
    await ops.flush(true);
    return { checked: due.length };
  }

  /** Ludants nobody came back to (see UNTOUCHED_*), cleared away entirely; and closed
   *  reports after 90 days. Hourly, with the checks. */
  async function tidy() {
    let cleared = 0;
    for (const l of await store.list('ludants')) {
      if (l.abandoned || (l.checkpoints?.length ?? 0) > 1 || holds.has(l.id)) continue;
      // Nobody came back: no save and no sitting since (playing doesn't always save).
      const last = Math.max(Date.parse(l.updated || l.created), ...Object.values(l.visitors ?? {}).map((v) => Date.parse(v.last) || 0));
      const idle = Date.now() - last;
      const copy = Boolean(l.lineage?.from);
      if (idle < (copy ? UNTOUCHED_COPY_MS : UNTOUCHED_SEED_MS)) continue;
      for (const cp of l.checkpoints ?? []) await store.remove('checkpoints', `${l.id}-${cp.n}`);
      for (const a of l.assets ?? []) await store.remove('assets', `l-${l.id}-${a.name}`);
      await store.remove('thumbs', `l-${l.id}`);
      await store.remove('ludants', l.id);
      cleared++;
    }
    for (const f of await store.list('flags')) if (f.status !== 'open' && Date.now() - Date.parse(f.closed ?? f.at) > 90 * 86400_000) await store.remove('flags', f.id);
    const reports = (await store.list('reports')).sort((x, y) => y.at.localeCompare(x.at));
    for (const r of reports.slice(200)) await store.remove('reports', r.id);
    if (cleared) ops.count('tidy cleared', cleared);
    return { cleared };
  }

  return { route, checkSome, tidy, flush: () => ops.flush(true) };
}

// ---------- shared by both hosts ----------

/** The API answers only the platform's own pages. A request from a sandbox (Origin: null)
 *  or another site is refused, so the relay can't be spent from anywhere else. */
export function sameOrigin(origin, host) {
  if (!origin) return true;   // same-origin GETs don't say
  try { return new URL(origin).host === host; } catch { return false; }
}

// The site's own pages hold what matters most in a browser: a person's OpenRouter key, and
// their owner keys. So they run only the platform's own scripts, talk only to this site
// and OpenRouter, embed only the sandbox, and can't be framed by anyone else.
export function pageHeaders(sandboxOrigin = '', https = false) {
  return {
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "connect-src 'self' https://openrouter.ai",
      `frame-src ${sandboxOrigin || "'self'"}`,
      "worker-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    ...(https ? { 'Strict-Transport-Security': 'max-age=31536000' } : {}),
  };
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

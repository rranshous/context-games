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
// Kinds: ludants, published, checkpoints (one soma per doc, `${ludant}-${n}`), names (given
// names in use, so a new seed's is fresh), thumbs (where the small picture of a ludant's or a
// publication's stage is, `l-<id>` or `p-<id>`, kept apart so lists stay light), lines (a
// shared game: { id, ludant, owner, by, public, versions: [publication ids], followers }).
//
// Pictures (art and thumbs) aren't documents. They're files in settings.art, served from
// settings.artBase: hosted, an R2 bucket behind its own custom domain, so they go through
// Cloudflare's cache, where the CSAM Scanning Tool sees them; locally, data/pictures/ at /art/.
//   art: { put(file, bytes, type), get(file) -> { bytes, type } | null, remove(file) }
//   a/<sha256>.<ext>          a piece of art, named by what's in it, so a ludant, its copies
//                             and its publications all point at the same file. Never removed:
//                             any of them may still draw it.
//   t/<l|p>-<id>-<hash>.<ext> a thumb; the ludant's is replaced (and the old one removed) as it changes
//
// settings: { model, key (OpenRouter, or ''), public (bool), sandbox (origin of the sandbox
//             page, or '' for this one), art, artBase, log(who, record), tail(who, n), opsLog(record) }
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
//   PUT  ludants/<id>   { soma, surfaces, token } -> {}            409 unless this window holds it. On a public
//                                                   install, surfaces are { stage, sealed }: everything private sealed
//                                                   in the browser with its person's key (identity.js), never readable here
//   POST ludants/<id>/hold { token, who, takeOver? } -> { held, tookFrom }   409 { heldBy, since } if another of the owner's
//                                                   windows does; 403 { notYours } if the person asking doesn't own it
//   Every other change (PUT, heartbeat, arrive, checkpoints, restore, abandon, assets, thumb,
//   publishing) needs the owner, and { token } of the window holding it.
//   Who's asking comes from the X-Gactant-Pass header (people.mjs): POST people/challenge,
//   people (a new person), people/pass, people/join, people/pair, people/name, people/remove,
//   people/recovery; GET people/me.
//   POST ludants/<id>/heartbeat { token, seconds, spent } -> { held } 409 once another window took it
//   POST ludants/<id>/issue { token, by, title, trying, wrong, tried, soma, table, doings } -> { id }
//                                                   a problem the ludant reported and its person sent (surfaces/admins.js)
//                                                   about: one of its reports, to answer the admins there
//   POST ludants/<id>/report-person { token, who, what, why } -> { id }   the ludant reports the person with it;
//                                                   a ⚑ report from a ludant
//   POST ludants/<id>/report-person-evidence { token, id, chat, image } -> { added }   the recent chat and a
//                                                   picture, if the person reported chooses to send them
//   GET  ludants/<id>/mail                       -> [{ id, issue, title, at, text }]   letters waiting (its owner)
//   POST ludants/<id>/mail { token, took }       -> { mail }   the ones its frame has written into its soma
//   POST ludants/<id>/release { token }          -> {}
//   POST ludants/<id>/arrive { who }             -> { firstVisit, visits, checkpoint, people }
//   GET  ludants/<id>/checkpoints                -> [{ n, label, by, at }]
//   POST ludants/<id>/checkpoints { label, by }  -> { n }           no-op if nothing changed
//   POST ludants/<id>/restore { n, by }          -> { restored }     checkpoints the present first
//   POST ludants/<id>/abandon { token, by }      -> { abandoned }    let it go: it, its checkpoints, art and
//                                                   chat are no longer kept; what it was published as stays.
//                                                   Its link then answers 410 { abandoned: { by, at, name } }
//   GET  published                               -> [{ id, name, given, title, by, note, ludant, line, version, n, from, fromName, at, copies, cost }]
//                                                   the newest version of each public line (the lobby); cost: per hour of play, from copies
//   POST ludants/<id>/share { token, by, public?, note? } -> line info (+ held)   share it: its line, made the first
//                                                   time with a first version (checked; held: the check hid it); public: in the lobby
//   POST ludants/<id>/update { token, by, note? }  -> line info (+ held)   send an update: a new version for its followers
//   POST ludants/<id>/follow { token }            -> { following, version }   go back to following the line it came from
//   GET  lines/<id>                               -> { id, public, by, followers, versions, title, given, latest, note, picture }
//   POST lines/<id>/copy { by }                   -> { id }          a copy of its newest version, following it
//   (GET ludants/<id> for its owner also says { line: { ..., behind, followers }, follows: { line, following, by, title },
//    updatedTo? }: a following copy takes its line's newest version as it's opened; PUT answers { behind, followers };
//    a following copy's game changes, and a restore, only with madeOwn: its person said yes)
//   GET  published/<id>                          -> metadata
//   POST published/<id>/copy { by }              -> { id }          an old version's link: a copy of its line's newest, following it
//   POST ludants/<id>/thumb { token, image }     -> {}             a picture of its stage now (a small JPEG data URL)
//   GET  ludants/<id>/assets                     -> [{ name, w, h, prompt, by, at, url }]   its art
//   POST ludants/<id>/assets { token, name, image, w, h, prompt, by } -> meta   keep a picture (replaces one of that name)
//   POST ludants/<id>/unasset { token, name }    -> { removed }
//   (publishing copies a ludant's art to the publication; taking a copy copies it on)
//   GET  thumbs/<l|p>/<id>                       -> { url }         (null if there's none yet)
//   POST reports        { id?, report }          -> { id }          what a device's check page found (/check.html);
//                                                   with an id, updates that report as the check goes on
//   POST admin/reports { token, n? }             -> newest reports (needs settings.adminToken; tools/reports.mjs)
//   POST events { browser, mobile, events: [...] } -> {}           what a page noticed: trouble and how the stage runs (ops.mjs)
//   POST flags { ludant?, published?, reason, note, by, image?, matches? } -> { id }   someone reports content (frame.js);
//                                                   a publication flagged by enough people is hidden until looked at;
//                                                   matches: the ids of matches the game was in (kept with who played, and how far)
//   POST admin/flags { token, all? }             -> open reports (or the latest 200)        tools/moderate.mjs
//   POST admin/moderate { token, action: hide|restore|approve|remove|dismiss, published?, ludant?, flag?, note? } -> { done }
//   POST admin/owners { token }                  -> [{ id, name, owned, owner, ownedAt, by, from, updated, people }]
//   POST admin/own { token, ludant, person }     -> { id, owner }   gives a ludant no person owns to a person (tools/own.mjs)
//   POST admin/people { token }                  -> [{ id, name, created, devices }]
//   POST admin/ops { token, days? }              -> { traffic, trouble, held }   what's going on (tools/ops.mjs)
//   POST admin/migrate-art { token, n? }         -> { moved, left }   art and thumbs kept as data URLs in the
//                                                   store move to the art store, n owners at a time (once, 2026-10-28)
//   POST admin/issues { token, n?, all?, id?, status?, reply? } -> the open reports in brief, or one whole (its status set,
//                                                   or a reply added: a letter waiting in the ludant's mail)
//   POST admin/import { token, published: [...] } -> { imported }  publications brought from another install
//                                                   (tools/push.mjs); needs settings.adminToken
//   drafts, rulebooks, matches                   tables: games many ludants play together (tables.mjs has their API)
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
import { createTables } from './tables.mjs';

const OPENROUTER = 'https://openrouter.ai/api/v1/chat/completions';
const HOLD_STALE_MS = 20000;
const MAX_LUDANT = 1_500_000;    // characters of JSON in a save: soma and surfaces together
const FLUSH_PLAY_MS = 60000;     // how often what play costs is written down
const MAX_THUMB = 45_000;        // bytes in a thumb
const MAX_FLAG_IMAGE = 60_000;   // characters of data URL in a report's picture
const MAX_REPORT = 60_000;       // characters of JSON in a check report
const MAX_ISSUE = 1_200_000;    // characters of JSON in a ludant's report, its soma included
const ISSUES_A_DAY = 10;         // reports a person may send in a day
const PERSON_REPORTS_A_DAY = 3;  // reports about people one ludant may send in a day
const REPORTED_CHAT = 30;        // chat messages that go with one
const MAX_FLAGS_A_DAY = 300;     // reports of content the install takes in a day
const FLAGS_EACH_A_DAY = 20;     // reports one person (or address) may make in a day
const DEVICE_REPORTS_A_DAY = 30; // device checks (check.html) one address may save in a day
const ART_BYTES_A_DAY = 40_000_000;   // bytes of pictures one person may upload in a day (art is never overwritten)
const MAX_CHECKS_A_DAY = 200;    // publish checks a day (settings.check; each costs a little)
const PUBLISH_A_DAY = 10;        // publications one address may make in a day
const SEED_A_DAY = 20;           // new ludants one address may seed in a day
const COPY_A_DAY = 40;           // copies one address may take in a day
const ART_BUDGET = 15_000_000;   // bytes of pictures one ludant keeps, all told
const CHECKPOINTS_KEPT = 50;     // a ludant's newest checkpoints kept (and its first)
// Ludants nobody came back to: still exactly as they began (one checkpoint), with no save
// and nobody sitting down this long, they're cleared away. A seed is a pulsing dot; a copy can be taken again.
const UNTOUCHED_SEED_MS = 7 * 86400_000;
const UNTOUCHED_COPY_MS = 30 * 86400_000;
const SEALED_SURFACES = new Set(['stage', 'sealed']);
const MAX_ASSET = 1_100_000;     // bytes in one picture
const MAX_ASSETS = 60;           // pictures per ludant
const assetName = (n) => { if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(String(n))) throw httpError(400, `art names are lowercase words joined by -, up to 40 characters: ${n}`); return n; };

export function httpError(code, message, extra) { return Object.assign(new Error(message), { code, extra }); }

const now = () => new Date().toISOString();
const PICTURE = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/;
const slug = (s) => String(s || 'actant').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'actant';
const hex = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('');
// A ludant's link works like a key (a stranger who has it sees its soma), so its id has 64
// random bits; a short one could be found by guessing.
const newId = (name) => `${slug(name)}-${hex(8)}`;
const short = (s) => (s == null || s === '' ? null : String(s).slice(0, 40));   // a person's name as given
const MAX_TITLE = 80;
/** The admin token, compared in constant time (an empty one never matches). */
export const isAdmin = (settings, token) => {
  const want = String(settings.adminToken || ''), got = String(token ?? '');
  if (!want || got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
};
export const safe = (id) => { if (!/^[a-z0-9-]+$/.test(String(id))) throw httpError(400, 'bad id'); return id; };
const sameSoma = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Replies from the admins, written into the soma of the ludant that reported (surfaces/admins.js).
// They're to that ludant: copies and publications go without them.
/** A document as a slim list has it: what worker.mjs's SLIM keeps, for the local store. */
export function slimmed(kind, d) {
  if (kind === 'ludants') { const { surfaces, assets, mail, ...rest } = d; return { ...rest, soma: { ...d.soma, sections: { title: d.soma?.sections?.title ?? null } } }; }
  if (kind === 'published') { const { soma, assets, ...rest } = d; return rest; }
  if (kind === 'flags') { const { image, ...rest } = d; return rest; }
  if (kind === 'reports') { const { report, ...rest } = d; return rest; }
  return d;
}
export const LETTERS = 'letters_from_gactant_admins';
const withoutLetters = (soma) => { const s = structuredClone(soma); if (s?.sections) delete s.sections[LETTERS]; return s; };
/** Same body, ignoring title and memory: a new name or remembering being published
 *  doesn't make a different ludant. Something else has to change. */
const sameBody = (a, b) => {
  const strip = (x) => ({ ...x, sections: { ...x?.sections, memory: undefined, title: undefined, [LETTERS]: undefined } });
  return sameSoma(strip(a), strip(b));
};

/** The same game, for a copy following a line: everything but its memory, its letters and
 *  its given name (which is the copy's own) has to match. A new title is a change. */
const sameGame = (a, b) => {
  const strip = (x) => ({ ...x, given: undefined, sections: { ...x?.sections, memory: undefined, [LETTERS]: undefined } });
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
  // What a public install keeps of a ludant's surfaces: the stage's size, and the rest sealed.
  // Anything else (from before sealing) isn't handed back.
  const kept = (surfaces = {}) => isPublic ? Object.fromEntries(Object.entries(surfaces).filter(([k]) => SEALED_SURFACES.has(k))) : surfaces;
  const ops = createOps({ store, log: settings.opsLog });
  // A removed device's live connections to matches close at once: every match its person is
  // in that isn't archived is told (hosted, the Match objects hold the sockets).
  const removed = async (person, device) => {
    for (const m of await store.list('match-index')) if (!m.archived && m.members?.[person] !== undefined) await settings.dropDevice?.(m.id, person, device);
  };
  const people = createPeople({ store, settings: { ...settings, removed }, httpError, limit: (...a) => limit(...a) });
  // Games many ludants play together (tables.mjs); each match apart, in settings.matches.
  const tables = createTables({ store, people, httpError, owns: (l, f) => owns(l, f), settings: { ...settings, count: (k, n) => ops.count(k, n), isAdmin: (token) => isAdmin(settings, token) } });

  // ---------- pictures: files in settings.art, served from artBase ----------
  const art = settings.art;
  const artBase = settings.artBase ?? '/art/';
  const urlOf = (file) => (file ? artBase + file : null);
  /** A picture sent as a data URL: its bytes, if it is one and isn't too big. */
  const pictureOf = (image, max) => {
    const m = String(image ?? '').match(PICTURE);
    if (!m) throw httpError(400, 'a picture is a png, jpeg, webp or gif data URL');
    const bytes = Uint8Array.from(atob(m[2]), (ch) => ch.charCodeAt(0));
    if (bytes.length > max) throw httpError(413, `a picture here is at most ${Math.round(max / 1000)} KB`);
    return { bytes, type: `image/${m[1]}`, ext: m[1] === 'jpeg' ? 'jpg' : m[1] };
  };
  const hashOf = async (bytes) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)).slice(0, 16), (x) => x.toString(16).padStart(2, '0')).join('');
  /** Keep a piece of art; it's named by what's in it. -> { file, bytes } */
  async function keepArt(image) {
    const p = pictureOf(image, MAX_ASSET);
    const file = `a/${await hashOf(p.bytes)}.${p.ext}`;
    await art.put(file, p.bytes, p.type);
    return { file, bytes: p.bytes.length };
  }
  /** Keep a thumb as `key` (l-<id> or p-<id>), removing the one it replaces. */
  async function keepThumb(key, p) {
    const file = `t/${key}-${(await hashOf(p.bytes)).slice(0, 12)}.${p.ext}`;
    const old = await store.get('thumbs', key);
    if (old?.file === file) return file;
    await art.put(file, p.bytes, p.type);
    await store.put('thumbs', key, { file, at: now() });
    if (old?.file) await art.remove(old.file);
    return file;
  }
  async function dropThumb(key) {
    const old = await store.get('thumbs', key);
    if (old?.file) await art.remove(old.file);
    await store.remove('thumbs', key);
  }
  /** A kept picture as a data URL, for the publish check to look at. */
  async function dataUrlOf(file) {
    const pic = file ? await art.get(file) : null;
    if (!pic) return null;
    let s = '';
    for (let i = 0; i < pic.bytes.length; i += 0x8000) s += String.fromCharCode(...pic.bytes.subarray(i, i + 0x8000));
    return `data:${pic.type};base64,${btoa(s)}`;
  }
  /** What the publish check looks at: the stage's picture, and the art. */
  async function picturesOf(thumbKey, assets) {
    return Promise.all([(await store.get('thumbs', thumbKey))?.file, ...(assets ?? []).map((m) => m.file)].map(dataUrlOf));
  }

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
  const beats = new Map();       // ludant id -> when its last heartbeat came (ms)

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
    following: Boolean(x.follows), shared: Boolean(x.line),
  });

  // ---------- inference on the install's key ----------

  async function infer(body) {
    if (!key) throw httpError(503, 'this install has no OpenRouter key: connect your own OpenRouter account');
    const who = body.who ? safe(body.who) : 'anon';
    // Thinking uses the install's model; painting may use one of the art models.
    const chosen = Object.values(ART_MODELS).includes(body.model) ? body.model : model;
    const request = buildRequest({ messages: body.messages, tools: body.tools, modalities: body.modalities, model: chosen, max_tokens: Math.min(Number(body.max_tokens) || 32000, 32000) });
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
        // The last message is what woke this turn (an event, or tool results; not the system
        // note of the soma as it is now, which comes after it); the reply is what came back.
        last: summarize(request.messages.findLast((m) => m.role !== 'system')), reply: summarize(json.choices?.[0]?.message),
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
    await dropThumb(`l-${id}`);
    const abandoned = { name: nameOf(ludant.soma), at: now(), ...how };
    await store.put('ludants', id, { id, abandoned, lineage: ludant.lineage ?? {} });
    holds.delete(id);
    unwritten.delete(id);
    return abandoned;
  }

  // ---------- lines: a game's shared versions, and the copies that follow them ----------
  //
  // People share games; underneath, a ludant shared has a line (one per ludant): a list of
  // versions, each a publication (a snapshot, checked before anyone gets it). Its invite link
  // is the line's. A copy taken from a line follows it: whenever its person opens it and
  // the line has a newer version, the copy takes that body, keeping its own memory, chat and
  // saves. A copy stops following once its person OKs a change to its game (the frame asks),
  // and can go back. A line whose ludant is itself following passes its upstream's versions
  // through, so a game reshared from a follower reaches the follower's friends too. Public
  // lines are in the lobby; private ones only travel by link.

  /** The version a line is at: its own latest that nobody's hidden, or, while its ludant
   *  follows another line, that line's. -> the publication, or null */
  async function lineHead(lineId, depth = 0) {
    const line = await store.get('lines', lineId);
    if (!line) return null;
    const ludant = depth < 10 ? await store.get('ludants', line.ludant) : null;
    if (ludant && !ludant.abandoned && ludant.follows) return lineHead(ludant.follows.line, depth + 1);
    for (const id of [...line.versions].reverse()) {
      const pub = await store.get('published', id);
      if (pub && !pub.hidden) return pub;
    }
    return null;
  }

  /** A new version on a ludant's line: a snapshot, checked like any publication. Its name
   *  is the ludant's; versions don't need names of their own. -> { pub, held? } */
  async function newVersion(ludant, line, { by, note = '' }, from) {
    const counted = limit('publish', from.ip, PUBLISH_A_DAY, `that's ${PUBLISH_A_DAY} updates from here today; more tomorrow`);
    const last = line.versions.length ? await store.get('published', line.versions.at(-1)) : null;
    if (last && sameGame(last.soma, ludant.soma)) throw httpError(409, 'nothing has changed since the last update');
    const name = nameOf(ludant.soma);
    const title = (ludant.soma.sections?.title ?? '').trim() || ludant.soma.given;
    const look = await lookAt({ name, title, note, soma: ludant.soma }, await picturesOf(`l-${ludant.id}`, ludant.assets));
    counted();
    const n = await checkpoint(ludant, `shared as version ${line.versions.length + 1}`, by);
    await store.put('ludants', ludant.id, ludant);
    const id = newId(name);
    const pub = {
      id, name, given: ludant.soma.given, title: title.slice(0, MAX_TITLE), by: short(by), note: String(note).slice(0, 500),
      ludant: ludant.id, n, line: line.id, version: line.versions.length + 1,
      from: ludant.lineage?.from?.published ?? null, fromName: ludant.lineage?.from?.name ?? null, at: now(),
      copies: 0, soma: withoutLetters(ludant.soma), assets: ludant.assets ?? [], checked: look.checked,
      ...(look.why ? { hidden: { by: 'check', at: now(), note: look.why } } : {}),
    };
    await store.put('published', id, pub);
    if (look.why) {
      const fid = `f-${hex(4)}`;
      await store.put('flags', fid, { id: fid, at: now(), status: 'open', reason: 'check', note: look.why.replace(/^the publish check: /, ''), by: 'the publish check', ludant: ludant.id, published: id, image: null });
    }
    // Its picture is the ludant's latest, so a card can show what it looks like.
    const thumb = (await store.get('thumbs', `l-${ludant.id}`))?.file;
    const pic = thumb ? await art.get(thumb) : null;
    if (pic) await keepThumb(`p-${id}`, { bytes: pic.bytes, type: pic.type, ext: thumb.split('.').pop() });
    line.versions.push(id);
    line.updated = now();
    await store.put('lines', line.id, line);
    return { pub, ...(look.why ? { held: look.why } : {}) };
  }

  /** A copy that follows a line takes its newest version, keeping its own memory, letters
   *  and given name. A checkpoint first, so the update can be undone. -> the version, or null */
  async function catchUp(ludant) {
    if (!ludant.follows) return null;
    const head = await lineHead(ludant.follows.line);
    if (!head || head.id === ludant.follows.version) return null;
    await checkpoint(ludant, `before updating to ${head.by ?? 'its maker'}'s latest`, null);
    const sections = { ...head.soma.sections, memory: ludant.soma.sections?.memory ?? '' };
    if (ludant.soma.sections?.[LETTERS]) sections[LETTERS] = ludant.soma.sections[LETTERS];
    ludant.soma = { ...head.soma, given: ludant.soma.given, sections };
    ludant.assets = head.assets ?? [];
    ludant.follows = { ...ludant.follows, version: head.id };
    ludant.updated = now();
    await store.put('ludants', ludant.id, ludant);
    return head;
  }

  /** What a line is, for its owner's share panel and anyone with its link. */
  async function lineInfo(line) {
    const head = await lineHead(line.id);
    return { id: line.id, public: Boolean(line.public), by: line.by ?? null, followers: line.followers ?? 0, versions: line.versions.length,
      title: head?.title ?? null, given: head?.given ?? null, latest: head ? { id: head.id, at: head.at, version: head.version, by: head.by } : null };
  }

  /** A copy of a version, for the person asking. Taken through a line, it follows that line.
   *  The soma comes whole; the surfaces start fresh: what was said and sketched belonged to
   *  the people who were there. */
  async function copyFrom(pub, lineId, body, from) {
    ownedBy({}, from);
    limit('copy', from.ip, COPY_A_DAY, `that's ${COPY_A_DAY} copies from here today; more tomorrow`)();
    const id = newId(pub.given);
    const ludant = {
      id, soma: structuredClone(pub.soma), surfaces: {}, checkpoints: [], visitors: {}, fresh: true, created: now(), updated: now(),
      lineage: { from: { published: pub.id, name: pub.name, by: pub.by, ludant: pub.ludant, ...(lineId ? { line: lineId } : {}) }, takenBy: short(body.by) },
      ...(lineId ? { follows: { line: lineId, version: pub.id } } : {}),
    };
    await checkpoint(ludant, `as received: ${pub.name}`, short(body.by));
    ludant.assets = pub.assets ?? [];
    ownedBy(ludant, from);
    await store.put('ludants', id, ludant);
    pub.copies = (pub.copies ?? 0) + 1;
    await store.put('published', pub.id, pub);
    if (lineId) await countFollower(lineId, 1);
    return { id };
  }

  /** Publications from before lines: each ludant's become the versions of one public line,
   *  oldest first. Copies taken before don't follow (nobody knows what they've changed).
   *  Once, after the change (admin/lines); it skips what already has a line. */
  async function linesFromPublications() {
    const byLudant = new Map();
    for (const p of await store.list('published', { slim: true })) if (!p.line) byLudant.set(p.ludant, [...(byLudant.get(p.ludant) ?? []), p]);
    let made = 0;
    for (const [ludantId, pubs] of byLudant) {
      pubs.sort((x, y) => x.at.localeCompare(y.at));
      const ludant = await store.get('ludants', ludantId);
      const line = { id: `line-${hex(8)}`, ludant: ludantId, owner: ludant?.owner ?? null, by: pubs[0].by ?? null, public: true, versions: pubs.map((p) => p.id), followers: 0, created: pubs[0].at, updated: pubs.at(-1).at };
      await store.put('lines', line.id, line);
      for (const [i, slim] of pubs.entries()) {
        const p = await store.get('published', slim.id);
        await store.put('published', p.id, { ...p, line: line.id, version: i + 1 });
      }
      if (ludant && !ludant.abandoned && !ludant.line) await store.put('ludants', ludantId, { ...ludant, line: line.id });
      made++;
    }
    return { lines: made };
  }

  async function countFollower(lineId, by) {
    const line = await store.get('lines', lineId);
    if (line) { line.followers = Math.max(0, (line.followers ?? 0) + by); await store.put('lines', line.id, line); }
  }

  /** Whether its line's followers are behind it: it has changed since the last update it
   *  sent. -> { behind, followers } (nothing if it isn't shared) */
  async function behind(ludant) {
    if (!ludant.line) return {};
    const line = await store.get('lines', ludant.line);
    if (!line) return {};
    const last = line.versions.length ? await store.get('published', line.versions.at(-1)) : null;
    return { behind: !last || !sameGame(last.soma, ludant.soma), followers: line.followers ?? 0 };
  }

  /** Where a ludant stands, for its frame: the line it shares (and whether followers are
   *  behind), and the line it follows, if it does (or could go back to). */
  async function standing(ludant) {
    const out = {};
    if (ludant.line) {
      const line = await store.get('lines', ludant.line);
      if (line) out.line = { ...(await lineInfo(line)), ...(await behind(ludant)) };
    }
    const fromLine = ludant.lineage?.from?.line;
    if (fromLine) {
      const line = await store.get('lines', fromLine);
      const head = line ? await lineHead(fromLine) : null;
      out.follows = { line: fromLine, following: Boolean(ludant.follows), by: head?.by ?? ludant.lineage.from.by ?? null, title: head?.title ?? null };
    }
    return out;
  }

  // ---------- apparent CSAM: preserve it, take it down, and say what a report needs ----------

  /** A picture the CSAM Scanning Tool (or a person) matched: the file is moved out of the
   *  served art into the private archive (preserved, as the law asks, for 90 days or more),
   *  every ludant that used it is taken down (whole, preserved first) and every publication
   *  hidden, and the answer is what a CyberTipline report needs. Nothing is downloaded to
   *  whoever runs this. -> { id, file, ludants, publications, people, preservedAt } */
  async function csam({ file: given }) {
    const file = String(given ?? '').replace(/^https?:\/\/[^/]+\//, '').replace(/^art\//, '').replace(/^\//, '');
    if (!/^[at]\/[a-z0-9.-]+$/.test(file)) throw httpError(400, 'give the matched file\'s path, like a/1234abcd.jpg, or its URL');
    if (!settings.preserve) throw httpError(501, 'this install has nowhere private to preserve it');
    const id = `c-${hex(6)}`, at = now();
    const pic = await art.get(file);
    if (pic) await settings.preserve(`${id}/${file.replace('/', '-')}`, pic.bytes, pic.type);
    // Who used it: as art, or as a thumb.
    // A thumb's file is named for whose it is: t/<l|p>-<id>-<hash>.<ext>.
    const thumbKey = file.startsWith('t/') ? file.slice(2).replace(/-[0-9a-f]{12}\.[a-z]+$/, '') : null;
    const ludants = [], publications = [], people = new Map();
    for (const l of await store.list('ludants')) {
      if (l.abandoned) continue;
      if (!(l.assets ?? []).some((m) => m.file === file) && thumbKey !== `l-${l.id}`) continue;
      // The whole ludant goes into the archive before it's taken down: its soma, its art list,
      // its checkpoints (what's private stays sealed: nobody here can read it).
      const checkpoints = [];
      for (const cp of l.checkpoints ?? []) checkpoints.push({ ...cp, soma: (await store.get('checkpoints', `${l.id}-${cp.n}`))?.soma ?? null });
      await settings.preserve(`${id}/ludant-${l.id}.json`, new TextEncoder().encode(JSON.stringify({ ...l, checkpoints })), 'application/json');
      if (l.owner && !people.has(l.owner)) people.set(l.owner, (await store.get('people', l.owner))?.name ?? null);
      ludants.push({ id: l.id, name: nameOf(l.soma), owner: l.owner ?? null, created: l.created, updated: l.updated, lineage: l.lineage ?? {} });
      await letGo(l, { by: 'gactant', takenDown: true });
    }
    for (const p of await store.list('published')) {
      if (!(p.assets ?? []).some((m) => m.file === file) && thumbKey !== `p-${p.id}`) continue;
      await settings.preserve(`${id}/publication-${p.id}.json`, new TextEncoder().encode(JSON.stringify(p)), 'application/json');
      publications.push({ id: p.id, name: p.name, by: p.by, at: p.at });
      p.hidden = { by: 'csam', at, note: id };
      p.assets = (p.assets ?? []).filter((m) => m.file !== file);
      delete p.cleared;
      await store.put('published', p.id, p);
    }
    await art.remove(file);
    if (thumbKey && (await store.get('thumbs', thumbKey))?.file === file) await store.remove('thumbs', thumbKey);
    const record = { id, at, file, url: urlOf(file), type: pic?.type ?? null, bytes: pic?.bytes.length ?? 0, preservedAt: `preserved/${id}/`, ludants, publications,
      people: [...people].map(([pid, name]) => ({ id: pid, name })) };
    await store.put('preserved', id, record);
    ops.count('csam taken down');
    settings.opsLog?.({ csam: id, file });
    return record;
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
    limit('flag', from.person ?? from.ip, FLAGS_EACH_A_DAY, `that's ${FLAGS_EACH_A_DAY} reports from you today; more tomorrow`)();
    const reason = FLAG_REASONS.includes(body.reason) ? body.reason : 'other';
    const ludant = body.ludant ? safe(body.ludant) : null;
    const published = body.published ? safe(body.published) : null;
    if (!ludant && !published) throw httpError(400, 'a report says what it is about');
    const image = typeof body.image === 'string' && body.image.startsWith('data:image/') && body.image.length <= MAX_FLAG_IMAGE ? body.image : null;
    const id = `f-${hex(4)}`;
    // The matches the game was in, as the server knows them (who was playing, and how far it
    // had got when the report came), so the log can be read up to that point.
    const matches = [];
    for (const m of (Array.isArray(body.matches) ? body.matches : []).slice(0, 10)) {
      if (!/^m-[0-9a-f]{12}$/.test(String(m))) continue;
      const idx = await store.get('match-index', String(m));
      if (idx) matches.push({ id: idx.id, name: idx.name, rulebook: idx.rulebook, n: idx.n, players: Object.values(idx.members ?? {}), over: Boolean(idx.result) });
    }
    const doc = { id, at: now(), status: 'open', reason, note: String(body.note ?? '').slice(0, 1000), by: String(body.by || 'someone').slice(0, 40), person: from.person ?? null, ludant, published, image, ...(matches.length ? { matches } : {}) };
    await store.put('flags', id, doc);
    ops.count(`flag ${reason}`);
    settings.opsLog?.({ flag: reason, ludant, published });
    if (published) {
      const pub = await store.get('published', published);
      if (pub && !pub.hidden && !pub.cleared) {
        const open = (await store.list('flags', { slim: true })).filter((f) => f.published === published && f.status === 'open');
        // Different people, signed in: a name typed into a report is anyone's to type, so
        // reports without a person wait for a moderator instead of hiding anything.
        const people = open.filter((f) => f.person);
        const reporters = new Set(people.map((f) => f.person)).size;
        const strong = new Set(people.filter((f) => f.reason === 'illegal').map((f) => f.person)).size;
        if (strong >= 2 || reporters >= 3) { pub.hidden = { by: 'reports', at: now() }; await store.put('published', published, pub); }
      }
    }
    return { id };
  }

  // What one address has done today, for the daily limits. In memory only: an address is
  // never written down.
  const today = new Map();   // `${day} ${what} ${ip}` -> count
  function limit(what, ip, max, saying, amount = 1) {
    const day = now().slice(0, 10), k = `${day} ${what} ${ip ?? 'here'}`;
    if (!today.has(k)) for (const old of today.keys()) if (!old.startsWith(day)) today.delete(old);
    const n = today.get(k) ?? 0;
    if (n + amount > max) throw httpError(429, saying);
    return () => today.set(k, (today.get(k) ?? 0) + amount);   // count it once it's done
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
      if (verdict.flagged) return { checked: 'flagged', why: `the publish check: ${verdict.why}` };
      if (verdict.partly) { ops.count('check couldn\'t see every picture'); return { checked: 'unchecked' }; }
      return { checked: 'clean' };
    } catch (err) {
      await ops.trouble({ kind: 'server', where: 'publish check', message: err.message, sample: err.stack }).catch(() => {});
      return { checked: 'unchecked' };
    }
  }

  async function recheck(pub) {
    const look = await lookAt(pub, await picturesOf(`p-${pub.id}`, pub.assets));
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
    try {
      // A pass we don't know (run out, or signed by a secret from before a restart): say so,
      // rather than answer as if to a stranger, so the page renews it and asks again.
      if (from.pass && !from.person) throw httpError(401, 'sign in first (your pass may have expired)');
      return await answer(method, parts, body, query, from);
    }
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
    const tabled = await tables.route(method, parts, body, query, from);
    if (tabled !== undefined) return tabled;
    if (a === 'events' && method === 'POST') return ops.events(body);
    if (a === 'flags' && method === 'POST') return flag(body, from);
    if (a === 'admin' && (b === 'flags' || b === 'moderate' || b === 'csam' || b === 'preserved' || b === 'lines') && method === 'POST') {
      if (!isAdmin(settings, body.token)) throw httpError(403, 'not allowed');
      if (b === 'moderate') return moderate(body);
      if (b === 'csam') return csam(body);
      if (b === 'lines') return linesFromPublications();
      if (b === 'preserved') return (await store.list('preserved')).sort((x, y) => y.at.localeCompare(x.at));
      const all = (await store.list('flags')).sort((x, y) => y.at.localeCompare(x.at));
      return body.all ? all.slice(0, 200) : all.filter((f) => f.status === 'open');
    }
    // Owners, for whoever runs the install: which ludants have one, and a key for one that
    // doesn't (a ludant from before owners). An owned ludant's key is never replaced here.
    if (a === 'admin' && (b === 'owners' || b === 'own' || b === 'people') && method === 'POST') {
      if (!isAdmin(settings, body.token)) throw httpError(403, 'not allowed');
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
    // Once, when sealing began: every ludant's private surfaces from before, gone for good.
    if (a === 'admin' && b === 'wipe-unsealed' && method === 'POST') {
      if (!isAdmin(settings, body.token)) throw httpError(403, 'not allowed');
      let wiped = 0;
      for (const l of await store.list('ludants')) {
        const surfaces = l.surfaces ?? {};
        if (Object.keys(surfaces).every((k) => SEALED_SURFACES.has(k))) continue;
        await store.put('ludants', l.id, { ...l, surfaces: Object.fromEntries(Object.entries(surfaces).filter(([k]) => SEALED_SURFACES.has(k))) });
        wiped++;
      }
      return { wiped };
    }
    if (a === 'admin' && b === 'ops' && method === 'POST') {
      if (!isAdmin(settings, body.token)) throw httpError(403, 'not allowed');
      return { ...(await ops.read({ days: Number(body.days) || 2 })), held: [...holds.keys()].length, storage: await store.size?.(), flagsOpen: (await store.list('flags')).filter((f) => f.status === 'open').length };
    }
    if (a === 'config') return { version: settings.version ?? null, model, hasKey: Boolean(key), logs: !isPublic, public: isPublic, sandbox: settings.sandbox || '' };
    if (a === 'infer' && method === 'POST') {
      if (!from.person) throw httpError(401, 'sign in first');
      return infer(body);
    }
    if (a === 'log' && b && method === 'POST') { if (!isPublic) await log(safe(b), { ...body, last: summarize(body.last) }); return {}; }
    if (a === 'log' && b) return isPublic ? [] : tail(safe(b), Number(query.get('n')) || 20);
    // A device's check: what its browser can do (controllers, voice, pictures across the
    // sandbox). Saved as it goes, so whoever is building can read it without anyone relaying.
    if (a === 'reports' && method === 'POST') {
      limit('device-report', from.ip, DEVICE_REPORTS_A_DAY, 'that\'s enough device checks from here today')();
      const report = body.report ?? {};
      if (JSON.stringify(report).length > MAX_REPORT) throw httpError(413, 'report too big');
      const id = body.id && /^r-[a-f0-9]{8}$/.test(body.id) && await store.get('reports', body.id) ? body.id : `r-${hex(4)}`;
      await store.put('reports', id, { id, at: now(), report });
      return { id };
    }
    // Problems ludants reported (tools/issues.mjs): the newest, in brief, or one whole by id.
    if (a === 'admin' && b === 'issues' && method === 'POST') {
      if (!isAdmin(settings, body.token)) throw httpError(403, 'not allowed');
      if (body.id) {
        const issue = await read('issues', String(body.id));
        if (body.status) issue.status = String(body.status).slice(0, 40);
        // A reply: kept on the report, and waiting for the ludant as a letter its frame writes into its soma.
        if (body.reply) {
          const reply = { id: `r-${hex(4)}`, at: now(), text: String(body.reply).slice(0, 8000) };
          issue.replies = [...(issue.replies ?? []), reply];
          issue.thread = [...(issue.thread ?? []), { at: reply.at, from: 'admins', text: reply.text, reply: reply.id }];
          const ludant = await store.get('ludants', issue.ludant);
          if (ludant && !ludant.abandoned) {
            ludant.mail = [...(ludant.mail ?? []), { id: reply.id, issue: issue.id, title: issue.title, at: reply.at, text: reply.text }];
            await store.put('ludants', ludant.id, ludant);
          }
        }
        if (body.status || body.reply) await store.put('issues', issue.id, issue);
        return issue;
      }
      return (await store.list('issues')).filter((i) => body.all || i.status === 'open').sort((x, y) => y.at.localeCompare(x.at)).slice(0, Number(body.n) || 20)
        .map(({ id, at, status, ludant, name, by, title, wrong, thread }) => ({ id, at, status, ludant, name, by, title, wrong: wrong.slice(0, 300), ...(thread?.length ? { thread: thread.length } : {}) }));
    }
    if (a === 'admin' && b === 'reports' && method === 'POST') {
      if (!isAdmin(settings, body.token)) throw httpError(403, 'not allowed');
      return (await store.list('reports')).sort((x, y) => y.at.localeCompare(x.at)).slice(0, Number(body.n) || 10);
    }
    // Once (2026-10-28): art and thumbs were data URLs in the store; they move to the art
    // store, n ludants and publications at a time, until nothing is left (tools/migrate-art.mjs).
    if (a === 'admin' && b === 'migrate-art' && method === 'POST') {
      if (!isAdmin(settings, body.token)) throw httpError(403, 'not allowed');
      const n = Math.max(1, Number(body.n) || 20);
      let moved = 0, owners = 0, missing = 0;
      for (const [kind, prefix] of [['ludants', 'l'], ['published', 'p']]) {
        for (const doc of await store.list(kind)) {
          const old = (doc.assets ?? []).filter((m) => !m.file);
          if (!old.length || owners >= n) continue;
          owners++;
          for (const m of old) {
            const kept = await store.get('assets', `${prefix}-${doc.id}-${m.name}`);
            if (kept?.image) Object.assign(m, await keepArt(kept.image)), moved++;
            else missing++;
          }
          doc.assets = doc.assets.filter((m) => m.file);
          await store.put(kind, doc.id, doc);
          for (const m of old) await store.remove('assets', `${prefix}-${doc.id}-${m.name}`);
        }
      }
      for (const [kind, prefix] of [['ludants', 'l'], ['published', 'p']]) {
        for (const doc of await store.list(kind)) {
          const t = await store.get('thumbs', `${prefix}-${doc.id}`);
          if (!t?.image) continue;
          try { await keepThumb(`${prefix}-${doc.id}`, pictureOf(t.image, MAX_THUMB * 2)); moved++; } catch { await store.remove('thumbs', `${prefix}-${doc.id}`); missing++; }
        }
      }
      const left = [...await store.list('ludants'), ...await store.list('published')].filter((d) => (d.assets ?? []).some((m) => !m.file)).length;
      // Pictures nothing listed any more (removed art was never deleted) go with the kind.
      if (!left) await store.drop?.('assets');
      return { moved, missing, left };
    }
    if (a === 'admin' && b === 'import' && method === 'POST') {
      if (!isAdmin(settings, body.token)) throw httpError(403, 'not allowed');
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
      return { url: urlOf((await store.get('thumbs', `${b}-${safe(c)}`))?.file) };
    }

    if (a === 'ludants') {
      if (!b && method === 'GET') {
        // mine=1: every ludant the person asking owns, whichever device they made it on. A
        // public install lists nothing else: anyone else's unpublished ludant is reached by its link.
        let found;
        if (query.get('mine')) found = from.person ? (await store.list('ludants', { slim: true })).filter((l) => l.owner === from.person && !l.abandoned) : [];
        else found = isPublic ? [] : (await store.list('ludants', { slim: true })).filter((l) => !l.abandoned);
        return found.map(summary).sort((x, y) => (y.updated || '').localeCompare(x.updated || ''));
      }
      if (!b && method === 'POST') {
        ownedBy({}, from);   // refused before anything is counted or written
        const counted = limit('seed', from.ip, SEED_A_DAY, `that's ${SEED_A_DAY} new ludants from here today; more tomorrow`);
        counted();
        const by = short(body.by);
        const given = await freshGiven();
        const id = newId(given);
        const ludant = { id, soma: seedSoma(given, by), surfaces: {}, checkpoints: [], visitors: {}, lineage: { seededBy: by }, fresh: true, created: now(), updated: now() };
        ownedBy(ludant, from);
        await checkpoint(ludant, 'as seeded', by);
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
        const familyNames = (await store.list('published', { slim: true })).filter((p) => p.given === ludant.soma?.given).map((p) => p.name);
        const { stats, owner, ownedAt, mail, ...rest } = ludant;
        // What was said, sketched and saved is for its owners (every device with its key).
        // Anyone else with the link sees what a copy would get: its game and its art.
        if (!owns(ludant, from)) {
          return { ...rest, surfaces: rest.surfaces?.stage ? { stage: rest.surfaces.stage } : {}, visitors: {}, familyNames, yours: false, unclaimed: !ludant.owner };
        }
        // A copy following a line takes its newest version as it's opened.
        const updated = !holdState(b) ? await catchUp(ludant) : null;
        const fresh = updated ? await store.get('ludants', b) : null;
        const shown = fresh ? (({ stats: _s, owner: _o, ownedAt: _a, mail: _m, ...r }) => r)(fresh) : rest;
        return { ...shown, surfaces: kept(shown.surfaces), familyNames, yours: true, mail: mail ?? [], ...(await standing(fresh ?? ludant)),
          ...(updated ? { updatedTo: { version: updated.version, by: updated.by, at: updated.at, note: updated.note || null } } : {}) };
      }
      if (!c && method === 'PUT') {
        await requireHold(ludant, body, from);
        if (isPublic && Object.keys(body.surfaces ?? {}).some((k) => !SEALED_SURFACES.has(k))) throw httpError(400, 'what\'s private is sealed before it\'s saved here; reload the page to get the version that does');
        const size = JSON.stringify(body.soma).length + JSON.stringify(body.surfaces).length;
        if (size > MAX_LUDANT) throw httpError(413, `too big to keep: ${size} characters of soma and surfaces (the limit is ${MAX_LUDANT})`);
        // Its given name is the server's to give (it's how families are told apart), and a
        // title is a name, not a document.
        const soma = { ...body.soma, given: ludant.soma.given };
        if (soma.sections && typeof soma.sections.title === 'string') soma.sections = { ...soma.sections, title: soma.sections.title.slice(0, MAX_TITLE) };
        // A copy following a line changes its game only once its person has said yes (the
        // frame asks, and says so: madeOwn). Then it's its own, and stops following.
        let follows = ludant.follows;
        if (follows) {
          const at = await store.get('published', follows.version);
          if (at && !sameGame(at.soma, soma)) {
            if (!body.madeOwn) throw httpError(423, 'this game follows another person\'s version: changing it needs its person\'s OK first (reload the page)', { following: true });
            follows = undefined;
            await countFollower(ludant.follows.line, -1);
          }
        }
        const next = { ...ludant, soma, surfaces: body.surfaces, fresh: false, updated: now() };
        if (follows) next.follows = follows; else delete next.follows;
        await store.put('ludants', b, next);
        return await behind(next);
      }
      if (c === 'hold' && method === 'POST') {
        // A ludant from before owners belongs to nobody until it's claimed (admin/own): no
        // one can change it in the meantime, so no one can take it by opening it first.
        if (!owns(ludant, from)) throw notYours(ludant);
        const h = holdState(b);
        if (h && h.token !== body.token && !body.takeOver) throw httpError(409, `${h.who} is holding this ludant in another window`, { heldBy: h.who, since: h.since, quietFor: Date.now() - h.seen, sameDevice: Boolean(h.device && h.device === from.device) });
        holds.set(b, { token: body.token, who: String(body.who || 'someone').slice(0, 40), since: h?.token === body.token ? h.since : now(), seen: Date.now(), device: from.device ?? null });
        return { held: true, tookFrom: h && h.token !== body.token ? h.who : null };
      }
      if (c === 'heartbeat' && method === 'POST') {
        await requireHold(ludant, body, from);
        // Play time can't run faster than the clock: no more than has passed since its last beat.
        const last = beats.get(b) ?? 0, nowMs = Date.now();
        beats.set(b, nowMs);
        await played(b, Math.min(Number(body.seconds) || 0, (nowMs - last) / 1000), Number(body.spent) || 0);
        return { held: true, mail: ludant.mail?.length ?? 0 };
      }
      // Art: pictures made for the ludant, kept apart from it (they're big) and listed on it.
      if (c === 'assets' && method === 'GET') {
        return (ludant.assets ?? []).filter((m) => m.file).map(({ file, ...m }) => ({ ...m, url: urlOf(file) }));
      }
      if (c === 'assets' && method === 'POST') {
        await requireHold(ludant, body, from);
        const name = assetName(body.name);
        const list = (ludant.assets ?? []).filter((m) => m.name !== name);
        if (list.length >= MAX_ASSETS) throw httpError(413, `a ludant keeps up to ${MAX_ASSETS} pictures; remove one first`);
        const kept = list.reduce((n, m) => n + (m.bytes ?? 0), 0);
        const size = pictureOf(body.image, MAX_ASSET).bytes.length;
        if (kept + size > ART_BUDGET) throw httpError(413, `its pictures would be over the ${Math.round(ART_BUDGET / 1e6)} MB a ludant keeps (${Math.round(kept / 1e6)} MB now); remove some first, or make smaller ones`);
        // Art is kept by what's in it and never overwritten, so uploads are counted by the day.
        limit('art-bytes', from.person, ART_BYTES_A_DAY, `that's all the pictures you can add today (${Math.round(ART_BYTES_A_DAY / 1e6)} MB); more tomorrow`, size)();
        const { file, bytes } = await keepArt(body.image);
        const meta = { name, w: Number(body.w) || 0, h: Number(body.h) || 0, prompt: String(body.prompt ?? '').slice(0, 1000), by: String(body.by ?? '').slice(0, 60), at: now(), bytes, file };
        ludant.assets = [...list, meta];
        await store.put('ludants', b, ludant);
        const { file: _, ...shown } = meta;
        return { ...shown, url: urlOf(file) };
      }
      if (c === 'unasset' && method === 'POST') {
        await requireHold(ludant, body, from);
        const name = assetName(body.name);
        ludant.assets = (ludant.assets ?? []).filter((m) => m.name !== name);
        await store.put('ludants', b, ludant);
        return { removed: name };
      }
      // A ludant reporting the person with it: no card to approve (that would be the person
      // reported), the recent chat goes with it, and the person is told it was sent
      // (surfaces/admins.js). It joins the ⚑ reports, for tools/moderate.mjs.
      if (c === 'report-person' && method === 'POST') {
        await requireHold(ludant, body, from);
        const counted = limit('report-person', b, PERSON_REPORTS_A_DAY, `that's ${PERSON_REPORTS_A_DAY} reports about people from this ludant today`);
        const what = String(body.what ?? '').trim().slice(0, 4000);
        if (!what) throw httpError(400, 'say what happened');
        // What was said goes with it only if the person chooses (report-person-evidence).
        const chat = [], image = null;
        const id = `f-${hex(4)}`;
        const named = from.person ? (await store.get('people', from.person))?.name ?? null : null;
        await store.put('flags', id, { id, at: now(), status: 'open', reason: 'person', from: 'ludant', note: what, why: String(body.why ?? '').slice(0, 2000),
          by: nameOf(ludant.soma), ludant: b, published: null, person: from.person ?? null, personName: named, who: String(body.who ?? '').slice(0, 60), chat, image });
        counted();
        ops.count('flag person');
        settings.opsLog?.({ flag: 'person', ludant: b });
        return { id };
      }
      // The person a ludant reported chose to send the recent chat and a picture with it.
      if (c === 'report-person-evidence' && method === 'POST') {
        await requireHold(ludant, body, from);
        const f = await store.get('flags', safe(body.id));
        if (!f || f.ludant !== b || f.from !== 'ludant' || f.chat?.length || f.image) throw httpError(404, 'no report waiting for that');
        f.chat = (Array.isArray(body.chat) ? body.chat : []).slice(-REPORTED_CHAT).map((m) => ({ who: String(m?.who ?? '').slice(0, 60), text: String(m?.text ?? '').slice(0, 2000), at: m?.at ?? null }));
        f.image = typeof body.image === 'string' && body.image.startsWith('data:image/') && body.image.length <= MAX_FLAG_IMAGE ? body.image : null;
        await store.put('flags', f.id, f);
        return { added: true };
      }
      // Letters from the admins waiting for it; took: the ones its frame has written into its soma.
      if (c === 'mail' && method === 'GET') { if (!owns(ludant, from)) throw notYours(ludant); return ludant.mail ?? []; }
      if (c === 'mail' && method === 'POST') {
        await requireHold(ludant, body, from);
        const took = new Set((body.took ?? []).map(String));
        ludant.mail = (ludant.mail ?? []).filter((m) => !took.has(m.id));
        await store.put('ludants', b, ludant);
        for (const m of await store.list('issues')) {
          if (m.ludant !== b || !m.replies?.some((x) => took.has(x.id))) continue;
          for (const x of m.replies) if (took.has(x.id)) x.delivered = now();
          await store.put('issues', m.id, m);
        }
        return { mail: ludant.mail.length };
      }
      // A ludant telling the admins about a problem, sent by its person (surfaces/admins.js).
      // about: one of its reports, to answer the admins on it (the thread goes on there).
      if (c === 'issue' && method === 'POST' && body.about) {
        await requireHold(ludant, body, from);
        const issue = await read('issues', String(body.about));
        if (issue.ludant !== b) throw httpError(404, 'that report isn\'t one of this ludant\'s');
        const counted = limit('issue', from.person ?? from.ip, ISSUES_A_DAY, `that's ${ISSUES_A_DAY} reports today; more tomorrow`);
        const text = String(body.wrong ?? body.text ?? '').trim().slice(0, 4000);
        if (!text) throw httpError(400, 'say something');
        issue.thread = [...(issue.thread ?? []), { at: now(), from: 'ludant', by: String(body.by ?? '').slice(0, 40), text, ...(body.soma ? { soma: body.soma } : {}) }];
        if (JSON.stringify(issue).length > MAX_ISSUE * 1.5) throw httpError(413, 'that report is too big');
        issue.status = 'open';
        await store.put('issues', issue.id, issue);
        counted();
        settings.opsLog?.({ trouble: 'issue answered', where: b, issue: issue.id });
        return { id: issue.id };
      }
      if (c === 'issue' && method === 'POST') {
        await requireHold(ludant, body, from);
        const counted = limit('issue', from.person ?? from.ip, ISSUES_A_DAY, `that's ${ISSUES_A_DAY} reports today; more tomorrow`);
        const text = (k, max) => String(body[k] ?? '').slice(0, max);
        const issue = { id: `i-${hex(4)}`, at: now(), status: 'open', ludant: b, name: nameOf(ludant.soma), person: from.person ?? null, by: text('by', 40),
          title: text('title', 120), trying: text('trying', 2000), wrong: text('wrong', 4000), tried: text('tried', 2000),
          soma: body.soma ?? null, table: body.table ?? null, doings: Array.isArray(body.doings) ? body.doings : [] };
        if (!issue.title || !issue.wrong) throw httpError(400, 'a report needs a title and what went wrong');
        if (JSON.stringify(issue).length > MAX_ISSUE) throw httpError(413, 'that report is too big');
        await store.put('issues', issue.id, issue);
        counted();
        settings.opsLog?.({ trouble: 'issue reported', where: b, issue: issue.id, title: issue.title });
        return { id: issue.id };
      }
      if (c === 'thumb' && method === 'POST') {
        await requireHold(ludant, body, from);
        const p = pictureOf(body.image, MAX_THUMB);
        await keepThumb(`l-${b}`, p);
        // A publication without a picture takes its first player's, while their copy is
        // still exactly what was published.
        const source = ludant.lineage?.from?.published;
        if (source && !(await store.get('thumbs', `p-${source}`))) {
          const pub = await store.get('published', source);
          if (pub && sameBody(pub.soma, ludant.soma)) await keepThumb(`p-${source}`, p);
        }
        return {};
      }
      if (c === 'release' && method === 'POST') {
        if (holds.get(b)?.token === body.token) holds.delete(b);
        await writePlay(b);
        return {};
      }
      // Sharing: its line, made the first time (with a first version), and whether it's in
      // the lobby. A public game needs a title.
      if (c === 'share' && method === 'POST') {
        await requireHold(ludant, body, from);
        let line = ludant.line ? await store.get('lines', ludant.line) : null;
        if (!line) {
          line = { id: `line-${hex(8)}`, ludant: b, owner: ludant.owner ?? null, by: short(body.by), public: false, versions: [], followers: 0, created: now() };
          ludant.line = line.id;
          await store.put('ludants', b, ludant);
          await store.put('lines', line.id, line);
        }
        if (typeof body.public === 'boolean') {
          if (body.public && !titleSlug(ludant.soma.sections?.title)) throw httpError(400, 'a game in the lobby needs a title first');
          line.public = body.public;
          await store.put('lines', line.id, line);
        }
        let held = null;
        if (!line.versions.length) ({ held } = await newVersion(ludant, line, { by: body.by, note: body.note }, from));
        return { ...(await lineInfo(line)), ...(held ? { held } : {}) };
      }
      // Send an update: a new version on its line, for everyone following it.
      if (c === 'update' && method === 'POST') {
        await requireHold(ludant, body, from);
        const line = ludant.line ? await store.get('lines', ludant.line) : null;
        if (!line) throw httpError(404, 'it isn\'t shared yet');
        const { held } = await newVersion(ludant, line, { by: body.by, note: body.note }, from);
        return { ...(await lineInfo(line)), ...(held ? { held } : {}) };
      }
      // Go back to following the line it came from: its game becomes that line's newest again
      // (its memory stays). Its person says so (the frame asks).
      if (c === 'follow' && method === 'POST') {
        await requireHold(ludant, body, from);
        const target = ludant.lineage?.from?.line;
        if (!target || !await store.get('lines', target)) throw httpError(404, 'it didn\'t come from a shared game it could follow');
        if (ludant.follows) return { following: true };
        ludant.follows = { line: target, version: null };
        await countFollower(target, 1);
        const head = await catchUp(ludant);
        return { following: true, version: head?.version ?? null };
      }
      // Someone sits down. Remember them, and keep the ludant as it was right now, so
      // whatever changes while they're here can be undone.
      if (c === 'copy' && method === 'POST') {
        ownedBy({}, from);
        limit('copy', from.ip, COPY_A_DAY, `that's ${COPY_A_DAY} copies from here today; more tomorrow`)();
        const id = newId(ludant.soma.given);
        const copy = {
          id, soma: withoutLetters(ludant.soma), surfaces: {}, checkpoints: [], visitors: {}, fresh: true, created: now(), updated: now(),
          lineage: { from: { ludant: b, name: nameOf(ludant.soma) }, takenBy: short(body.by) },
        };
        await checkpoint(copy, `copied from ${nameOf(ludant.soma)}`, short(body.by));
        copy.assets = ludant.assets ?? [];   // the same files: art is named by what's in it
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
        const n = await checkpoint(ludant, String(body.label ?? '').slice(0, 120), short(body.by));
        await store.put('ludants', b, ludant);
        return { n };
      }
      if (c === 'restore' && method === 'POST') {
        await requireHold(ludant, body, from);
        const cp = ludant.checkpoints.find((x) => x.n === Number(body.n));
        const soma = cp && await checkpointSoma(ludant, cp.n);
        if (!soma) throw httpError(404, `no checkpoint ${body.n}`);
        if (ludant.follows) {
          if (!body.madeOwn) throw httpError(423, 'this game follows another person\'s version: going back makes it your own (the frame asks first)', { following: true });
          await countFollower(ludant.follows.line, -1);
          delete ludant.follows;
        }
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
    // A shared game, by its link: what it is (for the card before taking a copy), and a copy.
    if (a === 'lines' && b) {
      const line = await read('lines', b);
      const head = await lineHead(line.id);
      if (!head) throw httpError(404, 'nothing has been shared on this link yet, or it has been taken down');
      if (!c && method === 'GET') {
        const thumb = (await store.get('thumbs', `p-${head.id}`))?.file;
        return { ...(await lineInfo(line)), note: head.note || null, picture: urlOf(thumb ?? null) };
      }
      if (c === 'copy' && method === 'POST') return copyFrom(head, line.id, body, from);
    }
    if (a === 'published') {
      if (!b && method === 'GET') {
        // Trusted: a person cleared it, or it passed the publish check (on an install with
        // one) and nobody has reported it. The lobby's front rows show only these, to
        // everyone, as soon as they're up; a report takes one off until a person looks.
        const reported = new Set((await store.list('flags', { slim: true })).filter((f) => f.status !== 'dismissed').map((f) => f.published));
        const trusted = (p) => Boolean(p.cleared) || (!reported.has(p.id) && (p.checked === 'clean' || !settings.check));
        // A public game is its line's newest version that nobody's hidden; private games and
        // older versions aren't listed.
        const open = new Set((await store.list('lines')).filter((l) => l.public).map((l) => l.id));
        const newest = new Map();
        for (const p of await store.list('published', { slim: true })) {
          if (p.hidden || !open.has(p.line)) continue;
          if (!newest.has(p.line) || p.version > newest.get(p.line).version) newest.set(p.line, p);
        }
        return [...newest.values()].map(({ soma, stats, play, assets, cleared, checked, ...p }) => ({ ...p, copies: p.copies ?? 0, cost: perHour(play), trusted: trusted({ ...p, cleared, checked }) }))
          .sort((x, y) => y.at.localeCompare(x.at));
      }
      if (!b && method === 'POST') throw httpError(410, 'games are shared now (POST ludants/<id>/share), not published one snapshot at a time');
      const pub = await read('published', b);
      if (pub.hidden) throw httpError(451, `${pub.name} has been taken down`, { hidden: true });
      if (!c && method === 'GET') { const { soma, stats, play, ...meta } = pub; return { ...meta, cost: perHour(play) }; }
      // An old link to one version: a copy of its game's newest, following it.
      if (c === 'copy' && method === 'POST') return copyFrom(pub.line ? (await lineHead(pub.line)) ?? pub : pub, pub.line ?? null, body, from);
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
    for (const l of await store.list('ludants', { slim: true })) {
      if (l.abandoned || (l.checkpoints?.length ?? 0) > 1 || holds.has(l.id)) continue;
      // Nobody came back: no save and no sitting since (playing doesn't always save).
      const last = Math.max(Date.parse(l.updated || l.created), ...Object.values(l.visitors ?? {}).map((v) => Date.parse(v.last) || 0));
      const idle = Date.now() - last;
      const copy = Boolean(l.lineage?.from);
      if (idle < (copy ? UNTOUCHED_COPY_MS : UNTOUCHED_SEED_MS)) continue;
      for (const cp of l.checkpoints ?? []) await store.remove('checkpoints', `${l.id}-${cp.n}`);
      await dropThumb(`l-${l.id}`);
      await store.remove('ludants', l.id);
      cleared++;
    }
    for (const f of await store.list('flags', { slim: true })) if (f.status !== 'open' && Date.now() - Date.parse(f.closed ?? f.at) > 90 * 86400_000) await store.remove('flags', f.id);
    const reports = (await store.list('reports', { slim: true })).sort((x, y) => y.at.localeCompare(x.at));
    for (const r of reports.slice(200)) await store.remove('reports', r.id);
    if (cleared) ops.count('tidy cleared', cleared);
    // Matches over for an hour, or idle for a month, go to the archive.
    const swept = settings.matches ? await tables.sweep().catch((err) => ({ error: err.message })) : null;
    return { cleared, swept };
  }

  return { route, checkSome, tidy, flush: () => ops.flush(true), whoIs: (pass) => people.whoIs(pass) };
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
// and OpenRouter, embed only the sandbox, and can't be framed by anyone else. Hosted, they
// also let in Cloudflare's Web Analytics beacon (which Cloudflare adds to each page itself).
export function pageHeaders(sandboxOrigin = '', https = false, artBase = '', host = '') {
  const analytics = https ? { script: ' https://static.cloudflareinsights.com', connect: ' https://cloudflareinsights.com' } : { script: '', connect: '' };
  // Pictures from their own domain when hosted (see the art store): shown, and read into canvases.
  const pictures = /^https?:\/\//.test(artBase) ? ` ${new URL(artBase).origin}` : '';
  // Matches followed live, over a WebSocket to this site: named, since not every browser
  // counts ws: and wss: as 'self'.
  const sockets = host ? ` ${https ? 'wss' : 'ws'}://${host}` : '';
  return {
    'Content-Security-Policy': [
      "default-src 'self'",
      `script-src 'self'${analytics.script}`,
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob:${pictures}`,
      `connect-src 'self'${sockets} https://openrouter.ai${analytics.connect}${pictures}`,
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

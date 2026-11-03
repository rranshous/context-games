// Tables: games many ludants play together, whatever each of them looks like. The rules
// live here, not in any ludant, so every fork that plays the same rulebook plays the same
// game, and only the rules decide what's legal.
//
//   draft      a rulebook being written: private to its owner, still changing, and tried
//              out with practice runs that report what every call did and cost
//   rulebook   a draft locked: frozen, and named by the hash of its source. The hash is
//              how anyone refers to it, and always means exactly those rules
//   match      one run of a rulebook, kept apart from everything else (match.mjs): hosted,
//              each is a Durable Object of its own, so a slow rulebook only slows its own
//              match. The World keeps an index of them, decides who may act, and checks
//              every signature before a match hears of it. The World never runs a rule.
//
// Every action is signed by the device of the person taking it (match.mjs has the text), so
// the log is a chain anyone can check: tools/check-match.mjs. A match that's over (after an
// hour) or idle for ARCHIVE_IDLE_DAYS is archived, its log whole, and its object deleted;
// the index keeps its summary, and its log is still there to check.
//
// Hosts give the World settings.matches and settings.archive:
//   matches: { op(ref, name, body), practice(person, body), check(person, source), archive(ref)
//              -> summary, ids?() -> [match ids] }       ref: a match id, or { object } (hosted)
//   archive: { put(id, doc), get(id) -> doc | null }
//
// API (JSON, under /api; reading a rulebook or a match needs no pass, the rest does)
//   GET  drafts                          -> [{ id, name, updated }]          yours
//   POST drafts { name, source, from? }  -> { id }                          from: a rulebook hash to start from
//   GET  drafts/<id>                     -> { id, name, source, updated, missing, lastTry }
//   PUT  drafts/<id> { name?, source }   -> { missing }                     missing: rule functions not defined yet
//   POST drafts/<id>/try { seed?, options?, steps: [{ do: join|move, as, data }] }
//                                        -> { ok, init, steps: [{ ok, refused?, broken?, error?, line?, view, result,
//                                             steps, stateSize, viewSize }], state, weight, warnings, limits, budget }
//                                           a practice run; as is a made-up player name. Nothing is kept
//   POST drafts/<id>/lock                -> { rulebook, weight }            the hash; weight from the last practice run
//   POST drafts/<id>/remove              -> {}
//   GET  rulebooks/<hash>                -> { id, name, source, by, at, from, weight }
//   GET  rulebooks/<hash>/matches        -> [{ id, at, updated, n, over, players, view }]   newest first; view: an onlooker's
//   GET  rulebooks/<hash>/standings?n=20 -> { rulebook, name, matches, players: [{ rank, id, name, wins, losses, draws,
//                                             played, last }], you }   every match of it that ended with winners,
//                                           whichever ludant it was played through; you: your line, if you're on it
//   POST matches { rulebook, options? }  -> { id, n, head }                 a new match, nobody in it yet
//   GET  matches/<id>?after=<n>          -> { id, rulebook, name, at, n, head, view, result, you, last, archived? }
//                                           view: yours. With after, it waits (up to 50 seconds) until the
//                                           match has more than n actions. Hosted, the Worker takes this
//                                           straight to the match, and does the waiting itself (up to 25
//                                           seconds, asking every 3), since an object is billed while it waits.
//   GET  matches/<id>/log?from=0         -> { id, rulebook, seed, options, genesis, n, head, result, log, keys, more }
//                                           keys: each signing device's public key (JWK), by device id
//   POST matches/<id>/act { kind: join|move, data, n, prev, signature?, ludant? }
//                                        -> { n, head, view, result, budget }   409 if n or prev aren't the latest;
//                                           422 { refused } if the rules said no; 429 past a budget
//   GET  tables/budget                   -> yours today: what's used and what's allowed
//   POST admin/sweep { token, objects? } -> { archived, kept }   archive what's due, and any match the index
//                                           doesn't know (objects: Durable Object ids, from the account's list)
//
// Actions are public (anyone can read the log, to check it). Anything secret, like a dealt
// hand, belongs in the state, made from the seed, and shown only through view.

import { MAX_STEPS } from './rules.mjs';
import { limits as matchLimits, signedText } from './match.mjs';

const MAX_SOURCE = 60_000;          // characters in a rulebook
const MAX_ACTION = 4_000;           // characters of JSON in one action, and in a match's options
const MAX_DRAFTS = 50;              // drafts one person keeps
// What one person may do in a day, and at once. Counted in memory: a restart forgives.
const LOCKS_A_DAY = 30;
const PRACTICE_A_DAY = 300;
const MATCHES_A_DAY = 30;           // matches opened
const ACTIONS_A_DAY = 3_000;
const ACTIONS_A_MINUTE = 60;
const STEPS_A_DAY = 50_000;         // steps of rules run for them, practice included
const OPEN_AT_ONCE = 10;            // matches they're in that aren't over
// The whole install in a day, so tables can't take the rest of the site down with them.
const WORLD_ACTIONS_A_DAY = 20_000;
const WORLD_MATCHES_A_DAY = 2_000;
const ARCHIVE_OVER_MS = 3600_000;   // a match that's over is archived after this
const ARCHIVE_IDLE_DAYS = 30;       // any match nobody acted in for this long is archived
const LISTED = 30;                  // matches listed for a rulebook
const STANDING = 5_000;             // people a rulebook's standings keep (the least recent go first)
const SHOWN = 100;                  // people standings show at most

const enc = new TextEncoder();
const sha = async (s) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(String(s)))), (b) => b.toString(16).padStart(2, '0')).join('');
const unb64u = (s) => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const hex = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('');
const now = () => new Date().toISOString();
const name40 = (s, or) => String(s ?? '').trim().slice(0, 40) || or;

export { signedText };
export { genesisText } from './match.mjs';

export function createTables({ store, people, httpError, owns, settings }) {
  const host = settings.matches, archive = settings.archive;
  const need = (from) => { if (!from.person) throw httpError(401, 'sign in first (your pass may have expired)'); return from; };
  const read = async (kind, id) => {
    if (!/^[a-z0-9-]{4,80}$/.test(String(id))) throw httpError(400, 'bad id');
    const doc = await store.get(kind, id);
    if (!doc) throw httpError(404, `no ${kind === 'match-index' ? 'match' : kind.replace(/s$/, '')} ${id}`);
    return doc;
  };
  const source = (s) => { s = String(s ?? ''); if (s.length > MAX_SOURCE) throw httpError(413, `a rulebook is up to ${MAX_SOURCE} characters`); return s; };
  const missing = async (person, s) => { try { return await host.check(person, s); } catch (err) { return [`(it doesn't run: ${err.message})`]; } };
  /** A match's answer, passed on: its code and words, or the error as it was. */
  const fromMatch = async (p) => { try { return await p; } catch (err) { throw err.code ? httpError(err.code, err.message, err.extra) : err; } };

  // ---------- budgets: per person per day, and the whole install ----------

  const used = new Map();   // `${day} ${what} ${who}` -> count
  const day = () => now().slice(0, 10);
  const minute = () => now().slice(0, 16);
  const tally = (what, who, at = day()) => used.get(`${at} ${what} ${who}`) ?? 0;
  const add = (what, who, n = 1, at = day()) => {
    const k = `${at} ${what} ${who}`;
    if (!used.has(k) && used.size > 5000) for (const old of used.keys()) if (!old.startsWith(day())) used.delete(old);
    used.set(k, (used.get(k) ?? 0) + n);
  };
  const within = (what, who, max, saying, at) => { if (tally(what, who, at) >= max) throw httpError(429, saying, { budget: budget(who) }); };
  function budget(person) {
    return {
      steps: { used: tally('steps', person), allowed: STEPS_A_DAY },
      actions: { used: tally('actions', person), allowed: ACTIONS_A_DAY, perMinute: ACTIONS_A_MINUTE },
      matches: { opened: tally('matches', person), allowed: MATCHES_A_DAY, openAtOnce: OPEN_AT_ONCE },
      practice: { used: tally('practice', person), allowed: PRACTICE_A_DAY },
      locks: { used: tally('locks', person), allowed: LOCKS_A_DAY },
      ...matchLimits(), rulebookSize: MAX_SOURCE, actionSize: MAX_ACTION,
    };
  }
  const steps = (person, n) => { add('steps', person, n || 0); settings.count?.('table steps', n || 0); };
  const enoughSteps = (person) => within('steps', person, STEPS_A_DAY, `that's the ${STEPS_A_DAY} steps of rules you may run in a day; more tomorrow`);

  async function myDraft(id, from) {
    const d = await read('drafts', id);
    if (d.owner !== need(from).person) throw httpError(404, `no draft ${id}`);   // drafts are private: someone else's isn't there
    return d;
  }

  // ---------- the index: what the World knows of each match ----------

  const indexed = (idx, sum) => Object.assign(idx, {
    n: sum.n, head: sum.head, updated: sum.updated ?? idx.updated, result: sum.result ?? null,
    members: sum.members ?? idx.members, onlooker: 'onlooker' in sum ? sum.onlooker : idx.onlooker ?? null,
  });
  const listed = (idx) => ({ id: idx.id, at: idx.at, updated: idx.updated, n: idx.n, over: Boolean(idx.result), players: Object.values(idx.members ?? {}), view: idx.onlooker ?? null, ...(idx.archived ? { archived: true } : {}) });
  async function openAtOnce(person) {
    return (await store.list('match-index')).filter((m) => m.members?.[person] !== undefined && !m.result && !m.archived).length;
  }

  async function act(id, body, from) {
    need(from);
    const idx = await read('match-index', id);
    if (idx.archived) throw httpError(410, 'this match is over and archived; its log is still there to read', { archived: true });
    const kind = body.kind;
    if (kind !== 'join' && kind !== 'move') throw httpError(400, 'an action is a join or a move');
    const n = Number(body.n), prev = String(body.prev ?? '');
    const data = body.data ?? null;
    if (JSON.stringify(data).length > MAX_ACTION) throw httpError(413, `an action is up to ${MAX_ACTION} characters of JSON`);
    const person = from.person;
    within('actions', person, ACTIONS_A_DAY, `that's the ${ACTIONS_A_DAY} actions you may take in a day; more tomorrow`);
    within('actions-minute', person, ACTIONS_A_MINUTE, `that's ${ACTIONS_A_MINUTE} actions in a minute; slow down a little`, minute());
    within('actions', 'world', WORLD_ACTIONS_A_DAY, 'tables are resting for today: the whole site has played as much as it can; tomorrow');
    enoughSteps(person);
    if (kind === 'join' && idx.members?.[person] === undefined && await openAtOnce(person) >= OPEN_AT_ONCE) {
      throw httpError(429, `you're in ${OPEN_AT_ONCE} matches that aren't over; finish or leave one first`, { budget: budget(person) });
    }
    // The signature, by the device the pass names, before the match hears of it.
    const key = await people.deviceKey(person, from.device);
    if (key) {
      let ok = false;
      try { ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, unb64u(body.signature ?? ''), enc.encode(signedText({ match: id, n, prev, kind, data }))); } catch {}
      if (!ok) throw httpError(401, 'that action isn\'t signed by this device');
    }
    let through = null;
    if (body.ludant) {
      const l = await store.get('ludants', String(body.ludant));
      if (!l || !owns(l, from)) throw httpError(403, 'you play through a ludant of your own');
      through = { id: l.id, name: `${l.soma?.given ?? ''}${l.soma?.sections?.title ? `-${l.soma.sections.title}` : ''}` };
    }
    let out;
    try {
      out = await fromMatch(host.op(id, 'act', { kind, data, n, prev, signature: key ? String(body.signature) : null, device: from.device, player: { id: person, name: from.name }, through }));
    } catch (err) { if (err.extra?.steps) steps(person, err.extra.steps); throw err; }
    steps(person, out.steps);
    add('actions', person); add('actions-minute', person, 1, minute()); add('actions', 'world');
    settings.count?.('table actions');
    const before = await read('match-index', id);
    if (!before.result && out.result) await ended(before.rulebook, out.result, out.members);
    await store.put('match-index', id, indexed(before, out));
    return { n: out.n, head: out.head, view: out.view, result: out.result, ...(out.viewError ? { viewError: out.viewError } : {}), budget: budget(person) };
  }

  // ---------- standings: per rulebook, from every match of it that ended ----------

  /** A match just ended: count it, if its result names who won (winners: [player ids], []
   *  for a draw). Everyone who took part and didn't win lost; nobody won, everybody drew. */
  async function ended(rulebook, result, members) {
    if (!Array.isArray(result?.winners)) return;
    const s = (await store.get('standings', rulebook)) ?? { rulebook, matches: 0, players: {} };
    const won = new Set(result.winners.map(String));
    for (const [person, name] of Object.entries(members ?? {})) {
      const p = s.players[person] ??= { name, wins: 0, losses: 0, draws: 0 };
      p.name = name ?? p.name;
      if (!won.size) p.draws++;
      else if (won.has(person)) p.wins++;
      else p.losses++;
      p.last = now();
    }
    s.matches++;
    s.updated = now();
    const ids = Object.keys(s.players);
    if (ids.length > STANDING) for (const id of ids.sort((a, b) => s.players[a].last.localeCompare(s.players[b].last)).slice(0, ids.length - STANDING)) delete s.players[id];
    await store.put('standings', rulebook, s);
    settings.count?.('table matches ended');
  }

  /** Most wins first; then the fewest losses; then the most played. */
  function ranked(s) {
    return Object.entries(s?.players ?? {}).map(([id, p]) => ({ id, ...p, played: p.wins + p.losses + p.draws }))
      .sort((a, b) => b.wins - a.wins || a.losses - b.losses || b.played - a.played || a.name?.localeCompare?.(b.name))
      .map((p, i) => ({ rank: i + 1, ...p }));
  }

  /** A match moved to the archive: its log whole, its object gone, its summary kept. */
  async function archived(idx, ref = idx.id) {
    const sum = await host.archive(ref);
    if (sum) indexed(idx, sum);
    idx.archived = now();
    await store.put('match-index', idx.id, idx);
    settings.count?.('table matches archived');
  }

  async function route(method, [a, b, c], body, query, from) {
    if (a === 'drafts') {
      need(from);
      if (!b && method === 'GET') {
        return (await store.list('drafts')).filter((d) => d.owner === from.person).map(({ id, name, updated }) => ({ id, name, updated })).sort((x, y) => y.updated.localeCompare(x.updated));
      }
      if (!b && method === 'POST') {
        const mine = (await store.list('drafts')).filter((d) => d.owner === from.person).length;
        if (mine >= MAX_DRAFTS) throw httpError(413, `you keep up to ${MAX_DRAFTS} drafts; remove one first`);
        let src = source(body.source);
        if (body.from) src = (await read('rulebooks', String(body.from))).source;
        const id = `d-${hex(6)}`;
        await store.put('drafts', id, { id, owner: from.person, name: name40(body.name, 'untitled rules'), source: src, from: body.from ?? null, created: now(), updated: now() });
        return { id };
      }
      const d = await myDraft(b, from);
      if (!c && method === 'GET') return { ...d, owner: undefined, missing: await missing(from.person, d.source) };
      if (!c && method === 'PUT') {
        d.source = source(body.source ?? d.source);
        if (body.name != null) d.name = name40(body.name, d.name);
        d.updated = now();
        await store.put('drafts', d.id, d);
        return { missing: await missing(from.person, d.source) };
      }
      if (c === 'try' && method === 'POST') {
        within('practice', from.person, PRACTICE_A_DAY, `that's ${PRACTICE_A_DAY} practice runs today; more tomorrow`);
        enoughSteps(from.person);
        const run = await fromMatch(host.practice(from.person, { source: d.source, seed: body.seed, options: body.options ?? {}, steps: Array.isArray(body.steps) ? body.steps : [] }));
        const spent = (run.init?.steps ?? 0) + run.steps.reduce((n, s) => n + (s.steps ?? 0), 0);
        steps(from.person, spent);
        add('practice', from.person);
        // What it weighed, kept with the draft while its source stays the same, for locking.
        if (run.weight) { d.lastTry = { weight: run.weight, of: await sha(d.source), at: now() }; await store.put('drafts', d.id, d); }
        return { ...run, budget: budget(from.person) };
      }
      if (c === 'lock' && method === 'POST') {
        const gaps = await missing(from.person, d.source);
        if (gaps.length) throw httpError(422, `it needs ${gaps.join(', ')} first`, { missing: gaps });
        const run = await fromMatch(host.practice(from.person, { source: d.source, steps: [] }));
        if (!run.ok) throw httpError(422, `init fails: ${run.init?.error}`);
        const id = await sha(d.source);
        const weight = d.lastTry?.of === id ? d.lastTry.weight : null;
        if (!(await store.get('rulebooks', id))) {
          within('locks', from.person, LOCKS_A_DAY, `that's ${LOCKS_A_DAY} rulebooks locked today; more tomorrow`);
          add('locks', from.person);
          await store.put('rulebooks', id, { id, name: d.name, source: d.source, by: from.name ?? null, owner: from.person, from: d.from ?? null, weight, at: now() });
        }
        return { rulebook: id, weight };
      }
      if (c === 'remove' && method === 'POST') { await store.remove('drafts', d.id); return {}; }
    }

    if (a === 'rulebooks' && b && method === 'GET') {
      const rb = await read('rulebooks', b);
      if (!c) { const { owner, ...shown } = rb; return shown; }
      if (c === 'standings') {
        const all = ranked(await store.get('standings', rb.id));
        const n = Math.min(SHOWN, Math.max(1, Number(query.get('n')) || 20));
        const mine = from.person ? all.find((p) => p.id === from.person) ?? null : null;
        return { rulebook: rb.id, name: rb.name, matches: (await store.get('standings', rb.id))?.matches ?? 0, players: all.slice(0, n), you: mine };
      }
      if (c === 'matches') {
        return (await store.list('match-index')).filter((m) => m.rulebook === rb.id)
          .sort((x, y) => (y.updated ?? y.at).localeCompare(x.updated ?? x.at)).slice(0, LISTED).map(listed);
      }
    }

    if (a === 'tables' && b === 'budget' && method === 'GET') return budget(need(from).person);

    if (a === 'admin' && b === 'sweep' && method === 'POST') {
      if (!settings.adminToken || body.token !== settings.adminToken) throw httpError(403, 'not allowed');
      return sweep(body.objects);
    }

    if (a === 'matches') {
      if (!b && method === 'POST') {
        need(from);
        const rb = await read('rulebooks', String(body.rulebook ?? ''));
        within('matches', from.person, MATCHES_A_DAY, `that's ${MATCHES_A_DAY} matches opened today; more tomorrow`);
        within('matches', 'world', WORLD_MATCHES_A_DAY, 'tables are resting for today: the whole site has opened as many matches as it can; tomorrow');
        const options = body.options && typeof body.options === 'object' ? body.options : {};
        if (JSON.stringify(options).length > MAX_ACTION) throw httpError(413, `options are up to ${MAX_ACTION} characters of JSON`);
        enoughSteps(from.person);
        const id = `m-${hex(6)}`, seed = crypto.getRandomValues(new Uint32Array(1))[0];
        const made = await fromMatch(host.op(id, 'create', { id, rulebook: rb.id, name: rb.name, source: rb.source, seed, options }));
        steps(from.person, made.steps);
        add('matches', from.person); add('matches', 'world');
        settings.count?.('table matches opened');
        await store.put('match-index', id, indexed({ id, rulebook: rb.id, name: rb.name, by: from.person, at: now(), genesis: made.genesis }, made));
        return { id, n: 0, head: made.head };
      }
      const idx = await read('match-index', b);
      if (!c && method === 'GET') {
        if (idx.archived) return { ...listed(idx), rulebook: idx.rulebook, name: idx.name, head: idx.head, result: idx.result, you: Boolean(from.person && idx.members?.[from.person] !== undefined), last: null };
        return fromMatch(host.op(b, 'look', { person: from.person ?? null, after: query.get('after') }));
      }
      if (c === 'log' && method === 'GET') {
        let m;
        if (idx.archived) {
          const doc = await archive.get(idx.id);
          if (!doc) throw httpError(404, 'this match\'s archive is missing');
          const start = Math.max(0, Number(query.get('from')) || 0);
          const { source, ...kept } = doc;
          m = { ...kept, log: doc.log.slice(start, start + 1000), more: start + 1000 < doc.log.length };
        } else m = await fromMatch(host.op(b, 'log', { from: query.get('from') }));
        // The public key of each device that signed, so anyone can check the signatures. (A
        // device its person has since removed is gone, and so is its key.)
        const keys = {};
        for (const e of m.log) if (e?.signature && !(e.device in keys)) keys[e.device] = await people.publicKey(e.player.id, e.device);
        return { ...m, keys };
      }
      if (c === 'act' && method === 'POST') return act(b, body, from);
    }
    return undefined;
  }

  /** Archive what's due: over for an hour, or idle for ARCHIVE_IDLE_DAYS. With objects (the
   *  account's list of match objects, hosted) or the host's own list, anything the index has
   *  never heard of is archived too, so nothing lingers unknown. Hourly, and tools/sweep-matches.mjs. */
  async function sweep(objects) {
    let done = 0, kept = 0;
    const index = await store.list('match-index');
    for (const idx of index) {
      if (idx.archived) continue;
      const idle = Date.now() - Date.parse(idx.updated ?? idx.at);
      if ((idx.result && idle > (settings.archiveOverMs ?? ARCHIVE_OVER_MS)) || idle > ARCHIVE_IDLE_DAYS * 86400_000) {
        try { await archived(idx); done++; } catch (err) { settings.opsLog?.({ trouble: 'archiving a match', match: idx.id, message: err.message }); }
      } else kept++;
    }
    const known = new Set(index.map((m) => m.id));
    const strays = objects ? objects.map((object) => ({ object })) : host.ids ? (await host.ids()).filter((id) => !known.has(id)) : [];
    for (const ref of strays) {
      try {
        // The account's list has every match object: ask which match it is, and leave the
        // ones the index knows (they were handled above). An empty object is just emptied.
        const seen = await host.op(ref, 'look', {}).catch((err) => { if (err.code === 404) return null; throw err; });
        if (seen && known.has(seen.id)) continue;
        const sum = await host.archive(ref);
        if (!sum?.id) { done++; continue; }
        await store.put('match-index', sum.id, indexed({ id: sum.id, rulebook: sum.rulebook, name: sum.name, at: sum.at, genesis: sum.genesis, archived: now(), stray: true }, sum));
        done++;
      } catch (err) { settings.opsLog?.({ trouble: 'sweeping a match', ref, message: err.message }); }
    }
    return { archived: done, kept };
  }

  return { route, sweep };
}

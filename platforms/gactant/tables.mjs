// Tables: games many ludants play together, whatever each of them looks like. The rules
// live here, not in any ludant (rules.mjs runs them), so every fork that plays the same
// rulebook plays the same game, and only the rules decide what's legal.
//
//   draft      a rulebook being written: private to its owner, still changing, and tried
//              out with practice runs
//   rulebook   a draft locked: frozen, and named by the hash of its source. The hash is
//              how anyone refers to it, and always means exactly those rules
//   match      one run of a rulebook: its seed, and a log of signed actions (joins and
//              moves). Its state is what the rules made of the log. Each action is its own
//              document (`actions`, `<match>-<n>`), so a long match never makes one big one
//
// Every action is signed by the device of the person taking it, over the match, its
// number, the hash of the log before it, and the action, so the log is a chain anyone can
// check: replay it from the rulebook and the seed. (A device that keeps a secret instead of
// a key, on a local install over plain http, can't sign; its actions say so.)
//
// API (JSON, under /api; all but reading a rulebook or a match need a pass)
//   GET  drafts                          -> [{ id, name, updated }]          yours
//   POST drafts { name, source, from? }  -> { id }                          from: a rulebook hash to start from
//   GET  drafts/<id>                     -> { id, name, source, updated, missing }
//   PUT  drafts/<id> { name?, source }   -> { missing }                     missing: rule functions not defined yet
//   POST drafts/<id>/try { seed?, options?, steps: [{ do: join|move, as, data }] }
//                                        -> { steps: [{ ok, error?, view }], state, result }   a practice run;
//                                           as is a made-up player name (players are { id: as, name: as })
//   POST drafts/<id>/lock                -> { rulebook }                    the hash
//   POST drafts/<id>/remove              -> {}
//   GET  rulebooks/<hash>                -> { id, name, source, by, at, from }
//   GET  rulebooks/<hash>/matches        -> [{ id, at, n, over, view }]     newest first; view is an onlooker's
//   POST matches { rulebook, options? }  -> { id, n, head }                 a new match, nobody in it yet
//   GET  matches/<id>?after=<n>          -> { id, rulebook, name, at, n, head, view, result, you, last }   view: yours;
//                                           last: the latest action { kind, by, through, data }. With after, it
//                                           waits (up to 25 seconds) until the match has more than n actions
//
// Actions are public (anyone can read the log, to check it). Anything secret, like a dealt
// hand, belongs in the state, made from the seed, and shown only through view.
//   GET  matches/<id>/log?from=0         -> { id, rulebook, seed, options, genesis, n, head, result, log, keys, more }
//                                           to check it (tools/check-match.mjs); up to 1000 actions at a time;
//                                           keys: each signing device's public key (JWK), by device id
//   POST matches/<id>/act { kind: join|move, data, n, prev, signature?, ludant? }
//                                        -> { n, head, view, result }       409 if n or prev aren't the latest;
//                                           422 { refused } if the rules said no
//
// The text a device signs (signedText below), base64url ECDSA P-256 SHA-256:
//   gactant/act/v1 \n match \n n \n prev \n kind \n JSON(data)
// and an entry's hash, which the next entry's prev names: sha256(that text \n signature).
// The first prev is the match's genesis: sha256(gactant/match/v1 \n id \n rulebook \n seed \n JSON(options)).

import { RULE_FUNCTIONS, RuleError } from './rules.mjs';

const MAX_SOURCE = 60_000;       // characters in a rulebook
const MAX_STATE = 200_000;       // characters of JSON in a match's state
const MAX_ACTIONS = 20_000;      // actions in one match
const MAX_DRAFTS = 50;           // drafts one person keeps
const MAX_STEPS = 60;            // steps in a practice run
const MATCHES_A_DAY = 100;       // matches one address may open in a day
const LOCKS_A_DAY = 30;          // rulebooks one person may lock in a day
const LISTED = 30;               // matches listed for a rulebook
const WAIT_MS = 25_000;          // how long a look waits for something to happen

const enc = new TextEncoder();
const sha = async (s) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(String(s)))), (b) => b.toString(16).padStart(2, '0')).join('');
const unb64u = (s) => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const hex = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('');
const now = () => new Date().toISOString();
const name40 = (s, or) => String(s ?? '').trim().slice(0, 40) || or;

export const signedText = ({ match, n, prev, kind, data }) => ['gactant/act/v1', match, n, prev, kind, JSON.stringify(data ?? null)].join('\n');
export const genesisText = ({ id, rulebook, seed, options }) => ['gactant/match/v1', id, rulebook, seed, JSON.stringify(options ?? {})].join('\n');

export function createTables({ store, loadRules, people, httpError, limit, owns }) {
  let rules = null, loading = null;   // QuickJS, loaded the first time a table is used
  const waiting = new Map();   // match id -> Set of wake functions: looks waiting for its next action
  const wake = (id) => { for (const w of waiting.get(id) ?? []) w(); waiting.delete(id); };
  const changed = (id) => new Promise((resolve) => {
    const done = () => { clearTimeout(timer); waiting.get(id)?.delete(done); resolve(); };
    const timer = setTimeout(done, WAIT_MS);
    if (!waiting.has(id)) waiting.set(id, new Set());
    waiting.get(id).add(done);
  });
  const locks = new Map();   // match id -> the promise of its last action, so actions on one match go one at a time
  const inTurn = (id, fn) => {
    const run = (locks.get(id) ?? Promise.resolve()).then(fn, fn);
    locks.set(id, run.catch(() => {}));
    return run;
  };
  const need = (from) => { if (!from.person) throw httpError(401, 'sign in first (your pass may have expired)'); return from; };
  const read = async (kind, id) => {
    if (!/^[a-z0-9-]{4,80}$/.test(String(id))) throw httpError(400, 'bad id');
    const doc = await store.get(kind, id);
    if (!doc) throw httpError(404, `no ${kind.replace(/s$/, '')} ${id}`);
    return doc;
  };
  const source = (s) => { s = String(s ?? ''); if (s.length > MAX_SOURCE) throw httpError(413, `a rulebook is up to ${MAX_SOURCE} characters`); return s; };
  const missing = (s) => { try { return rules.check(s); } catch (err) { return [`(it doesn't run: ${err.message})`]; } };
  /** The rules, and what they said: a refusal is the rules' answer, anything else is the rulebook broken. */
  const call = (src, fn, args) => {
    try { return { value: rules.call(src, fn, args) }; } catch (err) {
      if (err instanceof RuleError) return { error: err.message, broken: err.kind === 'broken' };
      throw err;
    }
  };
  const playerOf = (from) => ({ id: from.person, name: from.name });
  const actionId = (match, n) => `${match}-${String(n).padStart(6, '0')}`;

  async function myDraft(id, from) {
    const d = await read('drafts', id);
    if (d.owner !== need(from).person) throw httpError(404, `no draft ${id}`);   // drafts are private: someone else's isn't there
    return d;
  }

  /** Who's in a match, by what its view says to an onlooker; the summary a list shows. */
  function summary(match, rulebook) {
    const v = call(rulebook.source, 'view', [match.state, null]);
    return { id: match.id, at: match.at, n: match.n, over: Boolean(match.result), view: v.error ? null : v.value };
  }

  async function act(match, body, from) {
    need(from);
    const kind = body.kind;
    if (kind !== 'join' && kind !== 'move') throw httpError(400, 'an action is a join or a move');
    const n = Number(body.n), prev = String(body.prev ?? '');
    const data = body.data ?? null;
    if (JSON.stringify(data).length > 4000) throw httpError(413, 'an action is small');
    // Checked before taking the match's turn: the signature, by the device the pass names.
    const text = signedText({ match: match.id, n, prev, kind, data });
    const key = await people.deviceKey(from.person, from.device);
    if (key) {
      let ok = false;
      try { ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, unb64u(body.signature ?? ''), enc.encode(text)); } catch {}
      if (!ok) throw httpError(401, 'that action isn\'t signed by this device');
    }
    let through = null;
    if (body.ludant) {
      const l = await store.get('ludants', String(body.ludant));
      if (!l || !owns(l, from)) throw httpError(403, 'you play through a ludant of your own');
      through = { id: l.id, name: `${l.soma?.given ?? ''}${l.soma?.sections?.title ? `-${l.soma.sections.title}` : ''}` };
    }
    return inTurn(match.id, async () => {
      const m = await read('matches', match.id);
      const rulebook = await read('rulebooks', m.rulebook);
      if (n !== m.n || prev !== m.head) throw httpError(409, 'the match moved on: act on its latest', { n: m.n, head: m.head });
      if (m.n >= MAX_ACTIONS) throw httpError(413, 'this match is as long as a match gets');
      if (m.result && kind === 'move') throw httpError(422, 'the match is over', { refused: 'the match is over' });
      const player = playerOf(from);
      const out = call(rulebook.source, kind, [m.state, player, data]);
      if (out.error) throw httpError(422, `${out.broken ? 'the rules broke: ' : ''}${out.error}`, { refused: out.error, broken: out.broken });
      if (JSON.stringify(out.value ?? null).length > MAX_STATE) throw httpError(413, 'the rules made a state too big to keep');
      const r = call(rulebook.source, 'result', [out.value]);
      const signature = key ? String(body.signature) : null;
      const entry = { n, kind, data, player, through, device: from.device, at: now(), prev, signature, hash: await sha(`${text}\n${signature ?? 'unsigned'}`) };
      await store.put('actions', actionId(m.id, n), entry);
      m.n = n + 1;
      m.head = entry.hash;
      if (!m.members.includes(player.id)) m.members.push(player.id);
      m.state = out.value;
      m.result = r.error ? null : r.value ?? null;
      m.updated = now();
      await store.put('matches', m.id, m);
      wake(m.id);
      const v = call(rulebook.source, 'view', [m.state, player]);
      return { n: m.n, head: m.head, view: v.error ? null : v.value, result: m.result };
    });
  }

  async function route(method, [a, b, c], body, query, from) {
    if (!['drafts', 'rulebooks', 'matches'].includes(a)) return undefined;
    rules ??= await (loading ??= loadRules());
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
      if (!c && method === 'GET') return { ...d, owner: undefined, missing: missing(d.source) };
      if (!c && method === 'PUT') {
        d.source = source(body.source ?? d.source);
        if (body.name != null) d.name = name40(body.name, d.name);
        d.updated = now();
        await store.put('drafts', d.id, d);
        return { missing: missing(d.source) };
      }
      if (c === 'try' && method === 'POST') {
        const steps = Array.isArray(body.steps) ? body.steps.slice(0, MAX_STEPS) : [];
        const init = call(d.source, 'init', [Number(body.seed) || 1, body.options ?? {}]);
        if (init.error) return { error: `init: ${init.error}`, steps: [] };
        let state = init.value;
        const out = [];
        for (const s of steps) {
          const player = { id: String(s.as ?? 'someone'), name: String(s.as ?? 'someone') };
          const r = call(d.source, s.do === 'join' ? 'join' : 'move', [state, player, s.data ?? null]);
          if (!r.error) state = r.value;
          const v = call(d.source, 'view', [state, player]);
          out.push({ ok: !r.error, ...(r.error ? { error: r.error } : {}), view: v.error ? `view: ${v.error}` : v.value });
        }
        const r = call(d.source, 'result', [state]);
        return { steps: out, state, result: r.error ? `result: ${r.error}` : r.value ?? null };
      }
      if (c === 'lock' && method === 'POST') {
        const gaps = missing(d.source);
        if (gaps.length) throw httpError(422, `it needs ${gaps.join(', ')} first`, { missing: gaps });
        const init = call(d.source, 'init', [1, {}]);
        if (init.error) throw httpError(422, `init fails: ${init.error}`);
        const id = await sha(d.source);
        if (!(await store.get('rulebooks', id))) {
          limit('lock', from.person, LOCKS_A_DAY, `that's ${LOCKS_A_DAY} rulebooks locked today; more tomorrow`)();
          await store.put('rulebooks', id, { id, name: d.name, source: d.source, by: from.name ?? null, owner: from.person, from: d.from ?? null, at: now() });
        }
        return { rulebook: id };
      }
      if (c === 'remove' && method === 'POST') { await store.remove('drafts', d.id); return {}; }
    }

    if (a === 'rulebooks' && b && method === 'GET') {
      const rb = await read('rulebooks', b);
      if (!c) { const { owner, ...shown } = rb; return shown; }
      if (c === 'matches') {
        const ms = (await store.list('matches')).filter((m) => m.rulebook === rb.id).sort((x, y) => (y.updated ?? y.at).localeCompare(x.updated ?? x.at)).slice(0, LISTED);
        return ms.map((m) => summary(m, rb));
      }
    }

    if (a === 'matches') {
      if (!b && method === 'POST') {
        need(from);
        const rb = await read('rulebooks', String(body.rulebook ?? ''));
        const counted = limit('match', from.ip, MATCHES_A_DAY, `that's ${MATCHES_A_DAY} matches from here today; more tomorrow`);
        const options = body.options && typeof body.options === 'object' ? body.options : {};
        if (JSON.stringify(options).length > 4000) throw httpError(413, 'options are small');
        const id = `m-${hex(6)}`, seed = crypto.getRandomValues(new Uint32Array(1))[0];
        const init = call(rb.source, 'init', [seed, options]);
        if (init.error) throw httpError(422, `the rules couldn't start a match: ${init.error}`);
        const genesis = await sha(genesisText({ id, rulebook: rb.id, seed, options }));
        await store.put('matches', id, { id, rulebook: rb.id, seed, options, genesis, by: from.person, at: now(), updated: now(), n: 0, head: genesis, members: [], state: init.value, result: null });
        counted();
        return { id, n: 0, head: genesis };
      }
      let m = await read('matches', b);
      if (!c && method === 'GET') {
        const after = query.get('after');
        if (after != null && m.n <= Number(after)) { await changed(m.id); m = await read('matches', b); }
        const rb = await read('rulebooks', m.rulebook);
        const latest = m.n ? await store.get('actions', actionId(m.id, m.n - 1)) : null;
        const player = from.person ? playerOf(from) : null;
        const v = call(rb.source, 'view', [m.state, player]);
        return { id: m.id, rulebook: m.rulebook, name: rb.name, at: m.at, n: m.n, head: m.head, view: v.error ? null : v.value, result: m.result, you: Boolean(player && m.members.includes(player.id)), last: latest && { kind: latest.kind, by: latest.player.name, through: latest.through?.name ?? null, data: latest.data } };
      }
      if (c === 'log' && method === 'GET') {
        const from_ = Math.max(0, Number(query.get('from')) || 0), upto = Math.min(m.n, from_ + 1000);
        const log = [];
        for (let i = from_; i < upto; i++) log.push(await store.get('actions', actionId(m.id, i)));
        // The public key of each device that signed, so anyone can check the signatures. (A
        // device its person has since removed is gone, and so is its key.)
        const keys = {};
        for (const e of log) if (e?.signature && !(e.device in keys)) keys[e.device] = await people.publicKey(e.player.id, e.device);
        const { state, by, members, ...kept } = m;
        return { ...kept, log, keys, more: upto < m.n };
      }
      if (c === 'act' && method === 'POST') return act(m, body, from);
    }
    return undefined;
  }

  return { route, RULE_FUNCTIONS };
}

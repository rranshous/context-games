// One match, kept apart from everything else: its rulebook (a copy of the source, which the
// rulebook's hash pins), its state, and its log of signed actions. Hosted, each match is a
// Durable Object of its own (worker.mjs, Match), so a slow rulebook only slows its own
// match; locally, createLocalMatches below keeps them all in the one Node process. Either
// way the World (tables.mjs) decides who may act and checks their signatures first; a match
// only runs its rules and keeps its log.
//
// Kept in the match's own store:
//   match/it        { id, rulebook, name, source, seed, options, genesis, at, updated, n, head,
//                     members: { person: name }, state, result }
//   actions/<n>     { n, kind, data, player, through, device, at, prev, signature, hash }
//
// Ops (a host calls match.op(name, body)):
//   create { id, rulebook, name, source, seed, options }   -> summary
//   act { kind, data, n, prev, signature, device, player, through } -> { ...summary, view, steps }
//   look { person?, after? }    -> { id, rulebook, name, at, n, head, view, result, you, last }
//                                  (after: waits up to WAIT_MS for more than `after` actions)
//   log { from? }               -> { id, rulebook, seed, options, genesis, n, head, result, log, more }
//   export                      -> the whole match, log included (to archive it)
// A summary is what the World's index keeps: { n, head, updated, result, members, onlooker }
// (onlooker: the rules' view for nobody in particular, if it's small).
//
// The text a device signs, base64url ECDSA P-256 SHA-256:
//   gactant/act/v1 \n match \n n \n prev \n kind \n JSON(data)
// An entry's hash, which the next entry's prev names: sha256(that text \n signature, or 'unsigned').
// The first prev is the genesis: sha256(gactant/match/v1 \n id \n rulebook \n seed \n JSON(options)).

import { MAX_STEPS, RuleError } from './rules.mjs';

export const MAX_STATE = 200_000;     // characters of JSON in a match's state
export const MAX_VIEW = 50_000;       // characters of JSON in one view
export const MAX_ACTIONS = 20_000;    // actions in one match
const MAX_ONLOOKER = 4_000;           // an onlooker's view small enough to list with the match
const WAIT_MS = 50_000;               // how long a look waits for something to happen
const PRACTICE_STEPS = 60;            // actions in one practice run

const enc = new TextEncoder();
const sha = async (s) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(String(s)))), (b) => b.toString(16).padStart(2, '0')).join('');
const now = () => new Date().toISOString();
const pad = (n) => String(n).padStart(6, '0');
const size = (v) => (v === undefined ? 0 : JSON.stringify(v).length);

export const signedText = ({ match, n, prev, kind, data }) => ['gactant/act/v1', match, n, prev, kind, JSON.stringify(data ?? null)].join('\n');
export const genesisText = ({ id, rulebook, seed, options }) => ['gactant/match/v1', id, rulebook, seed, JSON.stringify(options ?? {})].join('\n');

/** An error the host passes on as an answer: code, message, and anything else to say. */
export const answer = (code, message, extra) => Object.assign(new Error(message), { code, extra });

/** What a rules call said, as the people at the table should hear it. */
function said(err) {
  if (!(err instanceof RuleError)) throw err;
  const where = err.line ? ` (line ${err.line}${err.column ? `, column ${err.column}` : ''})` : '';
  return { refused: err.kind === 'refused', broken: err.kind === 'broken', error: `${err.message}${err.kind === 'broken' ? where : ''}`, ...(err.line ? { line: err.line, column: err.column } : {}), steps: err.steps };
}

/** A match, over its own store ({ get(kind, id), put(kind, id, doc), remove(kind, id) }). */
export function createMatch({ store, rules }) {
  const waiting = new Set();   // looks waiting for the next action
  const wake = () => { for (const w of waiting) w(); waiting.clear(); };
  const changed = () => new Promise((resolve) => {
    const done = () => { clearTimeout(timer); waiting.delete(done); resolve(); };
    const timer = setTimeout(done, WAIT_MS);
    waiting.add(done);
  });
  let turn = Promise.resolve();   // actions go one at a time
  const inTurn = (fn) => { const run = turn.then(fn, fn); turn = run.catch(() => {}); return run; };

  const it = async () => { const m = await store.get('match', 'it'); if (!m) throw answer(404, 'no such match here', { gone: true }); return m; };
  const viewOf = (m, player) => {
    try {
      const { value, steps } = rules.call(m.source, 'view', [m.state, player]);
      return size(value) > MAX_VIEW ? { view: null, steps, error: `the view is too big to send (over ${MAX_VIEW} characters)` } : { view: value, steps };
    } catch (err) { const s = said(err); return { view: null, steps: s.steps, error: `view: ${s.error}` }; }
  };
  const summary = (m) => {
    const o = viewOf(m, null);
    return { n: m.n, head: m.head, updated: m.updated, result: m.result, members: m.members, onlooker: size(o.view) <= MAX_ONLOOKER ? o.view : null };
  };
  const playerFor = (m, person) => (person && m.members[person] ? { id: person, name: m.members[person] } : person ? { id: person, name: null } : null);

  const ops = {
    async create({ id, rulebook, name, source, seed, options }) {
      if (await store.get('match', 'it')) throw answer(409, 'that match already exists');
      let init;
      try { init = rules.call(source, 'init', [seed, options ?? {}]); } catch (err) { throw answer(422, `the rules couldn't start a match: ${said(err).error}`); }
      if (size(init.value) > MAX_STATE) throw answer(413, `the rules started a state too big to keep (over ${MAX_STATE} characters)`);
      const genesis = await sha(genesisText({ id, rulebook, seed, options }));
      const m = { id, rulebook, name, source, seed, options: options ?? {}, genesis, at: now(), updated: now(), n: 0, head: genesis, members: {}, state: init.value, result: null };
      await store.put('match', 'it', m);
      return { ...summary(m), genesis, steps: init.steps };
    },

    act(body) {
      return inTurn(async () => {
        const m = await it();
        const { kind, data, n, prev, signature, device, player, through } = body;
        if (n !== m.n || prev !== m.head) throw answer(409, 'the match moved on: act on its latest', { n: m.n, head: m.head });
        if (m.n >= MAX_ACTIONS) throw answer(413, `this match is as long as a match gets (${MAX_ACTIONS} actions)`);
        if (m.result && kind === 'move') throw answer(422, 'the match is over', { refused: 'the match is over' });
        let out;
        try { out = rules.call(m.source, kind, [m.state, player, data]); } catch (err) {
          const s = said(err);
          throw answer(422, s.broken ? `the rules broke: ${s.error}` : s.error, { refused: s.error, broken: s.broken, steps: s.steps });
        }
        let steps = out.steps;
        if (size(out.value) > MAX_STATE) throw answer(413, `the rules made a state too big to keep (over ${MAX_STATE} characters)`, { steps });
        let result = null;
        try { const r = rules.call(m.source, 'result', [out.value]); result = r.value ?? null; steps += r.steps; } catch (err) { steps += said(err).steps; }
        const text = signedText({ match: m.id, n, prev, kind, data });
        const entry = { n, kind, data, player, through, device, at: now(), prev, signature: signature ?? null, hash: await sha(`${text}\n${signature ?? 'unsigned'}`) };
        await store.put('actions', pad(n), entry);
        Object.assign(m, { n: n + 1, head: entry.hash, state: out.value, result, updated: now() });
        m.members[player.id] = player.name;
        await store.put('match', 'it', m);
        wake();
        const v = viewOf(m, player);
        const sum = summary(m);
        return { ...sum, view: v.view, ...(v.error ? { viewError: v.error } : {}), steps: steps + v.steps };
      });
    },

    async look({ person, after }) {
      let m = await it();
      if (after != null && m.n <= Number(after)) { await changed(); m = await it(); }
      const latest = m.n ? await store.get('actions', pad(m.n - 1)) : null;
      const v = viewOf(m, playerFor(m, person));
      return {
        id: m.id, rulebook: m.rulebook, name: m.name, at: m.at, n: m.n, head: m.head, view: v.view, ...(v.error ? { viewError: v.error } : {}),
        result: m.result, you: Boolean(person && person in m.members),
        last: latest && { kind: latest.kind, by: latest.player.name, through: latest.through?.name ?? null, data: latest.data },
      };
    },

    async log({ from = 0 }) {
      const m = await it();
      const start = Math.max(0, Number(from) || 0), upto = Math.min(m.n, start + 1000);
      const log = [];
      for (let i = start; i < upto; i++) log.push(await store.get('actions', pad(i)));
      const { state, source, members, ...kept } = m;
      return { ...kept, log, more: upto < m.n };
    },

    async export() {
      const m = await it();
      const log = [];
      for (let i = 0; i < m.n; i++) log.push(await store.get('actions', pad(i)));
      const { state, ...kept } = m;
      return { ...kept, log };
    },
  };

  return {
    op(name, body = {}) {
      if (!Object.hasOwn(ops, name)) throw answer(404, `no match op ${name}`);
      return ops[name](body);
    },
    /** Every action of it, and then the match, removed from its store (once archived). */
    async clear() {
      const m = await store.get('match', 'it');
      for (let i = 0; i < (m?.n ?? 0); i++) await store.remove('actions', pad(i));
      await store.remove('match', 'it');
    },
  };
}

/** A practice run of a draft: nothing kept, everything reported, so whoever is writing the
 *  rules sees what each call did and what it cost, against the limits a real match has. */
export function practice(rules, { source, seed = 1, options = {}, steps = [] }) {
  const warn = [];
  const note = (what, used, max) => { if (used > max / 2) warn.push(`${what}: ${used} of the ${max} allowed`); };
  const run = (fn, args) => { try { return { ok: true, ...rules.call(source, fn, args) }; } catch (err) { return { ok: false, ...said(err) }; } };
  const init = run('init', [Number(seed) || 1, options]);
  if (!init.ok) return { ok: false, init, steps: [], limits: limits() };
  note('init steps', init.steps, MAX_STEPS);
  note('state size after init', size(init.value), MAX_STATE);
  let state = init.value;
  const out = [];
  for (const s of steps.slice(0, PRACTICE_STEPS)) {
    const player = { id: String(s.as ?? 'someone'), name: String(s.as ?? 'someone') };
    const kind = s.do === 'join' ? 'join' : 'move';
    const r = run(kind, [state, player, s.data ?? null]);
    if (r.ok) {
      if (size(r.value) > MAX_STATE) Object.assign(r, { ok: false, broken: true, error: `the state would be too big to keep (${size(r.value)} of ${MAX_STATE} characters)` });
      else state = r.value;
    }
    const v = run('view', [state, player]);
    const res = run('result', [state]);
    const used = (r.steps ?? 0) + (v.steps ?? 0) + (res.steps ?? 0);
    note(`${kind} by ${player.name} (step ${out.length}) steps`, r.steps ?? 0, MAX_STEPS);
    note(`state size after step ${out.length}`, size(state), MAX_STATE);
    if (v.ok) note(`view for ${player.name} (step ${out.length})`, size(v.value), MAX_VIEW);
    out.push({
      do: kind, as: player.name, ok: r.ok,
      ...(r.ok ? {} : { refused: r.refused, broken: r.broken, error: r.error, ...(r.line ? { line: r.line, column: r.column } : {}) }),
      view: v.ok ? v.value : `view: ${v.error}`, result: res.ok ? res.value ?? null : `result: ${res.error}`,
      steps: used, stateSize: size(state), viewSize: v.ok ? size(v.value) : null,
    });
  }
  const costs = out.map((s) => s.steps);
  return {
    ok: out.every((s) => s.ok || s.refused),
    init: { steps: init.steps, stateSize: size(init.value) }, steps: out, state,
    weight: costs.length ? { average: Math.round(costs.reduce((a, b) => a + b, 0) / costs.length * 10) / 10, most: Math.max(...costs) } : null,
    warnings: warn, limits: limits(),
  };
}

/** What the World keeps of an archived match. */
export const archivedSummary = (doc) => ({ id: doc.id, rulebook: doc.rulebook, name: doc.name, at: doc.at, genesis: doc.genesis, n: doc.n, head: doc.head, updated: doc.updated, result: doc.result, members: doc.members });

export const limits = () => ({ stepsPerCall: MAX_STEPS, stateSize: MAX_STATE, viewSize: MAX_VIEW, actionsPerMatch: MAX_ACTIONS });

/** Matches kept in this process (Node), over the install's store: each match's documents are
 *  `matches/<id>` and `actions/<id>-<n>`. Archives go to `archive` ({ put(id, doc), get(id) }). */
export function createLocalMatches({ store, loadRules, archive }) {
  const live = new Map();
  let rules = null;
  const ready = async () => (rules ??= await loadRules());
  const scoped = (id) => ({
    get: (kind, k) => store.get(kind === 'match' ? 'matches' : 'actions', kind === 'match' ? id : `${id}-${k}`),
    put: (kind, k, doc) => store.put(kind === 'match' ? 'matches' : 'actions', kind === 'match' ? id : `${id}-${k}`, doc),
    remove: (kind, k) => store.remove(kind === 'match' ? 'matches' : 'actions', kind === 'match' ? id : `${id}-${k}`),
  });
  const get = async (id) => { await ready(); if (!live.has(id)) live.set(id, createMatch({ store: scoped(id), rules })); return live.get(id); };
  return {
    async op(id, name, body) { return (await get(id)).op(name, body); },
    async practice(person, body) { return practice(await ready(), body); },
    async check(person, source) { return (await ready()).check(source); },
    /** Archive a match: its whole log kept, its documents removed. -> its summary */
    async archive(id) {
      const m = await get(id);
      const doc = await m.op('export').catch((err) => { if (err.code === 404) return null; throw err; });
      if (!doc) { live.delete(id); return null; }
      await archive.put(doc.id, doc);
      await m.clear();
      live.delete(id);
      return archivedSummary(doc);
    },
    /** Every match this install holds (for a sweep), by id. */
    async ids() { return (await store.list('matches')).map((m) => m.id); },
  };
}

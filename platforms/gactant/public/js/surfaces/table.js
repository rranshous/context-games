// Table: shared play. Games many ludants play together, whatever each looks like: the
// rules live on the server, not in any ludant (tables.mjs runs them), so every ludant
// playing the same rulebook plays the same game, and only the rules decide what's legal.
// Every join and move is signed by this device for its person, here in the frame: the
// ludant asks, the table signs. Nothing in the sandbox ever holds a key.
//
// actions (as an actor)
//   drafts() -> [{ id, name, updated }]                    rulebooks being written (private to this person)
//   draft({ name, source?, from? }) -> { id }              a new draft; from: a rulebook hash to start from
//   readDraft(id) -> { name, source, missing }             writeDraft(id, { name?, source }) -> { missing }
//   tryDraft(id, { steps, seed?, options? }) -> { steps, state, result }   a practice run, nothing kept
//   lock(id) -> { rulebook }                                frozen; the hash is its name for good
//   removeDraft(id)
//   rulebook(hash) -> { name, source, by, at, from }       anyone's, by reference
//   matches(hash) -> [{ id, at, n, over, view }]           its recent matches, as an onlooker sees them
//   open(hash, options?) -> { match }                      a new match (nobody in it yet), watched
//   watch(match) -> { view, n, result, you }               follow it: table.changed on every action
//   unwatch(match)
//   join(match, request?) -> { view, result }              take a place, if the rules allow
//   move(match, action) -> { view, result }                act, if the rules allow (refused: an error with their words)
//   view(match) -> { view, n, result, you }                the latest seen (asked of the server if it hasn't been)
//   budget() -> what this person has used today, and the limits
//   standings(hash, n = 20) -> { matches, players: [{ rank, id, name, wins, losses, draws, played }], you }
// events
//   table.changed { match, n, view, result, last: { kind, by, through, data } }   someone acted (you included)
//   table.refused { match, kind, reason }

import { sign } from '../identity.js';
import { api } from '../ui.js';

const signedText = ({ match, n, prev, kind, data }) => ['gactant/act/v1', match, n, prev, kind, JSON.stringify(data ?? null)].join('\n');
const TRIES = 4;   // an action meets a newer head (someone else acted first): signed again on it
const FOLLOWED = 20;   // matches one frame follows at once

export class Table {
  id = 'table';

  constructor(frame) {
    this.frame = frame;
    this.seen = new Map();       // match -> { view, n, head, result, you, rulebook, name }
    this.watching = new Set();
    this.polls = new Map();      // match -> AbortController
  }

  describe() {
    return `table: shared play with other people and their ludants, whoever they are and whatever their game looks like. The rules of a shared game are a rulebook: plain JavaScript defining init(seed, options), join(state, player, request), move(state, player, action), view(state, player), result(state). They're pure: state in, state out, everything JSON, no clock or network, and refusing is throwing an Error whose message the player sees; random(n) -> [a number in [0, 1), the next n] keeps randomness in the state, from the seed. player is { id, name } (view gets null for an onlooker). result returns null until the game is over, then anything the rules like plus winners: [player ids] ([] for a draw), which is what standings across matches count. The rules run on the server, never in anyone's game, so every ludant playing the same rulebook plays the same game and nobody can cheat. Rulebooks are written as private drafts (draft, writeDraft, tryDraft for a practice run), then locked: lock(id) gives a hash that names those exact rules for good, and anyone can load it with rulebook(hash). A game of yours plays a rulebook by its hash: open(hash) starts a match, join(match) takes a place, move(match, action) acts, view(match) is what you see now; table.changed arrives on every action by anyone (watch(match) to follow one you didn't open or join). Actions are public, so anything secret belongs in the state and is shown through view. Every action is signed by the device of the person you're playing for, so who did what is provable. Rules have limits, and run on the person's daily budget: work is counted in steps (about 5,000 simple operations each, at least 1 a call), a call may take up to 1,000, a state may be up to 200,000 characters of JSON and a view 50,000; budget() says what's used today. A practice run reports each call: ok, refused (the rules said no) or broken (with the line in your rulebook), its steps, the state's and view's sizes, and warnings once anything passes half of a limit; lock reports the rulebook's weight from the last practice run. A match that's over is archived after an hour (it can still be read). Every rulebook has standings: each match of it that ended with winners counts, in every ludant that plays it, so standings(hash) is the same board for all of them, kept by the server and impossible to fake. How it looks is yours: draw it in your game however suits you. Actions (all return promises): drafts(), draft({ name, source, from }), readDraft(id), writeDraft(id, { name, source }), tryDraft(id, { steps: [{ do: 'join'|'move', as: 'a name', data }], seed, options }), lock(id), removeDraft(id), rulebook(hash), matches(hash), open(hash, options), watch(match), unwatch(match), join(match, request), move(match, action), view(match), standings(hash, n) -> { matches, players: [{ rank, id, name, wins, losses, draws, played }], you: your own row or null }, budget().`;
  }

  state() {
    if (!this.watching.size) return 'table: not following any match.';
    const lines = [...this.watching].map((m) => {
      const s = this.seen.get(m);
      return s ? `${m} (${s.name ?? 'rules'}: ${s.n} actions${s.result ? ', over' : ''}${s.you ? ', you have a place' : ''})` : m;
    });
    return `table: following ${lines.join('; ')}.`;
  }

  actions(who) {
    return {
      drafts: () => api('GET', 'drafts'),
      draft: (o = {}) => api('POST', 'drafts', { name: o.name, source: o.source ?? '', from: o.from }),
      readDraft: (id) => api('GET', `drafts/${id}`),
      writeDraft: (id, o = {}) => api('PUT', `drafts/${id}`, { name: o.name, source: o.source }),
      tryDraft: (id, o = {}) => api('POST', `drafts/${id}/try`, o),
      lock: (id) => api('POST', `drafts/${id}/lock`, {}),
      removeDraft: (id) => api('POST', `drafts/${id}/remove`, {}),
      rulebook: (hash) => api('GET', `rulebooks/${hash}`),
      matches: (hash) => api('GET', `rulebooks/${hash}/matches`),
      open: (hash, options) => this.open(hash, options),
      watch: (match) => this.watch(match),
      unwatch: (match) => this.unwatch(match),
      join: (match, request) => this.act(who, match, 'join', request ?? null),
      move: (match, action) => this.act(who, match, 'move', action ?? null),
      view: async (match) => structuredClone(this.seen.get(match) ?? await this.fetch(match)),
      budget: () => api('GET', 'tables/budget'),
      standings: (hash, n) => api('GET', `rulebooks/${hash}/standings${n ? `?n=${n}` : ''}`),
    };
  }

  async open(hash, options) {
    const { id } = await api('POST', 'matches', { rulebook: hash, options });
    await this.watch(id);
    return { match: id };
  }

  /** Follow a match: what it is now, then every action as it comes (a long look that the
   *  server answers when something happens). */
  async watch(match) {
    const now = await this.fetch(match);
    if (!this.watching.has(match)) {
      if (this.watching.size >= FOLLOWED) throw new Error(`a frame follows up to ${FOLLOWED} matches at once; unwatch one first`);
      this.watching.add(match);
      this.frame.changed();
      this.poll(match);
    }
    return now;
  }

  unwatch(match) {
    this.watching.delete(match);
    this.polls.get(match)?.abort();
    this.polls.delete(match);
    this.frame.changed();
    return true;
  }

  async fetch(match, after) {
    const m = await api('GET', `matches/${match}${after != null ? `?after=${after}` : ''}`);
    const before = this.seen.get(match);
    if (before && m.n < before.n) return structuredClone(before);   // an older answer, arriving late
    const s = { view: m.view, n: m.n, head: m.head, result: m.result, you: m.you, rulebook: m.rulebook, name: m.name, ...(m.archived ? { archived: true } : {}) };
    this.seen.set(match, s);
    if (before && m.n > before.n) this.frame.bus.emit('table.changed', { match, n: m.n, view: m.view, result: m.result, last: m.last });
    return structuredClone(s);
  }

  async poll(match) {
    const stop = new AbortController();
    this.polls.set(match, stop);
    let quiet = 0;
    const done = () => this.seen.get(match)?.result || this.seen.get(match)?.archived;
    while (this.watching.has(match) && !stop.signal.aborted && !this.frame.lost && !done()) {
      // Nobody's looking at this page: don't keep asking. Catch up when it's seen again.
      if (document.visibilityState === 'hidden') { await new Promise((r) => document.addEventListener('visibilitychange', r, { once: true })); continue; }
      try {
        await this.fetch(match, this.seen.get(match)?.n ?? 0);   // once it's over (or archived), the loop ends
        quiet = 0;
      } catch {
        // The network, or the server restarting: wait a little longer each time.
        await new Promise((r) => setTimeout(r, Math.min(30_000, 1000 * 2 ** quiet++)));
      }
    }
  }

  /** A join or a move: signed by this device over the match's latest head. If someone else
   *  acted first, sign again on the new head. */
  async act(who, match, kind, data) {
    let s = this.seen.get(match) ?? await this.fetch(match);
    for (let i = 0; ; i++) {
      const text = signedText({ match, n: s.n, prev: s.head, kind, data });
      try {
        const out = await api('POST', `matches/${match}/act`, { kind, data, n: s.n, prev: s.head, signature: await sign(text), ludant: this.frame.recordId });
        // The long look sees it too; this makes sure the one acting hears it at once.
        await this.fetch(match);
        if (!this.watching.has(match)) await this.watch(match);
        return { view: out.view, result: out.result };
      } catch (err) {
        if (err.status === 409 && i < TRIES) { s = await this.fetch(match); continue; }
        if (err.status === 422 || err.status === 410 || err.status === 429) {
          this.frame.bus.emit('table.refused', { match, kind, reason: err.body?.refused ?? err.message });
          throw new Error(err.body?.refused ?? err.message);
        }
        throw err;
      }
    }
  }

  toJSON() { return { watching: [...this.watching] }; }

  load(saved) {
    this.watching = new Set(saved?.watching ?? []);
  }

  /** Once the frame is running: catch up with the matches it was following. */
  resume() {
    for (const m of this.watching) this.fetch(m).then(() => this.poll(m)).catch(() => this.watching.delete(m));
  }
}

// Table: shared play. Games many ludants play together, whatever each looks like: the
// rules live on the server, not in any ludant (tables.mjs runs them), so every ludant
// playing the same rulebook plays the same game, and only the rules decide what's legal.
// Every join and move is signed by this device for its person, here in the frame: the
// ludant asks, the table signs. Nothing in the sandbox ever holds a key.
//
// actions (as an actor)
//   drafts() -> [{ id, name, updated }]                    rulebooks being written (private to this person)
//   draft({ name, source?, from? }) -> { id }              a new draft; from: a rulebook hash to start from
//   readDraft(id, { from, to }?) -> { name, source, missing } (with from/to: lines, numbered, in place of source)   writeDraft(id, { name?, source }) -> { missing }
//   editDraft(id, edits) -> { missing, changed }          change a draft in places, as edit_section does (edits.js)
//   tryDraft(id, { steps, seed?, options? }) -> { steps, state, result }   a practice run, nothing kept
//   lock(id) -> { rulebook }                                frozen; the hash is its name for good
//   removeDraft(id)
//   rulebook(hash) -> { name, source, by, at, from }       anyone's, by reference
//   matches(hash) -> [{ id, at, updated, n, over, players, view }]   its recent matches; view: an onlooker's
//   open(hash, options?, { practice }?) -> { match }       a new match (nobody in it yet), watched. practice: for
//                                                          testing alone; only you act in it, in any seat (as below)
//   watch(match) -> { view, n, result, you }               follow it: table.changed on every action
//   unwatch(match)
//   join(match, request?, { as }?) -> { view, result }     take a place, if the rules allow
//   move(match, action, { as }?) -> { view, result }       act, if the rules allow (refused: an error with their words)
//                                                          as: in a practice match, another seat of yours (a made-up
//                                                          name); its view comes back with the answer
//   view(match), or look(match) -> { view, n, result, you } the latest seen (asked of the server if it hasn't been)
// Forgiving: wherever the rules' view comes back as .view (these, and table.changed), its own
// fields are on the answer too, so view(match).seats and view(match).view.seats both work.
// Where a field of the view has the same name as one of the answer's, the answer's wins.
//   budget() -> what this person has used today, and the limits
//   standings(hash, n = 20, by) -> { matches, players: [{ rank, id, name, wins, losses, draws, played, scored, best, bestAt, bestMatch }], you }
//                                  by 'best': only those with a score, ranked by their best
//   share(match, value) -> { sent }                       pass a value to everyone else on it at once (live; see below)
// events
//   table.shared { match, by, player, value, at }   another player shared a value (by: their name)
//   table.changed { match, n, view, result, last: { kind, by, through, data }, ...the view's fields }   someone acted (you included)
//   table.refused { match, kind, reason }
//   table.clock { offset, rtt }   this frame's best idea of the server's clock changed: server time ≈ Date.now() + offset
//
// The server's clock: serverNow() is the server's time now, as best this frame can tell. Each
// live socket checks it ({ time } -> { type: 'time', t0, now }) as it opens and every minute
// after, timing the round trip; the fastest of the recent checks says it best (the server
// read its clock about halfway through). In the game (chassis.js), serverNow() is
// synchronous, eases toward each new estimate rather than jumping, and never goes backwards,
// so things that move as a function of the server's time move smoothly.

import { pass, sign, signer } from '../identity.js';
import { applyEdits } from '../edits.js';
import { api } from '../ui.js';

// Ids from the game go into API paths: only an id's own characters, so none can climb out of
// its route ('..') to another one, asked as the person.
const idOf = (x) => { const s = String(x); if (!/^[A-Za-z0-9_-]{1,80}$/.test(s)) throw new Error(`not an id: ${s.slice(0, 40)}`); return s; };

/** The answer with the rules' view's own fields on it too (see the top of this file). */
const forgiving = (o) => (o && o.view && typeof o.view === 'object' && !Array.isArray(o.view) ? { ...o.view, ...o } : o);

const signedText = ({ match, n, prev, person, device, kind, data }) => ['gactant/act/v2', match, n, prev, person, device, kind, JSON.stringify(data ?? null)].join('\n');
const TRIES = 4;   // an action meets a newer head (someone else acted first): signed again on it
const TOGETHER = 20;   // moves sent together, at most (the server's MAX_TOGETHER)
const FOLLOWED = 20;   // matches one frame follows at once

const SEEN_KEPT = 50;   // matches remembered as last seen, beyond the followed ones
const CLOCK_CHECKS = 8;          // recent clock checks kept; the fastest round trip among them says it best
const CLOCK_EVERY_MS = 60_000;   // a live socket checks the clock this often (and three times as it opens)

export class Table {
  id = 'table';

  constructor(frame) {
    this.frame = frame;
    this.seen = new Map();       // match -> { view, n, head, result, you, rulebook, name }
    this.watching = new Set();
    this.heard = new Map();   // when each followed match last had something happen, as this frame heard it
    this.polls = new Map();      // match -> AbortController
    this.sockets = new Map();    // match -> its live WebSocket, while it's open
    this.draftNames = new Map(); // draft id -> name, for saying what's being worked on
    this.outbox = new Map();     // match -> { busy, held: [{ action, resolve, reject }] }: moves waiting while one is on its way
    this.clockChecks = [];       // { offset, rtt }: the server's clock less this one, and how long the check took
    this.offset = null;          // the best of them, as last told (table.clock)
  }

  /** The server's time now, as best this frame can tell (until a check, the time a look said). */
  serverNow() { return Date.now() + (this.offset ?? 0); }

  /** A clock check came back, or a look carried the server's time (rtt unknown: only used
   *  until a real check). Tell the game when the best idea of the offset moves. */
  clocked(offset, rtt) {
    if (rtt == null) { if (this.clockChecks.length || this.offset != null) return; }
    else { this.clockChecks.push({ offset, rtt }); if (this.clockChecks.length > CLOCK_CHECKS) this.clockChecks.shift(); }
    const best = rtt == null ? { offset, rtt: null } : this.clockChecks.reduce((a, b) => (b.rtt < a.rtt ? b : a));
    if (this.offset != null && Math.abs(best.offset - this.offset) < 2) return;
    this.offset = best.offset;
    this.frame.bus.emit('table.clock', { offset: Math.round(best.offset), rtt: best.rtt == null ? null : Math.round(best.rtt) });
  }

  /** Working on rules shows in the chat while the ludant's awake ("testing multiplayer
   *  rules for “tic-tac-toe”…"), as changing its game does. */
  working(verb, id, name) {
    if (name) this.draftNames.set(id, name);
    const called = name ?? this.draftNames.get(id);
    this.frame.actant?.busy?.(`${verb} multiplayer rules${called ? ` for “${called}”` : ''}`);
  }

  describe() {
    return `table: shared play with other people and their ludants, whoever they are and whatever their game looks like. The rules of a shared game are a rulebook: plain JavaScript defining init(seed, options, time), join(state, player, request, time), move(state, player, action, time), view(state, player, time), result(state, time). They're pure: state in, state out, everything JSON, no network, and refusing is throwing an Error whose message the player sees; random(n) -> [a number in [0, 1), the next n] keeps randomness in the state, from the seed. time is { now, started }: the server's time in milliseconds since 1970 when the action arrived (and when the match began), never earlier than the last action's, and kept with the action, so a replay gets the same. Use it, never Date. Rules only run when someone acts, so keep when you last brought the state up to date and, at the top of each call, catch the world up by however much time has passed (regen, cooldowns, respawns); view gets the time it's asked at, so it can show the world caught up without changing it. Anything a player needs in order to act (action points, a turn, a respawn) must come back with time, worked out from now, never only as a result of other actions: otherwise a player alone can be stuck for good. Put deadlines in the state as times (readyAt, respawnAt) and show them in view: every look, move and table.changed also carries now, the server's time, and serverNow() (synchronous in your game) is the server's time right now as best your frame can tell: it checks the clock over the live connection, eases toward each new estimate rather than jumping, and never goes backwards. Animate anything that's a function of the server's time (patrols, countdowns, day and night) from serverNow(), never from Date.now() plus an offset of your own. Arrival times vary with each player's connection, so allow a little slack (a quarter second) on anything timed. For movement, share positions for showing, and send a move at the moments that matter, which the rules refuse if it's farther than speed × the time since the last one allows. player is { id, name } (view gets null for an onlooker). result returns null until the game is over, then anything the rules like plus winners: [player ids] ([] for a draw) and/or scores: { [player id]: number }, which is what standings across matches count. The rules run on the server, never in anyone's game, so every ludant playing the same rulebook plays the same game and nobody can cheat. Rulebooks are written as private drafts (draft, writeDraft, editDraft, tryDraft for a practice run), then locked: lock(id) gives a hash that names those exact rules for good, and anyone can load it with rulebook(hash). A game of yours plays a rulebook by its hash: open(hash) starts a match, join(match) takes a place, move(match, action) acts, view(match) (or look(match)) is what you see now; table.changed arrives on every action by anyone (watch(match) to follow one you didn't open or join). Actions are public, so anything secret belongs in the state and is shown through view. Every action is signed by the device of the person you're playing for, so who did what is provable. Rules have limits, and run on the person's daily budget: work is counted in steps (about 5,000 simple operations each, at least 1 a call), a call may take up to 1,000, a state may be up to 200,000 characters of JSON and a view 50,000; budget() says what's used today. What reaches the server is paced, per person across all their matches: up to 10 sends at once, refilling at 2 a second (refused ones count too; one that met someone else's newer action doesn't). That paces sends, not moves: call move() as often as your game needs, many times a second if it likes. Moves your game makes while one is still on its way to a match are held and sent together (up to 20 at a time) when it answers, and a batch costs one step of the pace, so a fast game gets bigger batches, not refusals; don't slow your game down or bunch moves up yourself to stay under 2 a second. Looks asked of the server (view or look before a match is followed) are paced too, per address: up to 40 at once, refilling at 4 a second; a followed match's views arrive live and cost none. Each move still counts toward the person's day: 3,000 actions (budget() shows what's used). The server applies moves sent together one at a time, in order, each judged on its own as if sent alone, and each move() gets its own answer or refusal (the view in it is as things stood after all of them). Moves sent together share one time, so check movement against an allowance that builds up with time (up to a cap), not against the time since the previous move. To be sure a move happened before making the next, await it. A practice run reports each call: ok, refused (the rules said no) or broken (with the line in your rulebook), its steps, the state's and view's sizes, and warnings once anything passes half of a limit; lock reports the rulebook's weight from the last practice run. A match that's over (result isn't null) is archived an hour later, and can still be read; one that isn't over is kept as long as someone acts in it at least once every 30 days, so a world that never ends is kept. A match holds up to 20,000 actions. Every rulebook has standings: each match of it that ended with winners or scores counts, in every ludant that plays it, so standings(hash) is the same board for all of them, kept by the server and impossible to fake, and kept for good (matches are archived; standings aren't). winners give each player in the match a win, a loss or a draw. scores keep each player's best (highest is best, so score a time so that faster is higher), with the match that made it; standings(hash, n, 'best') ranks the people with a score by their best. A one-player game with a high-score table is a match per run: the run's moves go to the rules, and result gives { scores: { [player id]: points } } when it ends. How it looks is yours: draw it in your game however suits you. Fast games: while you follow a match (open, join or watch it), you're connected to it live, so table.changed arrives the moment anyone acts. A frame follows up to 20 matches; past that, following another lets go of the ones that are over first, then the one quiet longest, so a match per run needs no tidying; unwatch(match) stops following one now. For what changes many times a second (where a ship is, where someone's aiming), share(match, value) passes a value straight to everyone else in the match, arriving as table.shared { match, by, player, value } on their side. It isn't signed or logged and the rules never see it, so it's for showing, not deciding: what decides (a hit, a score, a win) stays a move. Up to 20 shares a second of up to 2,000 characters each, from players who've joined. Between shares, ease things toward where they were last shared rather than jumping. What comes back: view, look and watch give { view, n, result, you }, join and move give { view, result }, and table.changed carries { match, n, view, result, last }; view is what your rules' view(state, player) returned for you, and its fields are also copied onto the answer itself, so view(match).seats and view(match).view.seats both work (a field named like one of the answer's own, such as n or result, is only under .view). matches(hash) lists recent matches with their players (names) and an onlooker's view, for finding one with room. To test a game that needs other players while nobody's there, open a practice match: open(hash, options, { practice: true }). Only you act in it, and you can take every seat: join(match, request, { as: 'B' }) and move(match, action, { as: 'B' }) play a made-up player (id '<yours>:B'), and each answer carries that seat's view. Your game plays your own seat as usual, and hears B's moves as table.changed, just as it will a real opponent's, so you can look at the stage to see it answer them. Practice matches aren't listed, signed or counted in standings; they cost actions like any match, and are archived after an hour without an action. Actions (all return promises): drafts(), draft({ name, source, from }), readDraft(id) (or readDraft(id, { from, to }) for those lines, numbered: read a long draft a part at a time), writeDraft(id, { name, source }), editDraft(id, edits) (changes a draft in places, with the same edits as edit_section: old, from + to, lines or after, each with new; far quicker than writing the whole source again), tryDraft(id, { steps: [{ do: 'join'|'move', as: 'a name', data, wait }], seed, options }) (a practice run's clock starts at 2026-01-01 and stands still; wait moves it on that many milliseconds before the step, and each step reports its now), lock(id), removeDraft(id), rulebook(hash), matches(hash), open(hash, options, { practice }), watch(match), unwatch(match), join(match, request, { as }), move(match, action, { as }), share(match, value), view(match), look(match), standings(hash, n, by) -> { matches, players: [{ rank, id, name, wins, losses, draws, played, scored, best, bestAt, bestMatch }], you: your own row or null }, budget(), serverNow().`;
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
      serverNow: () => this.serverNow(),
      drafts: () => api('GET', 'drafts'),
      draft: async (o = {}) => {
        const d = await api('POST', 'drafts', { name: o.name, source: o.source ?? '', from: o.from });
        this.working('writing', d.id, o.name);
        return d;
      },
      // A long draft can be read a part at a time: { from, to } (line numbers, as numbered)
      // gives those lines, numbered, instead of the whole source.
      readDraft: async (id, part) => {
        const d = await api('GET', `drafts/${idOf(id)}`);
        if (d?.name) this.draftNames.set(id, d.name);
        if (!part || typeof d?.source !== 'string') return d;
        const ls = d.source.split('\n'), a = Math.max(1, Math.floor(part.from ?? 1)), b = Math.min(ls.length, Math.floor(part.to ?? a + 299));
        const { source, ...rest } = d;
        return { ...rest, lines: `lines ${a}–${b} of ${ls.length}:\n${ls.slice(a - 1, b).map((l, i) => `${String(a + i).padStart(5)}│${l}`).join('\n')}` };
      },
      writeDraft: (id, o = {}) => { this.working('writing', id, o.name); return api('PUT', `drafts/${idOf(id)}`, { name: o.name, source: o.source }); },
      editDraft: async (id, edits) => {
        const d = await api('GET', `drafts/${idOf(id)}`);
        this.working('writing', id, d?.name);
        const { text, spans } = applyEdits(d.source ?? '', edits);
        return { ...(await api('PUT', `drafts/${idOf(id)}`, { source: text })), changed: spans.map((s) => `edit ${s.edit}: now lines ${s.lines[0]}-${s.lines[1]}`) };
      },
      tryDraft: (id, o = {}) => { this.working('testing', id); return api('POST', `drafts/${idOf(id)}/try`, o); },
      lock: (id) => { this.working('locking', id); return api('POST', `drafts/${idOf(id)}/lock`, {}); },
      removeDraft: (id) => api('POST', `drafts/${idOf(id)}/remove`, {}),
      rulebook: (hash) => api('GET', `rulebooks/${idOf(hash)}`),
      matches: (hash) => api('GET', `rulebooks/${idOf(hash)}/matches`),
      open: (hash, options, how) => this.open(hash, options, how),
      watch: async (match) => forgiving(await this.watch(match)),
      unwatch: (match) => this.unwatch(match),
      join: (match, request, how) => this.act(who, match, 'join', request ?? null, how?.as),
      // Another seat's moves go one at a time, straight away: the batching is for a game's own.
      move: (match, action, how) => (how?.as != null ? this.act(who, match, 'move', action ?? null, how.as) : this.moved(who, match, action ?? null)),
      view: async (match) => forgiving(structuredClone(this.seen.get(match) ?? await this.fetch(match))),
      look: async (match) => forgiving(structuredClone(this.seen.get(match) ?? await this.fetch(match))),
      share: (match, value) => this.share(match, value),
      budget: () => api('GET', 'tables/budget'),
      standings: (hash, n, by) => api('GET', `rulebooks/${idOf(hash)}/standings?${new URLSearchParams({ ...(n ? { n } : {}), ...(by ? { by } : {}) })}`),
    };
  }

  async open(hash, options, how) {
    const { id } = await api('POST', 'matches', { rulebook: hash, options, ...(how?.practice ? { practice: true } : {}) });
    await this.watch(id);
    return { match: id };
  }

  /** Follow a match: what it is now, then every action as it comes (a long look that the
   *  server answers when something happens). */
  async watch(match) {
    const now = await this.fetch(match);
    if (!this.watching.has(match)) {
      if (this.watching.size >= FOLLOWED) this.makeRoom();
      this.watching.add(match);
      this.frame.changed();
      this.poll(match);
    }
    return now;
  }

  /** Following as many as a frame does: let go of the matches that are over (nothing more
   *  will happen in them), or else the one that's been quiet longest. Ludants open a match
   *  per run and rarely unwatch, so the frame keeps this tidy rather than refusing. */
  makeRoom() {
    const over = [...this.watching].filter((m) => this.seen.get(m)?.result || this.seen.get(m)?.archived);
    for (const m of over) this.unwatch(m);
    if (this.watching.size < FOLLOWED) return;
    const quietest = [...this.watching].sort((a, b) => (this.heard.get(a) ?? 0) - (this.heard.get(b) ?? 0))[0];
    this.unwatch(quietest);
  }

  unwatch(match) {
    this.watching.delete(match);
    this.polls.get(match)?.abort();
    this.polls.delete(match);
    this.frame.changed();
    return true;
  }

  async fetch(match, after) {
    return this.took(match, await api('GET', `matches/${idOf(match)}${after != null ? `?after=${Number(after)}` : ''}`));
  }

  /** The match as the server says it is now (asked, or pushed over its socket). */
  took(match, m) {
    const before = this.seen.get(match);
    if (before && m.n < before.n) return structuredClone(before);   // an older answer, arriving late
    if (typeof m.now === 'number') this.clocked(m.now - Date.now(), null);
    const s = { view: m.view, n: m.n, head: m.head, result: m.result, you: m.you, rulebook: m.rulebook, name: m.name, now: m.now ?? null, ...(m.archived ? { archived: true } : {}) };
    this.seen.delete(match);
    this.seen.set(match, s);
    // Kept for the matches followed and the latest few others: a game that opens a match
    // a run would otherwise keep every one it ever saw.
    for (const old of this.seen.keys()) {
      if (this.seen.size <= SEEN_KEPT) break;
      if (!this.watching.has(old)) { this.seen.delete(old); this.heard.delete(old); }
    }
    if (!before || m.n > before.n) this.heard.set(match, Date.now());
    if (before && m.n > before.n) this.frame.bus.emit('table.changed', forgiving({ match, n: m.n, view: m.view, result: m.result, last: m.last, now: m.now ?? null }));
    return structuredClone(s);
  }

  /** Following a match: live over a socket, where every action is pushed as it happens;
   *  asking the server (a long look) where a socket can't be had, trying one again now and then. */
  async poll(match) {
    const stop = new AbortController();
    this.polls.set(match, stop);
    let quiet = 0, liveAgainAt = 0;
    const done = () => this.seen.get(match)?.result || this.seen.get(match)?.archived;
    while (this.watching.has(match) && !stop.signal.aborted && !this.frame.lost && !done()) {
      if (typeof WebSocket === 'function' && Date.now() >= liveAgainAt) {
        const how = await this.live(match, stop);
        if (how === 'dropped') { await new Promise((r) => setTimeout(r, 1000)); continue; }
        if (how === 'over') { await this.fetch(match).catch(() => {}); continue; }
        liveAgainAt = Date.now() + 60_000;   // no socket to be had: ask for a minute, then try again
      }
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

  /** A socket that hears the match: resolves 'failed' (it never opened), 'dropped' (it did,
   *  and closed) or 'over' (the match was archived). */
  live(match, stop) {
    return new Promise((resolve) => {
      pass().catch(() => null).then((p) => {
        let ws, opened = false;
        try { ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/matches/${match}/live`, p ? ['gactant', p] : ['gactant']); }
        catch { resolve('failed'); return; }
        const ping = setInterval(() => { if (ws.readyState === 1) ws.send('ping'); }, 30_000);
        const check = () => { if (ws.readyState === 1) ws.send(JSON.stringify({ time: Date.now() })); };
        const checks = [setTimeout(check, 300), setTimeout(check, 1200)];
        const clock = setInterval(check, CLOCK_EVERY_MS);
        const close = () => { try { ws.close(1000); } catch {} };
        stop.signal.addEventListener('abort', close, { once: true });
        ws.onopen = () => {
          opened = true;
          this.sockets.set(match, ws);
          check();
          this.fetch(match).catch(() => {});   // whatever happened before it opened
        };
        ws.onmessage = (e) => {
          if (e.data === 'pong') return;
          let m;
          try { m = JSON.parse(e.data); } catch { return; }
          if (m.type === 'look') {
            this.took(match, m);
            if (m.result || m.archived) close();
          } else if (m.type === 'time') this.clocked(m.now - (m.t0 + Date.now()) / 2, Date.now() - m.t0);
          else if (m.type === 'shared') this.frame.bus.emit('table.shared', { match, by: m.name, player: m.by, value: m.value, at: m.at });
          else if (m.type === 'error') this.frame.bus.emit('table.refused', { match, kind: 'share', reason: m.error });
        };
        ws.onclose = (e) => {
          clearInterval(ping); clearInterval(clock); checks.forEach(clearTimeout);
          stop.signal.removeEventListener('abort', close);
          if (this.sockets.get(match) === ws) this.sockets.delete(match);
          if (!opened) console.warn(`[gactant] couldn't follow ${match} live (${e.code}${e.reason ? ` ${e.reason}` : ''}); asking the server instead for a minute`);
          resolve(e.code === 4410 ? 'over' : opened ? 'dropped' : 'failed');
        };
      });
    });
  }

  /** Pass a value to everyone else on the match, at once: not signed, not logged, never seen
   *  by the rules. Best effort: while it isn't connected live, nothing goes. */
  share(match, value) {
    const ws = this.sockets.get(match);
    if (!ws || ws.readyState !== 1) {
      if (!this.watching.has(match)) this.watch(match).catch(() => {});
      return { sent: false, why: 'not connected to that match live yet (it connects once you watch, open or join it); try again in a moment' };
    }
    const text = JSON.stringify({ share: value ?? null });
    if (text.length > 2_010) throw new Error('a shared value is up to 2,000 characters of JSON');
    ws.send(text);
    return { sent: true };
  }

  /** A join or a move: signed by this device over the match's latest head. If someone else
   *  acted first, sign again on the new head. */
  /** A move: sent at once if nothing's on its way to that match; otherwise it waits, and
   *  whatever waited goes together when the answer comes (the server applies each on its
   *  own, in order). Either way it resolves, or is refused, as if it had been sent alone. */
  moved(who, match, action) {
    return new Promise((resolve, reject) => {
      const box = this.outbox.get(match) ?? { busy: false, held: [] };
      this.outbox.set(match, box);
      box.held.push({ action, resolve, reject });
      if (!box.busy) this.sendMoves(who, match, box);
    });
  }

  async sendMoves(who, match, box) {
    box.busy = true;
    try {
      while (box.held.length) {
        const go = box.held.splice(0, TOGETHER);
        if (go.length === 1) {
          await this.act(who, match, 'move', go[0].action).then(go[0].resolve, go[0].reject);
          continue;
        }
        try {
          const out = await this.act(who, match, 'moves', go.map((g) => g.action));
          go.forEach((g, i) => {
            const o = out.outcomes?.[i] ?? { ok: true };
            if (o.ok) g.resolve(forgiving({ view: out.view, result: out.result, now: out.now ?? null }));
            else {
              this.frame.bus.emit('table.refused', { match, kind: 'move', reason: o.refused });
              g.reject(new Error(o.refused));
            }
          });
        } catch (err) { go.forEach((g) => g.reject(err)); }
      }
    } finally {
      box.busy = false;
      if (!box.held.length) this.outbox.delete(match);
    }
  }

  async act(who, match, kind, data, as) {
    let s = this.seen.get(match) ?? await this.fetch(match);
    for (let i = 0; ; i++) {
      const text = signedText({ match, n: s.n, prev: s.head, ...(await signer()), kind, data });
      try {
        const out = await api('POST', `matches/${idOf(match)}/act`, { kind, data, n: s.n, prev: s.head, signature: await sign(text), ludant: this.frame.recordId, ...(as != null ? { as: String(as) } : {}) });
        // The long look sees it too; this makes sure the one acting hears it at once.
        await this.fetch(match);
        if (!this.watching.has(match)) await this.watch(match);
        if (kind === 'moves') return out;
        return forgiving({ view: out.view, result: out.result, now: out.now ?? null });
      } catch (err) {
        if (err.status === 409 && i < TRIES) { s = await this.fetch(match); continue; }
        // Moves sent together, none applied: each has its own reason.
        if (kind === 'moves' && err.status === 422 && err.body?.outcomes) return { outcomes: err.body.outcomes };
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
    for (const m of this.watching) this.fetch(m).then((s) => (s.result || s.archived ? this.unwatch(m) : this.poll(m))).catch(() => this.watching.delete(m));
  }
}

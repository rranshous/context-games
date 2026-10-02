// The dungeon: an authoritative host for worlds. It runs as its own process (server.ts) or inside the
// desktop app. Each WebSocket connection is a round (the Dark and Dark Racer share rounds among players).
// It issues a fresh context, verifies zero-knowledge journeys against it, runs the simulation at a
// fixed step, and streams snapshots. It never sees a secret: no addresses, no nonces, no keys.
import { WebSocketServer, type WebSocket } from 'ws';
import { randomBytes } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import type { ProofVerifier } from '@truenames/authority';
import { DungeonSim, BastionSim, CouncilSim, RacerSim, zkVerifier, type ChoirMember, type ClientMsg, type ServerMsg, type World } from '@truenames/dungeon';

/** Set by startDungeon: verifies proofs against the circuit's verification key. */
let verifier: ProofVerifier;
/** Set by startDungeon: where reported issues are appended (one JSON line each), or null to only log them. */
let issuesFile: string | null = null;
const STEP = 1 / 60; // simulation step
const SNAP_EVERY = 3; // snapshots at 20 Hz
const MAX_LEVEL = 99;

const MAX_LAG = 1000;

// ---------- shared rounds (Dark Racer, the Dark) ----------
// A player joins a round of the same world and level that is still gathering, so everyone proves against the same
// context. The lobby opens when the first player is in and holds the start for LOBBY seconds (longer if someone is
// still proving, never past LOBBY_MAX), or until someone says go. The choir hears each gathering, so choristers
// standing ready can walk in.
const LOBBY = 15;
const LOBBY_MAX = 35;

type SharedWorld = 'racer' | 'dark';
type SharedSim = RacerSim | DungeonSim;
interface Seat { ws: WebSocket; aura: string | null; send: (m: ServerMsg) => void; ended: boolean }
interface Gathering { world: SharedWorld; sim: SharedSim; context: bigint; level: number; seats: Set<Seat>; firstIn: number | null; go: boolean; loop: ReturnType<typeof setInterval> | null; steps: number }
const gatherings = new Set<Gathering>();
const tag = (g: Gathering) => `${g.world === 'racer' ? 'race' : 'dark'} ${g.context.toString(16).slice(0, 8)}`;

function findGathering(world: SharedWorld, level: number): Gathering {
  for (const g of gatherings) {
    const open = !g.sim.started && g.seats.size < g.sim.seats && (g.firstIn === null || performance.now() - g.firstIn < LOBBY * 1000);
    if (g.world === world && g.level === level && open) return g;
  }
  const context = BigInt('0x' + randomBytes(16).toString('hex'));
  const sim = world === 'racer' ? new RacerSim({ level, context, verifier }) : new DungeonSim({ level, context, verifier });
  const g: Gathering = { world, sim, context, level, seats: new Set(), firstIn: null, go: false, loop: null, steps: 0 };
  gatherings.add(g);
  g.loop = setInterval(() => stepGathering(g), STEP * 1000);
  return g;
}

function stepGathering(g: Gathering) {
  const { sim } = g;
  if (!g.seats.size) return closeGathering(g); // everyone left
  if (!sim.started) {
    if (g.firstIn === null) return;
    const waited = (performance.now() - g.firstIn) / 1000;
    const proving = [...g.seats].some((r) => !r.aura);
    sim.lobby = Math.max(0, LOBBY - waited);
    if (g.go || waited >= LOBBY_MAX || (waited >= LOBBY && !proving)) {
      for (const r of g.seats) if (!r.aura) { r.send({ t: 'error', message: 'the round began without you' }); r.ws.close(); g.seats.delete(r); }
      sim.lobby = null;
      sim.start();
      console.log(`[dungeon] ${tag(g)} begins with ${sim.playerCount} player(s)`);
    }
  }
  sim.step(STEP);
  if (++g.steps % SNAP_EVERY === 0) {
    if (g.world === 'racer') {
      const events = (sim as RacerSim).drainEvents();
      for (const r of g.seats) if (r.aura && !r.ended) r.send((sim as RacerSim).viewFor(r.aura, events));
    } else {
      const events = (sim as DungeonSim).drainEvents();
      for (const r of g.seats) if (r.aura && !r.ended) r.send((sim as DungeonSim).viewFor(r.aura, events));
    }
  }
  for (const r of g.seats) {
    if (r.aura && !r.ended && sim.doneFor(r.aura)) {
      r.ended = true;
      r.send(g.world === 'racer' ? (sim as RacerSim).viewFor(r.aura, []) : (sim as DungeonSim).viewFor(r.aura, []));
      r.send({ t: 'end', result: g.world === 'racer' ? (sim as RacerSim).result(r.aura) : (sim as DungeonSim).result() });
    }
  }
  if (sim.over && [...g.seats].every((r) => !r.aura || r.ended)) closeGathering(g);
  else if (sim.started && ![...g.seats].some((r) => r.aura && !r.ended)) closeGathering(g);
}

function closeGathering(g: Gathering) {
  if (g.loop) clearInterval(g.loop);
  g.loop = null;
  gatherings.delete(g);
}

// ---------- the choir ----------
// One choir per host: members (any instance that joins here) see each other's presence, talk, and share signs.
// The host only relays; nothing is stored. Signs are public facts (anyone can check a being exists at a cell).
interface Member { ws: WebSocket; send: (m: ServerMsg) => void; info: ChoirMember }
const choir = new Set<Member>();
function choirBroadcast(m: ServerMsg) { for (const x of choir) x.send(m); }
function choirRoster() { choirBroadcast({ t: 'choir-roster', members: [...choir].map((x) => x.info) }); }
const clean = (s: unknown, n: number) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').slice(0, n);

function serveChoir(ws: WebSocket, join: Extract<ClientMsg, { t: 'choir-join' }>, send: (m: ServerMsg) => void, onMessage: (h: (m: ClientMsg) => void) => void) {
  const me: Member = { ws, send, info: { aura: clean(join.aura, 64), handle: clean(join.handle, 24) || clean(join.aura, 6), element: Math.max(0, Math.min(7, Number(join.element) | 0)), since: Date.now(), hum: 0, words: 0, beings: 0, truest: 0, actant: 'none' } };
  choir.add(me);
  console.log(`[dungeon] choir: ${me.info.handle} joined (${choir.size})`);
  choirRoster();
  onMessage((m) => {
    const from = { aura: me.info.aura, handle: me.info.handle };
    if (m.t === 'choir-presence') {
      const p = m.presence;
      Object.assign(me.info, { hum: Math.max(0, Number(p.hum) || 0), words: Math.max(0, Number(p.words) | 0), beings: Math.max(0, Number(p.beings) | 0), truest: Math.max(0, Number(p.truest) | 0), actant: ['none', 'asleep', 'waiting', 'thinking'].includes(p.actant) ? p.actant : 'none' });
      choirRoster();
    } else if (m.t === 'choir-say') {
      const text = clean(m.text, 500).trim();
      if (text) choirBroadcast({ t: 'choir-said', from, text, at: Date.now() });
    } else if (m.t === 'choir-share') {
      const cell = String(m.cell ?? '');
      if (/^[0-7]{12,24}$/.test(cell)) choirBroadcast({ t: 'choir-shared', from, cell, ...(m.note ? { note: clean(m.note, 200) } : {}), at: Date.now() });
    }
  });
  ws.on('close', () => { choir.delete(me); console.log(`[dungeon] choir: ${me.info.handle} left (${choir.size})`); choirRoster(); });
}

function serveShared(ws: WebSocket, world: SharedWorld, level: number, send: (m: ServerMsg) => void, onMessage: (h: (m: ClientMsg) => void) => void) {
  const g = findGathering(world, level);
  console.log(`[dungeon] ${tag(g)}: a player opens (${g.seats.size + 1} gathering, lobby ${g.firstIn === null ? 'not yet open' : `${((performance.now() - g.firstIn) / 1000).toFixed(1)}s in`})`);
  const me: Seat = { ws, aura: null, send, ended: false };
  g.seats.add(me);
  send({ t: 'ticket', context: g.context.toString(), level, world });
  onMessage(async (m) => {
    if (m.t === 'journey') {
      if (me.aura) return send({ t: 'error', message: 'already in' });
      try {
        const { slots, refused } = await g.sim.admit(m.aura, m.bundle);
        me.aura = m.aura;
        if (g.firstIn === null) {
          g.firstIn = performance.now();
          // the choir hears a round gathering: choristers standing ready can join it within the lobby
          choirBroadcast({ t: 'choir-gather', world, level: g.level, by: m.aura, closesIn: LOBBY });
        }
        console.log(`[dungeon] ${tag(g)}: ${m.aura.slice(0, 8)} is in (${g.sim.playerCount}), ${slots.filter(Boolean).length} names${refused.length ? `, refused: ${refused.join('; ')}` : ''}`);
        send(g.sim.welcome(m.aura, slots, refused));
      } catch (err) {
        send({ t: 'error', message: String((err as Error).message ?? err) });
      }
      return;
    }
    if (!me.aura) return;
    if (m.t === 'go') { g.go = true; return; }
    if (m.t === 'pause') { if (g.sim.playerCount === 1) g.sim.paused = !!m.on; return; } // a shared round never pauses
    g.sim.handle(me.aura, m);
  });
  ws.on('close', () => {
    g.seats.delete(me);
    if (me.aura) g.sim.leave(me.aura);
  });
}

function serve(ws: WebSocket) {
  // Dev-only simulated latency (?lag=150 on the client): half each way, so a round trip costs `lag`.
  let lag = 0;
  const send = (_ws: WebSocket, m: ServerMsg) => {
    const out = JSON.stringify(m);
    const go = () => { if (ws.readyState === ws.OPEN) ws.send(out); };
    if (lag > 0) setTimeout(go, lag / 2); else go();
  };
  let context: bigint | null = null;
  let level = 0;
  let world: World = 'dark';
  let sim: BastionSim | CouncilSim | null = null;
  let you: string | null = null;
  let loop: ReturnType<typeof setInterval> | null = null;
  let steps = 0;
  const stop = () => { if (loop) clearInterval(loop); loop = null; };

  ws.on('message', (raw) => {
    if (lag > 0) setTimeout(() => handle(raw), lag / 2); else handle(raw);
  });
  let shared: ((m: ClientMsg) => void) | null = null; // a shared round (or the choir) takes over this connection's messages
  const handle = async (raw: unknown) => {
    let m: ClientMsg;
    try { m = JSON.parse(String(raw)); } catch { return send(ws, { t: 'error', message: 'bad message' }); }
    if (m.t === 'issue') {
      // development: an actant or the explorer reports something that seems broken; kept for whoever builds the game
      const line = { at: new Date().toISOString(), from: clean(m.from, 60), where: clean(m.where ?? '', 120), text: clean(m.text, 2000) };
      console.log(`[issue] ${line.from} (${line.where}): ${line.text}`);
      if (issuesFile) appendFileSync(issuesFile, JSON.stringify(line) + '\n');
      return;
    }
    if (shared) return shared(m);
    if (m.t === 'choir-join' && context === null) {
      context = 0n; // this connection is a choir member, not a round
      return serveChoir(ws, m, (out) => send(ws, out), (h) => { shared = h; });
    }
    switch (m.t) {
      case 'open': {
        if (context !== null) return send(ws, { t: 'error', message: 'round already open' });
        level = Math.max(0, Math.min(MAX_LEVEL, Math.floor(Number(m.level) || 0)));
        lag = Math.max(0, Math.min(MAX_LAG, Math.floor(Number(m.lag) || 0)));
        if (m.world === 'racer' || m.world === 'dark' || !m.world) {
          context = 0n; // a shared round: the gathering issues the context
          return serveShared(ws, m.world === 'racer' ? 'racer' : 'dark', level, (out) => send(ws, out), (h) => { shared = h; });
        }
        world = m.world === 'bastion' ? 'bastion' : 'council';
        context = BigInt('0x' + randomBytes(16).toString('hex'));
        return send(ws, { t: 'ticket', context: context.toString(), level, world });
      }
      case 'journey': {
        if (context === null || sim) return send(ws, { t: 'error', message: 'no open round' });
        sim = world === 'bastion' ? new BastionSim({ level, context, verifier }) : new CouncilSim({ level, context, verifier });
        const t0 = performance.now();
        const { slots, refused } = await sim.admit(m.aura, m.bundle);
        you = m.aura;
        console.log(`[dungeon] ${world} round ${context.toString(16).slice(0, 8)}: ${slots.filter(Boolean).length} names verified in ${(performance.now() - t0).toFixed(0)} ms${refused.length ? `, refused: ${refused.join('; ')}` : ''}`);
        send(ws, sim.welcome(m.aura, slots, refused));
        sim.start();
        loop = setInterval(() => {
          if (!sim) return;
          sim.step(STEP);
          if (++steps % SNAP_EVERY === 0) { const s = sim.snapshot(); if (s) send(ws, s); } // turn-based worlds send only on change
          if (sim.over) {
            const s = sim.snapshot();
            if (s) send(ws, s);
            send(ws, { t: 'end', result: sim.result() });
            stop();
          }
        }, STEP * 1000);
        return;
      }
      case 'pause':
        if (sim) sim.paused = !!m.on; // single-player convenience; a shared dungeon would ignore this
        return;
      default:
        if (sim && you) sim.handle(you, m); // world-specific: movement and casts, or building shrines
        return;
    }
  };
  ws.on('close', () => stop());
}

export interface DungeonHost { port: number; close(): Promise<void> }

/** Start a dungeon: listen for worlds on `port` (all interfaces by default, so LAN friends can join). */
export function startDungeon(opts: { port: number; host?: string; vkey: object; issues?: string }): Promise<DungeonHost> {
  verifier = zkVerifier(opts.vkey);
  issuesFile = opts.issues ?? null;
  return new Promise((res, rej) => {
    const wss = new WebSocketServer({ port: opts.port, host: opts.host ?? '0.0.0.0' });
    wss.on('connection', serve);
    wss.once('error', rej);
    wss.once('listening', () => {
      console.log(`[dungeon] listening on ws://${opts.host ?? '0.0.0.0'}:${opts.port}`);
      res({ port: opts.port, close: () => new Promise((r) => { for (const g of gatherings) closeGathering(g); wss.close(() => r()); }) });
    });
  });
}

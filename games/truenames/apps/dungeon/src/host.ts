// The dungeon: an authoritative host for worlds (a game server). It runs as its own process (server.ts) or inside
// the desktop app; a game master can run one anywhere. Each connection is a round (the Dark and Dark Racer share
// rounds among players). It issues a fresh context, verifies zero-knowledge journeys against it, runs the
// simulation at a fixed step, and streams snapshots. It never sees a secret: no addresses, no nonces, no keys.
// It knows nothing of choirs: gathering happens at altars (apps/altar). Every connection is sealed (packages/channel).
import { WebSocketServer } from 'ws';
import { randomBytes } from 'node:crypto';
import type { ProofVerifier } from '@truenames/authority';
import { b64u, type ChannelKey } from '@truenames/channel';
import { sealServerSocket, type Peer } from '@truenames/channel/node';
import { DungeonSim, BastionSim, CouncilSim, RacerSim, zkVerifier, type ClientMsg, type ServerMsg, type World } from '@truenames/dungeon';

/** Set by startDungeon: verifies proofs against the circuit's verification key. */
let verifier: ProofVerifier;
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
interface Seat { peer: Peer; aura: string | null; send: (m: ServerMsg) => void; ended: boolean }
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
      for (const r of g.seats) if (!r.aura) { r.send({ t: 'error', message: 'the round began without you' }); r.peer.close(); g.seats.delete(r); }
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

function serveShared(peer: Peer, world: SharedWorld, level: number, send: (m: ServerMsg) => void, onMessage: (h: (m: ClientMsg) => void) => void) {
  const g = findGathering(world, level);
  console.log(`[dungeon] ${tag(g)}: a player opens (${g.seats.size + 1} gathering, lobby ${g.firstIn === null ? 'not yet open' : `${((performance.now() - g.firstIn) / 1000).toFixed(1)}s in`})`);
  const me: Seat = { peer, aura: null, send, ended: false };
  g.seats.add(me);
  send({ t: 'ticket', context: g.context.toString(), level, world });
  onMessage(async (m) => {
    if (m.t === 'journey') {
      if (me.aura) return send({ t: 'error', message: 'already in' });
      try {
        const { slots, refused } = await g.sim.admit(m.aura, m.bundle);
        me.aura = m.aura;
        // the first one in opens the lobby, and may call the round at their altars (the dungeon knows no altars)
        const first = g.firstIn === null;
        if (first) g.firstIn = performance.now();
        console.log(`[dungeon] ${tag(g)}: ${m.aura.slice(0, 8)} is in (${g.sim.playerCount}), ${slots.filter(Boolean).length} names${refused.length ? `, refused: ${refused.join('; ')}` : ''}`);
        send({ ...(g.sim.welcome(m.aura, slots, refused) as Extract<ServerMsg, { t: 'welcome'; world: 'dark' | 'racer' }>), gathering: { first, closesIn: LOBBY } });
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
  peer.onClose(() => {
    g.seats.delete(me);
    if (me.aura) g.sim.leave(me.aura);
  });
}

function serve(peer: Peer) {
  // Dev-only simulated latency (?lag=150 on the client): half each way, so a round trip costs `lag`.
  let lag = 0;
  const send = (m: ServerMsg) => { if (lag > 0) setTimeout(() => peer.send(m), lag / 2); else peer.send(m); };
  let context: bigint | null = null;
  let level = 0;
  let world: World = 'dark';
  let sim: BastionSim | CouncilSim | null = null;
  let you: string | null = null;
  let loop: ReturnType<typeof setInterval> | null = null;
  let steps = 0;
  const stop = () => { if (loop) clearInterval(loop); loop = null; };

  peer.onMessage((m) => { if (lag > 0) setTimeout(() => handle(m as ClientMsg), lag / 2); else handle(m as ClientMsg); });
  let shared: ((m: ClientMsg) => void) | null = null; // a shared round takes over this connection's messages
  const handle = async (m: ClientMsg) => {
    if (!m || typeof m !== 'object') return send({ t: 'error', message: 'bad message' });
    if (shared) return shared(m);
    switch (m.t) {
      case 'open': {
        if (context !== null) return send({ t: 'error', message: 'round already open' });
        level = Math.max(0, Math.min(MAX_LEVEL, Math.floor(Number(m.level) || 0)));
        lag = Math.max(0, Math.min(MAX_LAG, Math.floor(Number(m.lag) || 0)));
        if (m.world === 'racer' || m.world === 'dark' || !m.world) {
          context = 0n; // a shared round: the gathering issues the context
          return serveShared(peer, m.world === 'racer' ? 'racer' : 'dark', level, send, (h) => { shared = h; });
        }
        world = m.world === 'bastion' ? 'bastion' : 'council';
        context = BigInt('0x' + randomBytes(16).toString('hex'));
        return send({ t: 'ticket', context: context.toString(), level, world });
      }
      case 'journey': {
        if (context === null || sim) return send({ t: 'error', message: 'no open round' });
        sim = world === 'bastion' ? new BastionSim({ level, context, verifier }) : new CouncilSim({ level, context, verifier });
        const t0 = performance.now();
        const { slots, refused } = await sim.admit(m.aura, m.bundle);
        you = m.aura;
        console.log(`[dungeon] ${world} round ${context.toString(16).slice(0, 8)}: ${slots.filter(Boolean).length} names verified in ${(performance.now() - t0).toFixed(0)} ms${refused.length ? `, refused: ${refused.join('; ')}` : ''}`);
        send(sim.welcome(m.aura, slots, refused));
        sim.start();
        loop = setInterval(() => {
          if (!sim) return;
          sim.step(STEP);
          if (++steps % SNAP_EVERY === 0) { const s = sim.snapshot(); if (s) send(s); } // turn-based worlds send only on change
          if (sim.over) {
            const s = sim.snapshot();
            if (s) send(s);
            send({ t: 'end', result: sim.result() });
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
  peer.onClose(() => stop());
}

export interface DungeonHost { port: number; key: string; close(): Promise<void> }

/** Start a dungeon: listen for worlds on `port` (all interfaces by default, so LAN friends can join). `key` is its identity. */
export function startDungeon(opts: { port: number; host?: string; vkey: object; key: ChannelKey }): Promise<DungeonHost> {
  verifier = zkVerifier(opts.vkey);
  return new Promise((res, rej) => {
    const wss = new WebSocketServer({ port: opts.port, host: opts.host ?? '0.0.0.0' });
    wss.on('connection', (ws) => serve(sealServerSocket(ws, opts.key)));
    wss.once('error', rej);
    wss.once('listening', () => {
      console.log(`[dungeon] listening on ws://${opts.host ?? '0.0.0.0'}:${opts.port} (key ${b64u(opts.key.pub).slice(0, 8)}…)`);
      res({ port: opts.port, key: b64u(opts.key.pub), close: () => new Promise((r) => { for (const g of gatherings) closeGathering(g); wss.close(() => r()); }) });
    });
  });
}

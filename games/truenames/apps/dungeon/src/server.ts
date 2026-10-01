// The dungeon process: an authoritative host for rounds. Each WebSocket connection is one round.
// It issues a fresh context, verifies zero-knowledge journeys against it, runs the simulation at a
// fixed step, and streams snapshots. It never sees a secret: no addresses, no nonces, no keys.
import { WebSocketServer, type WebSocket } from 'ws';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { DungeonSim, BastionSim, CouncilSim, RacerSim, zkVerifier, type ClientMsg, type ServerMsg, type World } from '@truenames/dungeon';

const require = createRequire(import.meta.url);
const vkey = JSON.parse(readFileSync(require.resolve('@truenames/proofs/artifacts/name.vkey.json'), 'utf8'));
const verifier = zkVerifier(vkey);

const PORT = Number(process.env.DUNGEON_PORT ?? 5192);
const STEP = 1 / 60; // simulation step
const SNAP_EVERY = 3; // snapshots at 20 Hz
const MAX_LEVEL = 99;

const MAX_LAG = 1000;

// ---------- shared races (Dark Racer) ----------
// A racer joins a race at the same circuit that is still gathering, so everyone proves against the same
// context. The lobby opens when the first racer reaches the grid and holds the start for LOBBY seconds
// (longer if someone is still proving, never past LOBBY_MAX), or until a racer says go.
const LOBBY = 15;
const LOBBY_MAX = 35;

interface Racer { ws: WebSocket; aura: string | null; send: (m: ServerMsg) => void; ended: boolean }
interface Race { sim: RacerSim; context: bigint; level: number; racers: Set<Racer>; firstOnGrid: number | null; go: boolean; loop: ReturnType<typeof setInterval> | null; steps: number }
const races = new Set<Race>();

function findRace(level: number): Race {
  for (const r of races) {
    const open = !r.sim.started && r.racers.size < r.sim.seats && (r.firstOnGrid === null || performance.now() - r.firstOnGrid < LOBBY * 1000);
    if (r.level === level && open) return r;
  }
  const context = BigInt('0x' + randomBytes(16).toString('hex'));
  const race: Race = { sim: new RacerSim({ level, context, verifier }), context, level, racers: new Set(), firstOnGrid: null, go: false, loop: null, steps: 0 };
  races.add(race);
  race.loop = setInterval(() => raceStep(race), STEP * 1000);
  return race;
}

function raceStep(race: Race) {
  const { sim } = race;
  if (!race.racers.size) return closeRace(race); // everyone left
  if (!sim.started) {
    if (race.firstOnGrid === null) return;
    const waited = (performance.now() - race.firstOnGrid) / 1000;
    const proving = [...race.racers].some((r) => !r.aura);
    sim.lobby = Math.max(0, LOBBY - waited);
    if (race.go || waited >= LOBBY_MAX || (waited >= LOBBY && !proving)) {
      for (const r of race.racers) if (!r.aura) { r.send({ t: 'error', message: 'the race left without you' }); r.ws.close(); race.racers.delete(r); }
      sim.lobby = null;
      sim.start();
      console.log(`[dungeon] race ${race.context.toString(16).slice(0, 8)} starts with ${sim.playerCount} racer(s)`);
    }
  }
  sim.step(STEP);
  if (++race.steps % SNAP_EVERY === 0) {
    const events = sim.drainEvents();
    for (const r of race.racers) if (r.aura && !r.ended) r.send(sim.viewFor(r.aura, events));
  }
  for (const r of race.racers) {
    if (r.aura && !r.ended && sim.doneFor(r.aura)) {
      r.ended = true;
      r.send(sim.viewFor(r.aura, []));
      r.send({ t: 'end', result: sim.result(r.aura) });
    }
  }
  if (sim.over || (sim.started && ![...race.racers].some((r) => r.aura && !r.ended))) closeRace(race);
}

function closeRace(race: Race) {
  if (race.loop) clearInterval(race.loop);
  race.loop = null;
  races.delete(race);
}

function serveRacer(ws: WebSocket, level: number, send: (m: ServerMsg) => void, onMessage: (h: (m: ClientMsg) => void) => void) {
  const race = findRace(level);
  console.log(`[dungeon] race ${race.context.toString(16).slice(0, 8)}: a racer opens (${race.racers.size + 1} at the line, lobby ${race.firstOnGrid === null ? 'not yet open' : `${((performance.now() - race.firstOnGrid) / 1000).toFixed(1)}s in`})`);
  const me: Racer = { ws, aura: null, send, ended: false };
  race.racers.add(me);
  send({ t: 'ticket', context: race.context.toString(), level, world: 'racer' });
  onMessage(async (m) => {
    if (m.t === 'journey') {
      if (me.aura) return send({ t: 'error', message: 'already on the grid' });
      try {
        const { slots, refused } = await race.sim.admit(m.aura, m.bundle);
        me.aura = m.aura;
        race.firstOnGrid ??= performance.now();
        console.log(`[dungeon] race ${race.context.toString(16).slice(0, 8)}: ${m.aura.slice(0, 8)} on the grid (${race.sim.playerCount}), ${slots.filter(Boolean).length} names${refused.length ? `, refused: ${refused.join('; ')}` : ''}`);
        send(race.sim.welcome(m.aura, slots, refused));
      } catch (err) {
        send({ t: 'error', message: String((err as Error).message ?? err) });
      }
      return;
    }
    if (!me.aura) return;
    if (m.t === 'go') { race.go = true; return; }
    if (m.t === 'pause') { if (race.sim.playerCount === 1) race.sim.paused = !!m.on; return; } // a shared race never pauses
    race.sim.handle(me.aura, m);
  });
  ws.on('close', () => {
    race.racers.delete(me);
    if (me.aura) race.sim.leave(me.aura);
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
  let sim: DungeonSim | BastionSim | CouncilSim | null = null;
  let you: string | null = null;
  let loop: ReturnType<typeof setInterval> | null = null;
  let steps = 0;
  const stop = () => { if (loop) clearInterval(loop); loop = null; };

  ws.on('message', (raw) => {
    if (lag > 0) setTimeout(() => handle(raw), lag / 2); else handle(raw);
  });
  let racer: ((m: ClientMsg) => void) | null = null; // a shared race takes over this connection's messages
  const handle = async (raw: unknown) => {
    let m: ClientMsg;
    try { m = JSON.parse(String(raw)); } catch { return send(ws, { t: 'error', message: 'bad message' }); }
    if (racer) return racer(m);
    switch (m.t) {
      case 'open': {
        if (context !== null) return send(ws, { t: 'error', message: 'round already open' });
        level = Math.max(0, Math.min(MAX_LEVEL, Math.floor(Number(m.level) || 0)));
        lag = Math.max(0, Math.min(MAX_LAG, Math.floor(Number(m.lag) || 0)));
        if (m.world === 'racer') {
          context = 0n;
          return serveRacer(ws, level, (out) => send(ws, out), (h) => { racer = h; });
        }
        world = m.world === 'bastion' || m.world === 'council' ? m.world : 'dark';
        context = BigInt('0x' + randomBytes(16).toString('hex'));
        return send(ws, { t: 'ticket', context: context.toString(), level, world });
      }
      case 'journey': {
        if (context === null || sim) return send(ws, { t: 'error', message: 'no open round' });
        sim = world === 'bastion' ? new BastionSim({ level, context, verifier }) : world === 'council' ? new CouncilSim({ level, context, verifier }) : new DungeonSim({ level, context, verifier });
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

const wss = new WebSocketServer({ port: PORT });
wss.on('connection', serve);
console.log(`[dungeon] listening on ws://localhost:${PORT}`);

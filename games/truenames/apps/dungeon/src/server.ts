// The dungeon process: an authoritative host for rounds. Each WebSocket connection is one round.
// It issues a fresh context, verifies zero-knowledge journeys against it, runs the simulation at a
// fixed step, and streams snapshots. It never sees a secret: no addresses, no nonces, no keys.
import { WebSocketServer, type WebSocket } from 'ws';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { DungeonSim, BastionSim, CouncilSim, zkVerifier, type ClientMsg, type ServerMsg, type World } from '@truenames/dungeon';

const require = createRequire(import.meta.url);
const vkey = JSON.parse(readFileSync(require.resolve('@truenames/proofs/artifacts/name.vkey.json'), 'utf8'));
const verifier = zkVerifier(vkey);

const PORT = Number(process.env.DUNGEON_PORT ?? 5192);
const STEP = 1 / 60; // simulation step
const SNAP_EVERY = 3; // snapshots at 20 Hz
const MAX_LEVEL = 99;

const MAX_LAG = 1000;

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
  const handle = async (raw: unknown) => {
    let m: ClientMsg;
    try { m = JSON.parse(String(raw)); } catch { return send(ws, { t: 'error', message: 'bad message' }); }
    switch (m.t) {
      case 'open': {
        if (context !== null) return send(ws, { t: 'error', message: 'round already open' });
        level = Math.max(0, Math.min(MAX_LEVEL, Math.floor(Number(m.level) || 0)));
        lag = Math.max(0, Math.min(MAX_LAG, Math.floor(Number(m.lag) || 0)));
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

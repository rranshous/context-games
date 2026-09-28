// The dungeon process: an authoritative host for rounds. Each WebSocket connection is one round.
// It issues a fresh context, verifies zero-knowledge journeys against it, runs the simulation at a
// fixed step, and streams snapshots. It never sees a secret: no addresses, no nonces, no keys.
import { WebSocketServer, type WebSocket } from 'ws';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { DungeonSim, zkVerifier, type ClientMsg, type ServerMsg } from '@truenames/dungeon';

const require = createRequire(import.meta.url);
const vkey = JSON.parse(readFileSync(require.resolve('@truenames/proofs/artifacts/name.vkey.json'), 'utf8'));
const verifier = zkVerifier(vkey);

const PORT = Number(process.env.DUNGEON_PORT ?? 5192);
const STEP = 1 / 60; // simulation step
const SNAP_EVERY = 3; // snapshots at 20 Hz
const MAX_LEVEL = 99;

function send(ws: WebSocket, m: ServerMsg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m));
}

function serve(ws: WebSocket) {
  let context: bigint | null = null;
  let level = 0;
  let sim: DungeonSim | null = null;
  let you: string | null = null;
  let loop: ReturnType<typeof setInterval> | null = null;
  let steps = 0;
  const stop = () => { if (loop) clearInterval(loop); loop = null; };

  ws.on('message', async (raw) => {
    let m: ClientMsg;
    try { m = JSON.parse(String(raw)); } catch { return send(ws, { t: 'error', message: 'bad message' }); }
    switch (m.t) {
      case 'open': {
        if (context !== null) return send(ws, { t: 'error', message: 'round already open' });
        level = Math.max(0, Math.min(MAX_LEVEL, Math.floor(Number(m.level) || 0)));
        context = BigInt('0x' + randomBytes(16).toString('hex'));
        return send(ws, { t: 'ticket', context: context.toString(), level });
      }
      case 'journey': {
        if (context === null || sim) return send(ws, { t: 'error', message: 'no open round' });
        sim = new DungeonSim({ level, context, verifier });
        const t0 = performance.now();
        const { slots, refused } = await sim.admit(m.aura, m.bundle);
        you = m.aura;
        console.log(`[dungeon] round ${context.toString(16).slice(0, 8)}: ${slots.filter(Boolean).length} names verified in ${(performance.now() - t0).toFixed(0)} ms${refused.length ? `, refused: ${refused.join('; ')}` : ''}`);
        send(ws, { t: 'welcome', you: m.aura, level, arena: { w: sim.W, h: sim.H }, pillars: sim.pillars, slots, refused });
        sim.start();
        loop = setInterval(() => {
          if (!sim) return;
          sim.step(STEP);
          if (++steps % SNAP_EVERY === 0) send(ws, sim.snapshot());
          if (sim.over) {
            send(ws, sim.snapshot());
            send(ws, { t: 'end', result: sim.result() });
            stop();
          }
        }, STEP * 1000);
        return;
      }
      case 'input':
        if (sim && you) sim.input(you, Number(m.mx) || 0, Number(m.my) || 0, Number(m.ax), Number(m.ay));
        return;
      case 'cast':
        if (sim && you) sim.cast(you, Math.floor(Number(m.slot)), Number(m.ax), Number(m.ay));
        return;
      case 'pause':
        if (sim) sim.paused = !!m.on; // single-player convenience; a shared dungeon would ignore this
        return;
      case 'abandon':
        if (sim && you) sim.leave(you);
        return;
    }
  });
  ws.on('close', () => stop());
}

const wss = new WebSocketServer({ port: PORT });
wss.on('connection', serve);
console.log(`[dungeon] listening on ws://localhost:${PORT}`);

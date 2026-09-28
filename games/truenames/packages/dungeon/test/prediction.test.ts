import { describe, it, expect } from 'vitest';
import { DungeonSim, movePlayer, type MoveCmd } from '../src/index.ts';
import type { ProofVerifier } from '@truenames/authority';

const noProofs: ProofVerifier = { async verify() { return { ok: false, reason: 'unused' }; } };
function rng(seed = 3) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

async function setup() {
  const sim = new DungeonSim({ level: 0, context: 1n, verifier: noProofs, rng: rng() });
  await sim.admit('me', []);
  sim.start();
  const s0 = sim.snapshot().players[0]!;
  return { sim, start: { x: s0.x, y: s0.y } };
}

/** A wandering command stream that spends time pressed against walls and pillars. */
function commands(n: number): MoveCmd[] {
  const r = rng(11);
  const out: MoveCmd[] = [];
  let mx = 1, my = 0;
  for (let i = 1; i <= n; i++) {
    if (i % 40 === 0) { mx = Math.round(r() * 2 - 1); my = Math.round(r() * 2 - 1); }
    out.push({ seq: i, mx, my, ax: 500, ay: 500, dt: 1 / 60 });
  }
  return out;
}

describe('client prediction', () => {
  it('predicting with the shared movement code lands exactly where the dungeon does, even with lag', async () => {
    const { sim, start } = await setup();
    const cmds = commands(600);
    const predicted = { ...start };
    const LAG = 9; // ticks in flight (~150 ms at 60 Hz)
    for (let i = 0; i < cmds.length + LAG; i++) {
      sim.step(1 / 60);
      if (i < cmds.length) movePlayer(predicted, cmds[i]!, sim.arena); // the client moves at once
      const arriving = cmds[i - LAG];
      if (arriving) sim.commands('me', [arriving]); // the dungeon hears it later
    }
    const s = sim.snapshot().players[0]!;
    expect(s.ack).toBe(600);
    expect(s.x).toBeCloseTo(predicted.x, 9);
    expect(s.y).toBeCloseTo(predicted.y, 9);
  });

  it('reconciling (reset to the snapshot, replay unacknowledged commands) reproduces the prediction', async () => {
    const { sim, start } = await setup();
    const cmds = commands(300);
    const predicted = { ...start };
    for (const c of cmds) movePlayer(predicted, c, sim.arena);
    // the dungeon has only heard the first 180
    for (const c of cmds.slice(0, 180)) { sim.step(1 / 60); sim.commands('me', [c]); }
    const s = sim.snapshot().players[0]!;
    const replay = { x: s.x, y: s.y };
    for (const c of cmds.filter((c) => c.seq > s.ack)) movePlayer(replay, c, sim.arena);
    expect(replay.x).toBeCloseTo(predicted.x, 9);
    expect(replay.y).toBeCloseTo(predicted.y, 9);
  });

  it("commands can't move a player faster than real time", async () => {
    const { sim, start } = await setup();
    sim.step(1 / 60);
    // a cheating client claims 100 ticks of movement after one real tick
    sim.commands('me', Array.from({ length: 100 }, (_, i) => ({ seq: i + 1, mx: 1, my: 0, ax: 0, ay: 0, dt: 1 / 60 })));
    const s = sim.snapshot().players[0]!;
    expect(s.ack).toBe(100);
    expect(Math.hypot(s.x - start.x, s.y - start.y)).toBeLessThan(10); // ~1/60 s of movement, not 100/60
  });
});

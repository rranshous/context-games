import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { ed25519 } from '@noble/curves/ed25519.js';
import { bytesToHex, spiritAt, facetForm, MIN_NAME_BITS } from '@truenames/universe';
import { proveName, type ZkNameClaim } from '@truenames/proofs';
import { DungeonSim, zkVerifier, HEARTH_GOD, BALANCE as B, autofight, fightViewOf, type Snapshot } from '../src/index.ts';
import { HEARTH_NONCE, HEARTH_NONCE_2 } from './fixtures.ts';

const require = createRequire(import.meta.url);
const art = (f: string) => require.resolve(`@truenames/proofs/artifacts/${f}`);
const verifier = zkVerifier(JSON.parse(readFileSync(art('name.vkey.json'), 'utf8')));
const SECRET = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const SECRET2 = Uint8Array.from({ length: 32 }, (_, i) => 200 - i);
const AURA = bytesToHex(ed25519.getPublicKey(SECRET));
const AURA2 = bytesToHex(ed25519.getPublicKey(SECRET2));
const CONTEXT = 777n;
const FORMS = ['bolt', 'ring', 'ward', 'lance', 'nova', 'summon', 'hex', 'blink'];
let claim: ZkNameClaim, claim2: ZkNameClaim;
function rng(seed = 7) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Two fighters on autofight, speaking their word when an enemy is in reach and they are cool enough. */
function fight(sim: DungeonSim, auras: string[], seconds: number) {
  const form = FORMS[facetForm(spiritAt(HEARTH_GOD)!.traits, 0)]!;
  const seq = new Map<string, number>();
  let last: Snapshot | null = null;
  for (let i = 0; i < seconds * 60 && !sim.over; i++) {
    if (last && i % 2 === 0) {
      for (const a of auras) {
        const v = fightViewOf(last, a, [form], { w: sim.W, h: sim.H }, i / 60, {});
        if (!v.me.alive) continue;
        const o = autofight(v);
        const n = (seq.get(a) ?? 0) + 1;
        seq.set(a, n);
        sim.handle(a, { t: 'cmds', cmds: [{ seq: n, ...o, dt: 2 / 60 }] });
        if (v.enemies[0] && v.enemies[0].dist < 500 && v.me.strain < v.me.capacity * 0.8 && i % 30 === 0) sim.handle(a, { t: 'cast', slot: 0, ax: o.ax, ay: o.ay });
      }
    }
    sim.step(1 / 60);
    if (i % 2 === 1) last = sim.viewFor(AURA, sim.drainEvents());
  }
  return last!;
}

describe('the shared dark', () => {
  beforeAll(async () => {
    const prove = (secretKey: Uint8Array, nonce: bigint) => proveName({ cell: HEARTH_GOD, nonce, secretKey, magnitude: spiritAt(HEARTH_GOD)!.magnitude, strength: MIN_NAME_BITS, context: CONTEXT }, { wasm: art('name.wasm'), zkey: art('name.zkey') });
    [claim, claim2] = await Promise.all([prove(SECRET, HEARTH_NONCE), prove(SECRET2, HEARTH_NONCE_2)]);
  });

  it('admits several players before the start, apart from each other, and none after', async () => {
    const sim = new DungeonSim({ level: 0, context: CONTEXT, verifier, rng: rng() });
    await sim.admit(AURA, [{ slot: 0, claim }]);
    await sim.admit(AURA2, [{ slot: 0, claim: claim2 }]);
    expect(sim.playerCount).toBe(2);
    await expect(sim.admit(AURA2, [{ slot: 0, claim: claim2 }])).rejects.toThrow(/already/);
    const s = sim.viewFor(AURA, []);
    expect(s.players.length).toBe(2);
    expect(Math.hypot(s.players[0]!.x - s.players[1]!.x, s.players[0]!.y - s.players[1]!.y)).toBeGreaterThan(30);
    sim.start();
    await expect(sim.admit('ff'.repeat(32), [])).rejects.toThrow(/begun/);
  });

  it('leaving before the start just goes; leaving after falls, and only that player is done', async () => {
    const sim = new DungeonSim({ level: 0, context: CONTEXT, verifier, rng: rng() });
    await sim.admit(AURA, [{ slot: 0, claim }]);
    await sim.admit(AURA2, [{ slot: 0, claim: claim2 }]);
    sim.leave(AURA2);
    expect(sim.playerCount).toBe(1);
    await sim.admit(AURA2, [{ slot: 0, claim: claim2 }]);
    sim.start();
    sim.leave(AURA2);
    expect(sim.doneFor(AURA2)).toBe(true);
    expect(sim.doneFor(AURA)).toBe(false);
    expect(sim.over).toBeNull(); // one still stands
  });

  it('more players bring more of the dark', async () => {
    const count = async (two: boolean) => {
      const sim = new DungeonSim({ level: 0, context: CONTEXT, verifier, rng: rng() });
      await sim.admit(AURA, [{ slot: 0, claim }]);
      if (two) await sim.admit(AURA2, [{ slot: 0, claim: claim2 }]);
      sim.start();
      for (let i = 0; i < 60 * 3; i++) sim.step(1 / 60); // past the first breather
      return sim.viewFor(AURA, []).remaining;
    };
    const solo = await count(false), pair = await count(true);
    expect(solo).toBe(B.waves[0]!.husk);
    expect(pair).toBe(Math.round(B.waves[0]!.husk! * (1 + B.coop.countPerPlayer)));
  });

  it('two fighters on autofight, speaking their words, break the first waves together', async () => {
    const sim = new DungeonSim({ level: 0, context: CONTEXT, verifier, rng: rng(3) });
    await sim.admit(AURA, [{ slot: 0, claim }]);
    await sim.admit(AURA2, [{ slot: 0, claim: claim2 }]);
    sim.start();
    const s = fight(sim, [AURA, AURA2], 90);
    console.log(`[shared dark] two fighters: wave ${s.wave + 1}, ${s.kills} banished, ${s.players.filter((p) => p.alive).length} standing${sim.over ? `, ${sim.over}` : ''}`);
    expect(s.kills).toBeGreaterThan(10);
    expect(s.wave).toBeGreaterThanOrEqual(2);
  });
});

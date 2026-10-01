import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { ed25519 } from '@noble/curves/ed25519.js';
import { bytesToHex, nameStrength, spiritAt, MIN_NAME_BITS, traitHashFromDigest, cellDigest } from '@truenames/universe';
import { proveName, type ZkNameClaim } from '@truenames/proofs';
import { DungeonSim, zkVerifier, HEARTH_GOD, BALANCE } from '../src/index.ts';
import { HEARTH_NONCE, HEARTH_NONCE_2 } from './fixtures.ts';

const require = createRequire(import.meta.url);
const art = (f: string) => require.resolve(`@truenames/proofs/artifacts/${f}`);
const verifier = zkVerifier(JSON.parse(readFileSync(art('name.vkey.json'), 'utf8')));
const SECRET = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const AURA = bytesToHex(ed25519.getPublicKey(SECRET));
const CONTEXT = 424242n;
let claim: ZkNameClaim;

// a deterministic rng so the round is repeatable
function rng(seed = 7) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

describe('DungeonSim', () => {
  beforeAll(async () => {
    let n = 0n;
    n = HEARTH_NONCE;
    claim = await proveName({ cell: HEARTH_GOD, nonce: n, secretKey: SECRET, magnitude: spiritAt(HEARTH_GOD)!.magnitude, strength: MIN_NAME_BITS, context: CONTEXT }, { wasm: art('name.wasm'), zkey: art('name.zkey') });
  });

  it('admits a player from proofs alone and reveals no address', async () => {
    const sim = new DungeonSim({ level: 0, context: CONTEXT, verifier, rng: rng() });
    const { slots, refused } = await sim.admit(AURA, [{ slot: 0, claim }]);
    expect(refused).toEqual([]);
    expect(slots[0]).toMatchObject({ element: spiritAt(HEARTH_GOD)!.element, strength: MIN_NAME_BITS, magnitude: spiritAt(HEARTH_GOD)!.magnitude, facet: 0 });
    expect(slots[0]!.spirit.startsWith('r:')).toBe(true);
    expect(slots[0]!.traits).toMatchObject({ form: spiritAt(HEARTH_GOD)!.traits.form, flavor: '0' }); // the facet's form; flavor never revealed
    expect(JSON.stringify(slots)).not.toContain(HEARTH_GOD);
    expect(JSON.stringify(slots)).not.toContain(traitHashFromDigest(cellDigest(HEARTH_GOD)).toString());
  });

  it('refuses a proof from another round and a proof presented under another aura', async () => {
    const other = new DungeonSim({ level: 0, context: CONTEXT + 1n, verifier, rng: rng() });
    expect((await other.admit(AURA, [{ slot: 0, claim }])).refused).toEqual(['wrong journey']);
    const sim = new DungeonSim({ level: 0, context: CONTEXT, verifier, rng: rng() });
    const thief = bytesToHex(ed25519.getPublicKey(new Uint8Array(32).fill(9)));
    expect((await sim.admit(thief, [{ slot: 0, claim }])).refused.length).toBe(1);
  });

  it('runs waves, resolves casts through the authority, and lets a lance kill', async () => {
    const sim = new DungeonSim({ level: 0, context: CONTEXT, verifier, rng: rng() });
    await sim.admit(AURA, [{ slot: 0, claim }]);
    sim.start();
    const events: string[] = [];
    let kills = 0;
    let seq = 0;
    for (let i = 0; i < 60 * 40 && !sim.over; i++) {
      sim.step(1 / 60);
      const snap = sim.snapshot();
      for (const e of snap.events) events.push(e.e);
      kills = snap.kills;
      const me = snap.players[0]!;
      const target = snap.enemies[0];
      if (target) {
        // kite away and lance every ~0.6 s
        sim.commands(AURA, [{ seq: ++seq, mx: Math.sign(me.x - target.x), my: Math.sign(me.y - target.y), ax: target.x, ay: target.y, dt: 1 / 60 }]);
        if (i % 36 === 0) sim.cast(AURA, 0, target.x, target.y);
      } else sim.commands(AURA, [{ seq: ++seq, mx: 0, my: 0, ax: me.x + 50, ay: me.y, dt: 1 / 60 }]);
    }
    expect(events).toContain('wave');
    expect(events).toContain('cast');
    expect(events).toContain('beam'); // the hearth-god is a lance
    expect(kills).toBeGreaterThan(0);
    expect(sim.snapshot().wave).toBeGreaterThanOrEqual(1);
  });

  it('refuses the same patron twice in one bundle', async () => {
    const sim = new DungeonSim({ level: 0, context: CONTEXT, verifier, rng: rng() });
    const r = await sim.admit(AURA, [{ slot: 0, claim }, { slot: 1, claim }]);
    expect(r.slots.filter(Boolean).length).toBe(1);
    expect(r.refused).toEqual(['the same patron twice']);
  });

  it('ends lost when the only player leaves', async () => {
    const sim = new DungeonSim({ level: 0, context: CONTEXT, verifier, rng: rng() });
    await sim.admit(AURA, [{ slot: 0, claim }]);
    sim.start();
    sim.leave(AURA);
    expect(sim.over).toBe('lost');
    expect(sim.result()).toMatchObject({ won: false, level: 0 });
    expect(BALANCE.waves.length).toBe(5);
  });
});

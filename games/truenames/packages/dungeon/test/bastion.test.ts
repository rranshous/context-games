import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { ed25519 } from '@noble/curves/ed25519.js';
import { bytesToHex, nameStrength, spiritAt, MIN_NAME_BITS } from '@truenames/universe';
import { proveName, type ZkNameClaim } from '@truenames/proofs';
import { BastionSim, zkVerifier, HEARTH_GOD, BASTION, type BastionSnapshot } from '../src/index.ts';

const require = createRequire(import.meta.url);
const art = (f: string) => require.resolve(`@truenames/proofs/artifacts/${f}`);
const verifier = zkVerifier(JSON.parse(readFileSync(art('name.vkey.json'), 'utf8')));
const SECRET = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const AURA = bytesToHex(ed25519.getPublicKey(SECRET));
const CONTEXT = 99n;
let claim: ZkNameClaim;
function rng(seed = 5) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

async function round() {
  const sim = new BastionSim({ level: 0, context: CONTEXT, verifier, rng: rng() });
  const { slots, refused } = await sim.admit(AURA, [{ slot: 0, claim }]);
  expect(refused).toEqual([]);
  sim.start();
  return { sim, slots };
}
function run(sim: BastionSim, seconds: number, each?: (s: BastionSnapshot) => void) {
  const events: string[] = [];
  let last!: BastionSnapshot;
  for (let i = 0; i < seconds * 60 && !sim.over; i++) {
    sim.step(1 / 60);
    last = sim.snapshot();
    for (const e of last.events) events.push(e.e);
    each?.(last);
  }
  return { events, last };
}

describe('the Bastion', () => {
  beforeAll(async () => {
    let n = 0n;
    while (nameStrength(HEARTH_GOD, ed25519.getPublicKey(SECRET), n) < MIN_NAME_BITS) n++;
    claim = await proveName({ cell: HEARTH_GOD, nonce: n, secretKey: SECRET, magnitude: spiritAt(HEARTH_GOD)!.magnitude, strength: MIN_NAME_BITS, context: CONTEXT }, { wasm: art('name.wasm'), zkey: art('name.zkey') });
  });

  it('admits proven names and lays out a road to the hearth', async () => {
    const { sim, slots } = await round();
    expect(slots[0]).toMatchObject({ element: 0, strength: MIN_NAME_BITS });
    const l = sim.layout();
    expect(l.road.length).toBe(BASTION.path.length);
    expect(l.roadTiles.length).toBeGreaterThan(30);
    expect(l.hearth.max).toBe(BASTION.hearth);
  });

  it('builds shrines only where allowed and charges rising resonance', async () => {
    const { sim } = await round();
    const r0 = sim.snapshot().resonance;
    sim.build(0, 5, 2); // on the road
    sim.build(0, 5, 3); // fine
    sim.build(0, 5, 3); // occupied
    sim.build(0, 99, 3); // outside
    const s = sim.snapshot();
    expect(s.shrines.length).toBe(1);
    expect(s.resonance).toBe(r0 - BASTION.shrineBase);
    expect(s.shrineCost).toBe(BASTION.shrineBase + BASTION.shrineStep);
    expect(s.events.filter((e) => e.e === 'denied').length).toBe(3);
  });

  it('shrines speak through the authority (lance), strain the aura, and earn resonance', async () => {
    const { sim } = await round();
    // lance shrines beside the first stretch of road
    sim.build(0, 3, 3);
    sim.build(0, 9, 3);
    sim.callWave();
    let maxStrain = 0;
    const { events, last } = run(sim, 60, (s) => { maxStrain = Math.max(maxStrain, s.strain); });
    expect(events).toContain('wave');
    expect(events).toContain('shrineCast');
    expect(events).toContain('beam');
    expect(last.kills).toBeGreaterThan(0);
    expect(maxStrain).toBeGreaterThan(0.5); // every shrine strains YOU
  });

  it('leaks crack the hearth; with no shrines the bastion falls', async () => {
    const { sim } = await round();
    sim.callWave();
    const { events, last } = run(sim, 400);
    expect(events).toContain('leak');
    expect(sim.over).toBe('lost');
    expect(last.hearth).toBeLessThanOrEqual(0);
    expect(sim.result()).toMatchObject({ world: 'bastion', won: false });
  });
});

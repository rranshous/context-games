import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { ed25519 } from '@noble/curves/ed25519.js';
import { bytesToHex, nameStrength, spiritAt, MIN_NAME_BITS } from '@truenames/universe';
import { proveName, type ZkNameClaim } from '@truenames/proofs';
import { CouncilSim, zkVerifier, HEARTH_GOD, COUNCIL, type CouncilView } from '../src/index.ts';
import { HEARTH_NONCE, HEARTH_NONCE_2 } from './fixtures.ts';

const require = createRequire(import.meta.url);
const art = (f: string) => require.resolve(`@truenames/proofs/artifacts/${f}`);
const verifier = zkVerifier(JSON.parse(readFileSync(art('name.vkey.json'), 'utf8')));
const SECRET = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const AURA = bytesToHex(ed25519.getPublicKey(SECRET));
const CONTEXT = 7n;
let claim: ZkNameClaim;
function rng(seed = 9) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

describe('the Council', () => {
  beforeAll(async () => {
    let n = 0n;
    n = HEARTH_NONCE;
    claim = await proveName({ cell: HEARTH_GOD, nonce: n, secretKey: SECRET, magnitude: spiritAt(HEARTH_GOD)!.magnitude, strength: MIN_NAME_BITS, context: CONTEXT }, { wasm: art('name.wasm'), zkey: art('name.zkey') });
  });

  it('deals your proven names as cards and hides the other hand', async () => {
    const sim = new CouncilSim({ level: 0, context: CONTEXT, verifier, rng: rng() });
    await sim.admit(AURA, [{ slot: 0, claim }]);
    sim.start();
    const v = sim.snapshot()!;
    expect(v.t).toBe('cview');
    expect(v.active).toBe(0);
    expect(v.hand.length).toBe(1); // a one-name deck
    expect(v.hand[0]).toMatchObject({ form: spiritAt(HEARTH_GOD)!.traits.form, element: spiritAt(HEARTH_GOD)!.element, strength: MIN_NAME_BITS }); // the hearth's one facet
    expect(v.seats[1]!.handCount).toBe(COUNCIL.startHand); // the Warden's hand: a count, never the cards
    expect(JSON.stringify(v)).not.toContain('"hand":[{"id":' + 999);
  });

  it('a play resolves through the authority, strains, and damages; turns alternate and the Warden acts', async () => {
    const sim = new CouncilSim({ level: 0, context: CONTEXT, verifier, rng: rng() });
    await sim.admit(AURA, [{ slot: 0, claim }]);
    sim.start();
    let v = sim.snapshot()!;
    const card = v.hand[0]!;
    // not enough voice on turn 1 if cost > 1
    sim.handle(AURA, { t: 'play', card: card.id, target: { kind: 'face', seat: 1 } });
    v = sim.snapshot()!;
    const played = v.events.find((e) => e.e === 'play');
    if (card.cost <= COUNCIL.voiceStart) {
      expect(played).toBeTruthy();
      expect(v.seats[1]!.life).toBeLessThan(COUNCIL.life);
      expect(v.seats[0]!.strain).toBeGreaterThan(0);
    }
    sim.handle(AURA, { t: 'pass' });
    v = sim.snapshot()!;
    expect(v.active).toBe(1);
    // let the Warden take its turn
    const seen: string[] = [];
    for (let i = 0; i < 60 * 20; i++) {
      sim.step(1 / 60);
      const s = sim.snapshot();
      if (s) { for (const e of s.events) seen.push(e.e); if (s.active === 0) break; }
    }
    expect(seen).toContain('play');
    expect(seen).toContain('turn');
  });

  it('a whole duel ends', async () => {
    const sim = new CouncilSim({ level: 0, context: CONTEXT, verifier, rng: rng() });
    await sim.admit(AURA, [{ slot: 0, claim }]);
    sim.start();
    let last: CouncilView | null = null;
    for (let i = 0; i < 60 * 600 && !sim.over; i++) {
      sim.step(1 / 60);
      const v = sim.snapshot();
      if (v) last = v;
      if (last && last.active === 0 && !sim.over) {
        const c = last.hand.find((h) => h.cost <= last!.seats[0]!.voice);
        if (c) sim.handle(AURA, { t: 'play', card: c.id, target: { kind: 'face', seat: 1 } });
        sim.handle(AURA, { t: 'pass' });
        last = null;
      }
    }
    expect(sim.over).not.toBeNull();
    expect(sim.result()).toMatchObject({ world: 'council' });
  });
});

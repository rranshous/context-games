import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { ed25519 } from '@noble/curves/ed25519.js';
import { bytesToHex, nameStrength, spiritAt, MIN_NAME_BITS } from '@truenames/universe';
import { proveName, type ZkNameClaim } from '@truenames/proofs';
import { RacerSim, zkVerifier, HEARTH_GOD, RACER, autopilot, buildTrack, driveCar, type RacerSnapshot, type RacerEvent, type CarState } from '../src/index.ts';

const require = createRequire(import.meta.url);
const art = (f: string) => require.resolve(`@truenames/proofs/artifacts/${f}`);
const verifier = zkVerifier(JSON.parse(readFileSync(art('name.vkey.json'), 'utf8')));
const SECRET = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const AURA = bytesToHex(ed25519.getPublicKey(SECRET));
const CONTEXT = 11n;
let claim: ZkNameClaim;
function rng(seed = 5) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Drive your car with the rivals' own autopilot (a bot), stepping the sim like the server does. */
function race(sim: RacerSim, seconds: number, drive = true, cast = false, onSnap?: (s: RacerSnapshot) => void) {
  let seq = 0;
  let last: RacerSnapshot | null = null;
  const events: RacerEvent[] = [];
  const me: CarState = { x: 0, y: 0, vx: 0, vy: 0, a: 0, spin: 0, slide: 0, slow: 0, top: 1, hint: -1 };
  for (let i = 0; i < seconds * 60 && !sim.over; i++) {
    if (drive && last) {
      Object.assign(me, last.cars[0]);
      const c = autopilot(me, sim.track, last.cars.slice(1));
      sim.handle(AURA, { t: 'drive', cmds: [{ seq: ++seq, ...c, dt: 1 / 60 }] });
      if (cast && last.countdown <= 0 && last.slots[0] && last.slots[0].ready <= 0 && i % 30 === 0 && last.strain < last.capacity * 0.7) sim.handle(AURA, { t: 'cast', slot: 0, ax: 0, ay: 0 });
    }
    sim.step(1 / 60);
    if (i % 3 === 0 || sim.over) { last = sim.snapshot(); events.push(...last.events); onSnap?.(last); }
  }
  return { last: last!, events };
}

describe('Dark Racer', () => {
  beforeAll(async () => {
    let n = 0n;
    while (nameStrength(HEARTH_GOD, ed25519.getPublicKey(SECRET), n) < MIN_NAME_BITS) n++;
    claim = await proveName({ cell: HEARTH_GOD, nonce: n, secretKey: SECRET, magnitude: spiritAt(HEARTH_GOD)!.magnitude, strength: MIN_NAME_BITS, context: CONTEXT }, { wasm: art('name.wasm'), zkey: art('name.zkey') });
  });

  it('every track can be lapped by the autopilot without touching a wall', () => {
    for (const ctrl of RACER.tracks) {
      const tr = buildTrack(ctrl);
      const c: CarState = { x: tr.pts[0]!.x, y: tr.pts[0]!.y, vx: 0, vy: 0, a: Math.atan2(tr.pts[1]!.y - tr.pts[0]!.y, tr.pts[1]!.x - tr.pts[0]!.x), spin: 0, slide: 0, slow: 0, top: 1, hint: 0 };
      let travelled = 0;
      for (let i = 0; i < 60 * 40; i++) {
        const x = c.x, y = c.y;
        driveCar(c, autopilot(c, tr), tr, 1 / 60);
        travelled += Math.hypot(c.x - x, c.y - y);
      }
      const length = tr.pts.length * RACER.spacing;
      expect(travelled).toBeGreaterThan(length * 1.2); // more than a lap in 40 s
    }
  });

  it('welcomes you onto a grid, holds everyone for the countdown, then the race runs', async () => {
    const sim = new RacerSim({ level: 0, context: CONTEXT, verifier, rng: rng() });
    const { slots, refused } = await sim.admit(AURA, [{ slot: 0, claim }]);
    expect(refused).toEqual([]);
    const w = sim.welcome(AURA, slots, refused);
    expect(w).toMatchObject({ t: 'welcome', world: 'racer', car: 0 });
    if (w.t !== 'welcome' || w.world !== 'racer') throw new Error('no');
    expect(w.rivals.length).toBe(RACER.rivals);
    expect(w.track.pts.length).toBeGreaterThan(100);
    sim.start();
    const early = race(sim, RACER.countdown - 0.5);
    expect(early.last.cars.every((c) => Math.hypot(c.vx, c.vy) < 1)).toBe(true); // nobody jumps the start
    const later = race(sim, 5);
    expect(later.events.some((e) => e.e === 'go')).toBe(true);
    expect(later.last.cars.filter((c) => c.id !== 0).every((c) => Math.hypot(c.vx, c.vy) > 100)).toBe(true);
    expect(Math.hypot(later.last.cars[0]!.vx, later.last.cars[0]!.vy)).toBeGreaterThan(100); // your commands drive you
  });

  it('your name speaks through the authority: it strains you (heat) and has an effect', async () => {
    const sim = new RacerSim({ level: 0, context: CONTEXT, verifier, rng: rng(3) });
    await sim.admit(AURA, [{ slot: 0, claim }]); // the hearth-god: a lance
    sim.start();
    race(sim, RACER.countdown + 2);
    sim.handle(AURA, { t: 'cast', slot: 0, ax: 0, ay: 0 });
    const r = race(sim, 1);
    const cast = r.events.find((e) => e.e === 'cast' && e.car === 0);
    expect(cast).toMatchObject({ form: 3, slot: 0 });
    expect(r.events.some((e) => e.e === 'beam')).toBe(true);
    expect(r.last.strain).toBeGreaterThan(0);
    expect(r.last.cars[0]!.top).toBeLessThan(1); // heat
    // the same name can't be spoken again at once
    sim.handle(AURA, { t: 'cast', slot: 0, ax: 0, ay: 0 });
    const again = race(sim, 0.2);
    expect(again.events.some((e) => e.e === 'cast' && e.car === 0)).toBe(false);
  });

  it('a whole race ends: rivals lap, speak, and finish', async () => {
    const sim = new RacerSim({ level: 0, context: CONTEXT, verifier, rng: rng(7) });
    await sim.admit(AURA, [{ slot: 0, claim }]);
    sim.start();
    const r = race(sim, 240, false); // you never drive
    expect(sim.over).toBe('lost');
    expect(r.events.filter((e) => e.e === 'finish').length).toBeGreaterThanOrEqual(RACER.podium);
    expect(r.events.some((e) => e.e === 'cast' && e.car !== 0)).toBe(true);
    expect(sim.result()).toMatchObject({ world: 'racer', won: false });
  });

  it('a bot driving the racing line (one 12-truth name) can make the podium at the first circuit', async () => {
    const sim = new RacerSim({ level: 0, context: CONTEXT, verifier, rng: rng(3) });
    await sim.admit(AURA, [{ slot: 0, claim }]);
    sim.start();
    race(sim, 240, true, true);
    expect(sim.over).not.toBeNull();
    const res = sim.result();
    console.log(`[racer] bot finished ${res.wave}${['st', 'nd', 'rd'][res.wave - 1] ?? 'th'}, ${res.kills} hits`);
    expect(res.wave).toBeLessThanOrEqual(RACER.podium);
  });
});

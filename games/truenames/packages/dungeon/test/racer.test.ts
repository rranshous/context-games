import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { ed25519 } from '@noble/curves/ed25519.js';
import { bytesToHex, nameStrength, spiritAt, MIN_NAME_BITS } from '@truenames/universe';
import { proveName, type ZkNameClaim } from '@truenames/proofs';
import { RacerSim, zkVerifier, HEARTH_GOD, RACER, autopilot, buildTrack, driveCar, type RacerSnapshot, type RacerEvent, type CarState } from '../src/index.ts';
import { HEARTH_NONCE, HEARTH_NONCE_2 } from './fixtures.ts';

const require = createRequire(import.meta.url);
const art = (f: string) => require.resolve(`@truenames/proofs/artifacts/${f}`);
const verifier = zkVerifier(JSON.parse(readFileSync(art('name.vkey.json'), 'utf8')));
const SECRET = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const AURA = bytesToHex(ed25519.getPublicKey(SECRET));
const CONTEXT = 11n;
let claim: ZkNameClaim;
function rng(seed = 5) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Drive your car with the rivals' own autopilot (a bot), stepping the sim like the server does. */
const mine = (s: RacerSnapshot) => s.cars.find((c) => c.player === AURA)!;
function race(sim: RacerSim, seconds: number, drive = true, cast = false, onSnap?: (s: RacerSnapshot) => void) {
  let seq = 0;
  let last: RacerSnapshot | null = null;
  const events: RacerEvent[] = [];
  const me: CarState = { x: 0, y: 0, vx: 0, vy: 0, a: 0, spin: 0, slide: 0, slow: 0, top: 1, hint: -1 };
  for (let i = 0; i < seconds * 60 && !sim.over; i++) {
    if (drive && last) {
      Object.assign(me, mine(last));
      const c = autopilot(me, sim.track, last.cars.filter((x) => x.player !== AURA));
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
    n = HEARTH_NONCE;
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
    expect(w).toMatchObject({ t: 'welcome', world: 'racer', car: RACER.rivals }); // the rearmost place on the grid
    if (w.t !== 'welcome' || w.world !== 'racer') throw new Error('no');
    expect(w.rivals.length).toBe(RACER.rivals); // the five other cars
    expect(w.track.pts.length).toBeGreaterThan(100);
    sim.start();
    const early = race(sim, RACER.countdown - 0.5);
    expect(early.last.cars.every((c) => Math.hypot(c.vx, c.vy) < 1)).toBe(true); // nobody jumps the start
    const later = race(sim, 5);
    expect(later.events.some((e) => e.e === 'go')).toBe(true);
    expect(later.last.cars.filter((c) => !c.player).every((c) => Math.hypot(c.vx, c.vy) > 100)).toBe(true);
    expect(Math.hypot(mine(later.last).vx, mine(later.last).vy)).toBeGreaterThan(100); // your commands drive you
  });

  it('your name speaks through the authority: it strains you (heat) and has an effect', async () => {
    const sim = new RacerSim({ level: 0, context: CONTEXT, verifier, rng: rng(3) });
    await sim.admit(AURA, [{ slot: 0, claim }]); // the hearth-god: a lance
    sim.start();
    race(sim, RACER.countdown + 2);
    sim.handle(AURA, { t: 'cast', slot: 0, ax: 0, ay: 0 });
    const r = race(sim, 1);
    const my = mine(r.last).id;
    const cast = r.events.find((e) => e.e === 'cast' && e.car === my);
    expect(cast).toMatchObject({ form: spiritAt(HEARTH_GOD)!.traits.form, slot: 0 });
    expect(r.events.some((e) => e.e === 'beam')).toBe(true);
    expect(r.last.strain).toBeGreaterThan(0);
    expect(mine(r.last).top).toBeLessThan(1); // heat
    // the same name can't be spoken again at once
    sim.handle(AURA, { t: 'cast', slot: 0, ax: 0, ay: 0 });
    const again = race(sim, 0.2);
    expect(again.events.some((e) => e.e === 'cast' && e.car === my)).toBe(false);
  });

  it('a whole race ends: rivals lap, speak, and finish', async () => {
    const sim = new RacerSim({ level: 0, context: CONTEXT, verifier, rng: rng(7) });
    await sim.admit(AURA, [{ slot: 0, claim }]);
    sim.start();
    const r = race(sim, 240, false); // you never drive
    expect(sim.over).toBe('lost');
    expect(r.events.filter((e) => e.e === 'finish').length).toBeGreaterThanOrEqual(RACER.podium);
    expect(r.events.some((e) => e.e === 'cast' && e.car !== mine(r.last).id)).toBe(true);
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

  it('two players share a race: each takes a rival\'s place, sees their own view, and gets their own result', async () => {
    const SECRET2 = Uint8Array.from({ length: 32 }, (_, i) => 200 - i);
    const AURA2 = bytesToHex(ed25519.getPublicKey(SECRET2));
    let n2 = 0n;
    n2 = HEARTH_NONCE_2;
    const claim2 = await proveName({ cell: HEARTH_GOD, nonce: n2, secretKey: SECRET2, magnitude: spiritAt(HEARTH_GOD)!.magnitude, strength: MIN_NAME_BITS, context: CONTEXT }, { wasm: art('name.wasm'), zkey: art('name.zkey') });
    const sim = new RacerSim({ level: 0, context: CONTEXT, verifier, rng: rng(4) });
    await sim.admit(AURA, [{ slot: 0, claim }]);
    await sim.admit(AURA2, [{ slot: 0, claim: claim2 }]);
    expect(sim.playerCount).toBe(2);
    await expect(sim.admit(AURA2, [{ slot: 0, claim: claim2 }])).rejects.toThrow(/already/);
    const w1 = sim.welcome(AURA, [], []), w2 = sim.welcome(AURA2, [], []);
    if (w1.t !== 'welcome' || w1.world !== 'racer' || w2.t !== 'welcome' || w2.world !== 'racer') throw new Error('no');
    expect(w1.car).not.toBe(w2.car);
    expect(w1.rivals.length).toBe(RACER.rivals - 1); // one rival gave up its place
    sim.start();
    await expect(sim.admit('ff'.repeat(32), [])).rejects.toThrow(/started/);
    // both drive with the autopilot; each acknowledges only its own commands
    const st: Record<string, CarState> = {};
    let seq = 0;
    for (let i = 0; i < 60 * 12; i++) {
      for (const [a, id] of [[AURA, w1.car], [AURA2, w2.car]] as const) {
        const v = sim.viewFor(a, []);
        st[a] ??= { x: 0, y: 0, vx: 0, vy: 0, a: 0, spin: 0, slide: 0, slow: 0, top: 1, hint: -1 };
        Object.assign(st[a]!, v.cars.find((c) => c.id === id));
        sim.handle(a, { t: 'drive', cmds: [{ seq: ++seq, ...autopilot(st[a]!, sim.track, v.cars.filter((c) => c.id !== id)), dt: 1 / 60 }] });
      }
      sim.step(1 / 60);
    }
    const events = sim.drainEvents();
    const v1 = sim.viewFor(AURA, events), v2 = sim.viewFor(AURA2, events);
    expect(v1.ack).not.toBe(v2.ack);
    expect(v1.players).toBe(2);
    for (const [v, id] of [[v1, w1.car], [v2, w2.car]] as const) expect(Math.hypot(v.cars[id]!.vx, v.cars[id]!.vy)).toBeGreaterThan(100);
    expect(v1.cars.filter((c) => c.player).map((c) => c.player).sort()).toEqual([AURA, AURA2].sort());
    // one leaves: their car races on under the autopilot, and their race is over
    sim.leave(AURA2);
    expect(sim.doneFor(AURA2)).toBe(true);
    expect(sim.doneFor(AURA)).toBe(false);
    for (let i = 0; i < 60 * 2; i++) sim.step(1 / 60);
    expect(Math.hypot(sim.viewFor(AURA, []).cars[w2.car]!.vx, sim.viewFor(AURA, []).cars[w2.car]!.vy)).toBeGreaterThan(100);
    expect(sim.result(AURA2)).toMatchObject({ world: 'racer', won: false });
  });
});

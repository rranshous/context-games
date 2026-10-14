// Seeded RNG (mulberry32). Every source of randomness in the sim goes through this,
// so a (seed, warriors) pair always replays the same match.
// `state` reads or sets where it is in its sequence (for checkpoints).
export type Rng = (() => number) & { state: number };

export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  const rng = (() => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Rng;
  Object.defineProperty(rng, 'state', { get: () => a, set: (v: number) => { a = v >>> 0; } });
  return rng;
}

export function randInt(rng: Rng, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

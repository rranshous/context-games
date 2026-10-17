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

/**
 * Where one stream starts: a pure function of (seed, tick, key). The sim points its rng at a
 * fresh stream for each body's turn and upkeep, so a draw never depends on how many draws
 * anyone else made that tick (so turns that never touch could one day run apart).
 */
export function streamSeed(seed: number, t: number, key: number): number {
  let h = fmix(seed ^ 0x9e3779b9);
  h = fmix((h + Math.imul(t >>> 0, 0x85ebca6b)) >>> 0);
  h = fmix((h ^ Math.imul(key >>> 0, 0xc2b2ae35) ^ Math.imul((key / 4294967296) | 0, 0x27d4eb2f)) >>> 0);
  return h;
}

function fmix(h: number): number {
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

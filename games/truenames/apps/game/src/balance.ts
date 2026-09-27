// Game-side balance for runs (not authority rules; those live in packages/authority/src/tunables.ts).
export const BALANCE = {
  arena: { w: 2400, h: 1600 },
  player: { hp: 100, speed: 210, radius: 13, wardMax: 80, wardDecayPerSec: 0.06 },
  /** Power requested per cast. Large: in v0 the cast cap and share decide what you get. */
  request: 1000,
  /** effect = grant * formEfficiency * effectScale */
  effectScale: 1,
  enemyEffectScale: 0.5,
  forms: {
    bolt: { speed: 620, radius: 7, life: 1.4 },
    lance: { length: 520, width: 18 },
    ring: { radius: 125, knock: 90 },
    nova: { radius: 105, delay: 0.7 },
    summon: { life: 10, speed: 190, hpPerEffect: 2, hitBase: 3, hitPerEffect: 0.15, hitEvery: 0.5 },
    hex: { duration: 2, pick: 90 },
    blink: { base: 90, perEffect: 10, max: 380 },
    ward: { mult: 1 },
  },
  enemies: {
    husk: { hp: 10, speed: 72, radius: 12, dmg: 6, color: '#8f8a7a' },
    runner: { hp: 6, speed: 145, radius: 9, dmg: 4, color: '#c46b5a' },
    brute: { hp: 48, speed: 52, radius: 21, dmg: 15, color: '#6f5c8f' },
    shaman: { hp: 18, speed: 64, radius: 12, dmg: 0, color: '#d6b86a' },
  },
  meleeCooldown: 0.9,
  shaman: { castMin: 1.6, castMax: 2.6, keepAway: 320, boltSpeed: 360, hearthChance: 0.45 },
  waves: [
    { husk: 6 },
    { husk: 8, runner: 4 },
    { husk: 8, runner: 4, shaman: 2, brute: 1 },
    { husk: 10, runner: 6, shaman: 3, brute: 2 },
    { husk: 12, runner: 8, shaman: 4, brute: 3 },
  ] as Record<string, number>[],
  spawnEvery: 0.55,
  breather: 4,
  shrines: 3,
  shrineRadius: 70,
  shrineWake: 1.5,
  /** Shrine scans the shallowest unexhausted layer from this depth, up to maxDepth. */
  shrineMinDepth: 7,
  shrineMaxDepth: 10,
};

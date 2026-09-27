// Game-side balance for runs (not authority rules; those live in packages/authority/src/tunables.ts).
export const BALANCE = {
  arena: { w: 2000, h: 1400 },
  player: { hp: 100, speed: 210, radius: 13, wardMax: 80, wardDecayPerSec: 0.06 },
  /** Power requested per cast. Large: in v0 the cast cap and share decide what you get. */
  request: 1000,
  /** effect = grant * formEfficiency * effectScale */
  effectScale: 1,
  forms: {
    bolt: { speed: 620, radius: 7, life: 1.4 },
    lance: { length: 520, width: 18 },
    ring: { radius: 125, knock: 90 },
    nova: { radius: 105, delay: 0.7 },
    /** ~one bolt's worth of damage spread over its life, plus a body that draws attacks. */
    summon: { life: 6, speed: 190, hpPerEffect: 1.2, hitBase: 1.5, hitPerEffect: 0.08, hitEvery: 0.6, maxActive: 2 },
    hex: { duration: 2, pick: 90 },
    blink: { base: 90, perEffect: 10, max: 380 },
    ward: { mult: 1 },
  },
  enemies: {
    husk: { hp: 8, speed: 72, radius: 12, dmg: 6, color: '#8f8a7a' },
    runner: { hp: 5, speed: 140, radius: 9, dmg: 3, color: '#c46b5a' },
    brute: { hp: 48, speed: 52, radius: 21, dmg: 15, color: '#6f5c8f' },
    shaman: { hp: 18, speed: 64, radius: 12, dmg: 0, color: '#d6b86a' },
    warden: { hp: 260, speed: 42, radius: 34, dmg: 18, color: '#3a2f52' },
  },
  meleeCooldown: 0.9,
  /** The Warden closes the last wave: telegraphed novas drawn from a mighty ancient. */
  warden: { castMin: 2.6, castMax: 3.6, novaDelay: 1.3, novaRadius: 115, novaDamage: 22, bits: 3, boltEvery: 3 },
  shaman: { castMin: 1.6, castMax: 2.6, keepAway: 320, boltSpeed: 360, hearthChance: 0.45, boltDamage: 9 },
  waves: [
    { husk: 6 },
    { husk: 8, runner: 4 },
    { husk: 8, runner: 4, shaman: 2, brute: 1 },
    { husk: 10, runner: 6, shaman: 3, brute: 2 },
    { husk: 12, runner: 8, shaman: 4, brute: 3 },
  ] as Record<string, number>[],
  spawnEvery: 0.55,
  breather: 4,
  /**
   * Descents: each level deepens the dark. Names grow by 2x work per bit and
   * cast power by sqrt(2) per bit, so ~1.5 bits (~3x meditation) per level.
   */
  descent: { hpMult: 1.7, dmgMult: 1.2, countMult: 0.15, shamanBits: 2 },
};

export const DESCENT_NAMES = ['the Threshold', 'the Lamplit Halls', 'the Ember Stair', 'the Drowned Stacks', 'the Quiet Galleries', 'the Root Vaults', 'the Unlit Deep', 'the Hollow Crown', 'the Last Door', 'the Nameless'];
export function descentName(l: number): string {
  return DESCENT_NAMES[l] ?? `the Nameless ${'I'.repeat(Math.min(12, l - DESCENT_NAMES.length + 2))}`;
}

/** The four spell slots and what speaks them: both mouse buttons first, then keys 1 and 2. */
export const SLOTS = [
  { label: 'LMB', key: null, button: 0, name: 'left click' },
  { label: 'RMB', key: null, button: 2, name: 'right click' },
  { label: '1', key: '1', button: null, name: 'key 1' },
  { label: '2', key: '2', button: null, name: 'key 2' },
] as const;

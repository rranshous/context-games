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

/** The worlds a dungeon can host. Each interprets the same proven powers differently. */
export type World = 'dark' | 'bastion' | 'council' | 'racer';
export const WORLDS: { id: World; name: string; blurb: string }[] = [
  { id: 'dark', name: 'the Dark', blurb: 'Walk into the dark and speak your words yourself: five waves and a Warden.' },
  { id: 'bastion', name: 'the Bastion', blurb: 'Raise shrines to your patrons along the road to your hearth. Every shrine speaks in your name, and every word strains you.' },
  { id: 'council', name: 'the Council', blurb: 'Sit across from a Warden and play your words as cards, turn by turn. A deck of up to twelve.' },
  { id: 'racer', name: 'Dark Racer', blurb: 'Race five rivals around a road through the astral. Your words are your weapons; every one you speak heats your engine.' },
];

export type BastionFoe = 'husk' | 'runner' | 'brute' | 'warden';

/** Tower defense: your names become shrines (towers) along a road to your hearth. */
export const BASTION = {
  tile: 48,
  cols: 22,
  rows: 13,
  /** The road, as tile-coordinate waypoints; foes enter at the first and reach the hearth at the last. */
  path: [[-1, 2], [17, 2], [17, 6], [4, 6], [4, 10], [21, 10]] as [number, number][],
  hearth: 20,
  startResonance: 170,
  /** a shrine costs base + step × shrines already standing */
  shrineBase: 60,
  shrineStep: 35,
  sellRefund: 0.5,
  waves: 10,
  breather: 7,
  firstBreather: 12,
  spawnEvery: 0.75,
  waveHpGrowth: 1.17,
  waveBonus: 20,
  waveBonusStep: 5,
  /** resonance for calling a wave early, per second of breather skipped */
  earlyCallPerSecond: 3,
  /** hearth damage per backlash, plus recoil / recoilPerHearth */
  backlashHearth: 1,
  recoilPerHearth: 80,
  foes: {
    husk: { hp: 26, speed: 48, radius: 11, leak: 1, reward: 5, hitGuardian: 8, color: '#8f8a7a' },
    runner: { hp: 14, speed: 92, radius: 8, leak: 1, reward: 4, hitGuardian: 5, color: '#c46b5a' },
    brute: { hp: 110, speed: 32, radius: 17, leak: 3, reward: 14, hitGuardian: 20, color: '#6f5c8f' },
    warden: { hp: 1400, speed: 24, radius: 26, leak: 10, reward: 80, hitGuardian: 40, color: '#3a2f52' },
  } as Record<BastionFoe, { hp: number; speed: number; radius: number; leak: number; reward: number; hitGuardian: number; color: string }>,
  wavesMix: [
    { husk: 8 },
    { husk: 10, runner: 4 },
    { husk: 12, runner: 6 },
    { husk: 10, brute: 3 },
    { runner: 14, husk: 6 },
    { husk: 14, brute: 5 },
    { husk: 16, runner: 10, brute: 3 },
    { brute: 8, runner: 8 },
    { husk: 20, runner: 14, brute: 6 },
    { husk: 16, runner: 10, brute: 8, warden: 1 },
  ] as Partial<Record<BastionFoe, number>>[],
  /** How each form manifests as a shrine. `every` is its cadence in seconds. */
  forms: {
    bolt: { range: 190, every: 0.7, speed: 520 },
    ring: { range: 95, every: 1.1 },
    ward: { range: 115, every: 2.0, slowPerEffect: 0.012, maxSlow: 0.6, duration: 2.6 },
    lance: { range: 270, every: 1.5, width: 22 },
    nova: { range: 330, every: 2.4, radius: 80, delay: 0.8 },
    /** A guardian holds at most `holds` foes (the Warden tramples it), with capped toughness; one per shrine at a time. */
    summon: { range: 160, every: 6, life: 6, hpPerEffect: 0.8, maxHp: 150, holds: 2, hitBase: 2, hitPerEffect: 0.12, hitEvery: 0.6 },
    hex: { range: 210, every: 1.3, duration: 3 },
    blink: { range: 180, every: 2.8, base: 40, perEffect: 1.5, max: 220 },
  },
};

export const BASTION_NAMES = ['the Outer Wall', 'the Lantern Gate', 'the Salt Road', 'the Weeping Span', 'the Ash Bridge', 'the Bell Tower', 'the Sunken Keep', 'the Last Courtyard', 'the Inner Hearth', 'the Nameless Wall'];
export function worldDescentName(world: World, l: number): string {
  if (world === 'dark') return descentName(l);
  if (world === 'racer') return RACER_NAMES[l] ?? `the Nameless Circuit ${'I'.repeat(Math.min(12, l - RACER_NAMES.length + 2))}`;
  if (world === 'council') return COUNCIL_NAMES[l] ?? `the Nameless Council ${'I'.repeat(Math.min(12, l - COUNCIL_NAMES.length + 2))}`;
  return BASTION_NAMES[l] ?? `the Nameless Wall ${'I'.repeat(Math.min(12, l - BASTION_NAMES.length + 2))}`;
}

/** The Council: a turn-based duel where each proven name is a card. */
export const COUNCIL = {
  deckMax: 12,
  life: 40,
  startHand: 4,
  handMax: 7,
  boardMax: 5,
  voiceStart: 1,
  voiceMax: 8,
  /** authority ticks between turns: strain ebbs (×0.9 each) and vessels refill */
  ticksPerTurn: 5,
  /** card power from what a play actually drew: round(powerScale × log2(1 + grant × formEfficiency)), at least 1.
   *  Logarithmic so a card game stays a card game: about one point per two truths, not doubling every four. */
  powerScale: 1.2,
  /** creature toughness and attack as multiples of power */
  summonHp: 1,
  summonAtk: 0.35,
  hexTurns: 3,
  novaMult: 1.5,
  wardMult: 1,
  ringMult: 0.5,
  /** backlash: damage to your own face = 1 + recoil / recoilPerLife */
  recoilPerLife: 60,
  /** The Warden speaks charted beings (world.ts). It sits among peers: its words resonate as far beyond their bars
   *  as your deck's median resonance less wardenLag, + shamanBits per seat. Card cost is 1 + the being's might. */
  wardenLag: 3,
  /** deeper seats: a hardier Warden */
  wardenLifePerSeat: 8,
  turnLimit: 40,
};
/** One formula for the dungeon and the client's estimate. */
export function councilPower(grant: number, formEfficiency: number): number {
  return Math.max(1, Math.round(COUNCIL.powerScale * Math.log2(1 + grant * formEfficiency)));
}
export const COUNCIL_NAMES = ['the Lesser Council', 'the Ember Court', 'the Salt Chamber', 'the Hall of Echoes', 'the Iron Conclave', 'the Hollow Bench', 'the Last Tribunal'];

/** Dark Racer: a race around a closed road. Your names are what your car can do. */
export const RACER = {
  laps: 3,
  rivals: 5,
  /** half the road's width, world units */
  halfWidth: 78,
  /** centerline samples every this many units */
  spacing: 20,
  countdown: 3,
  car: {
    radius: 13,
    accel: 560,
    brake: 900,
    maxSpeed: 440,
    reverseMax: 140,
    /** radians per second at full lock, once moving */
    turnRate: 3.1,
    /** how fast sideways motion bleeds away (per second); a slick cuts it */
    grip: 7,
    drag: 0.25,
    /** a wall: the part of velocity into it is reflected by this much */
    bounce: 0.35,
    spinRate: 11,
  },
  /** strain is engine heat: top speed lost at full strain (strain ≥ capacity) */
  heat: 0.3,
  /** power from what a cast drew: round(powerScale × log2(1 + grant × formEfficiency)), at least 1 (as the Council) */
  powerScale: 1.2,
  /** seconds between speakings of the same name */
  cooldown: 1.1,
  /** a spin-out from a hit: base + perPower × power seconds, at most max */
  spin: { base: 0.45, perPower: 0.05, max: 1.3 },
  forms: {
    bolt: { speed: 820, turn: 3.2, life: 2.4, seek: 1000 },
    ring: { radius: 150, push: 34 },
    ward: { base: 2.5, perPower: 0.35 },
    lance: { length: 600, width: 26, slowBase: 0.9, slowPer: 0.1, slowMult: 0.55 },
    nova: { arm: 0.6, life: 25, trigger: 24, blast: 70 },
    summon: { speed: 560, life: 7 },
    hex: { life: 12, radiusBase: 34, radiusPer: 2, slideBase: 0.7, slidePer: 0.06 },
    blink: { base: 90, perPower: 16, max: 340 },
  },
  rival: {
    /** truths beyond each word's bar (resonance), + shamanBits per circuit */
    resonance: 0,
    /** rivals' top speed as a fraction of a car's, + per descent (capped) */
    skillBase: 0.84,
    skillSpread: 0.07,
    skillPerLevel: 0.025,
    skillMax: 1.02,
    castMin: 4,
    castMax: 8,
    names: 2,
  },
  /** finish in this place or better to open the next circuit */
  podium: 3,
  /** the race closes this long after the winner crosses */
  grace: 25,
  /** tracks: closed loops of control points (world units), smoothed into a road */
  tracks: [
    [[500, 500], [1400, 360], [2400, 440], [2900, 900], [2650, 1450], [1950, 1350], [1500, 1750], [800, 1850], [380, 1350]],
    [[520, 620], [1300, 380], [2100, 560], [2700, 380], [3150, 820], [2800, 1400], [3000, 1950], [2200, 2100], [1650, 1600], [1100, 2050], [500, 1800], [760, 1200]],
    [[600, 500], [1600, 420], [2500, 700], [2300, 1150], [1500, 1050], [1250, 1450], [2100, 1700], [2800, 1650], [2700, 2250], [1400, 2350], [520, 2000], [380, 1200]],
  ] as [number, number][][],
};
export const RACER_NAMES = ['the Ember Circuit', 'the Tidal Loop', 'the Serpent Road', 'the Glass Mile', 'the Ashen Ring', 'the Veiled Spiral', 'the Last Lap'];

/** One formula for power in every world that turns grants into small game numbers. */
export function logPower(grant: number, formEfficiency: number, scale: number): number {
  return Math.max(1, Math.round(scale * Math.log2(1 + grant * formEfficiency)));
}

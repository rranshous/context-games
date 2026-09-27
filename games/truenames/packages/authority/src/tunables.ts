// Every authority tunable lives here. Starting points from docs/03-mechanics.md,
// adjusted where the journal says so. Never inline these elsewhere.
import { MIN_NAME_BITS } from '@truenames/universe';

export const TUNABLES = {
  /** Authority tick length. */
  TICK_MS: 200,

  // --- pools (token bucket per spirit) ---
  poolBase: 100,
  refillBase: 5, // per tick
  poolExp: 0.5,

  // --- allocation ---
  /** Cast cap at effective == capRef, before generosity. */
  castCapBase: 12,
  capExp: 0.5,
  /** Effective strength at which the cap equals castCapBase. Docs used absolute effective; we use MIN_NAME_BITS so a fresh name casts castCapBase. */
  capRef: MIN_NAME_BITS,
  /** generosity = generosityMin * 2^(idx * generositySpan / 15), idx 0..15  ->  [0.25, 2] */
  generosityMin: 0.25,
  generositySpan: 3,

  // --- strain ---
  strainDecay: 0.9, // per tick (docs: 0.8; see journal)
  /** Global multiplier on castStrain (docs had none; see journal). */
  strainScale: 1,
  familiarityRate: 0.03,
  minFamiliarity: 0.3,
  /** spirit weight = weightMin + weightIdx / weightDiv  ->  [0.5, 3] */
  weightMin: 0.5,
  weightDiv: 6,
  /** form weights and efficiencies by form id (bolt ring ward lance nova summon hex blink) */
  formWeight: [1.0, 1.5, 1.0, 1.3, 2.0, 2.0, 1.2, 0.8],
  formEfficiency: [1.0, 0.6, 1.2, 0.8, 0.7, 1.0, 1.0, 1.0],

  // --- capacity ---
  capBase: 4,
  capPerBit: 0.1,
  capThreshold: 12,

  // --- backlash (v0: recoil only) ---
  /** chance = clamp((strain - capacity) * backlashSlope, backlashMin, 1) */
  backlashSlope: 0.35,
  backlashMin: 0.25,
  /** recoil damage = grant * recoilFactor */
  recoilFactor: 0.6,

  // --- optional server rules (off) ---
  attunementBonus: 0,
} as const;

export type Tunables = typeof TUNABLES;

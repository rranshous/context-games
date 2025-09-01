/**
 * Known spell sequences for the magic simulator
 * These are the "perfect" sequences that produce the intended effects
 */
import { KnownSpell, SpellType } from './types.js';
export declare const KNOWN_SPELLS: Record<SpellType, string>;
export declare const SPELL_LIBRARY: KnownSpell[];
export declare const VALID_BASES: readonly ["A", "T", "C", "G"];
export type ValidBase = typeof VALID_BASES[number];
//# sourceMappingURL=constants.d.ts.map
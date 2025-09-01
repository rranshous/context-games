/**
 * Magic Simulator Module
 * 
 * A deterministic magic simulation system that treats spells as genetic-like sequences.
 * Based on ATCG base-4 encoding for biological-inspired magic mechanics.
 * 
 * @example Basic Usage
 * ```typescript
 * import { SimpleSpellSimulator, KNOWN_SPELLS } from './magic-simulator';
 * 
 * const simulator = new SimpleSpellSimulator();
 * const result = simulator.simulate(KNOWN_SPELLS.fireball);
 * 
 * console.log(`Cast ${result.type} with ${result.power}% power`);
 * ```
 * 
 * @example Fragment Discovery
 * ```typescript
 * const fragment = 'ATCGAT'; // Partial fireball sequence
 * const result = simulator.simulate(fragment);
 * 
 * if (result.power > 0) {
 *   console.log(`Detected ${result.type} spell (${result.power}% complete)`);
 * }
 * ```
 */

// Core simulator class
export { SimpleSpellSimulator } from './simulator.js';

// Type definitions
export type { 
  SpellResult, 
  SpellType, 
  MagicSequence, 
  KnownSpell 
} from './types.js';

// Constants and spell library
export { 
  KNOWN_SPELLS, 
  SPELL_LIBRARY, 
  VALID_BASES 
} from './constants.js';

/**
 * Advanced Magic Simulator Module
 *
 * A sophisticated multi-pass magic simulation system that treats spells as complex biological sequences.
 * Features regulatory elements, structural components, and modifier sequences for realistic magic mechanics.
 *
 * @example Basic Usage
 * ```typescript
 * import { AdvancedSpellSimulator, COMPLETE_SPELL_SEQUENCES } from './magic-simulator';
 *
 * const simulator = new AdvancedSpellSimulator();
 * const result = simulator.interpret(COMPLETE_SPELL_SEQUENCES.pyroblast);
 *
 * console.log(`Cast ${result.type} with ${result.power}% power and ${result.complexity}% complexity`);
 * ```
 *
 * @example Fragment Discovery
 * ```typescript
 * const fragment = 'TATAAAAATATAATCGATCGATCGATCG'; // Partial pyroblast sequence
 * const result = simulator.interpret(fragment);
 *
 * if (result.power > 0) {
 *   console.log(`Detected ${result.type} spell (${result.power}% complete, risk: ${result.riskLevel})`);
 * }
 * ```
 */
export { AdvancedSpellSimulator } from './simulator.js';
export type { SpellResult, SpellType, MagicSequence, InterpretationContext, RegulatoryEffect, StructuralComponent, ModifierEffect, ComplexSpell } from './types.js';
export { COMPLEX_SPELLS, COMPLETE_SPELL_SEQUENCES, REGULATORY_PATTERNS, STRUCTURAL_CORES, MODIFIER_PATTERNS, VALID_BASES } from './constants.js';
//# sourceMappingURL=index.d.ts.map
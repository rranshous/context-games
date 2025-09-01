/**
 * Known spell sequences for the magic simulator
 * These are the "perfect" sequences that produce the intended effects
 */

import { KnownSpell, SpellType } from './types.js';

export const KNOWN_SPELLS: Record<SpellType, string> = {
  fireball:  'ATCGATCGATCG',
  heal:      'GCTAGCTAGCTA',
  shield:    'ATGCATGCATGC', 
  lightning: 'TACGTACGTACG',
  teleport:  'CGCGCGCGCGCG'
} as const;

export const SPELL_LIBRARY: KnownSpell[] = Object.entries(KNOWN_SPELLS).map(
  ([type, sequence]) => ({ type: type as SpellType, sequence })
);

// Valid base characters for magic sequences
export const VALID_BASES = ['A', 'T', 'C', 'G'] as const;
export type ValidBase = typeof VALID_BASES[number];

/**
 * Types for the magic simulator system
 * Based on the magical DNA system design
 */

export type SpellType = 'fireball' | 'heal' | 'shield' | 'lightning' | 'teleport';

export interface SpellResult {
  type: SpellType;
  power: number;      // 0-100, effectiveness of the spell
  stability: number;  // 0-100, low values indicate dangerous side effects
  duration: number;   // seconds, if applicable (0 for instant spells)
}

export interface KnownSpell {
  type: SpellType;
  sequence: string;   // The perfect ATCG sequence for this spell
}

export type MagicSequence = string; // ATCG base-4 encoding

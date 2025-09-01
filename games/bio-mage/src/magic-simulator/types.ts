/**
 * Types for the advanced multi-pass magic simulator system
 * Based on the magical DNA system design with biological complexity
 */

export type SpellType = 'pyroblast' | 'regeneration' | 'ward' | 'storm' | 'phase' | 'unknown';

export interface SpellResult {
  type: SpellType;
  power: number;      // 0-100, effectiveness of the spell
  stability: number;  // 0-100, low values indicate dangerous side effects
  duration: number;   // seconds, if applicable (0 for instant spells)
  complexity: number; // 0-1.0, how sophisticated the spell interpretation was
}

export interface InterpretationContext {
  regulatoryEffects: RegulatoryEffect[];
  structuralComponents: StructuralComponent[];
  modifierEffects: ModifierEffect[];
  confidence: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'LETHAL';
  perfectSpell?: boolean; // True if this is a perfect complete spell sequence
}

export interface RegulatoryEffect {
  type: 'promoter' | 'enhancer' | 'silencer' | 'insulator';
  position: number;
  strength: number;
  targetDomain: string;
}

export interface StructuralComponent {
  type: SpellType;
  sequence: string;
  startPosition: number;
  endPosition: number;
  confidence: number;
}

export interface ModifierEffect {
  type: 'amplifier' | 'stabilizer' | 'duration_extend' | 'focus' | 'chaos';
  magnitude: number;
  position: number;
}

export interface ComplexSpell {
  type: SpellType;
  regulatorySequence: string;  // Control sequences
  structuralSequence: string;  // Core spell effect
  modifierSequence: string;    // Enhancement/modification sequences
}

export type MagicSequence = string; // ATCG base-4 encoding

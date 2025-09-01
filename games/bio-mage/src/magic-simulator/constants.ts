/**
 * Complex spell sequences for the advanced magic simulator
 * Each spell has regulatory, structural, and modifier components
 */

import { ComplexSpell, SpellType } from './types.js';

// Regulatory sequence patterns
export const REGULATORY_PATTERNS = {
  // Promoters - initiate spell casting
  FIRE_PROMOTER: 'TATA',
  LIFE_PROMOTER: 'GCGC', 
  PROTECTION_PROMOTER: 'ATAT',
  ENERGY_PROMOTER: 'CTCT',
  SPACE_PROMOTER: 'CGAT',
  
  // Enhancers - amplify spell effects
  POWER_ENHANCER: 'AAAA',
  DURATION_ENHANCER: 'TTTT',
  
  // Silencers - reduce spell effects
  STABILITY_SILENCER: 'CCCC',
  CHAOS_SILENCER: 'GGGG'
} as const;

// Structural spell cores (the main effect sequences)
export const STRUCTURAL_CORES = {
  PYROBLAST_CORE: 'ATCGATCGATCGATCG',    // Advanced fireball
  REGENERATION_CORE: 'GCTAGCTAGCTAGCTA',  // Advanced healing
  WARD_CORE: 'ATGCATGCATGCATGC',         // Advanced shielding
  STORM_CORE: 'TACGTACGTACGTACG',        // Advanced lightning
  PHASE_CORE: 'CGCGCGCGCGCGCGCG'         // Advanced teleportation
} as const;

// Modifier sequences
export const MODIFIER_PATTERNS = {
  AMPLIFIER: 'ACTG',      // Increases power
  STABILIZER: 'TGCA',     // Increases stability
  EXTENDER: 'GATC',       // Increases duration
  FOCUSER: 'CATG',        // Increases precision
  CHAOS_MOD: 'GTAC'       // Adds unpredictability
} as const;

// Complete complex spells with all components
export const COMPLEX_SPELLS: Record<Exclude<SpellType, 'unknown'>, ComplexSpell> = {
  pyroblast: {
    type: 'pyroblast',
    regulatorySequence: 'TATAAAAATATA',           // FIRE_PROMOTER + POWER_ENHANCER + FIRE_PROMOTER
    structuralSequence: 'ATCGATCGATCGATCG',       // PYROBLAST_CORE
    modifierSequence: 'ACTGTGCA'                  // AMPLIFIER + STABILIZER
  },
  regeneration: {
    type: 'regeneration', 
    regulatorySequence: 'GCGCTTTTGCGC',           // LIFE_PROMOTER + DURATION_ENHANCER + LIFE_PROMOTER
    structuralSequence: 'GCTAGCTAGCTAGCTA',       // REGENERATION_CORE
    modifierSequence: 'GATCTGCA'                  // EXTENDER + STABILIZER
  },
  ward: {
    type: 'ward',
    regulatorySequence: 'ATATCCCCATAT',           // PROTECTION_PROMOTER + STABILITY_SILENCER + PROTECTION_PROMOTER
    structuralSequence: 'ATGCATGCATGCATGC',       // WARD_CORE
    modifierSequence: 'CATGTGCA'                  // FOCUSER + STABILIZER
  },
  storm: {
    type: 'storm',
    regulatorySequence: 'CTCTAAAACTCT',           // ENERGY_PROMOTER + POWER_ENHANCER + ENERGY_PROMOTER
    structuralSequence: 'TACGTACGTACGTACG',       // STORM_CORE
    modifierSequence: 'ACTGGTAC'                  // AMPLIFIER + CHAOS_MOD
  },
  phase: {
    type: 'phase',
    regulatorySequence: 'CGATGGGGCGAT',           // SPACE_PROMOTER + CHAOS_SILENCER + SPACE_PROMOTER
    structuralSequence: 'CGCGCGCGCGCGCGCG',       // PHASE_CORE
    modifierSequence: 'CATGTGCA'                  // FOCUSER + STABILIZER
  }
} as const;

// Assemble complete sequences for each spell
export const COMPLETE_SPELL_SEQUENCES: Record<Exclude<SpellType, 'unknown'>, string> = {
  pyroblast: COMPLEX_SPELLS.pyroblast.regulatorySequence + 
             COMPLEX_SPELLS.pyroblast.structuralSequence + 
             COMPLEX_SPELLS.pyroblast.modifierSequence,
  regeneration: COMPLEX_SPELLS.regeneration.regulatorySequence + 
                COMPLEX_SPELLS.regeneration.structuralSequence + 
                COMPLEX_SPELLS.regeneration.modifierSequence,
  ward: COMPLEX_SPELLS.ward.regulatorySequence + 
        COMPLEX_SPELLS.ward.structuralSequence + 
        COMPLEX_SPELLS.ward.modifierSequence,
  storm: COMPLEX_SPELLS.storm.regulatorySequence + 
         COMPLEX_SPELLS.storm.structuralSequence + 
         COMPLEX_SPELLS.storm.modifierSequence,
  phase: COMPLEX_SPELLS.phase.regulatorySequence + 
         COMPLEX_SPELLS.phase.structuralSequence + 
         COMPLEX_SPELLS.phase.modifierSequence
} as const;

// Valid base characters for magic sequences
export const VALID_BASES = ['A', 'T', 'C', 'G'] as const;
export type ValidBase = typeof VALID_BASES[number];

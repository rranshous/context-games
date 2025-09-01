/**
 * Advanced multi-pass spell simulator that treats magic as complex biological sequences
 * Replaces the simple similarity-based approach with sophisticated sequence analysis
 */

import { 
  SpellResult, 
  SpellType, 
  InterpretationContext, 
  RegulatoryEffect, 
  StructuralComponent, 
  ModifierEffect 
} from './types.js';
import { 
  REGULATORY_PATTERNS, 
  STRUCTURAL_CORES, 
  MODIFIER_PATTERNS, 
  COMPLEX_SPELLS,
  COMPLETE_SPELL_SEQUENCES 
} from './constants.js';

export class AdvancedSpellSimulator {
  /**
   * Main entry point for spell interpretation using multi-pass analysis
   */
  interpret(rawSequence: string): SpellResult {
    // Clean and validate input
    const sequence = this.cleanSequence(rawSequence);
    if (!this.isValidSequence(sequence)) {
      return this.createFailureResult();
    }

    // Initialize interpretation context
    let context: InterpretationContext = {
      regulatoryEffects: [],
      structuralComponents: [],
      modifierEffects: [],
      confidence: 0,
      riskLevel: 'HIGH'
    };

    // Multi-pass analysis
    context = this.regulatoryPass(sequence, context);
    context = this.structuralPass(sequence, context);
    context = this.modifierPass(sequence, context);

    // Synthesize final result
    return this.synthesizeEffect(sequence, context);
  }

  /**
   * First pass: Identify regulatory sequences that control spell casting
   */
  private regulatoryPass(sequence: string, context: InterpretationContext): InterpretationContext {
    const effects: RegulatoryEffect[] = [];

    // Scan for regulatory patterns
    for (const [patternName, pattern] of Object.entries(REGULATORY_PATTERNS)) {
      let position = 0;
      while ((position = sequence.indexOf(pattern, position)) !== -1) {
        const effect = this.classifyRegulatoryEffect(patternName, position, pattern.length);
        if (effect) {
          effects.push(effect);
        }
        position += 1; // Allow overlapping matches
      }
    }

    return {
      ...context,
      regulatoryEffects: effects
    };
  }

  /**
   * Second pass: Identify structural components that define spell type and core effects
   */
  private structuralPass(sequence: string, context: InterpretationContext): InterpretationContext {
    const components: StructuralComponent[] = [];

    // Scan for structural cores
    for (const [coreName, coreSequence] of Object.entries(STRUCTURAL_CORES)) {
      const position = sequence.indexOf(coreSequence);
      if (position !== -1) {
        const spellType = this.coreNameToSpellType(coreName);
        const confidence = this.calculateStructuralConfidence(sequence, coreSequence, position);
        
        components.push({
          type: spellType,
          sequence: coreSequence,
          startPosition: position,
          endPosition: position + coreSequence.length,
          confidence
        });
      }
    }

    // Also check for partial matches
    if (components.length === 0) {
      const partialMatch = this.findBestPartialStructuralMatch(sequence);
      if (partialMatch) {
        components.push(partialMatch);
      }
    }

    return {
      ...context,
      structuralComponents: components
    };
  }

  /**
   * Third pass: Identify modifier sequences that alter spell behavior
   */
  private modifierPass(sequence: string, context: InterpretationContext): InterpretationContext {
    const effects: ModifierEffect[] = [];

    // Scan for modifier patterns
    for (const [modifierName, pattern] of Object.entries(MODIFIER_PATTERNS)) {
      let position = 0;
      while ((position = sequence.indexOf(pattern, position)) !== -1) {
        const effect = this.classifyModifierEffect(modifierName, position, context);
        if (effect) {
          effects.push(effect);
        }
        position += 1;
      }
    }

    return {
      ...context,
      modifierEffects: effects,
      confidence: this.calculateOverallConfidence(context),
      riskLevel: this.assessRiskLevel(context)
    };
  }

  /**
   * Final pass: Synthesize all analysis into spell result
   */
  private synthesizeEffect(sequence: string, context: InterpretationContext): SpellResult {
    // Determine primary spell type
    const primaryType = this.determinePrimarySpellType(context);
    
    // Calculate base power from structural components
    let power = this.calculateBasePower(context);
    
    // Apply regulatory modifications
    power = this.applyRegulatoryModifications(power, context);
    
    // Apply modifier effects
    const { finalPower, stability, duration } = this.applyModifierEffects(power, context);
    
    return {
      type: primaryType,
      power: Math.max(0, Math.min(100, finalPower)),
      stability: Math.max(0, Math.min(100, stability)),
      duration: Math.max(0, duration),
      complexity: context.confidence
    };
  }

  // Helper methods for classification and analysis

  private cleanSequence(sequence: string): string {
    return sequence.toUpperCase().replace(/[^ATCG]/g, '');
  }

  private isValidSequence(sequence: string): boolean {
    return sequence.length > 0 && /^[ATCG]+$/.test(sequence);
  }

  private createFailureResult(): SpellResult {
    return {
      type: 'unknown',
      power: 0,
      stability: 0,
      duration: 0,
      complexity: 0
    };
  }

  private classifyRegulatoryEffect(patternName: string, position: number, length: number): RegulatoryEffect | null {
    const promoters = ['FIRE_PROMOTER', 'LIFE_PROMOTER', 'PROTECTION_PROMOTER', 'ENERGY_PROMOTER', 'SPACE_PROMOTER'];
    const enhancers = ['POWER_ENHANCER', 'DURATION_ENHANCER'];
    const silencers = ['STABILITY_SILENCER', 'CHAOS_SILENCER'];

    if (promoters.includes(patternName)) {
      return {
        type: 'promoter',
        position,
        strength: 0.8,
        targetDomain: patternName.replace('_PROMOTER', '').toLowerCase()
      };
    } else if (enhancers.includes(patternName)) {
      return {
        type: 'enhancer',
        position,
        strength: 0.6,
        targetDomain: patternName.replace('_ENHANCER', '').toLowerCase()
      };
    } else if (silencers.includes(patternName)) {
      return {
        type: 'silencer',
        position,
        strength: 0.4,
        targetDomain: patternName.replace('_SILENCER', '').toLowerCase()
      };
    }

    return null;
  }

  private coreNameToSpellType(coreName: string): SpellType {
    const mapping: Record<string, SpellType> = {
      'PYROBLAST_CORE': 'pyroblast',
      'REGENERATION_CORE': 'regeneration',
      'WARD_CORE': 'ward',
      'STORM_CORE': 'storm',
      'PHASE_CORE': 'phase'
    };
    return mapping[coreName] || 'unknown';
  }

  private calculateStructuralConfidence(sequence: string, coreSequence: string, position: number): number {
    // Perfect match gets 100% confidence
    if (sequence.includes(coreSequence)) {
      return 1.0;
    }
    
    // Calculate partial match confidence
    let maxSimilarity = 0;
    for (let i = 0; i <= sequence.length - coreSequence.length; i++) {
      const subseq = sequence.substr(i, coreSequence.length);
      const similarity = this.calculateSimilarity(subseq, coreSequence);
      maxSimilarity = Math.max(maxSimilarity, similarity);
    }
    
    return maxSimilarity;
  }

  private findBestPartialStructuralMatch(sequence: string): StructuralComponent | null {
    let bestMatch: StructuralComponent | null = null;
    let bestSimilarity = 0.3; // Minimum threshold for partial matches

    for (const [coreName, coreSequence] of Object.entries(STRUCTURAL_CORES)) {
      for (let i = 0; i <= sequence.length - 4; i++) { // Minimum 4 bases for partial match
        for (let len = 4; len <= Math.min(sequence.length - i, coreSequence.length); len++) {
          const subseq = sequence.substr(i, len);
          const similarity = this.calculateSimilarity(subseq, coreSequence.substr(0, len));
          
          if (similarity > bestSimilarity) {
            bestSimilarity = similarity;
            bestMatch = {
              type: this.coreNameToSpellType(coreName),
              sequence: subseq,
              startPosition: i,
              endPosition: i + len,
              confidence: similarity
            };
          }
        }
      }
    }

    return bestMatch;
  }

  private classifyModifierEffect(modifierName: string, position: number, context: InterpretationContext): ModifierEffect | null {
    const modifierMap: Record<string, ModifierEffect['type']> = {
      'AMPLIFIER': 'amplifier',
      'STABILIZER': 'stabilizer', 
      'EXTENDER': 'duration_extend',
      'FOCUSER': 'focus',
      'CHAOS_MOD': 'chaos'
    };

    const type = modifierMap[modifierName];
    if (!type) return null;

    // Calculate magnitude based on context
    const magnitude = this.calculateModifierMagnitude(type, context);

    return {
      type,
      magnitude,
      position
    };
  }

  private calculateModifierMagnitude(type: ModifierEffect['type'], context: InterpretationContext): number {
    // Base magnitudes
    const baseMagnitudes = {
      amplifier: 0.3,
      stabilizer: 0.25,
      duration_extend: 0.4,
      focus: 0.2,
      chaos: -0.15
    };

    let magnitude = baseMagnitudes[type];

    // Modify based on regulatory context
    const relevantRegulatory = context.regulatoryEffects.filter(effect => 
      (effect.type === 'enhancer' && type === 'amplifier') ||
      (effect.type === 'silencer' && type === 'stabilizer')
    );

    if (relevantRegulatory.length > 0) {
      magnitude *= 1.5; // Regulatory enhancement
    }

    return magnitude;
  }

  private calculateOverallConfidence(context: InterpretationContext): number {
    if (context.structuralComponents.length === 0) {
      return 0;
    }

    const structuralConfidence = Math.max(...context.structuralComponents.map(c => c.confidence));
    const regulatoryBonus = Math.min(0.2, context.regulatoryEffects.length * 0.05);
    const modifierBonus = Math.min(0.1, context.modifierEffects.length * 0.02);

    return Math.min(1.0, structuralConfidence + regulatoryBonus + modifierBonus);
  }

  private assessRiskLevel(context: InterpretationContext): 'LOW' | 'MEDIUM' | 'HIGH' | 'LETHAL' {
    const chaosModifiers = context.modifierEffects.filter(m => m.type === 'chaos').length;
    const stabilizers = context.modifierEffects.filter(m => m.type === 'stabilizer').length;
    const confidence = context.confidence;

    if (chaosModifiers > 2 || confidence < 0.3) {
      return 'LETHAL';
    } else if (chaosModifiers > 0 || confidence < 0.6) {
      return 'HIGH';
    } else if (stabilizers === 0 || confidence < 0.8) {
      return 'MEDIUM';
    } else {
      return 'LOW';
    }
  }

  private determinePrimarySpellType(context: InterpretationContext): SpellType {
    if (context.structuralComponents.length === 0) {
      return 'unknown';
    }

    // Return the highest confidence structural component
    const bestComponent = context.structuralComponents.reduce((best, current) => 
      current.confidence > best.confidence ? current : best
    );

    return bestComponent.type;
  }

  private calculateBasePower(context: InterpretationContext): number {
    if (context.structuralComponents.length === 0) {
      return 0;
    }

    const bestComponent = context.structuralComponents.reduce((best, current) => 
      current.confidence > best.confidence ? current : best
    );

    return bestComponent.confidence * 100;
  }

  private applyRegulatoryModifications(basePower: number, context: InterpretationContext): number {
    let modifiedPower = basePower;

    for (const effect of context.regulatoryEffects) {
      switch (effect.type) {
        case 'promoter':
          modifiedPower *= (1 + effect.strength * 0.3);
          break;
        case 'enhancer':
          modifiedPower *= (1 + effect.strength * 0.5);
          break;
        case 'silencer':
          modifiedPower *= (1 - effect.strength * 0.4);
          break;
      }
    }

    return modifiedPower;
  }

  private applyModifierEffects(power: number, context: InterpretationContext): { finalPower: number, stability: number, duration: number } {
    let finalPower = power;
    let stability = 50; // Base stability
    let duration = 0;   // Base duration

    for (const modifier of context.modifierEffects) {
      switch (modifier.type) {
        case 'amplifier':
          finalPower *= (1 + modifier.magnitude);
          stability -= 10; // More power = less stable
          break;
        case 'stabilizer':
          stability += modifier.magnitude * 100;
          break;
        case 'duration_extend':
          duration += modifier.magnitude * 20; // Up to 8 seconds extra
          break;
        case 'focus':
          finalPower *= (1 + modifier.magnitude * 0.5);
          stability += 5;
          break;
        case 'chaos':
          finalPower *= (1 + modifier.magnitude); // Negative magnitude reduces power
          stability += modifier.magnitude * 50; // Negative reduces stability
          break;
      }
    }

    // Apply confidence-based adjustments
    stability *= context.confidence;

    return { finalPower, stability, duration };
  }

  private calculateSimilarity(seq1: string, seq2: string): number {
    if (seq1.length === 0 || seq2.length === 0) return 0;
    
    const minLength = Math.min(seq1.length, seq2.length);
    let matches = 0;
    
    for (let i = 0; i < minLength; i++) {
      if (seq1[i] === seq2[i]) matches++;
    }
    
    return matches / minLength;
  }
}

/**
 * Simple spell simulator that treats magic as genetic-like sequences
 * Completely deterministic implementation based on sequence similarity
 */

import { SpellResult, SpellType, MagicSequence } from './types.js';
import { KNOWN_SPELLS, VALID_BASES } from './constants.js';

export class SimpleSpellSimulator {
  /**
   * Simulate a magic sequence and return the resulting spell effect
   * @param sequence - ATCG sequence to simulate
   * @returns SpellResult with type, power, stability, and duration
   */
  simulate(sequence: MagicSequence): SpellResult {
    // Normalize to uppercase for consistent processing
    const normalizedSequence = sequence.toUpperCase();
    
    // Validate input sequence
    if (!this.isValidSequence(normalizedSequence)) {
      return this.createFailedSpell();
    }

    const bestMatch = this.findBestMatch(normalizedSequence);
    const similarity = this.calculateSimilarity(normalizedSequence, bestMatch.sequence);
    
    return {
      type: bestMatch.type,
      power: this.calculatePower(similarity),
      stability: this.calculateStability(normalizedSequence, bestMatch.sequence, similarity),
      duration: this.calculateDuration(bestMatch.type, similarity)
    };
  }

  /**
   * Find the known spell that best matches the input sequence
   */
  private findBestMatch(sequence: MagicSequence): { type: SpellType, sequence: string } {
    let bestSimilarity = 0;
    let bestSpell: SpellType = 'fireball';
    
    for (const [spellType, spellSequence] of Object.entries(KNOWN_SPELLS)) {
      const similarity = this.calculateSimilarity(sequence, spellSequence);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestSpell = spellType as SpellType;
      }
    }
    
    return { type: bestSpell, sequence: KNOWN_SPELLS[bestSpell] };
  }

  /**
   * Calculate similarity between two sequences using simple position-based matching
   * Returns a value between 0 and 1
   */
  private calculateSimilarity(seq1: string, seq2: string): number {
    if (seq1.length === 0 && seq2.length === 0) return 1;
    if (seq1.length === 0 || seq2.length === 0) return 0;
    
    // For sequences of different lengths, compare up to the shorter length
    // and penalize the length difference
    const minLength = Math.min(seq1.length, seq2.length);
    const maxLength = Math.max(seq1.length, seq2.length);
    
    let matches = 0;
    for (let i = 0; i < minLength; i++) {
      if (seq1[i] === seq2[i]) {
        matches++;
      }
    }
    
    const positionSimilarity = matches / minLength;
    const lengthPenalty = minLength / maxLength;
    
    return positionSimilarity * lengthPenalty;
  }

  /**
   * Calculate spell power based on sequence similarity (0-100)
   */
  private calculatePower(similarity: number): number {
    return Math.floor(similarity * 100);
  }

  /**
   * Calculate spell stability based on sequence accuracy (0-100)
   * More accurate sequences are more stable
   */
  private calculateStability(
    inputSequence: string, 
    targetSequence: string, 
    similarity: number
  ): number {
    // Base stability from similarity
    let stability = similarity * 100;
    
    // Additional penalty for length mismatches (deterministic)
    const lengthDiff = Math.abs(inputSequence.length - targetSequence.length);
    const lengthPenalty = lengthDiff * 5; // 5 points per character difference
    
    stability = Math.max(0, stability - lengthPenalty);
    
    return Math.floor(stability);
  }

  /**
   * Calculate spell duration based on spell type and accuracy (deterministic)
   */
  private calculateDuration(spellType: SpellType, similarity: number): number {
    // Base durations for different spell types
    const baseDurations: Record<SpellType, number> = {
      fireball: 0,   // Instant
      heal: 0,       // Instant
      shield: 30,    // 30 seconds base
      lightning: 0,  // Instant
      teleport: 0    // Instant
    };
    
    const baseDuration = baseDurations[spellType];
    
    // For non-instant spells, duration scales with similarity
    if (baseDuration > 0) {
      return Math.floor(baseDuration * similarity);
    }
    
    return 0;
  }

  /**
   * Validate that a sequence contains only valid ATCG bases
   */
  private isValidSequence(sequence: string): boolean {
    if (sequence.length === 0) return false;
    
    return sequence.split('').every(char => 
      VALID_BASES.includes(char.toUpperCase() as any)
    );
  }

  /**
   * Create a failed spell result for invalid inputs
   */
  private createFailedSpell(): SpellResult {
    return {
      type: 'fireball', // Default type
      power: 0,
      stability: 0,
      duration: 0
    };
  }
}

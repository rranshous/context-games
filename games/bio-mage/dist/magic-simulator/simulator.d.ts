/**
 * Simple spell simulator that treats magic as genetic-like sequences
 * Completely deterministic implementation based on sequence similarity
 */
import { SpellResult, MagicSequence } from './types.js';
export declare class SimpleSpellSimulator {
    /**
     * Simulate a magic sequence and return the resulting spell effect
     * @param sequence - ATCG sequence to simulate
     * @returns SpellResult with type, power, stability, and duration
     */
    simulate(sequence: MagicSequence): SpellResult;
    /**
     * Find the known spell that best matches the input sequence
     */
    private findBestMatch;
    /**
     * Calculate similarity between two sequences using simple position-based matching
     * Returns a value between 0 and 1
     */
    private calculateSimilarity;
    /**
     * Calculate spell power based on sequence similarity (0-100)
     */
    private calculatePower;
    /**
     * Calculate spell stability based on sequence accuracy (0-100)
     * More accurate sequences are more stable
     */
    private calculateStability;
    /**
     * Calculate spell duration based on spell type and accuracy (deterministic)
     */
    private calculateDuration;
    /**
     * Validate that a sequence contains only valid ATCG bases
     */
    private isValidSequence;
    /**
     * Create a failed spell result for invalid inputs
     */
    private createFailedSpell;
}
//# sourceMappingURL=simulator.d.ts.map
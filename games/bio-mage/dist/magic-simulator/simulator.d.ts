/**
 * Advanced multi-pass spell simulator that treats magic as complex biological sequences
 * Replaces the simple similarity-based approach with sophisticated sequence analysis
 */
import { SpellResult } from './types.js';
export declare class AdvancedSpellSimulator {
    /**
     * Main entry point for spell interpretation using multi-pass analysis
     */
    interpret(sequence: string): SpellResult;
    /**
     * First pass: Identify regulatory sequences that control spell casting
     */
    private regulatoryPass;
    /**
     * Second pass: Identify structural components that define spell type and core effects
     */
    private structuralPass;
    /**
     * Third pass: Identify modifier sequences that alter spell behavior
     */
    private modifierPass;
    /**
     * Final pass: Synthesize all analysis into spell result
     */
    private synthesizeEffect;
    /**
     * Check if sequence exactly matches a complete perfect spell
     */
    private checkForPerfectSpell;
    /**
     * Get duration for specific spell types
     */
    private getSpellDuration;
    private cleanSequence;
    private isValidSequence;
    private createFailureResult;
    private classifyRegulatoryEffect;
    private coreNameToSpellType;
    private calculateStructuralConfidence;
    private findBestPartialStructuralMatch;
    private calculateOverallConfidence;
    private assessRiskLevel;
    private determinePrimarySpellType;
    private calculateBasePower;
    private applyRegulatoryModifications;
    private applyModifierEffects;
    private calculateSimilarity;
}
//# sourceMappingURL=simulator.d.ts.map
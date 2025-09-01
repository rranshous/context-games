/**
 * Types for the advanced multi-pass magic simulator system
 * Based on the magical DNA system design with biological complexity
 */
export type SpellType = 'pyroblast' | 'regeneration' | 'ward' | 'storm' | 'phase' | 'unknown';
export interface SpellResult {
    type: SpellType;
    power: number;
    stability: number;
    duration: number;
    complexity: number;
}
export interface InterpretationContext {
    regulatoryEffects: RegulatoryEffect[];
    structuralComponents: StructuralComponent[];
    modifierEffects: ModifierEffect[];
    confidence: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'LETHAL';
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
    regulatorySequence: string;
    structuralSequence: string;
    modifierSequence: string;
}
export type MagicSequence = string;
//# sourceMappingURL=types.d.ts.map
/**
 * Types for the magic simulator system
 * Based on the magical DNA system design
 */
export type SpellType = 'fireball' | 'heal' | 'shield' | 'lightning' | 'teleport';
export interface SpellResult {
    type: SpellType;
    power: number;
    stability: number;
    duration: number;
}
export interface KnownSpell {
    type: SpellType;
    sequence: string;
}
export type MagicSequence = string;
//# sourceMappingURL=types.d.ts.map
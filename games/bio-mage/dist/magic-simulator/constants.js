/**
 * Known spell sequences for the magic simulator
 * These are the "perfect" sequences that produce the intended effects
 */
export const KNOWN_SPELLS = {
    fireball: 'ATCGATCGATCG',
    heal: 'GCTAGCTAGCTA',
    shield: 'ATGCATGCATGC',
    lightning: 'TACGTACGTACG',
    teleport: 'CGCGCGCGCGCG'
};
export const SPELL_LIBRARY = Object.entries(KNOWN_SPELLS).map(([type, sequence]) => ({ type: type, sequence }));
// Valid base characters for magic sequences
export const VALID_BASES = ['A', 'T', 'C', 'G'];
//# sourceMappingURL=constants.js.map
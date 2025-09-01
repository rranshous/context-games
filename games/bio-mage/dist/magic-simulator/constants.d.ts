/**
 * Complex spell sequences for the advanced magic simulator
 * Each spell has regulatory, structural, and modifier components
 */
import { ComplexSpell, SpellType } from './types.js';
export declare const REGULATORY_PATTERNS: {
    readonly FIRE_PROMOTER: "TATA";
    readonly LIFE_PROMOTER: "GCGC";
    readonly PROTECTION_PROMOTER: "ATAT";
    readonly ENERGY_PROMOTER: "CTCT";
    readonly SPACE_PROMOTER: "CGAT";
    readonly POWER_ENHANCER: "AAAA";
    readonly DURATION_ENHANCER: "TTTT";
    readonly STABILITY_SILENCER: "CCCC";
    readonly CHAOS_SILENCER: "GGGG";
};
export declare const STRUCTURAL_CORES: {
    readonly PYROBLAST_CORE: "ATCGATCGATCGATCG";
    readonly REGENERATION_CORE: "GCTAGCTAGCTAGCTA";
    readonly WARD_CORE: "ATGCATGCATGCATGC";
    readonly STORM_CORE: "TACGTACGTACGTACG";
    readonly PHASE_CORE: "CGCGCGCGCGCGCGCG";
};
export declare const MODIFIER_PATTERNS: {
    readonly AMPLIFIER: "ACTG";
    readonly STABILIZER: "TGCA";
    readonly EXTENDER: "GATC";
    readonly FOCUSER: "CATG";
    readonly CHAOS_MOD: "GTAC";
};
export declare const COMPLEX_SPELLS: Record<Exclude<SpellType, 'unknown'>, ComplexSpell>;
export declare const COMPLETE_SPELL_SEQUENCES: Record<Exclude<SpellType, 'unknown'>, string>;
export declare const VALID_BASES: readonly ["A", "T", "C", "G"];
export type ValidBase = typeof VALID_BASES[number];
//# sourceMappingURL=constants.d.ts.map
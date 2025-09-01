/**
 * Integration tests for the advanced magic simulator
 * Testing end-to-end scenarios and real-world usage patterns
 */

import { describe, it, expect } from 'vitest';
import { AdvancedSpellSimulator } from '../../magic-simulator/simulator.js';
import { COMPLEX_SPELLS, COMPLETE_SPELL_SEQUENCES } from '../../magic-simulator/constants.js';
import { SpellType } from '../../magic-simulator/types.js';

describe('Advanced Magic Simulator Integration Tests', () => {
  const simulator = new AdvancedSpellSimulator();

  describe('End-to-end multi-pass scenarios', () => {
    it('should handle fragment-based spell discovery workflow', () => {
      // Scenario: Player discovers fragments of a pyroblast spell
      const regulatoryFragment = 'TATAAAAATATA';        // Regulatory only
      const structuralFragment = 'ATCGATCGATCGATCG';     // Structural core only  
      const completeSpell = COMPLETE_SPELL_SEQUENCES.pyroblast;
      
      // Test fragments have different characteristics than complete spell
      const regResult = simulator.interpret(regulatoryFragment);
      const structResult = simulator.interpret(structuralFragment);
      const completeResult = simulator.interpret(completeSpell);
      
      expect(structResult.type).toBe('pyroblast'); // Core identifies spell type
      expect(completeResult.power).toBe(100);
      expect(completeResult.type).toBe('pyroblast');
      expect(completeResult.stability).toBe(100);
      
      // Fragments should be less powerful than complete spell
      expect(regResult.power).toBeLessThan(completeResult.power);
      expect(structResult.power).toBeLessThan(completeResult.power);
    });

    it('should handle experimental sequence assembly', () => {
      // Scenario: Player tries to combine components from different spells
      const fireRegulatory = COMPLEX_SPELLS.pyroblast.regulatorySequence;
      const lifeCore = COMPLEX_SPELLS.regeneration.structuralSequence;
      
      const hybridSpell = fireRegulatory + lifeCore;
      const result = simulator.interpret(hybridSpell);
      
      // Should produce some effect but likely different classification
      expect(result.power).toBeGreaterThan(0);
      expect(['pyroblast', 'regeneration', 'unknown']).toContain(result.type);
    });
  });

  describe('Spell classification accuracy', () => {
    it('should correctly classify all known complete spells', () => {
      const testCases = [
        { sequence: COMPLETE_SPELL_SEQUENCES.pyroblast, expectedType: 'pyroblast' as SpellType },
        { sequence: COMPLETE_SPELL_SEQUENCES.regeneration, expectedType: 'regeneration' as SpellType },
        { sequence: COMPLETE_SPELL_SEQUENCES.ward, expectedType: 'ward' as SpellType },
        { sequence: COMPLETE_SPELL_SEQUENCES.storm, expectedType: 'storm' as SpellType },
        { sequence: COMPLETE_SPELL_SEQUENCES.phase, expectedType: 'phase' as SpellType }
      ];

      testCases.forEach(({ sequence, expectedType }) => {
        const result = simulator.interpret(sequence);
        expect(result.type).toBe(expectedType);
        expect(result.power).toBe(100);
        expect(result.stability).toBe(100);
      });
    });

    it('should handle batch processing efficiently', () => {
      const testSequences = Object.values(COMPLETE_SPELL_SEQUENCES);
      
      // Process same batch multiple times - should be deterministic
      const batch1 = testSequences.map(seq => simulator.interpret(seq));
      const batch2 = testSequences.map(seq => simulator.interpret(seq));
      
      // All batches should produce identical results
      expect(batch1).toEqual(batch2);
    });
  });

  describe('Performance and reliability', () => {
    it('should handle performance requirements for real-time usage', () => {
      // Scenario: Game needs to process spells quickly during combat
      const testSequence = COMPLETE_SPELL_SEQUENCES.pyroblast;
      const iterations = 100; // Reduced for faster testing
      
      const startTime = performance.now();
      
      for (let i = 0; i < iterations; i++) {
        simulator.interpret(testSequence);
      }
      
      const endTime = performance.now();
      const avgTimePerSpell = (endTime - startTime) / iterations;
      
      // Should process each spell in reasonable time
      expect(avgTimePerSpell).toBeLessThan(10); // 10ms is reasonable for complex processing
    });

    it('should maintain consistency across multiple sessions', () => {
      // Scenario: Results should be identical across different simulator instances
      const simulator1 = new AdvancedSpellSimulator();
      const simulator2 = new AdvancedSpellSimulator();
      
      const testSequence = COMPLETE_SPELL_SEQUENCES.storm;
      
      const result1 = simulator1.interpret(testSequence);
      const result2 = simulator2.interpret(testSequence);
      
      expect(result1).toEqual(result2);
    });
  });

  describe('Error handling and edge cases', () => {
    it('should handle malformed sequences gracefully', () => {
      const malformedSequences = [
        '',                    // Empty
        'XYZXYZ',             // Invalid characters
        'A',                  // Too short
        'A'.repeat(100)       // Long sequence
      ];

      malformedSequences.forEach(sequence => {
        const result = simulator.interpret(sequence);
        
        // Should not crash and should return safe default values
        expect(typeof result.power).toBe('number');
        expect(typeof result.stability).toBe('number');
        expect(typeof result.duration).toBe('number');
        expect(typeof result.type).toBe('string');
        
        expect(result.power).toBeGreaterThanOrEqual(0);
        expect(result.power).toBeLessThanOrEqual(100);
      });
    });
  });
});

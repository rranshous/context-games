/**
 * Tests for the AdvancedSpellSimulator class
 * Following TDD approach with comprehensive coverage for multi-pass interpretation
 */

import { describe, it, expect } from 'vitest';
import { AdvancedSpellSimulator } from '../../magic-simulator/simulator.js';
import { COMPLEX_SPELLS } from '../../magic-simulator/constants.js';

describe('AdvancedSpellSimulator', () => {
  const simulator = new AdvancedSpellSimulator();

  describe('Perfect sequence interpretation', () => {
    it('should return maximum power and stability for perfect pyroblast sequence', () => {
      const result = simulator.interpret(COMPLEX_SPELLS.pyroblast.regulatorySequence + 
                                       COMPLEX_SPELLS.pyroblast.structuralSequence + 
                                       COMPLEX_SPELLS.pyroblast.modifierSequence);
      
      expect(result.type).toBe('pyroblast');
      expect(result.power).toBe(100);
      expect(result.stability).toBe(100);
      expect(result.duration).toBe(0); // Instant spell
    });

    it('should return maximum power and stability for perfect regeneration sequence', () => {
      const result = simulator.interpret(COMPLEX_SPELLS.regeneration.regulatorySequence + 
                                       COMPLEX_SPELLS.regeneration.structuralSequence + 
                                       COMPLEX_SPELLS.regeneration.modifierSequence);
      
      expect(result.type).toBe('regeneration');
      expect(result.power).toBe(100);
      expect(result.stability).toBe(100);
      expect(result.duration).toBe(0); // Instant spell
    });

    it('should return maximum power and stability for perfect ward sequence', () => {
      const result = simulator.interpret(COMPLEX_SPELLS.ward.regulatorySequence + 
                                       COMPLEX_SPELLS.ward.structuralSequence + 
                                       COMPLEX_SPELLS.ward.modifierSequence);
      
      expect(result.type).toBe('ward');
      expect(result.power).toBe(100);
      expect(result.stability).toBe(100);
      expect(result.duration).toBe(45); // Shield has duration
    });

    it('should return maximum power and stability for perfect storm sequence', () => {
      const result = simulator.interpret(COMPLEX_SPELLS.storm.regulatorySequence + 
                                       COMPLEX_SPELLS.storm.structuralSequence + 
                                       COMPLEX_SPELLS.storm.modifierSequence);
      
      expect(result.type).toBe('storm');
      expect(result.power).toBe(100);
      expect(result.stability).toBe(100);
      expect(result.duration).toBe(0); // Instant spell
    });

    it('should return maximum power and stability for perfect phase sequence', () => {
      const result = simulator.interpret(COMPLEX_SPELLS.phase.regulatorySequence + 
                                       COMPLEX_SPELLS.phase.structuralSequence + 
                                       COMPLEX_SPELLS.phase.modifierSequence);
      
      expect(result.type).toBe('phase');
      expect(result.power).toBe(100);
      expect(result.stability).toBe(100);
      expect(result.duration).toBe(0); // Instant spell
    });
  });

  describe('Determinism tests', () => {
    it('should always return identical results for the same input', () => {
      const testSequence = 'TATAAAAATATACGATCGATCGATCGACTGTGCA'; // Complete pyroblast
      const result1 = simulator.interpret(testSequence);
      const result2 = simulator.interpret(testSequence);
      const result3 = simulator.interpret(testSequence);
      
      expect(result1).toEqual(result2);
      expect(result2).toEqual(result3);
    });

    it('should be deterministic for partial matches', () => {
      const testSequence = 'TATAAAAATATACGATCGATCGATCTACTGTGCA'; // Almost pyroblast but one char different
      const results = Array.from({ length: 10 }, () => simulator.interpret(testSequence));
      
      // All results should be identical
      results.forEach(result => expect(result).toEqual(results[0]));
    });
  });

  describe('Multi-pass interpretation', () => {
    it('should handle sequences with regulatory components only', () => {
      const regulatoryOnly = 'TATAAAAATATA'; // Fire promoter + power enhancer + fire promoter
      const result = simulator.interpret(regulatoryOnly);
      
      expect(result.power).toBeGreaterThan(0); // Should have some effect
      expect(result.power).toBeLessThan(100); // But not full power without structural core
    });

    it('should handle sequences with structural core only', () => {
      const structuralOnly = 'ATCGATCGATCGATCG'; // Pyroblast core only
      const result = simulator.interpret(structuralOnly);
      
      expect(result.type).toBe('pyroblast'); // Should identify spell type
      expect(result.power).toBeGreaterThan(0);
      expect(result.power).toBeLessThan(100); // Reduced without regulatory/modifier
    });

    it('should handle sequences with modifier components', () => {
      const withModifiers = 'ATCGATCGATCGATCGACTGTGCA'; // Core + modifiers only
      const result = simulator.interpret(withModifiers);
      
      expect(result.type).toBe('pyroblast');
      expect(result.stability).toBeGreaterThan(50); // Stabilizer should improve stability
    });
  });

  describe('Invalid sequence handling', () => {
    it('should handle empty sequences', () => {
      const result = simulator.interpret('');
      
      expect(result.power).toBe(0);
      expect(result.stability).toBe(0);
      expect(result.duration).toBe(0);
      expect(result.type).toBe('unknown');
    });

    it('should handle sequences with invalid characters', () => {
      const result = simulator.interpret('ATCGXYZ');
      
      expect(result.power).toBe(0);
      expect(result.stability).toBe(0);
      expect(result.duration).toBe(0);
      expect(result.type).toBe('unknown');
    });

    it('should handle lowercase sequences by converting to uppercase', () => {
      const lowerCaseSequence = COMPLEX_SPELLS.pyroblast.structuralSequence.toLowerCase();
      const result = simulator.interpret(lowerCaseSequence);
      
      expect(result.type).toBe('pyroblast');
      expect(result.power).toBeGreaterThan(0);
    });
  });

  describe('Complex sequence analysis', () => {
    it('should analyze mixed spell components', () => {
      const mixedSequence = 'TATAAAAATATACGCGCGCGCGCGCGCGACTGTGCA'; // Fire regulatory + phase core + amplifier
      const result = simulator.interpret(mixedSequence);
      
      expect(result.power).toBeGreaterThan(0);
      expect(['pyroblast', 'phase', 'unknown']).toContain(result.type); // Could match either
    });
  });
});

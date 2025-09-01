/**
 * Integration tests for the magic simulator
 * Testing end-to-end scenarios and real-world usage patterns
 */

import { describe, it, expect } from 'vitest';
import { SimpleSpellSimulator } from '../../magic-simulator/simulator.js';
import { KNOWN_SPELLS } from '../../magic-simulator/constants.js';
import { SpellType } from '../../magic-simulator/types.js';

describe('Magic Simulator Integration Tests', () => {
  const simulator = new SimpleSpellSimulator();

  describe('End-to-end simulation scenarios', () => {
    it('should handle a complete spell discovery workflow', () => {
      // Scenario: Player discovers fragments of a fireball spell
      const fragmentA = 'ATCGAT';      // Start of fireball
      const fragmentB = 'CGATCG';      // Middle of fireball  
      const fullAttempt = 'ATCGATCGATCG'; // Complete fireball
      
      // Test fragments have lower power than complete spell
      const resultA = simulator.simulate(fragmentA);
      const resultB = simulator.simulate(fragmentB);
      const resultFull = simulator.simulate(fullAttempt);
      
      expect(resultA.power).toBeLessThan(resultFull.power);
      expect(resultB.power).toBeLessThan(resultFull.power);
      expect(resultFull.power).toBe(100);
      expect(resultFull.type).toBe('fireball');
    });

    it('should handle experimental spell sequence assembly', () => {
      // Scenario: Player tries to combine known fragments incorrectly
      const wrongAssembly = 'ATCGCGTACG'; // Mix of fireball start + lightning middle
      const result = simulator.simulate(wrongAssembly);
      
      // Should classify as one of the known spells but with reduced effectiveness
      expect(['fireball', 'heal', 'shield', 'lightning', 'teleport']).toContain(result.type);
      expect(result.power).toBeLessThan(100);
      expect(result.stability).toBeLessThan(100);
    });

    it('should handle dangerous experimental sequences', () => {
      // Scenario: Player attempts risky sequence variations
      const dangerousSequence = 'XXXXXXXXXXXXXX'; // Invalid but same length as known spells
      const result = simulator.simulate(dangerousSequence);
      
      // Should fail safely
      expect(result.power).toBe(0);
      expect(result.stability).toBe(0);
      expect(result.duration).toBe(0);
    });

    it('should support progressive learning through similarity', () => {
      // Scenario: Player gradually improves spell accuracy
      const attempts = [
        'TTTTTTTTTTTT',    // Completely wrong
        'ATTTTTTTTTTT',    // One correct base
        'ATCGTTTTTTTT',    // Two correct bases
        'ATCGATTTTTTT',    // Half correct
        'ATCGATCGATTT',    // Almost complete
        'ATCGATCGATCG'     // Perfect fireball
      ];
      
      const results = attempts.map(seq => simulator.simulate(seq));
      
      // Power should generally increase as sequence gets more accurate
      for (let i = 1; i < results.length; i++) {
        if (results[i].type === results[i-1].type) {
          expect(results[i].power).toBeGreaterThanOrEqual(results[i-1].power);
        }
      }
      
      // Final result should be perfect
      expect(results[results.length - 1].power).toBe(100);
      expect(results[results.length - 1].type).toBe('fireball');
    });

    it('should handle multiple spell types in discovery session', () => {
      // Scenario: Player discovers multiple different spells
      const spellAttempts = [
        { sequence: KNOWN_SPELLS.fireball, expectedType: 'fireball' as SpellType },
        { sequence: KNOWN_SPELLS.heal, expectedType: 'heal' as SpellType },
        { sequence: KNOWN_SPELLS.shield, expectedType: 'shield' as SpellType },
        { sequence: KNOWN_SPELLS.lightning, expectedType: 'lightning' as SpellType },
        { sequence: KNOWN_SPELLS.teleport, expectedType: 'teleport' as SpellType }
      ];
      
      spellAttempts.forEach(({ sequence, expectedType }) => {
        const result = simulator.simulate(sequence);
        expect(result.type).toBe(expectedType);
        expect(result.power).toBe(100);
        expect(result.stability).toBe(100);
      });
    });

    it('should maintain consistency across batch processing', () => {
      // Scenario: Processing many sequences in a game session
      const testSequences = [
        'ATCGATCGATCG',
        'GCTAGCTAGCTA', 
        'ATGCATGCATGC',
        'TACGTACGTACG',
        'CGCGCGCGCGCG'
      ];
      
      // Run multiple times to ensure consistency
      const batch1 = testSequences.map(seq => simulator.simulate(seq));
      const batch2 = testSequences.map(seq => simulator.simulate(seq));
      const batch3 = testSequences.map(seq => simulator.simulate(seq));
      
      batch1.forEach((result, index) => {
        expect(result).toEqual(batch2[index]);
        expect(result).toEqual(batch3[index]);
      });
    });
  });

  describe('Known spell verification', () => {
    it('should correctly identify all known spell types', () => {
      const spellTests = [
        { sequence: KNOWN_SPELLS.fireball, type: 'fireball', instant: true },
        { sequence: KNOWN_SPELLS.heal, type: 'heal', instant: true },
        { sequence: KNOWN_SPELLS.shield, type: 'shield', instant: false },
        { sequence: KNOWN_SPELLS.lightning, type: 'lightning', instant: true },
        { sequence: KNOWN_SPELLS.teleport, type: 'teleport', instant: true }
      ];
      
      spellTests.forEach(({ sequence, type, instant }) => {
        const result = simulator.simulate(sequence);
        
        expect(result.type).toBe(type);
        expect(result.power).toBe(100);
        expect(result.stability).toBe(100);
        
        if (instant) {
          expect(result.duration).toBe(0);
        } else {
          expect(result.duration).toBeGreaterThan(0);
        }
      });
    });

    it('should handle spell sequences with case variations', () => {
      const variations = [
        KNOWN_SPELLS.fireball.toLowerCase(),
        KNOWN_SPELLS.fireball.toUpperCase(),
        'AtCgAtCgAtCg', // Mixed case
      ];
      
      variations.forEach(sequence => {
        const result = simulator.simulate(sequence);
        expect(result.type).toBe('fireball');
        expect(result.power).toBe(100);
        expect(result.stability).toBe(100);
      });
    });

    it('should provide consistent spell classification boundaries', () => {
      // Test sequences that are exactly between two spells
      const fireball = KNOWN_SPELLS.fireball;   // ATCGATCGATCG
      const heal = KNOWN_SPELLS.heal;           // GCTAGCTAGCTA
      
      // Create a sequence that's 50% fireball, 50% heal
      const hybrid = 'ATCGATAGCTAG'; // First half fireball, second half heal
      const result = simulator.simulate(hybrid);
      
      // Should consistently classify as one type
      expect(['fireball', 'heal']).toContain(result.type);
      
      // Run multiple times to ensure consistent classification
      for (let i = 0; i < 10; i++) {
        const testResult = simulator.simulate(hybrid);
        expect(testResult.type).toBe(result.type);
      }
    });

    it('should handle performance requirements for real-time usage', () => {
      // Scenario: Game needs to process spells quickly during combat
      const testSequence = KNOWN_SPELLS.fireball;
      const iterations = 1000;
      
      const startTime = performance.now();
      
      for (let i = 0; i < iterations; i++) {
        simulator.simulate(testSequence);
      }
      
      const endTime = performance.now();
      const averageTime = (endTime - startTime) / iterations;
      
      // Should process each spell in less than 1ms for real-time gameplay
      expect(averageTime).toBeLessThan(1);
    });
  });
});

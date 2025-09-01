/**
 * Tests for the SimpleSpellSimulator class
 * Following TDD approach with comprehensive coverage
 */

import { describe, it, expect } from 'vitest';
import { SimpleSpellSimulator } from '../../magic-simulator/simulator.js';
import { KNOWN_SPELLS } from '../../magic-simulator/constants.js';

describe('SimpleSpellSimulator', () => {
  const simulator = new SimpleSpellSimulator();

  describe('Perfect sequence matching', () => {
    it('should return maximum power and stability for perfect fireball sequence', () => {
      const result = simulator.simulate(KNOWN_SPELLS.fireball);
      
      expect(result.type).toBe('fireball');
      expect(result.power).toBe(100);
      expect(result.stability).toBe(100);
      expect(result.duration).toBe(0); // Instant spell
    });

    it('should return maximum power and stability for perfect heal sequence', () => {
      const result = simulator.simulate(KNOWN_SPELLS.heal);
      
      expect(result.type).toBe('heal');
      expect(result.power).toBe(100);
      expect(result.stability).toBe(100);
      expect(result.duration).toBe(0); // Instant spell
    });

    it('should return maximum power and stability for perfect shield sequence', () => {
      const result = simulator.simulate(KNOWN_SPELLS.shield);
      
      expect(result.type).toBe('shield');
      expect(result.power).toBe(100);
      expect(result.stability).toBe(100);
      expect(result.duration).toBe(30); // Shield has duration
    });

    it('should return maximum power and stability for perfect lightning sequence', () => {
      const result = simulator.simulate(KNOWN_SPELLS.lightning);
      
      expect(result.type).toBe('lightning');
      expect(result.power).toBe(100);
      expect(result.stability).toBe(100);
      expect(result.duration).toBe(0); // Instant spell
    });

    it('should return maximum power and stability for perfect teleport sequence', () => {
      const result = simulator.simulate(KNOWN_SPELLS.teleport);
      
      expect(result.type).toBe('teleport');
      expect(result.power).toBe(100);
      expect(result.stability).toBe(100);
      expect(result.duration).toBe(0); // Instant spell
    });
  });

  describe('Determinism tests', () => {
    it('should always return identical results for the same input', () => {
      const testSequence = 'ATCGATCGATCG';
      const result1 = simulator.simulate(testSequence);
      const result2 = simulator.simulate(testSequence);
      const result3 = simulator.simulate(testSequence);
      
      expect(result1).toEqual(result2);
      expect(result2).toEqual(result3);
    });

    it('should be deterministic for partial matches', () => {
      const testSequence = 'ATCGATCGATCT'; // Almost fireball but last char different
      const results = Array.from({ length: 10 }, () => simulator.simulate(testSequence));
      
      // All results should be identical
      results.forEach(result => expect(result).toEqual(results[0]));
    });
  });

  describe('Partial sequence matching', () => {
    it('should handle sequences with single character differences', () => {
      const almostFireball = 'ATCGATCGATCT'; // Last G -> T
      const result = simulator.simulate(almostFireball);
      
      expect(result.type).toBe('fireball'); // Should still match fireball best
      expect(result.power).toBeLessThan(100);
      expect(result.stability).toBeLessThan(100);
    });

    it('should handle shorter sequences', () => {
      const shortSequence = 'ATCGAT'; // First half of fireball
      const result = simulator.simulate(shortSequence);
      
      expect(result.type).toBe('fireball'); // Should match fireball best
      expect(result.power).toBeLessThan(100);
      expect(result.stability).toBeLessThan(100);
    });

    it('should handle longer sequences', () => {
      const longSequence = 'ATCGATCGATCGATCG'; // Fireball + extra
      const result = simulator.simulate(longSequence);
      
      expect(result.type).toBe('fireball'); // Should match fireball best
      expect(result.power).toBeLessThan(100);
      expect(result.stability).toBeLessThan(100);
    });
  });

  describe('Invalid sequence handling', () => {
    it('should handle empty sequences', () => {
      const result = simulator.simulate('');
      
      expect(result.power).toBe(0);
      expect(result.stability).toBe(0);
      expect(result.duration).toBe(0);
    });

    it('should handle sequences with invalid characters', () => {
      const result = simulator.simulate('ATCGXYZ');
      
      expect(result.power).toBe(0);
      expect(result.stability).toBe(0);
      expect(result.duration).toBe(0);
    });

    it('should handle lowercase sequences by converting to uppercase', () => {
      const result = simulator.simulate('atcgatcgatcg');
      
      expect(result.type).toBe('fireball');
      expect(result.power).toBe(100);
      expect(result.stability).toBe(100);
    });
  });

  describe('Similarity calculation edge cases', () => {
    it('should handle completely different sequences', () => {
      const result = simulator.simulate('TTTTTTTTTTTT');
      
      expect(result.power).toBeGreaterThanOrEqual(0);
      expect(result.stability).toBeGreaterThanOrEqual(0);
      // Should still classify as some spell type
      expect(['fireball', 'heal', 'shield', 'lightning', 'teleport']).toContain(result.type);
    });
  });
});

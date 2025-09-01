/**
 * Simple usage examples for the Magic Simulator
 * 
 * Run with: npx ts-node examples/usage-examples.ts
 */

import { SimpleSpellSimulator, KNOWN_SPELLS, SpellResult } from '../src/magic-simulator/index.js';

console.log('🧬 Magic Simulator - Usage Examples\n');

const simulator = new SimpleSpellSimulator();

// Example 1: Perfect spell casting
console.log('=== Perfect Spell Casting ===');
Object.entries(KNOWN_SPELLS).forEach(([spellName, sequence]) => {
  const result = simulator.simulate(sequence);
  const durationText = result.duration > 0 ? ` (${result.duration}s duration)` : ' (instant)';
  console.log(`${spellName.toUpperCase()}: ${result.power}% power, ${result.stability}% stability${durationText}`);
});

console.log('\n=== Fragment Discovery ===');
// Example 2: Fragment analysis
const fireballFragments = [
  'ATCGAT',       // Start of fireball
  'CGATCG',       // Middle of fireball
  'GATCG',        // End of fireball
  'ATCGATCGATCG'  // Complete fireball
];

fireballFragments.forEach((fragment, index) => {
  const result = simulator.simulate(fragment);
  const isComplete = result.power === 100;
  console.log(`Fragment ${index + 1} (${fragment}): ${result.type} - ${result.power}% ${isComplete ? '✓ COMPLETE' : 'incomplete'}`);
});

console.log('\n=== Experimental Magic ===');
// Example 3: Experimental sequences
const experiments = [
  { name: 'Almost Fireball', sequence: 'ATCGATCGATCT' }, // Last G -> T
  { name: 'Mixed Sequence', sequence: 'ATCGGCTAGCTA' },  // Fireball start + heal end
  { name: 'Invalid Sequence', sequence: 'XXXXXXXXXXXXXX' }, // Invalid characters
  { name: 'Random Sequence', sequence: 'TTTTTTTTTTTT' },   // All T's
];

experiments.forEach(({ name, sequence }) => {
  const result = simulator.simulate(sequence);
  const status = result.power === 0 ? '❌ FAILED' : 
                 result.stability < 50 ? '⚠️  DANGEROUS' : '✅ SAFE';
  console.log(`${name}: ${result.type} (${result.power}% power, ${result.stability}% stability) ${status}`);
});

console.log('\n=== Performance Test ===');
// Example 4: Performance demonstration
const testSequence = KNOWN_SPELLS.fireball;
const iterations = 1000;

const startTime = performance.now();
for (let i = 0; i < iterations; i++) {
  simulator.simulate(testSequence);
}
const endTime = performance.now();

const totalTime = endTime - startTime;
const averageTime = totalTime / iterations;

console.log(`Processed ${iterations} spells in ${totalTime.toFixed(2)}ms`);
console.log(`Average time per spell: ${averageTime.toFixed(4)}ms`);
console.log(`Performance: ${averageTime < 1 ? '✅ Excellent' : '⚠️  Needs optimization'} (target: <1ms)`);

console.log('\n=== Determinism Verification ===');
// Example 5: Determinism check
const testSeq = 'ATCGATCGATCT'; // Almost fireball
const results: SpellResult[] = [];

for (let i = 0; i < 5; i++) {
  results.push(simulator.simulate(testSeq));
}

const allIdentical = results.every(result => 
  result.type === results[0].type &&
  result.power === results[0].power &&
  result.stability === results[0].stability &&
  result.duration === results[0].duration
);

console.log(`Determinism test: ${allIdentical ? '✅ PASSED' : '❌ FAILED'}`);
console.log(`All 5 runs produced: ${results[0].type} (${results[0].power}% power, ${results[0].stability}% stability)`);

console.log('\n🎉 All examples completed!');

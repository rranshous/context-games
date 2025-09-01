/**
 * Advanced usage examples for the Magic Simulator
 * 
 * Run with: npx ts-node examples/usage-examples.ts
 */

import { AdvancedSpellSimulator, COMPLETE_SPELL_SEQUENCES, SpellResult } from '../magic-simulator/index.js';

console.log('🧬 Advanced Magic Simulator - Usage Examples\n');

const simulator = new AdvancedSpellSimulator();

// Example 1: Perfect spell casting
console.log('=== Perfect Spell Casting ===');
Object.entries(COMPLETE_SPELL_SEQUENCES).forEach(([spellName, sequence]) => {
  const result = simulator.interpret(sequence);
  const durationText = result.duration > 0 ? ` (${result.duration}s duration)` : ' (instant)';
  console.log(`${spellName.toUpperCase()}: ${result.power}% power, ${result.stability}% stability, ${result.complexity}% complexity${durationText}`);
});

console.log('\n=== Fragment Discovery ===');
// Example 2: Fragment analysis
const pyroblastFragments = [
  'TATAAAAATATA',       // Regulatory sequence only
  'ATCGATCGATCGATCG',    // Structural core only
  'ACTGTGCA',            // Modifier sequence only
  'TATAAAAATATAATCGATCGATCGATCGACTGTGCA'  // Complete pyroblast
];

pyroblastFragments.forEach((fragment, index) => {
  const result = simulator.interpret(fragment);
  const isComplete = result.power === 100;
  console.log(`Fragment ${index + 1} (${fragment}): ${result.type} - ${result.power}% power, ${result.complexity}% complexity, risk: ${result.stability < 50 ? 'HIGH' : 'LOW'} ${isComplete ? '✓ COMPLETE' : 'incomplete'}`);
});

console.log('\n=== Experimental Magic ===');
// Example 3: Experimental sequences  
const experiments = [
  { name: 'Regulatory Only', sequence: 'TATAAAAATATA' },     // Just promoter + enhancer
  { name: 'Core Only', sequence: 'ATCGATCGATCGATCG' },      // Just pyroblast core
  { name: 'Mixed Fragments', sequence: 'TATACTCTGATC' },     // Mixed regulatory patterns
  { name: 'Chaos Modifier', sequence: 'ATCGATCGATCGATCGGTAC' }, // Core + chaos
];

experiments.forEach(({ name, sequence }) => {
  const result = simulator.interpret(sequence);
  const status = result.power === 0 ? '❌ FAILED' : 
                 result.stability < 30 ? '☠️  LETHAL' :
                 result.stability < 50 ? '⚠️  DANGEROUS' : '✅ SAFE';
  console.log(`${name}: ${result.type} (${result.power}% power, ${result.stability}% stability, ${result.complexity}% complexity) ${status}`);
});

console.log('\n=== Performance Test ===');
// Example 4: Performance demonstration
const testSequence = COMPLETE_SPELL_SEQUENCES.pyroblast;
const iterations = 1000;

const startTime = performance.now();
for (let i = 0; i < iterations; i++) {
  simulator.interpret(testSequence);
}
const endTime = performance.now();

const totalTime = endTime - startTime;
const averageTime = totalTime / iterations;

console.log(`Processed ${iterations} spells in ${totalTime.toFixed(2)}ms`);
console.log(`Average time per spell: ${averageTime.toFixed(4)}ms`);
console.log(`Performance: ${averageTime < 1 ? '✅ Excellent' : '⚠️  Needs optimization'} (target: <1ms)`);

console.log('\n=== Determinism Verification ===');
// Example 5: Determinism check
const testSeq = 'TATAATCGATCGATCGATCG'; // Partial pyroblast
const results: SpellResult[] = [];

for (let i = 0; i < 5; i++) {
  results.push(simulator.interpret(testSeq));
}

const allIdentical = results.every(result => 
  result.type === results[0].type &&
  result.power === results[0].power &&
  result.stability === results[0].stability &&
  result.duration === results[0].duration &&
  result.complexity === results[0].complexity
);

console.log(`Determinism test: ${allIdentical ? '✅ PASSED' : '❌ FAILED'}`);
console.log(`All 5 runs produced: ${results[0].type} (${results[0].power}% power, ${results[0].stability}% stability, ${results[0].complexity}% complexity)`);

console.log('\n🎉 All advanced examples completed!');

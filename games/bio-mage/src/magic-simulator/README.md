# Magic Simulator

A deterministic magic simulation system that treats spells as genetic-like sequences using ATCG base-4 encoding. Part of the bio-mage game where magic is understood through biological analysis.

## Quick Start

```typescript
import { SimpleSpellSimulator, KNOWN_SPELLS } from './magic-simulator';

const simulator = new SimpleSpellSimulator();

// Cast a perfect fireball spell
const result = simulator.simulate(KNOWN_SPELLS.fireball);
console.log(`${result.type}: ${result.power}% power, ${result.stability}% stability`);

// Experiment with partial sequences
const fragment = 'ATCGAT'; // First half of fireball
const fragmentResult = simulator.simulate(fragment);
console.log(`Fragment detected: ${fragmentResult.type} (${fragmentResult.power}% complete)`);
```

## Core Concepts

### Magic as Biology
- **Spells are sequences**: Like DNA, magic follows ATCG base-4 encoding
- **Similarity matters**: Partial sequences still produce effects
- **Deterministic**: Same input always produces identical output
- **Fragment-based discovery**: Players detect pieces and assemble complete spells

### Spell Types
- **Fireball** (`ATCGATCGATCG`) - Instant damage spell
- **Heal** (`GCTAGCTAGCTA`) - Instant healing spell  
- **Shield** (`ATGCATGCATGC`) - Duration-based protection
- **Lightning** (`TACGTACGTACG`) - Instant electrical damage
- **Teleport** (`CGCGCGCGCGCG`) - Instant movement spell

## API Reference

### SimpleSpellSimulator

The main simulation engine for processing magic sequences.

#### Constructor
```typescript
const simulator = new SimpleSpellSimulator();
```

#### Methods

##### `simulate(sequence: string): SpellResult`
Process a magic sequence and return spell effects.

**Parameters:**
- `sequence` - ATCG magic sequence string (case-insensitive)

**Returns:** `SpellResult` with type, power, stability, and duration

**Example:**
```typescript
const result = simulator.simulate('ATCGATCGATCG');
// { type: 'fireball', power: 100, stability: 100, duration: 0 }
```

### Types

#### SpellResult
```typescript
interface SpellResult {
  type: SpellType;      // Detected spell type
  power: number;        // 0-100, effectiveness of the spell
  stability: number;    // 0-100, safety/reliability (low = dangerous)
  duration: number;     // Seconds, 0 for instant spells
}
```

#### SpellType
```typescript
type SpellType = 'fireball' | 'heal' | 'shield' | 'lightning' | 'teleport';
```

### Constants

#### KNOWN_SPELLS
Perfect sequences for all known spells:
```typescript
const KNOWN_SPELLS = {
  fireball: 'ATCGATCGATCG',
  heal: 'GCTAGCTAGCTA',
  shield: 'ATGCATGCATGC', 
  lightning: 'TACGTACGTACG',
  teleport: 'CGCGCGCGCGCG'
};
```

#### VALID_BASES
Valid magic sequence characters:
```typescript
const VALID_BASES = ['A', 'T', 'C', 'G'];
```

## Usage Patterns

### Fragment Discovery Workflow
```typescript
// Player observes a mage casting fireball and detects fragments
const observedFragments = ['ATCGAT', 'CGATCG', 'GATCG'];

observedFragments.forEach(fragment => {
  const result = simulator.simulate(fragment);
  console.log(`Fragment analysis: ${result.type} (${result.power}% confidence)`);
});

// Player attempts to assemble complete sequence
const assembledSpell = 'ATCGATCGATCG';
const finalResult = simulator.simulate(assembledSpell);

if (finalResult.power === 100) {
  console.log('Perfect spell reconstruction!');
}
```

### Experimental Magic
```typescript
// Player experiments with sequence variations
const experiments = [
  'ATCGATCGATCT', // Almost perfect fireball (last G -> T)
  'ATCGATCGATCGATCG', // Fireball with extra bases
  'TTTTTTTTTTTT', // Completely wrong sequence
];

experiments.forEach((sequence, index) => {
  const result = simulator.simulate(sequence);
  console.log(`Experiment ${index + 1}: ${result.type} - Power: ${result.power}%, Stability: ${result.stability}%`);
  
  if (result.stability < 50) {
    console.warn('⚠️  Dangerous sequence - low stability!');
  }
});
```

### Batch Processing for Game Sessions
```typescript
// Process multiple spells efficiently during combat
const combatSequences = [
  'ATCGATCGATCG', // Fireball
  'GCTAGCTAGCTA', // Heal
  'ATGCATGCATGC', // Shield
];

const combatResults = combatSequences.map(sequence => ({
  sequence,
  result: simulator.simulate(sequence)
}));

combatResults.forEach(({ sequence, result }) => {
  console.log(`${sequence} -> ${result.type} (${result.power}% power)`);
});
```

## Performance

The simulator is optimized for real-time gameplay:
- **Sub-millisecond processing**: Each spell simulation completes in <1ms
- **Deterministic**: No randomness ensures consistent performance
- **Memory efficient**: Minimal allocation during simulation
- **Stateless**: Safe for concurrent usage

## Integration Guide

### Game Engine Integration
```typescript
// Example game engine integration
class MagicSystem {
  private simulator = new SimpleSpellSimulator();
  
  castSpell(player: Player, sequence: string): boolean {
    const result = this.simulator.simulate(sequence);
    
    if (result.power === 0) {
      this.showMessage(player, 'The spell fizzles out...');
      return false;
    }
    
    if (result.stability < 30) {
      this.showMessage(player, '⚠️ Dangerous magic detected!');
      this.applyBacklash(player, 100 - result.stability);
    }
    
    this.executeSpellEffect(player, result);
    return true;
  }
}
```

### UI Integration
```typescript
// Example spell analyzer UI component
class SpellAnalyzer {
  private simulator = new SimpleSpellSimulator();
  
  analyzeSequence(inputSequence: string) {
    const result = this.simulator.simulate(inputSequence);
    
    return {
      spellType: result.type,
      completeness: `${result.power}%`,
      safety: result.stability > 70 ? 'Safe' : 'Dangerous',
      effect: this.describeSpellEffect(result)
    };
  }
}
```

## Extension Patterns

### Custom Spell Libraries
```typescript
// Extend with custom spells for mods/expansions
const CUSTOM_SPELLS = {
  ...KNOWN_SPELLS,
  invisibility: 'GCGCGCGCGCGC',
  earthquake: 'TATATATATATA'
};
```

### Advanced Similarity Algorithms
```typescript
// Future enhancement: weighted similarity based on spell domains
class AdvancedSpellSimulator extends SimpleSpellSimulator {
  // Override similarity calculation for domain-specific weighting
  protected calculateSimilarity(seq1: string, seq2: string): number {
    // Custom implementation
  }
}
```

## Testing

The simulator includes comprehensive test coverage:
- **24 tests** covering all functionality
- **97.97% statement coverage**
- **100% function coverage**
- **Determinism verification**
- **Performance benchmarks**

Run tests:
```bash
npm test              # Run all tests
npm run test:coverage # Run with coverage report
npm run test:watch    # Watch mode for development
```

## Architecture

The magic simulator follows clean architecture principles:

```
magic-simulator/
├── index.ts          # Public API exports
├── simulator.ts      # Core simulation engine
├── types.ts          # Type definitions
├── constants.ts      # Spell library and constants
└── tests/           # Comprehensive test suite
    ├── simulator.test.ts
    └── integration.test.ts
```

## Future Enhancements

Based on the [Magical DNA System](../docs/magical_dna_system.md) design:

1. **Fragment Assembly System** - Automatic sequence reconstruction
2. **Multi-pass Interpretation** - Regulatory sequences and modifiers  
3. **Emergent Magic** - Dynamic spell discovery beyond known library
4. **Advanced Risk Assessment** - Biochemical stability modeling

---

*This magic simulator provides the foundation for a unique spell system where magic follows biological principles, enabling systematic discovery and experimentation.*

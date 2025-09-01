# Magic Simulator IPI - Standalone Module with Tests

## Introduce

### Vision
Create the magic simulator component for the bio-mage game that treats spells as genetic-like sequences (ATCG base-4 encoding). The simulator will be the foundation for the game's magic system, enabling fragment detection, sequence assembly, and experimental spell casting.

*Based on the design outlined in [Magical DNA System](magical_dna_system.md)*

### Core Requirements
- **Modular component** - Clean interface for integration with other game systems
- **Extensive testing** - Ensure reliability and internal consistency 
- **TypeScript implementation** - Type safety and modern development patterns
- **Simple starting point** - Based on the `SimpleSpellSimulator` from magical DNA system doc
- **Completely deterministic** - No randomness, same input always produces same output

### Success Criteria
- Magic simulator processes ATCG sequences and returns spell effects
- Comprehensive test suite covering all functionality
- Clean API for integration with game systems
- Documentation for usage and extension

## Plan

### Phase 1: Core Simulator Implementation
1. **Project Setup**
   - Initialize TypeScript project with testing framework
   - Set up build configuration and dev dependencies
   - Create project structure for standalone module

2. **Type Definitions**
   - Define `SpellResult` interface (type, power, stability, duration)
   - Define spell types enum
   - Create configuration types for known spells

3. **SimpleSpellSimulator Class**
   - Implement core simulation logic from magical DNA doc (modified for determinism)
   - Known spells library (fireball, heal, shield, lightning, teleport)
   - Sequence similarity calculation
   - Deterministic power/stability/duration calculation methods (no Math.random())

### Phase 2: Testing Infrastructure
1. **Test Framework Setup**
   - Configure Jest or Vitest for TypeScript
   - Set up test coverage reporting
   - Create test file structure

2. **Core Functionality Tests**
   - Perfect sequence matching tests
   - Similarity calculation validation
   - Edge cases (empty sequences, invalid characters)
   - Stability and duration calculation tests

3. **Integration Tests**
   - End-to-end simulation scenarios
   - Known spell verification
   - Performance benchmarks

### Phase 3: API & Documentation
1. **Clean Module API**
   - Export main simulator class
   - Export type definitions
   - Simple usage examples

2. **Documentation**
   - API documentation with examples
   - Usage guide for game integration
   - Extension patterns for future complexity

### Technical Specifications

#### File Structure
```
bio-mage/
├── src/
│   ├── magic-simulator/
│   │   ├── index.ts           # Main exports
│   │   ├── simulator.ts       # SimpleSpellSimulator class
│   │   ├── types.ts          # Type definitions
│   │   └── constants.ts      # Known spells library
│   ├── game-engine/          # Future game systems
│   ├── ui/                   # Future UI components
│   └── tests/
│       ├── magic-simulator/
│       │   ├── simulator.test.ts
│       │   ├── types.test.ts
│       │   └── integration.test.ts
│       └── ...
├── package.json
├── tsconfig.json
├── index.html
└── README.md
```

#### Key APIs
```typescript
// Main simulator class
class SimpleSpellSimulator {
  simulate(sequence: string): SpellResult
  private findBestMatch(sequence: string): {type: string, sequence: string}
  private calculateSimilarity(seq1: string, seq2: string): number
  private calculateStability(sequence: string, targetSequence: string): number
  private calculateDuration(sequence: string, similarity: number): number
}

// Result interface
interface SpellResult {
  type: 'fireball' | 'heal' | 'shield' | 'lightning' | 'teleport'
  power: number      // 0-100
  stability: number  // 0-100, low = dangerous side effects  
  duration: number   // seconds, if applicable
}
```

#### Test Coverage Goals
- **Unit Tests**: 95%+ coverage on all methods
- **Integration Tests**: Full simulation workflows
- **Edge Cases**: Invalid inputs, boundary conditions
- **Determinism Tests**: Verify same inputs always produce identical outputs
- **Performance Tests**: Sequence processing benchmarks

## Implement

### Development Workflow
1. Set up TypeScript project with testing
2. Implement core types and interfaces
3. Build SimpleSpellSimulator class with TDD approach
4. Create comprehensive test suite
5. Add documentation and examples
6. Validate standalone module functionality

### Validation Criteria
- [ ] All tests pass with >95% coverage
- [ ] Module can be imported and used by other game components
- [ ] Known spells produce expected results
- [ ] Sequence similarity calculations are mathematically sound
- [ ] **Simulator is completely deterministic** - no randomness anywhere
- [ ] Performance is suitable for real-time game usage
- [ ] API is clean and well-documented

### Next Steps (Future IPIs)
- Fragment detection and assembly system
- Advanced multi-pass spell interpretation
- Emergent magic for unknown sequences
- Game engine and UI integration

---

*This IPI focuses on building a solid, well-tested foundation for the magic system that can grow in complexity while maintaining internal consistency.*

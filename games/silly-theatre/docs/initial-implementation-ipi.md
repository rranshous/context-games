# Silly Theatre - Initial Implementation (IPI)

*Following the Introduce → Plan → Implement pattern for building the foundational theater simulator and visual composition tool*

## Introduce

### Vision
Build a web-based simulator that replicates a physical four-layer theater console as a foundation for future creative tools, games, and collaborative experiences.

### Core Principles
- **Separation of Concerns**: Clean split between simulator logic, presentation layer, and input handling (Dark Hall pattern)
- **Foundation First**: Focus on solid simulator and display before exploring dynamic interactions
- **Visual Composition Tool**: Direct stage mapping interface rather than programming language
- **Modular Heads**: Multiple interfaces can be built on top of the simulator core

### Initial Scope
- Build the core theater simulator with all 4 layers
- Create a simple visual composition interface that maps directly to the stage
- Implement basic rendering pipeline
- Enable creation of "static" theatrical scenes
- NO game mechanics or AI integration yet - foundation first

### Technical Architecture
**Static Web App - No Backend Required**

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Input Layer   │───▶│  Simulator Core  │───▶│ Presentation    │
│ (Composition UI)│    │ (4-layer theater)│    │ (Canvas Render) │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

- **Pure client-side implementation** using HTML5 Canvas and TypeScript
- **Static assets** bundled with build (sprites embedded or included)
- **Scene files** included as static DSL text files  
- **State management** in browser memory/localStorage
- **Deployment** to any static host (GitHub Pages, Netlify, itch.io)

## Plan

### Phase 1: Core Simulator Foundation
**Goal**: Implement the theater simulator engine with all 4 layers

**Deliverables**:
- [ ] TypeScript interfaces for all 4 layers (from spec)
- [ ] Animation queue system
- [ ] State management for each layer
- [ ] Basic simulator class with API methods

**Acceptance Criteria**:
- Can programmatically control all 4 layers
- Animation queues work for overlapping animations  
- State can be saved/loaded
- Clean separation from presentation layer

### Phase 2: Canvas Rendering Pipeline
**Goal**: Visual representation of the theater state

**Deliverables**:
- [x] Multi-canvas layered rendering system
- [ ] Tile flip animations with easing
- [x] LED glow effects and color blending
- [ ] Prop sprites with transforms (enhanced)
- [ ] Puppet sprites with shadows
- [ ] Stage positioning and scaling refinements

**Acceptance Criteria**:
- 64×32 stage renders correctly
- All layer visual effects work as specified
- Smooth 60fps animations
- Configurable rendering scale
- **NEW: Proper staging alignment and positioning**

**Phase 2 Refinement Goals**:
- Enhanced prop sprites (better design, colors, details)
- Puppet shadows and improved character design
- Tile flip animations with smooth easing
- Stage positioning: scale and align all elements properly
- "Line everything up" - consistent positioning across all layers

### Phase 3: Scene Description DSL
**Goal**: Create a simple, human-readable DSL for describing theatrical scenes

**Deliverables**:
- [ ] DSL syntax specification (newline-separated instructions)
- [ ] DSL parser that translates to simulator API calls
- [ ] Basic DSL commands for all 4 layers
- [ ] Error handling and validation for DSL

**Acceptance Criteria**:
- Clean, readable syntax for describing scenes
- Parser correctly translates DSL to simulator commands
- DSL supports all major theater operations (tiles, LEDs, props, puppets)
- Good error messages for invalid DSL

**DSL Features**:
- Tile patterns (fill, shapes, gradients)
- LED lighting (colors, gradients, effects)
- Prop placement and positioning
- Puppet positioning and basic poses
- Comments and scene metadata

### Phase 4: Static Scene Gallery
**Goal**: Create compelling static scenes using the DSL to validate simulator and showcase capabilities

**Deliverables**:
- [ ] 5-8 scenes written in DSL demonstrating each layer
- [ ] Scene picker/browser interface
- [ ] Scene transition animations
- [ ] Scene loading from DSL files

**Acceptance Criteria**:
- Multiple diverse scenes showcase all 4 layers working together
- Scene picker allows browsing and selecting scenes
- Smooth transitions between scenes
- Scenes demonstrate the theater's expressive potential

**Example Scenes**:
- Forest clearing (trees, dappled light, woodland creatures)
- Stormy castle (dark tiles, lightning LEDs, castle prop, swaying figures)
- Sunrise landscape (gradient tiles, warm LED progression, mountain props)
- Underwater scene (blue tiles, flowing light, coral props, fish puppets)
- City at night (building silhouettes, neon LEDs, urban props, people)

### Phase 5: Visual Composition Interface
**Goal**: Direct stage manipulation UI

**Deliverables**:
- [ ] Click/drag interface for tile states
- [ ] Color picker for LED matrix
- [ ] Prop placement and manipulation tools
- [ ] Puppet positioning controls
- [ ] Scene save/load functionality

**Acceptance Criteria**:
- Can create static scenes through UI
- Interface maps directly to stage coordinates
- Changes immediately reflected in renderer
- Scenes can be saved and shared

### Phase 6: Integration & Polish
**Goal**: Complete working system ready for experimentation

**Deliverables**:
- [ ] Project setup (package.json, build system)
- [ ] Demo scenes showcasing capabilities
- [ ] Documentation for extending the system
- [ ] Basic examples for each layer

**Acceptance Criteria**:
- Clean project structure following repo patterns
- Multiple demo scenes work reliably
- Ready for future game/interaction experiments

## Current Status: Phase 1 COMPLETE ✅

### Phase 1: Core Simulator Foundation ✅
**Goal**: Implement the theater simulator engine with all 4 layers

**Deliverables**:
- [x] TypeScript interfaces for all 4 layers (from spec)
- [x] Animation queue system
- [x] State management for each layer
- [x] Basic simulator class with API methods

**Acceptance Criteria**:
- [x] Can programmatically control all 4 layers
- [x] Animation queues work for overlapping animations  
- [x] State can be saved/loaded
- [x] Clean separation from presentation layer

**Implementation Details**:
- **Project Structure**: Vite + TypeScript setup complete
- **Core Files**: `types.ts`, `animation.ts`, `theater.ts`, `main.ts`
- **API Interface**: Full Theater class implementing all 4 layer controls
- **Animation System**: Command queue architecture with easing support
- **Testing**: Basic test controls in HTML interface
- **Build System**: Clean TypeScript compilation and Vite build

### Next Steps
1. Review Phase 1 implementation with Robby ✅
2. Proceed to Phase 2: Canvas Rendering Pipeline

### Questions for Discussion
- Should we start with a specific layer or build all 4 simultaneously?
- Any modifications to the technical interfaces from the spec?
- Preferred build system (Vite like other projects)?

---
*Created: August 12, 2025*
*Status: Planning Phase 1*

# Silly Theatre

Physical Fantasy Console Theater - Web simulator of a four-layer theater console

## Overview

This is a browser-based simulator that replicates the behavior of a physical four-layer theater console. The simulator provides a foundation for creative tools, games, and collaborative storytelling experiences.

## Phase 1 Status: Core Simulator Foundation ✅

**Completed Features:**
- ✅ TypeScript interfaces for all 4 layers
- ✅ Animation queue system  
- ✅ State management for each layer
- ✅ Basic simulator class with API methods
- ✅ Clean separation from presentation layer

## Architecture

### 4-Layer Theater System

1. **Tile Canvas (Background)** - 64×32 grid of flip-tiles (black/white)
2. **LED Matrix (Atmospheric)** - 64×32 RGB LEDs with brightness control  
3. **Props Shelf (Mid-layer)** - 12 horizontal slots for sliding props
4. **Puppet Theater (Foreground)** - 6 marionettes on parallel tracks

### Technical Stack

- **TypeScript** - Type-safe development
- **Vite** - Fast build system and dev server
- **Canvas API** - For future rendering (Phase 2)
- **Pure client-side** - No backend required

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## API Usage

```typescript
import { Theater } from './src/theater.js';

// Create theater instance
const theater = new Theater();

// Control tiles
theater.tile.set(10, 15, 'white');
theater.tile.flip_sequence([{x: 20, y: 10}, {x: 21, y: 10}], 100);

// Control LEDs
theater.led.set(32, 16, {r: 255, g: 0, b: 0}, 80);
theater.led.fade_to(30, 15, {r: 0, g: 255, b: 0}, 500);

// Deploy props
theater.prop.deploy(5, 'tree', 15, 0);
theater.prop.rotate(5, 45, 300);

// Position puppets
theater.puppet.move(0, 25, 400);
theater.puppet.bob(0, 5, 200);

// Global controls
theater.clear_all();
```

## Testing

Open the dev server and use the test buttons to verify each layer works:

- **Test Tiles** - Creates checkerboard pattern and flip sequence
- **Test LEDs** - Shows rainbow gradient with fade animation
- **Test Props** - Deploys various props with rotation/tilt
- **Test Puppets** - Positions and animates puppets
- **Clear All** - Resets entire theater

## Current Status

**Phase 1: Core Simulator Foundation** ✅ COMPLETE

**Next: Phase 2 - Canvas Rendering Pipeline**

## Project Structure

```
src/
├── types.ts          # TypeScript interfaces and types
├── animation.ts      # Animation engine and queue system  
├── theater.ts        # Core simulator implementation
└── main.ts           # Entry point and test controls
```

## Documentation

- `/docs/sim-spec-draft.md` - Technical specification
- `/docs/initial-implementation-ipi.md` - Implementation plan

---

*Part of the context-games exploration in experimental theater simulation and AI-friendly creative tools.*

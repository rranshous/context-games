# Physical Fantasy Console Theater - Simulator Specification

*Technical specification for implementing a web-based simulator of the four-layer physical game stage*

## Overview

This document specifies the requirements for a browser-based simulator that replicates the behavior of a physical four-layer theater console. The simulator should provide enjoyable show which is dynamic and visually interesting.

## Physical Theater Dimensions

- **Stage Size**: 64 units wide × 32 units tall (logical coordinates)
- **Aspect Ratio**: 2:1 (width:height)
- **Rendering Scale**: Configurable (suggested: 8-16px per unit for web display)

## Layer System Architecture

### Layer 1: Tile Canvas (Background)
**Physical Representation**: Mechanical flip-tiles with binary states

**Simulator Requirements**:
- 64×32 grid of individually controllable tiles
- Each tile renders as colored square (8×8px minimum)
- Smooth flip animation between states
- Support for tile state batching (multiple tiles flip simultaneously)

**State Model**:
```typescript
interface TileState {
  x: number;           // 0-63
  y: number;           // 0-31
  state: 'black' | 'white';
  isFlipping: boolean;
  flipProgress: number; // 0-1 during animation
}

interface TileGrid {
  tiles: TileState[][];
  animationQueue: FlipCommand[];
}
```

**Visual Effects**:
- Flip animation: 3D rotation effect or fade transition
- Duration: 100-500ms per flip
- Easing: ease-out for mechanical feel

### Layer 2: LED Matrix (Atmospheric)
**Physical Representation**: Addressable RGB LEDs behind tile grid

**Simulator Requirements**:
- Same 64×32 coordinate system as tiles
- Full RGB color support with brightness control
- Smooth color transitions and fading
- Glow/blur effects to simulate LED bleeding

**State Model**:
```typescript
interface LEDState {
  x: number;           // 0-63
  y: number;           // 0-31
  color: {r: number, g: number, b: number}; // 0-255
  brightness: number;  // 0-100
  isFading: boolean;
  fadeProgress: number; // 0-1 during transition
}

interface LEDMatrix {
  leds: LEDState[][];
  animationQueue: FadeCommand[];
}
```

**Visual Effects**:
- Gaussian blur for LED glow effect
- Color blending between adjacent LEDs
- Brightness affects both color intensity and glow radius

### Layer 3: Props Shelf (Mid-layer)
**Physical Representation**: Sliding props on 12 fixed horizontal tracks

**Simulator Requirements**:
- 12 horizontal slots positioned evenly across stage width
- Props slide in/out from off-screen positions
- Support rotation and tilting animations
- Z-order: renders above tiles/LEDs, below puppets

**State Model**:
```typescript
interface PropState {
  slot: number;        // 0-11
  type: 'tree' | 'house' | 'rock' | 'castle' | 'bush' | 'sign';
  position: 'hidden' | 'visible';
  rotation: number;    // 0-360 degrees
  tilt: number;        // -30 to +30 degrees
  x: number;           // calculated from slot (read-only)
  y: number;           // fixed baseline position
  isAnimating: boolean;
}

interface PropsShelf {
  props: (PropState | null)[]; // 12 slots, null = empty
  animationQueue: PropCommand[];
}
```

**Visual Effects**:
- Slide animation: smooth horizontal movement (300-800ms)
- Rotation: 2D transform around prop center
- Tilt: perspective transform for depth effect
- Props cast subtle shadows on tile layer

### Layer 4: Puppet Theater (Foreground)
**Physical Representation**: Simple marionettes on parallel horizontal tracks

**Simulator Requirements**:
- 4-6 puppet slots with independent movement
- Horizontal sliding, vertical bobbing, rotation, tilting
- Simple sprite-based or SVG puppet representations
- Highest Z-order (renders in front of all other layers)

**State Model**:
```typescript
interface PuppetState {
  id: number;          // 0-5
  x: number;           // 0-100 (percentage across stage)
  y_offset: number;    // -10 to +10 (relative to baseline)
  rotation: number;    // 0-360 degrees
  tilt: number;        // -45 to +45 degrees
  isAnimating: boolean;
  animationQueue: PuppetCommand[];
}

interface PuppetTheater {
  puppets: PuppetState[];
  baseline_y: number;  // Fixed y-coordinate for puppet baseline
}
```

**Visual Effects**:
- Smooth easing for all movements (ease-out preferred)
- Puppets cast shadows on props/tiles
- Slight parallax effect during movement

## Animation System

### Command Queue Architecture
Each layer maintains its own animation queue to handle overlapping animations:

```typescript
interface AnimationCommand {
  id: string;
  startTime: number;
  duration: number;
  easing: 'linear' | 'ease-out' | 'ease-in-out';
  onComplete?: () => void;
}

interface FlipCommand extends AnimationCommand {
  tiles: {x: number, y: number}[];
  targetState: 'black' | 'white';
}

interface FadeCommand extends AnimationCommand {
  led: {x: number, y: number};
  targetColor: {r: number, g: number, b: number};
  targetBrightness: number;
}

interface PropCommand extends AnimationCommand {
  slot: number;
  property: 'position' | 'rotation' | 'tilt';
  targetValue: any;
}

interface PuppetCommand extends AnimationCommand {
  puppet_id: number;
  property: 'x' | 'y_offset' | 'rotation' | 'tilt';
  targetValue: number;
}
```

### Timing and Synchronization
- All animations use `requestAnimationFrame` for smooth 60fps updates
- Commands can be scheduled with specific start times for synchronization
- Queue processing supports overlapping animations on same objects

## API Specification

### Core Interface
```typescript
interface TheaterSimulator {
  // Tile Canvas Control
  tile: {
    set(x: number, y: number, state: 'black' | 'white'): void;
    flip_sequence(coords: {x: number, y: number}[], delay_ms: number): void;
    clear(): void;
    fill(state: 'black' | 'white'): void;
  };
  
  // LED Matrix Control  
  led: {
    set(x: number, y: number, color: {r: number, g: number, b: number}, brightness: number): void;
    fade_to(x: number, y: number, color: {r: number, g: number, b: number}, duration: number): void;
    clear(): void;
    flood(color: {r: number, g: number, b: number}, brightness: number): void;
  };
  
  // Props Shelf Control
  prop: {
    deploy(slot: number, type: PropType, rotation?: number, tilt?: number): void;
    move(slot: number, position: 'hidden' | 'visible', duration?: number): void;
    rotate(slot: number, degrees: number, duration?: number): void;
    tilt(slot: number, degrees: number, duration?: number): void;
    remove(slot: number): void;
  };
  
  // Puppet Theater Control
  puppet: {
    move(id: number, x: number, duration?: number): void;
    bob(id: number, y_offset: number, duration?: number): void;
    spin(id: number, degrees: number, duration?: number): void;
    tilt(id: number, degrees: number, duration?: number): void;
    reset(id: number): void; // Return to default position/orientation
  };
  
  // Global Controls
  clear_all(): void;
  pause_animations(): void;
  resume_animations(): void;
  get_state(): TheaterState;
  set_state(state: TheaterState): void;
}
```

### Event System
```typescript
interface TheaterEvents {
  on(event: 'animation_complete', callback: (commandId: string) => void): void;
  on(event: 'layer_changed', callback: (layer: string, change: any) => void): void;
  on(event: 'state_snapshot', callback: (state: TheaterState) => void): void;
}
```

## Rendering Pipeline

### Canvas-Based Implementation (Recommended)
1. **Background Layer**: Render tiles as filled rectangles
2. **Atmospheric Layer**: Render LEDs with glow effects (separate canvas with blur)
3. **Props Layer**: Render prop sprites with transforms
4. **Puppet Layer**: Render puppet sprites with transforms
5. **Composite**: Layer canvases with appropriate blending modes

### Performance Considerations
- Use dirty rectangle updating for tiles (only redraw changed regions)
- Implement object pooling for animation commands
- Consider WebGL for large numbers of LEDs with glow effects
- Optimize puppet/prop sprite atlasing

## Configuration Options

```typescript
interface SimulatorConfig {
  canvas_size: {width: number, height: number};
  tile_size: number;           // Pixels per tile
  enable_shadows: boolean;
  enable_glow_effects: boolean;
  animation_speed_multiplier: number;
  prop_sprites: {[key: string]: string}; // URLs or base64
  puppet_sprites: {[key: string]: string};
}
```


---

*This specification provides the technical foundation for implementing a faithful simulator of the Physical Fantasy Console Theater that can be used for development and testing of AI scene composition systems.*
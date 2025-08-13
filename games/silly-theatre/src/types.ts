/**
 * Core TypeScript interfaces for the Physical Fantasy Console Theater simulator
 * Based on the technical specification from sim-spec-draft.md
 */

// ===== LAYER 1: TILE CANVAS =====

export interface TileState {
  x: number;           // 0-63
  y: number;           // 0-31
  state: 'black' | 'white';
  isFlipping: boolean;
  flipProgress: number; // 0-1 during animation
}

export interface TileGrid {
  tiles: TileState[][];
  animationQueue: FlipCommand[];
}

// ===== LAYER 2: LED MATRIX =====

export interface RGBColor {
  r: number; // 0-255
  g: number; // 0-255
  b: number; // 0-255
}

export interface LEDState {
  x: number;           // 0-63
  y: number;           // 0-31
  color: RGBColor;
  brightness: number;  // 0-100
  isFading: boolean;
  fadeProgress: number; // 0-1 during transition
}

export interface LEDMatrix {
  leds: LEDState[][];
  animationQueue: FadeCommand[];
}

// ===== LAYER 3: PROPS SHELF =====

export type PropType = 'tree' | 'house' | 'rock' | 'castle' | 'bush' | 'sign';

export interface PropState {
  slot: number;        // 0-11
  type: PropType;
  position: 'hidden' | 'visible';
  rotation: number;    // 0-360 degrees
  tilt: number;        // -30 to +30 degrees
  x: number;           // calculated from slot (read-only)
  y: number;           // fixed baseline position
  isAnimating: boolean;
}

export interface PropsShelf {
  props: (PropState | null)[]; // 12 slots, null = empty
  animationQueue: PropCommand[];
}

// ===== LAYER 4: PUPPET THEATER =====

export interface PuppetState {
  id: number;          // 0-5
  x: number;           // 0-100 (percentage across stage)
  y_offset: number;    // -10 to +10 (relative to baseline)
  rotation: number;    // 0-360 degrees
  tilt: number;        // -45 to +45 degrees
  visible: boolean;    // Whether the puppet should be rendered
  isAnimating: boolean;
  animationQueue: PuppetCommand[];
}

export interface PuppetTheater {
  puppets: PuppetState[];
  baseline_y: number;  // Fixed y-coordinate for puppet baseline
}

// ===== ANIMATION SYSTEM =====

export type EasingType = 'linear' | 'ease-out' | 'ease-in-out';

export interface AnimationCommand {
  id: string;
  startTime: number;
  duration: number;
  easing: EasingType;
  onComplete?: () => void;
}

export interface FlipCommand extends AnimationCommand {
  tiles: {x: number, y: number}[];
  targetState: 'black' | 'white';
}

export interface FadeCommand extends AnimationCommand {
  led: {x: number, y: number};
  targetColor: RGBColor;
  targetBrightness: number;
}

export interface PropCommand extends AnimationCommand {
  slot: number;
  property: 'position' | 'rotation' | 'tilt';
  targetValue: any;
}

export interface PuppetCommand extends AnimationCommand {
  puppet_id: number;
  property: 'x' | 'y_offset' | 'rotation' | 'tilt';
  targetValue: number;
}

// ===== COMPLETE THEATER STATE =====

export interface TheaterState {
  tiles: TileGrid;
  leds: LEDMatrix;
  props: PropsShelf;
  puppets: PuppetTheater;
  timestamp: number;
}

// ===== CONFIGURATION =====

export interface SimulatorConfig {
  canvas_size: {width: number, height: number};
  tile_size: number;           // Pixels per tile
  enable_shadows: boolean;
  enable_glow_effects: boolean;
  animation_speed_multiplier: number;
  prop_sprites: {[key: string]: string}; // URLs or base64
  puppet_sprites: {[key: string]: string};
}

// ===== EVENT SYSTEM =====

export type TheaterEventType = 'animation_complete' | 'layer_changed' | 'state_snapshot';

export interface TheaterEvents {
  on(event: 'animation_complete', callback: (commandId: string) => void): void;
  on(event: 'layer_changed', callback: (layer: string, change: any) => void): void;
  on(event: 'state_snapshot', callback: (state: TheaterState) => void): void;
}

// ===== API INTERFACE =====

export interface TheaterSimulator {
  // Tile Canvas Control
  tile: {
    set(x: number, y: number, state: 'black' | 'white'): void;
    flip_sequence(coords: {x: number, y: number}[], delay_ms: number): void;
    clear(): void;
    fill(state: 'black' | 'white'): void;
  };
  
  // LED Matrix Control  
  led: {
    set(x: number, y: number, color: RGBColor, brightness: number): void;
    fade_to(x: number, y: number, color: RGBColor, duration: number): void;
    clear(): void;
    flood(color: RGBColor, brightness: number): void;
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

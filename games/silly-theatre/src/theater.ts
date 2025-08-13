/**
 * Core theater simulator implementation
 * Manages all 4 layers and provides the main API interface
 */

import type {
  TheaterSimulator,
  TheaterState,
  TileState,
  LEDState,
  PropState,
  PuppetState,
  RGBColor,
  PropType,
  FlipCommand,
  FadeCommand,
  PropCommand,
  PuppetCommand,
  SimulatorConfig
} from './types.js';

import { AnimationEngine, AnimationQueue } from './animation.js';

/**
 * Physical Fantasy Console Theater Simulator
 */
export class Theater implements TheaterSimulator {
  private state: TheaterState;
  private animationEngine: AnimationEngine;
  private flipQueue: AnimationQueue<FlipCommand>;
  private fadeQueue: AnimationQueue<FadeCommand>;
  private propQueue: AnimationQueue<PropCommand>;
  private puppetQueue: AnimationQueue<PuppetCommand>;

  constructor(_config: Partial<SimulatorConfig> = {}) {
    // Config available for future customization
    this.animationEngine = new AnimationEngine();
    
    // Initialize animation queues
    this.flipQueue = new AnimationQueue<FlipCommand>(this.animationEngine);
    this.fadeQueue = new AnimationQueue<FadeCommand>(this.animationEngine);
    this.propQueue = new AnimationQueue<PropCommand>(this.animationEngine);
    this.puppetQueue = new AnimationQueue<PuppetCommand>(this.animationEngine);

    // Initialize state
    this.state = this.createInitialState();

    // Start animation processing
    this.startAnimationLoop();
  }

  /**
   * Create initial theater state with all layers initialized
   */
  private createInitialState(): TheaterState {
    // Initialize tile grid (64x32)
    const tiles: TileState[][] = [];
    for (let y = 0; y < 32; y++) {
      tiles[y] = [];
      for (let x = 0; x < 64; x++) {
        tiles[y][x] = {
          x,
          y,
          state: 'black',
          isFlipping: false,
          flipProgress: 0
        };
      }
    }

    // Initialize LED matrix (64x32)
    const leds: LEDState[][] = [];
    for (let y = 0; y < 32; y++) {
      leds[y] = [];
      for (let x = 0; x < 64; x++) {
        leds[y][x] = {
          x,
          y,
          color: { r: 0, g: 0, b: 0 },
          brightness: 0,
          isFading: false,
          fadeProgress: 0
        };
      }
    }

    // Initialize props shelf (12 slots)
    const props: (PropState | null)[] = new Array(12).fill(null);

    // Initialize puppets (6 maximum)
    const puppets: PuppetState[] = [];
    for (let i = 0; i < 6; i++) {
      puppets.push({
        id: i,
        x: 50, // Center stage
        y_offset: 0,
        rotation: 0,
        tilt: 0,
        isAnimating: false,
        animationQueue: []
      });
    }

    return {
      tiles: {
        tiles,
        animationQueue: []
      },
      leds: {
        leds,
        animationQueue: []
      },
      props: {
        props,
        animationQueue: []
      },
      puppets: {
        puppets,
        baseline_y: 24 // Near bottom of 32-unit stage
      },
      timestamp: Date.now()
    };
  }

  /**
   * Start the animation processing loop
   */
  private startAnimationLoop(): void {
    const processAnimations = () => {
      const currentTime = performance.now();
      
      // Process all animation queues
      this.flipQueue.update(currentTime);
      this.fadeQueue.update(currentTime);
      this.propQueue.update(currentTime);
      this.puppetQueue.update(currentTime);

      // Continue loop
      requestAnimationFrame(processAnimations);
    };

    requestAnimationFrame(processAnimations);
  }

  // ===== TILE CANVAS API =====

  tile = {
    set: (x: number, y: number, state: 'black' | 'white'): void => {
      if (x < 0 || x >= 64 || y < 0 || y >= 32) return;
      this.state.tiles.tiles[y][x].state = state;
    },

    flip_sequence: (coords: {x: number, y: number}[], delay_ms: number): void => {
      coords.forEach((coord, index) => {
        const command: FlipCommand = {
          id: this.animationEngine.generateId(),
          startTime: performance.now() + (index * delay_ms),
          duration: 300,
          easing: 'ease-out',
          tiles: [coord],
          targetState: this.state.tiles.tiles[coord.y]?.[coord.x]?.state === 'black' ? 'white' : 'black'
        };
        this.flipQueue.add(command);
      });
    },

    clear: (): void => {
      for (let y = 0; y < 32; y++) {
        for (let x = 0; x < 64; x++) {
          this.state.tiles.tiles[y][x].state = 'black';
        }
      }
    },

    fill: (state: 'black' | 'white'): void => {
      for (let y = 0; y < 32; y++) {
        for (let x = 0; x < 64; x++) {
          this.state.tiles.tiles[y][x].state = state;
        }
      }
    }
  };

  // ===== LED MATRIX API =====

  led = {
    set: (x: number, y: number, color: RGBColor, brightness: number): void => {
      if (x < 0 || x >= 64 || y < 0 || y >= 32) return;
      const led = this.state.leds.leds[y][x];
      led.color = { ...color };
      led.brightness = Math.max(0, Math.min(100, brightness));
    },

    fade_to: (x: number, y: number, color: RGBColor, duration: number): void => {
      if (x < 0 || x >= 64 || y < 0 || y >= 32) return;
      
      const command: FadeCommand = {
        id: this.animationEngine.generateId(),
        startTime: performance.now(),
        duration,
        easing: 'ease-out',
        led: { x, y },
        targetColor: { ...color },
        targetBrightness: 80
      };
      this.fadeQueue.add(command);
    },

    clear: (): void => {
      for (let y = 0; y < 32; y++) {
        for (let x = 0; x < 64; x++) {
          const led = this.state.leds.leds[y][x];
          led.color = { r: 0, g: 0, b: 0 };
          led.brightness = 0;
        }
      }
    },

    flood: (color: RGBColor, brightness: number): void => {
      const clampedBrightness = Math.max(0, Math.min(100, brightness));
      for (let y = 0; y < 32; y++) {
        for (let x = 0; x < 64; x++) {
          const led = this.state.leds.leds[y][x];
          led.color = { ...color };
          led.brightness = clampedBrightness;
        }
      }
    }
  };

  // ===== PROPS SHELF API =====

  prop = {
    deploy: (slot: number, type: PropType, rotation: number = 0, tilt: number = 0): void => {
      if (slot < 0 || slot >= 12) return;
      
      const x = (slot * 64) / 12 + 32/12; // Evenly distribute across stage width
      const y = 20; // Fixed baseline
      
      this.state.props.props[slot] = {
        slot,
        type,
        position: 'visible',
        rotation: rotation % 360,
        tilt: Math.max(-30, Math.min(30, tilt)),
        x,
        y,
        isAnimating: false
      };
    },

    move: (slot: number, position: 'hidden' | 'visible', duration: number = 500): void => {
      if (slot < 0 || slot >= 12 || !this.state.props.props[slot]) return;
      
      const command: PropCommand = {
        id: this.animationEngine.generateId(),
        startTime: performance.now(),
        duration,
        easing: 'ease-out',
        slot,
        property: 'position',
        targetValue: position
      };
      this.propQueue.add(command);
    },

    rotate: (slot: number, degrees: number, duration: number = 300): void => {
      if (slot < 0 || slot >= 12 || !this.state.props.props[slot]) return;
      
      const command: PropCommand = {
        id: this.animationEngine.generateId(),
        startTime: performance.now(),
        duration,
        easing: 'ease-out',
        slot,
        property: 'rotation',
        targetValue: degrees % 360
      };
      this.propQueue.add(command);
    },

    tilt: (slot: number, degrees: number, duration: number = 300): void => {
      if (slot < 0 || slot >= 12 || !this.state.props.props[slot]) return;
      
      const clampedTilt = Math.max(-30, Math.min(30, degrees));
      const command: PropCommand = {
        id: this.animationEngine.generateId(),
        startTime: performance.now(),
        duration,
        easing: 'ease-out',
        slot,
        property: 'tilt',
        targetValue: clampedTilt
      };
      this.propQueue.add(command);
    },

    remove: (slot: number): void => {
      if (slot < 0 || slot >= 12) return;
      this.state.props.props[slot] = null;
    }
  };

  // ===== PUPPET THEATER API =====

  puppet = {
    move: (id: number, x: number, duration: number = 400): void => {
      if (id < 0 || id >= 6) return;
      
      const clampedX = Math.max(0, Math.min(100, x));
      const command: PuppetCommand = {
        id: this.animationEngine.generateId(),
        startTime: performance.now(),
        duration,
        easing: 'ease-out',
        puppet_id: id,
        property: 'x',
        targetValue: clampedX
      };
      this.puppetQueue.add(command);
    },

    bob: (id: number, y_offset: number, duration: number = 200): void => {
      if (id < 0 || id >= 6) return;
      
      const clampedOffset = Math.max(-10, Math.min(10, y_offset));
      const command: PuppetCommand = {
        id: this.animationEngine.generateId(),
        startTime: performance.now(),
        duration,
        easing: 'ease-out',
        puppet_id: id,
        property: 'y_offset',
        targetValue: clampedOffset
      };
      this.puppetQueue.add(command);
    },

    spin: (id: number, degrees: number, duration: number = 500): void => {
      if (id < 0 || id >= 6) return;
      
      const command: PuppetCommand = {
        id: this.animationEngine.generateId(),
        startTime: performance.now(),
        duration,
        easing: 'ease-out',
        puppet_id: id,
        property: 'rotation',
        targetValue: degrees % 360
      };
      this.puppetQueue.add(command);
    },

    tilt: (id: number, degrees: number, duration: number = 300): void => {
      if (id < 0 || id >= 6) return;
      
      const clampedTilt = Math.max(-45, Math.min(45, degrees));
      const command: PuppetCommand = {
        id: this.animationEngine.generateId(),
        startTime: performance.now(),
        duration,
        easing: 'ease-out',
        puppet_id: id,
        property: 'tilt',
        targetValue: clampedTilt
      };
      this.puppetQueue.add(command);
    },

    reset: (id: number): void => {
      if (id < 0 || id >= 6) return;
      const puppet = this.state.puppets.puppets[id];
      puppet.x = 50;
      puppet.y_offset = 0;
      puppet.rotation = 0;
      puppet.tilt = 0;
    }
  };

  // ===== GLOBAL CONTROLS =====

  clear_all(): void {
    this.tile.clear();
    this.led.clear();
    for (let i = 0; i < 12; i++) {
      this.prop.remove(i);
    }
    for (let i = 0; i < 6; i++) {
      this.puppet.reset(i);
    }
  }

  pause_animations(): void {
    this.animationEngine.pause();
  }

  resume_animations(): void {
    this.animationEngine.resume();
  }

  get_state(): TheaterState {
    return JSON.parse(JSON.stringify(this.state)); // Deep clone
  }

  set_state(state: TheaterState): void {
    this.state = JSON.parse(JSON.stringify(state)); // Deep clone
  }
}

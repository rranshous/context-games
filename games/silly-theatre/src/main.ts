/**
 * Main entry point for Silly Theatre
 * Sets up the theater simulator and basic testing interface
 */

import { Theater } from './theater.js';
import { TheaterRenderer } from './renderer.js';
import type { TheaterState } from './types.js';

/**
 * Format theater state for human-readable display
 */
function formatStateForDisplay(state: TheaterState): string {
  const output: string[] = [];
  
  output.push('=== THEATER STATE DEBUG ===\n');
  output.push(`Timestamp: ${new Date(state.timestamp).toLocaleTimeString()}\n`);
  
  // Tile layer summary
  output.push('\n🔲 TILE LAYER:');
  let whiteCount = 0;
  let blackCount = 0;
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 64; x++) {
      if (state.tiles.tiles[y][x].state === 'white') {
        whiteCount++;
      } else {
        blackCount++;
      }
    }
  }
  output.push(`  White tiles: ${whiteCount}`);
  output.push(`  Black tiles: ${blackCount}`);
  output.push(`  Animation queue: ${state.tiles.animationQueue.length} commands`);
  
  // LED layer summary
  output.push('\n💡 LED LAYER:');
  let activeCount = 0;
  let maxBrightness = 0;
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 64; x++) {
      const led = state.leds.leds[y][x];
      if (led.brightness > 0) {
        activeCount++;
        maxBrightness = Math.max(maxBrightness, led.brightness);
      }
    }
  }
  output.push(`  Active LEDs: ${activeCount}`);
  output.push(`  Max brightness: ${maxBrightness}`);
  output.push(`  Animation queue: ${state.leds.animationQueue.length} commands`);
  
  // Props layer summary
  output.push('\n🌳 PROPS LAYER:');
  let deployedCount = 0;
  const propTypes: Record<string, number> = {};
  state.props.props.forEach((prop, slot) => {
    if (prop) {
      deployedCount++;
      propTypes[prop.type] = (propTypes[prop.type] || 0) + 1;
      output.push(`  Slot ${slot}: ${prop.type} (${prop.position}, rot:${prop.rotation}°, tilt:${prop.tilt}°)`);
    }
  });
  output.push(`  Deployed props: ${deployedCount}/12`);
  output.push(`  Animation queue: ${state.props.animationQueue.length} commands`);
  
  // Puppet layer summary
  output.push('\n🎭 PUPPET LAYER:');
  output.push(`  Baseline Y: ${state.puppets.baseline_y}`);
  state.puppets.puppets.forEach((puppet, index) => {
    if (puppet.x !== 50 || puppet.y_offset !== 0 || puppet.rotation !== 0 || puppet.tilt !== 0) {
      output.push(`  Puppet ${index}: x=${puppet.x}%, y_offset=${puppet.y_offset}, rot=${puppet.rotation}°, tilt=${puppet.tilt}°`);
    }
  });
  
  // Show a small sample of the tile grid
  output.push('\n🔲 TILE GRID SAMPLE (top-left 16×8):');
  for (let y = 0; y < 8; y++) {
    let row = '  ';
    for (let x = 0; x < 16; x++) {
      row += state.tiles.tiles[y][x].state === 'white' ? '█' : '░';
    }
    output.push(row);
  }
  
  return output.join('\n');
}

/**
 * Initialize the theater and set up basic test controls
 */
function init(): void {
  console.log('🎭 Initializing Silly Theatre...');

  // Create theater instance
  const theater = new Theater({
    canvas_size: { width: 1024, height: 512 },
    tile_size: 16
  });

  // Create renderer and connect to theater container
  const theaterContainer = document.getElementById('theater-container');
  if (!theaterContainer) {
    throw new Error('Theater container not found');
  }
  
  const renderer = new TheaterRenderer(theaterContainer, {
    pixelsPerUnit: 12, // Scale factor for visibility
    enableGlow: true,
    enableShadows: true
  });

  console.log('✅ Theater simulator created');
  console.log('✅ Theater renderer created');
  console.log('State:', theater.get_state());

  // Render initial state
  renderer.render(theater.get_state());

  // Set up test controls
  setupControls(theater, renderer);
}

/**
 * Set up basic test controls for the theater
 */
function setupControls(theater: Theater, renderer: TheaterRenderer): void {
  const testTilesBtn = document.getElementById('test-tiles');
  const testLedsBtn = document.getElementById('test-leds');
  const testPropsBtn = document.getElementById('test-props');
  const testPuppetsBtn = document.getElementById('test-puppets');
  const clearAllBtn = document.getElementById('clear-all');
  const showStateBtn = document.getElementById('show-state');
  const closeDebugBtn = document.getElementById('close-debug');
  const refreshDebugBtn = document.getElementById('refresh-debug');
  const debugPanel = document.getElementById('debug-panel');
  const stateDisplay = document.getElementById('state-display');

  // Function to refresh the debug display and renderer
  const refreshDebugDisplay = () => {
    const state = theater.get_state();
    
    // Always update the renderer
    renderer.render(state);
    
    // Update debug panel if visible
    if (debugPanel && stateDisplay && debugPanel.style.display !== 'none') {
      stateDisplay.textContent = formatStateForDisplay(state);
    }
  };

  if (testTilesBtn) {
    testTilesBtn.addEventListener('click', () => {
      console.log('🔲 Testing tiles...');
      
      // Create a simple pattern
      theater.tile.fill('black');
      
      // Create a checkerboard pattern in center
      for (let y = 10; y < 22; y++) {
        for (let x = 20; x < 44; x++) {
          if ((x + y) % 2 === 0) {
            theater.tile.set(x, y, 'white');
          }
        }
      }

      // Test flip sequence
      const coords = [];
      for (let i = 0; i < 10; i++) {
        coords.push({ x: 30 + i, y: 15 });
      }
      theater.tile.flip_sequence(coords, 100);
      
      console.log('Tiles pattern created');
      refreshDebugDisplay(); // Auto-refresh debug panel
    });
  }

  if (testLedsBtn) {
    testLedsBtn.addEventListener('click', () => {
      console.log('💡 Testing LEDs...');
      
      // Clear LEDs first
      theater.led.clear();
      
      // Create rainbow gradient
      for (let x = 0; x < 64; x++) {
        for (let y = 0; y < 32; y++) {
          const hue = (x / 64) * 360;
          const rgb = hslToRgb(hue, 100, 50);
          theater.led.set(x, y, rgb, 60);
        }
      }

      // Test fade animation
      theater.led.fade_to(32, 16, { r: 255, g: 255, b: 255 }, 1000);
      
      console.log('LED gradient created');
      refreshDebugDisplay(); // Auto-refresh debug panel
    });
  }

  if (testPropsBtn) {
    testPropsBtn.addEventListener('click', () => {
      console.log('🌳 Testing props...');
      
      // Deploy various props
      theater.prop.deploy(1, 'tree', 0, 0);
      theater.prop.deploy(3, 'house', 15, 0);
      theater.prop.deploy(5, 'castle', -10, 5);
      theater.prop.deploy(7, 'bush', 0, 0);
      theater.prop.deploy(9, 'rock', 0, -10);
      theater.prop.deploy(11, 'sign', 20, 0);

      // Test some animations
      setTimeout(() => {
        theater.prop.rotate(3, 45, 500);
        theater.prop.tilt(5, 15, 300);
        refreshDebugDisplay(); // Refresh after animations start
      }, 500);
      
      console.log('Props deployed');
      refreshDebugDisplay(); // Auto-refresh debug panel
    });
  }

  if (testPuppetsBtn) {
    testPuppetsBtn.addEventListener('click', () => {
      console.log('🎭 Testing puppets...');
      
      // Position puppets across stage
      theater.puppet.move(0, 20, 300);
      theater.puppet.move(1, 40, 400);
      theater.puppet.move(2, 60, 500);
      theater.puppet.move(3, 80, 600);

      // Test puppet animations
      setTimeout(() => {
        theater.puppet.bob(0, 5, 200);
        theater.puppet.spin(1, 180, 400);
        theater.puppet.tilt(2, 20, 300);
        theater.puppet.bob(3, -3, 250);
        refreshDebugDisplay(); // Refresh after animations start
      }, 1000);
      
      console.log('Puppets positioned and animated');
      refreshDebugDisplay(); // Auto-refresh debug panel
    });
  }

  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', () => {
      console.log('🧹 Clearing all...');
      theater.clear_all();
      console.log('Theater cleared');
      refreshDebugDisplay(); // Auto-refresh debug panel
    });
  }

  // Debug panel controls
  if (showStateBtn && debugPanel && stateDisplay) {
    showStateBtn.addEventListener('click', () => {
      console.log('🐛 Showing state debug panel...');
      const state = theater.get_state();
      stateDisplay.textContent = formatStateForDisplay(state);
      debugPanel.style.display = 'block';
    });
  }

  if (closeDebugBtn && debugPanel) {
    closeDebugBtn.addEventListener('click', () => {
      debugPanel.style.display = 'none';
    });
  }

  if (refreshDebugBtn) {
    refreshDebugBtn.addEventListener('click', () => {
      console.log('🔄 Manually refreshing debug panel...');
      refreshDebugDisplay();
    });
  }

  console.log('✅ Controls set up');
}

/**
 * Convert HSL to RGB for color generation
 */
function hslToRgb(h: number, s: number, l: number): { r: number, g: number, b: number } {
  h = h / 360;
  s = s / 100;
  l = l / 100;

  const hue2rgb = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };

  let r, g, b;

  if (s === 0) {
    r = g = b = l; // achromatic
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  };
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

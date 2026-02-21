import type { SimCommand } from '../interface/commands.js';
import type { SimEvent } from '../interface/events.js';
import { Controls } from './controls.js';
import { Renderer } from './renderer.js';

// ── Main entry point ─────────────────────────────────────

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const controlsEl = document.getElementById('controls') as HTMLElement;

const renderer = new Renderer(canvas);

// Create worker
const worker = new Worker('worker.js', { type: 'module' });

function send(cmd: SimCommand): void {
  worker.postMessage(cmd);
}

const controls = new Controls(controlsEl, send);

// Handle events from sim worker
worker.onmessage = (e: MessageEvent<SimEvent>) => {
  const event = e.data;

  switch (event.type) {
    case 'state':
      renderer.updateState(event.state);
      break;

    case 'stats':
      renderer.updateStats(event.stats);
      break;

    case 'creature:died':
      // Could add death animations later
      break;

    case 'creature:spawned':
      // Could add birth animations later
      break;

    case 'creature:woke':
      console.log(`[CONSCIOUSNESS] Creature #${event.id} (${event.reason}): ${event.thoughts}`);
      if (event.toolsUsed.length > 0) {
        console.log(`[CONSCIOUSNESS] Tools:`, event.toolsUsed);
      }
      controls.showLog(`[BRAIN] #${event.id}: ${event.thoughts.slice(0, 60)}`);
      break;

    case 'log':
      controls.showLog(event.message);
      console.log(`[SIM] ${event.message}`);
      break;
  }
};

worker.onerror = (e) => {
  console.error('Worker error:', e);
  controls.showLog(`Error: ${e.message}`);
};

// Start the simulation
send({ type: 'start' });

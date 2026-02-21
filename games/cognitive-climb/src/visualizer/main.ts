import type { SimCommand } from '../interface/commands.js';
import type { SimEvent } from '../interface/events.js';
import type { CreatureState } from '../interface/state.js';
import { Controls } from './controls.js';
import { CreatureHistoryStore } from './history.js';
import { Inspector } from './inspector.js';
import { Renderer } from './renderer.js';

// ── Main entry point ─────────────────────────────────────

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const controlsEl = document.getElementById('controls') as HTMLElement;
const inspectorEl = document.getElementById('inspector') as HTMLElement;

const renderer = new Renderer(canvas);
const history = new CreatureHistoryStore();
const inspector = new Inspector(inspectorEl);

// Create worker
const worker = new Worker('worker.js', { type: 'module' });

function send(cmd: SimCommand): void {
  worker.postMessage(cmd);
}

const controls = new Controls(controlsEl, send);

// ── Selection state ──────────────────────────────────────

let selectedId: number | null = null;
let lastCreatures: CreatureState[] = [];

function selectCreature(id: number | null): void {
  selectedId = id;
  renderer.selectedCreatureId = id;
  updateInspector();
}

function updateInspector(): void {
  if (selectedId == null) {
    inspector.hide();
    triggerResize();
    return;
  }

  const creature = lastCreatures.find(c => c.id === selectedId) ?? null;
  const timeline = history.getTimeline(selectedId);
  const dead = history.isDead(selectedId);

  // If creature isn't alive and has no history, deselect
  if (!creature && !dead) {
    selectedId = null;
    renderer.selectedCreatureId = null;
    inspector.hide();
    triggerResize();
    return;
  }

  inspector.update(creature, timeline, dead);
  triggerResize();
}

function triggerResize(): void {
  // Force canvas to recalculate size after inspector show/hide
  requestAnimationFrame(() => {
    window.dispatchEvent(new Event('resize'));
  });
}

// Wire renderer selection → inspector
renderer.onSelectCreature = (id) => {
  selectCreature(id);
};

// Wire inspector navigation → renderer
inspector.setOnNavigate((id) => {
  if (id < 0) {
    // Deselect
    selectCreature(null);
  } else {
    selectCreature(id);
    renderer.selectedCreatureId = id;
  }
});

// ── Handle events from sim worker ────────────────────────

worker.onmessage = (e: MessageEvent<SimEvent>) => {
  const event = e.data;

  // Feed all events to history store
  history.handleEvent(event);

  switch (event.type) {
    case 'state':
      renderer.updateState(event.state);
      lastCreatures = event.state.creatures;
      // Refresh inspector with latest state
      if (selectedId != null) updateInspector();
      break;

    case 'stats':
      renderer.updateStats(event.stats);
      break;

    case 'creature:died':
      // If selected creature died, refresh to show death state
      if (event.id === selectedId) updateInspector();
      break;

    case 'creature:spawned':
      break;

    case 'creature:woke':
      console.log(`[CONSCIOUSNESS] Creature #${event.id} (${event.reason}): ${event.thoughts}`);
      if (event.toolsUsed.length > 0) {
        console.log(`[CONSCIOUSNESS] Tools:`, event.toolsUsed);
      }
      controls.showLog(`[BRAIN] #${event.id}: ${event.thoughts.slice(0, 60)}`);
      // Refresh inspector if this creature is selected
      if (event.id === selectedId) updateInspector();
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

// ── Debug API ────────────────────────────────────────────

(window as any).__debug = {
  get creatures() { return lastCreatures; },
  get history() { return history; },
  select: selectCreature,
  renderer,
};

// Start the simulation
send({ type: 'start' });

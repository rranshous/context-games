import type { SimCommand } from '../interface/commands.js';
import type { SimEvent } from '../interface/events.js';
import type { CellState, CreatureState, SimStats } from '../interface/state.js';
import { Controls } from './controls.js';
import { CreatureHistoryStore } from './history.js';
import { Inspector } from './inspector.js';
import { ObserverPanel, buildObserverContext, callObserverAPI } from './observer.js';
import { Renderer } from './renderer.js';

// ── Main entry point ─────────────────────────────────────

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const controlsEl = document.getElementById('controls') as HTMLElement;
const inspectorEl = document.getElementById('inspector') as HTMLElement;
const observerEl = document.getElementById('observer') as HTMLElement;

const renderer = new Renderer(canvas);
const history = new CreatureHistoryStore();
const inspector = new Inspector(inspectorEl);
const observerPanel = new ObserverPanel(observerEl);

// Create worker
const worker = new Worker('worker.js', { type: 'module' });

function send(cmd: SimCommand): void {
  worker.postMessage(cmd);
}

const controls = new Controls(controlsEl, send);

// ── Observer toggle button ──────────────────────────────
// Appended AFTER Controls constructor (which clears innerHTML)

const observerBtn = document.createElement('button');
observerBtn.textContent = 'Observer: OFF';
observerBtn.style.cssText = `
  padding: 4px 12px; cursor: pointer;
  background: #2a2a4e; color: #ddd; border: 1px solid #444;
  border-radius: 4px; font-family: monospace; font-size: 13px;
`;
observerBtn.onclick = () => {
  observerPanel.toggle();
  observerEnabled = observerPanel.isVisible;
  observerBtn.textContent = observerEnabled ? 'Observer: ON' : 'Observer: OFF';
  triggerResize();
};
// Insert before the log span (last child)
const logSpan = controlsEl.querySelector('#sim-log');
if (logSpan) {
  controlsEl.insertBefore(observerBtn, logSpan);
} else {
  controlsEl.appendChild(observerBtn);
}

// ── Selection state ──────────────────────────────────────

let selectedId: number | null = null;
let lastCreatures: CreatureState[] = [];
let lastCells: CellState[] = [];
let lastStats: SimStats | null = null;

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
  // Force canvas to recalculate size after inspector/observer show/hide
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

// Wire observer creature links → inspector
observerPanel.setOnSelectCreature((id) => {
  selectCreature(id);
});

// ── Observer state ──────────────────────────────────────

let observerEnabled = false;
let simPaused = false;
let lastObserverCallMs = 0;
let observerInFlight = false;
let lastMaxGeneration = 0;
const observerEventBuffer: string[] = [];
const recentlyEditedIds: number[] = [];
const MAX_EVENT_BUFFER = 50;
const MIN_INTERVAL_MS = 30_000;
const PERIODIC_INTERVAL_MS = 60_000;

function pushObserverEvent(msg: string): void {
  observerEventBuffer.push(msg);
  if (observerEventBuffer.length > MAX_EVENT_BUFFER) {
    observerEventBuffer.shift();
  }
}

function maybeFireObserver(currentTick: number): void {
  if (!observerEnabled || !observerPanel.isVisible) return;
  if (simPaused) return;
  if (observerInFlight) return;
  const now = Date.now();
  if (now - lastObserverCallMs < MIN_INTERVAL_MS) return;

  // Fire if: notable events exist, OR periodic interval elapsed
  const hasNotable = observerEventBuffer.length > 0;
  const periodic = now - lastObserverCallMs >= PERIODIC_INTERVAL_MS;
  if (!hasNotable && !periodic) return;

  lastObserverCallMs = now;
  fireObserver(currentTick);
}

async function fireObserver(currentTick: number): Promise<void> {
  if (lastCreatures.length === 0 && !lastStats) return;

  observerInFlight = true;
  observerPanel.setThinking(true);

  const context = buildObserverContext(
    lastCreatures,
    lastCells,
    lastStats ?? { tick: currentTick, creatureCount: 0, totalBirths: 0, totalDeaths: 0, avgEnergy: 0, maxGeneration: 0, avgTraits: null, deathsByStarvation: 0, deathsByHazard: 0 },
    observerEventBuffer,
    recentlyEditedIds,
    observerPanel.getLastHeadline(),
  );

  console.log('[OBSERVER] Firing at tick', currentTick, '— context length:', context.length);

  const report = await callObserverAPI(context);

  observerInFlight = false;
  observerPanel.setThinking(false);

  if (report) {
    console.log('[OBSERVER] Report:', report.headline, '—', report.mood);
    observerPanel.addReport(currentTick, report);
  }

  // Clear buffers after report
  observerEventBuffer.length = 0;
  recentlyEditedIds.length = 0;
}

// ── Handle events from sim worker ────────────────────────

worker.onmessage = (e: MessageEvent<SimEvent>) => {
  const event = e.data;

  // Feed all events to history store
  history.handleEvent(event);

  switch (event.type) {
    case 'state':
      renderer.updateState(event.state);
      lastCreatures = event.state.creatures;
      lastCells = event.state.cells;
      // Refresh inspector with latest state
      if (selectedId != null) updateInspector();
      break;

    case 'stats':
      renderer.updateStats(event.stats);
      lastStats = event.stats;
      // Track new generation records
      if (event.stats.maxGeneration > lastMaxGeneration) {
        pushObserverEvent(`Tick ${event.stats.tick}: New generation record: Gen ${event.stats.maxGeneration}!`);
        lastMaxGeneration = event.stats.maxGeneration;
      }
      // Check observer trigger on stats events (frequent, good cadence)
      maybeFireObserver(event.stats.tick);
      break;

    case 'creature:died':
      // If selected creature died, refresh to show death state
      if (event.id === selectedId) updateInspector();
      // Notable: old creature deaths
      if (event.tick > 0) {
        // Find creature in history to check age
        const deathInfo = history.getTimeline(event.id);
        if (deathInfo && deathInfo.length > 0) {
          // Approximate — check if first event was born long ago
          const bornEntry = deathInfo.find(e => e.type === 'born');
          if (bornEntry && event.tick - bornEntry.tick > 200) {
            pushObserverEvent(`Tick ${event.tick}: #${event.id} died (long-lived creature)`);
          }
        }
      }
      break;

    case 'creature:spawned':
      break;

    case 'creature:reproduced':
      pushObserverEvent(`Tick ${event.tick}: #${event.parentId} reproduced → offspring #${event.childId}`);
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

    case 'log': {
      controls.showLog(event.message);
      console.log(`[SIM] ${event.message}`);

      // Track pause state
      if (event.message === 'Paused') simPaused = true;
      else if (event.message === 'Resumed') simPaused = false;

      // Observer: track embodiment edits
      const editMatch = event.message.match(/\[EMBODIMENT\] #(\d+) edited (on_tick|sensors|identity|memory|tools)/);
      if (editMatch) {
        const creatureId = parseInt(editMatch[1], 10);
        const tick = lastStats?.tick ?? '?';
        pushObserverEvent(`Tick ${tick}: #${creatureId} edited ${editMatch[2]}`);
        if (editMatch[2] === 'on_tick' && !recentlyEditedIds.includes(creatureId)) {
          recentlyEditedIds.push(creatureId);
          if (recentlyEditedIds.length > 10) recentlyEditedIds.shift();
        }
      }

      // Observer: population critical
      if (event.message.includes('Population critical')) {
        const tick = lastStats?.tick ?? '?';
        pushObserverEvent(`Tick ${tick}: Population crashed to critical — spawned reinforcements`);
      }
      break;
    }
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
  observer: observerPanel,
  dumpEmbodiment(id: number) {
    const c = lastCreatures.find(c => c.id === id);
    if (!c) { console.log('Creature not found'); return; }
    console.log(`\n=== Embodiment for Creature #${id} ===`);
    console.log(`<identity>\n${c.embodiment.identity}\n</identity>`);
    console.log(`<sensors>\n${c.embodiment.sensors}\n</sensors>`);
    console.log(`<on_tick>\n${c.embodiment.on_tick}\n</on_tick>`);
    console.log(`<memory>\n${c.embodiment.memory}\n</memory>`);
    console.log(`<tools>\n${c.embodiment.tools}\n</tools>`);
  },
};

// Start the simulation
send({ type: 'start' });

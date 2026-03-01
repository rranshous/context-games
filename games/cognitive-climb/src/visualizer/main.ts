import type { SimCommand } from '../interface/commands.js';
import type { SimEvent } from '../interface/events.js';
import type { CellState, CreatureState, SimStats } from '../interface/state.js';
import { Controls } from './controls.js';
import { CreatureHistoryStore } from './history.js';
import { Inspector } from './inspector.js';
import { ObserverPanel, buildObserverContext, callObserverAPI } from './observer.js';
import { Renderer } from './renderer.js';
import { StatsHistoryStore } from './stats-history.js';
import { SummaryModal } from './summary.js';

// ── Main entry point ─────────────────────────────────────

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const controlsEl = document.getElementById('controls') as HTMLElement;
const inspectorEl = document.getElementById('inspector') as HTMLElement;
const observerEl = document.getElementById('observer') as HTMLElement;

const renderer = new Renderer(canvas);
const history = new CreatureHistoryStore();
const inspector = new Inspector(inspectorEl);
const observerPanel = new ObserverPanel(observerEl);
const statsHistory = new StatsHistoryStore();
const summaryModal = new SummaryModal();

// Create worker
const worker = new Worker('worker.js', { type: 'module' });

function send(cmd: SimCommand): void {
  worker.postMessage(cmd);
}

const controls = new Controls(controlsEl, send);

// ── Control bar buttons ─────────────────────────────────
// Appended AFTER Controls constructor (which clears innerHTML)

const ctrlBtnStyle = 'padding: 4px 12px; cursor: pointer; background: #2a2a4e; color: #ddd; border: 1px solid #444; border-radius: 4px; font-family: monospace; font-size: 13px;';
const logSpan = controlsEl.querySelector('#sim-log');

// Observer toggle
const observerBtn = document.createElement('button');
observerBtn.textContent = 'Observer';
observerBtn.style.cssText = ctrlBtnStyle;
observerBtn.onclick = () => {
  observerPanel.toggle();
  triggerResize();
};
if (logSpan) controlsEl.insertBefore(observerBtn, logSpan);
else controlsEl.appendChild(observerBtn);

// Summary button
const summaryBtn = document.createElement('button');
summaryBtn.textContent = 'Summary';
summaryBtn.style.cssText = ctrlBtnStyle;
summaryBtn.onclick = () => {
  summaryModal.open(statsHistory, lastCreatures);
};
if (logSpan) controlsEl.insertBefore(summaryBtn, logSpan);
else controlsEl.appendChild(summaryBtn);

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

// ── Observer state (button-based, no auto-fire) ─────────

let observerInFlight = false;
let lastMaxGeneration = 0;
const observerEventBuffer: string[] = [];
const recentlyEditedIds: number[] = [];
const MAX_EVENT_BUFFER = 50;

function pushEvent(msg: string): void {
  observerEventBuffer.push(msg);
  if (observerEventBuffer.length > MAX_EVENT_BUFFER) observerEventBuffer.shift();
  // Also record as milestone for summary
  const tick = lastStats?.tick ?? 0;
  statsHistory.addMilestone(tick, msg);
}

async function fireObserver(): Promise<void> {
  const currentTick = lastStats?.tick ?? 0;
  if (lastCreatures.length === 0 && !lastStats) return;
  if (observerInFlight) return;

  observerInFlight = true;
  observerPanel.setThinking(true);

  const context = buildObserverContext(
    lastCreatures,
    lastCells,
    lastStats ?? { tick: currentTick, creatureCount: 0, totalBirths: 0, totalDeaths: 0, avgEnergy: 0, maxGeneration: 0, avgTraits: null, deathsByStarvation: 0, deathsByHazard: 0 },
    observerEventBuffer,
    recentlyEditedIds,
    observerPanel.getLastScratchpad(),
  );

  console.log('[OBSERVER] Firing at tick', currentTick, '— context length:', context.length);

  const report = await callObserverAPI(context);

  observerInFlight = false;
  observerPanel.setThinking(false);

  if (report) {
    console.log('[OBSERVER] Report:', report.headline, '—', report.mood);
    observerPanel.addReport(currentTick, report);
  } else {
    observerPanel.showError('Observer API call failed — are you logged in at localhost:3000?');
  }

  // Clear buffers after report
  observerEventBuffer.length = 0;
  recentlyEditedIds.length = 0;
}

// Wire observer "New Report" button
observerPanel.setOnRequestReport(() => fireObserver());

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
      // Record stats history for summary
      statsHistory.record(event.stats, lastCreatures);
      // Track new generation records
      if (event.stats.maxGeneration > lastMaxGeneration) {
        pushEvent(`New generation record: Gen ${event.stats.maxGeneration}!`);
        lastMaxGeneration = event.stats.maxGeneration;
      }
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
            pushEvent(`Tick ${event.tick}: #${event.id} died (long-lived creature)`);
          }
        }
      }
      break;

    case 'creature:spawned':
      break;

    case 'creature:reproduced':
      pushEvent(`Tick ${event.tick}: #${event.parentId} reproduced → offspring #${event.childId}`);
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

      // Observer: track embodiment edits
      const editMatch = event.message.match(/\[EMBODIMENT\] #(\d+) edited (on_tick|sensors|identity|memory|tools)/);
      if (editMatch) {
        const creatureId = parseInt(editMatch[1], 10);
        const tick = lastStats?.tick ?? '?';
        pushEvent(`Tick ${tick}: #${creatureId} edited ${editMatch[2]}`);
        if (editMatch[2] === 'on_tick' && !recentlyEditedIds.includes(creatureId)) {
          recentlyEditedIds.push(creatureId);
          if (recentlyEditedIds.length > 10) recentlyEditedIds.shift();
        }
      }

      // Observer: population critical
      if (event.message.includes('Population critical')) {
        const tick = lastStats?.tick ?? '?';
        pushEvent(`Tick ${tick}: Population crashed to critical — spawned reinforcements`);
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
  get statsHistory() { return statsHistory; },
  select: selectCreature,
  renderer,
  observer: observerPanel,
  summary: summaryModal,
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

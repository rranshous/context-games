// ── Reflex Layer ──
// Ties together reservoir, TD learner, action vocabulary, and reward into a
// single per-car subsystem. The game loop calls into this; the car's on_tick
// code doesn't know it exists.
//
// Integration flow per tick:
//   1. game.ts calls reflexLayer.preTick(car, me, world) BEFORE on_tick
//   2. reflex layer runs reservoir (on cadence), computes priorities
//   3. Selects highest-priority available action, executes it via me API
//   4. game.ts runs on_tick code (which can override/augment reflex decisions)
//   5. After physics, game.ts calls reflexLayer.postTick(car) with reward snapshot
//   6. TD learner updates probes online
//
// The reflex fires BEFORE on_tick so its actions can be overridden by the soma's
// authored code. The soma code is the "conscious" layer; the reflex is the
// "sub-conscious" base. If the soma doesn't steer/accel/brake, the reflex's
// inputs persist. If the soma does, it overwrites them. This mirrors how
// reflexes work in organisms — they fire first, voluntary control can override.

import { MeAPI, WorldAPI } from '../soma';
import { Car } from '../car';
import { TDLearner, DEFAULT_TD_CONFIG, TDConfig } from './td-learner';
import { TENDENCY_DEFS, TENDENCY_NAMES, TENDENCY_COUNT } from './actions';
import { stateToText, StateHistory } from './state-to-text';
import { RewardSnapshot, captureRewardSnapshot, computeReward } from './reward';

// Reservoir bridge interface (same as hunch)
export interface ReservoirBridge {
  readonly activationDim: number;
  load(): Promise<void>;
  embed(text: string): Promise<Float32Array>;
}

export interface ReflexConfig {
  /** Reservoir fires every N frames. Default 6 (~10Hz at 60fps). */
  reservoirCadence: number;
  /** TD learning config. */
  td: TDConfig;
  /** Enable/disable the reflex layer at runtime. */
  enabled: boolean;
}

export const DEFAULT_REFLEX_CONFIG: ReflexConfig = {
  reservoirCadence: 6,
  td: DEFAULT_TD_CONFIG,
  enabled: true,
};

/** Per-car reflex state. One instance per AI car. */
export class CarReflex {
  readonly carId: string;
  readonly td: TDLearner;
  private cachedActivation: Float32Array | null = null;
  cachedPriorities: Float32Array | null = null;
  private prevReward: RewardSnapshot | null = null;
  private framesSinceReservoir: number = 0;
  private lastSelectedAction: number = -1;

  // State history for temporal context in reservoir input
  stateHistory: StateHistory = new StateHistory(4);

  // Diagnostics
  actionCounts: Map<string, number> = new Map();
  ticksSinceReset: number = 0;

  constructor(carId: string, dim: number) {
    this.carId = carId;
    this.td = new TDLearner(dim, TENDENCY_NAMES);
    for (const name of TENDENCY_NAMES) this.actionCounts.set(name, 0);
  }

  /** Update cached reservoir activations + probe priorities on cadence.
   *  Does NOT select or execute actions — that's done via the
   *  TendencyAccumulator in game.ts, which composes probe magnitudes
   *  with on_tick magnitudes via softmax. */
  async updateReservoir(
    car: Car,
    me: MeAPI,
    world: WorldAPI,
    reservoir: ReservoirBridge,
    config: ReflexConfig,
  ): Promise<void> {
    if (!config.enabled || !car.alive) return;

    this.ticksSinceReset++;
    this.framesSinceReservoir++;

    // Reservoir forward pass on cadence
    if (this.framesSinceReservoir >= config.reservoirCadence || !this.cachedActivation) {
      const text = stateToText(me, world, this.stateHistory);
      this.cachedActivation = await reservoir.embed(text);
      this.cachedPriorities = this.td.priorities(this.cachedActivation);
      // Push current snapshot to history for next reservoir call
      this.stateHistory.push(stateToText(me, world));  // snapshot without history (just current tick)
      this.framesSinceReservoir = 0;
    }

    // Record activation for TD update (will be used in postTick)
    if (this.cachedActivation) {
      // In the tendency system, ALL probes contribute simultaneously.
      // We record the activation for the value probe's TD update.
      // Individual action probes get updated proportionally to their
      // magnitude in the softmax composition.
      this.td.recordSelection(-1, this.cachedActivation); // -1 = all probes
    }
  }

  /** Run after physics: compute reward, TD update. */
  postTick(car: Car): void {
    const curr = captureRewardSnapshot(car);
    if (this.prevReward && this.cachedActivation) {
      const reward = computeReward(this.prevReward, curr);
      this.td.update(this.cachedActivation, reward);
    }
    this.prevReward = curr;
  }

  /** Call on death/respawn to reset per-life state. */
  onDeath(): void {
    this.td.resetTickState();
    this.prevReward = null;
    this.cachedActivation = null;
    this.cachedPriorities = null;
    this.stateHistory.clear();
    this.framesSinceReservoir = 999; // force reservoir on next alive tick
  }

  /** Top actions by usage. */
  topActions(n: number = 5): Array<{ name: string; count: number; pct: string }> {
    const total = this.ticksSinceReset || 1;
    return [...this.actionCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([name, count]) => ({ name, count, pct: (count / total * 100).toFixed(1) + '%' }));
  }
}

/** The full reflex layer: manages per-car reflexes + shared reservoir. */
export class ReflexLayer {
  readonly reservoir: ReservoirBridge;
  readonly config: ReflexConfig;
  private carReflexes: Map<string, CarReflex> = new Map();
  private loaded: boolean = false;

  constructor(reservoir: ReservoirBridge, config: ReflexConfig = DEFAULT_REFLEX_CONFIG) {
    this.reservoir = reservoir;
    this.config = config;
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    await this.reservoir.load();
    this.loaded = true;
    console.log(`[REFLEX] reservoir loaded, dim=${this.reservoir.activationDim}, actions=${TENDENCY_COUNT}`);
  }

  /** Get or create the CarReflex for a given car. */
  getReflex(carId: string): CarReflex {
    let cr = this.carReflexes.get(carId);
    if (!cr) {
      cr = new CarReflex(carId, this.reservoir.activationDim);
      this.carReflexes.set(carId, cr);
    }
    return cr;
  }

  /** Update reservoir + priorities for one car. Called from game.ts. */
  async updateReservoir(car: Car, me: MeAPI, world: WorldAPI): Promise<void> {
    if (!this.loaded || !this.config.enabled) return;
    const cr = this.getReflex(car.id);
    await cr.updateReservoir(car, me, world, this.reservoir, this.config);
  }

  /** Post-tick for one car. Called from game.ts after physics. */
  postTick(car: Car): void {
    if (!this.config.enabled) return;
    const cr = this.getReflex(car.id);
    cr.postTick(car);
  }

  /** Notify death for a car (reset TD state). */
  onCarDeath(carId: string): void {
    const cr = this.carReflexes.get(carId);
    if (cr) cr.onDeath();
  }

  /** Summary for logging / diagnostics. */
  summary(): Record<string, { updates: number; meanAbsTD: string; topActions: Array<{ name: string; pct: string }> }> {
    const out: Record<string, any> = {};
    for (const [id, cr] of this.carReflexes) {
      out[id] = {
        updates: cr.td.totalUpdates,
        meanAbsTD: cr.td.meanAbsTDError().toFixed(4),
        topActions: cr.topActions(3),
      };
    }
    return out;
  }

  /** Persist all TD learner states to localStorage. */
  save(): void {
    const data: Record<string, unknown> = {};
    for (const [id, cr] of this.carReflexes) {
      data[id] = cr.td.toJSON();
    }
    localStorage.setItem('tag-your-dead-reflexes', JSON.stringify(data));
  }

  /** Load TD learner states from localStorage. */
  loadSaved(): void {
    const raw = localStorage.getItem('tag-your-dead-reflexes');
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      for (const [id, obj] of Object.entries(data)) {
        const cr = this.getReflex(id);
        const loaded = TDLearner.fromJSON(obj as any, this.config.td);
        cr.td.valueProbe = loaded.valueProbe;
        cr.td.actionProbes = loaded.actionProbes;
        cr.td.totalUpdates = loaded.totalUpdates;
      }
      console.log(`[REFLEX] loaded saved reflexes for ${Object.keys(data).length} cars`);
    } catch (err) {
      console.warn('[REFLEX] failed to load saved reflexes:', err);
    }
  }
}

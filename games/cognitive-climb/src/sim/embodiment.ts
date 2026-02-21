import type { EmbodimentState, GenomeState, ReflexWeights, CellState } from '../interface/state.js';

// ── Default embodiment content ──────────────────────────

export const DEFAULT_IDENTITY = `I am a creature in a survival simulation. I eat food to gain energy, avoid hazard zones that damage me, and reproduce when I have enough energy. My body runs on reflexes between wake-ups. I can modify my own embodiment to improve my survival.`;

export const DEFAULT_SENSORS = `function sensors(me, world) {
  var nearby = world.nearby();
  var foodCount = 0, dangerCount = 0, creatureCount = 0, totalFood = 0;
  for (var i = 0; i < nearby.length; i++) {
    var cell = nearby[i];
    if (cell.food > 0) { foodCount++; totalFood += cell.food; }
    if (cell.danger > 0) dangerCount++;
    if (cell.creature) creatureCount++;
  }
  var cur = world.currentCell();
  me.memory.set('nearby_food', foodCount);
  me.memory.set('total_food', totalFood);
  me.memory.set('nearby_danger', dangerCount);
  me.memory.set('nearby_creatures', creatureCount);
  me.memory.set('energy_pct', me.energy / me.maxEnergy);
  me.memory.set('current_terrain', cur.terrain);
  me.memory.set('current_danger', cur.danger);
  me.memory.set('current_food', cur.food);
}`;

export const DEFAULT_ON_TICK = `function onTick(me, world) {
  me.sensors.run();
  var energy = me.memory.get('energy_pct');
  var danger = me.memory.get('nearby_danger');

  me.reflex.reset();
  if (energy < 0.35) me.reflex.adjust('foodAttraction', 0.4);
  if (energy < 0.2) me.reflex.adjust('restThreshold', 0.15);
  if (danger > 0) me.reflex.adjust('dangerAvoidance', 0.3);

  for (var i = 0; i < me.events.length; i++) {
    var e = me.events[i];
    if (e.type === 'reproduced') return { wake: true, reason: 'reproduced' };
    if (e.type === 'new_terrain') return { wake: true, reason: 'new_terrain' };
  }
  if (energy < 0.25) return { wake: true, reason: 'crisis' };

  var lastWake = me.memory.get('last_wake_tick') || 0;
  if (world.tick - lastWake >= me.genome.wakeInterval) {
    return { wake: true, reason: 'periodic' };
  }

  return { wake: false };
}`;

export const DEFAULT_MEMORY = '{}';

export const DEFAULT_TOOLS = JSON.stringify([
  {
    name: 'adjust_reflex',
    description: 'Adjust a reflex weight that influences your body\'s instinctive behavior each tick. Weights: foodAttraction, dangerAvoidance, curiosity, restThreshold, sociality. Positive delta increases, negative decreases.',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          enum: ['foodAttraction', 'dangerAvoidance', 'curiosity', 'restThreshold', 'sociality'],
        },
        delta: {
          type: 'number',
          description: 'Amount to add to current weight adjustment',
        },
      },
      required: ['name', 'delta'],
    },
    execute: 'me.reflex.adjust(args.name, args.delta)',
  },
], null, 2);

// ── Helpers ─────────────────────────────────────────────

export function defaultEmbodiment(): EmbodimentState {
  return {
    identity: DEFAULT_IDENTITY,
    sensors: DEFAULT_SENSORS,
    on_tick: DEFAULT_ON_TICK,
    memory: DEFAULT_MEMORY,
    tools: DEFAULT_TOOLS,
  };
}

export function computeEmbodimentSize(e: EmbodimentState): number {
  return e.identity.length + e.sensors.length + e.on_tick.length
    + e.memory.length + e.tools.length;
}

export function ageScalar(age: number): number {
  return Math.min(1.0, 0.3 + 0.7 * (age / 100));
}

// ── Code compilation ────────────────────────────────────

function extractFunctionBody(code: string): string {
  const match = code.match(/^function\s+\w+\s*\([^)]*\)\s*\{([\s\S]*)\}\s*$/);
  return match ? match[1] : code;
}

export function compileFunction(
  code: string,
): ((me: unknown, world: unknown, args?: unknown) => unknown) | null {
  if (!code || code.length > 5000) return null;
  // Basic safety checks
  if (/while\s*\(\s*true\s*\)/.test(code) || /for\s*\(\s*;\s*;\s*\)/.test(code)) {
    console.warn('[EMBODIMENT] Rejected infinite loop in code');
    return null;
  }
  try {
    const body = extractFunctionBody(code);
    return new Function('me', 'world', 'args', body) as
      (me: unknown, world: unknown, args?: unknown) => unknown;
  } catch (e) {
    console.error('[EMBODIMENT] Compilation error:', e);
    return null;
  }
}

// ── Creature interface (duck-typed to avoid circular imports) ─

interface CreatureLike {
  readonly id: number;
  x: number;
  y: number;
  energy: number;
  maxEnergy: number;
  age: number;
  genome: GenomeState;
  embodiment: EmbodimentState;
  reflexAdjustments: ReflexWeights;
  events: ReadonlyArray<{ type: string; [key: string]: unknown }>;
  inheritedEmbodimentSize: number;
}

interface WorldLike {
  readonly width: number;
  readonly height: number;
  cellAt(x: number, y: number): CellState;
  inBounds(x: number, y: number): boolean;
}

// ── me API ──────────────────────────────────────────────

function checkBudget(creature: CreatureLike, section: keyof EmbodimentState, newContent: string): boolean {
  const current = computeEmbodimentSize(creature.embodiment);
  const oldLen = creature.embodiment[section].length;
  const newTotal = current - oldLen + newContent.length;
  const maxAllowed = Math.max(
    creature.inheritedEmbodimentSize,
    creature.genome.maxEmbodimentSize * ageScalar(creature.age),
  );
  return newTotal <= maxAllowed;
}

export function buildMeApi(
  creature: CreatureLike,
  world: WorldLike,
  allCreatures: CreatureLike[],
  tick: number,
  worldApi?: ReturnType<typeof buildWorldApi>,
) {
  // Parse memory once; mutations go here, synced back after execution
  let memoryCache: Record<string, unknown>;
  try {
    memoryCache = JSON.parse(creature.embodiment.memory || '{}');
  } catch {
    memoryCache = {};
  }

  const me: Record<string, unknown> = {};

  // ── Section access ──────────────────────────────────
  function makeSectionApi(name: keyof EmbodimentState, runnable: boolean) {
    const api: Record<string, unknown> = {
      read: () => creature.embodiment[name],
      write: (str: string) => {
        if (!checkBudget(creature, name, str)) return false;
        creature.embodiment[name] = str;
        return true;
      },
    };
    if (runnable) {
      api.run = () => {
        const fn = compileFunction(creature.embodiment[name]);
        if (fn) {
          try { fn(me, worldApi); }
          catch (e) { console.error(`[EMBODIMENT] ${name} error for #${creature.id}:`, e); }
        }
      };
    }
    return api;
  }

  me.identity = makeSectionApi('identity', false);
  me.sensors = makeSectionApi('sensors', true);
  me.on_tick = makeSectionApi('on_tick', false);
  me.tools = makeSectionApi('tools', false);

  // ── Memory (special — has get/set convenience + parsed cache) ──
  me.memory = {
    get: (key: string) => memoryCache[key],
    set: (key: string, val: unknown) => { memoryCache[key] = val; },
    read: () => ({ ...memoryCache }),
    write: (str: string) => {
      if (!checkBudget(creature, 'memory', str)) return false;
      creature.embodiment.memory = str;
      try { memoryCache = JSON.parse(str); } catch { memoryCache = {}; }
      return true;
    },
  };

  // ── Reflex interface ──────────────────────────────────
  const adj = creature.reflexAdjustments;
  const base = creature.genome.reflexWeights;
  const reflexNames = ['foodAttraction', 'dangerAvoidance', 'curiosity', 'restThreshold', 'sociality'] as const;

  me.reflex = {
    adjust: (name: string, delta: number) => {
      if (reflexNames.includes(name as typeof reflexNames[number])) {
        adj[name as keyof ReflexWeights] += delta;
      }
    },
    set: (name: string, value: number) => {
      if (reflexNames.includes(name as typeof reflexNames[number])) {
        adj[name as keyof ReflexWeights] = value;
      }
    },
    reset: (name?: string) => {
      if (name && reflexNames.includes(name as typeof reflexNames[number])) {
        adj[name as keyof ReflexWeights] = 0;
      } else if (!name) {
        for (const n of reflexNames) adj[n] = 0;
      }
    },
    get: (name: string) => {
      if (!reflexNames.includes(name as typeof reflexNames[number])) return null;
      const k = name as keyof ReflexWeights;
      return { base: base[k], adjustment: adj[k], effective: base[k] + adj[k] };
    },
  };

  // ── Read-only state ─────────────────────────────────────
  Object.defineProperties(me, {
    energy: { get: () => creature.energy, enumerable: true },
    maxEnergy: { get: () => creature.maxEnergy, enumerable: true },
    position: { get: () => ({ x: creature.x, y: creature.y }), enumerable: true },
    age: { get: () => creature.age, enumerable: true },
    genome: { get: () => Object.freeze({ ...creature.genome, reflexWeights: Object.freeze({ ...creature.genome.reflexWeights }) }), enumerable: true },
    events: { get: () => creature.events, enumerable: true },
    embodimentSize: { get: () => computeEmbodimentSize(creature.embodiment), enumerable: true },
    maxEmbodimentSize: {
      get: () => Math.max(
        creature.inheritedEmbodimentSize,
        creature.genome.maxEmbodimentSize * ageScalar(creature.age),
      ),
      enumerable: true,
    },
  });

  // ── world API (built here if not provided, since me.sensors.run() needs it) ──
  if (!worldApi) worldApi = buildWorldApi(creature, world, allCreatures, tick);

  // Expose a syncMemory function so the caller can flush after execution
  (me as any).__syncMemory = () => {
    creature.embodiment.memory = JSON.stringify(memoryCache);
  };

  return me;
}

// ── world API ───────────────────────────────────────────

export function buildWorldApi(
  creature: CreatureLike,
  world: WorldLike,
  allCreatures: CreatureLike[],
  tick: number,
) {
  return {
    nearby: () => {
      const range = Math.round(creature.genome.senseRange);
      const result: Array<{
        x: number; y: number; terrain: string; elevation: number;
        food: number; danger: number; creature?: { id: number; energy: number };
      }> = [];

      for (let dy = -range; dy <= range; dy++) {
        for (let dx = -range; dx <= range; dx++) {
          const nx = creature.x + dx;
          const ny = creature.y + dy;
          if (!world.inBounds(nx, ny)) continue;
          const dist = Math.abs(dx) + Math.abs(dy);
          if (dist > range || dist === 0) continue;
          const cell = world.cellAt(nx, ny);
          const entry: {
            x: number; y: number; terrain: string; elevation: number;
            food: number; danger: number; creature?: { id: number; energy: number };
          } = {
            x: nx, y: ny,
            terrain: cell.terrain,
            elevation: cell.elevation,
            food: cell.food,
            danger: cell.danger,
          };
          // Check for creature at this cell
          const other = allCreatures.find(c =>
            c !== creature && c.x === nx && c.y === ny && (c as any).alive !== false,
          );
          if (other) {
            entry.creature = { id: other.id, energy: other.energy };
          }
          result.push(entry);
        }
      }
      return result;
    },

    currentCell: () => {
      const cell = world.cellAt(creature.x, creature.y);
      return {
        terrain: cell.terrain,
        elevation: cell.elevation,
        food: cell.food,
        danger: cell.danger,
      };
    },

    tick,

    bounds: { width: world.width, height: world.height },
  };
}

// ── onTick runner ───────────────────────────────────────

export function runOnTick(
  creature: CreatureLike,
  world: WorldLike,
  allCreatures: CreatureLike[],
  tick: number,
): { wake: boolean; reason?: string } {
  const fn = compileFunction(creature.embodiment.on_tick);
  if (!fn) {
    return { wake: false };
  }

  const worldApi = buildWorldApi(creature, world, allCreatures, tick);
  const meApi = buildMeApi(creature, world, allCreatures, tick, worldApi);

  try {
    const result = fn(meApi, worldApi);

    // Sync memory back to embodiment
    (meApi as any).__syncMemory();

    if (result && typeof result === 'object' && (result as any).wake) {
      return { wake: true, reason: (result as any).reason || 'unknown' };
    }
    return { wake: false };
  } catch (e) {
    console.error(`[ONTICK] Creature #${creature.id} error:`, e);
    return { wake: false };
  }
}

import type { SimEvent } from '../interface/events.js';
import type { SimStats, WorldState } from '../interface/state.js';
import { ConsciousnessManager } from './consciousness.js';
import { Creature } from './creature.js';
import { runOnTick, computeEmbodimentSize } from './embodiment.js';
import { mutateGenome } from './genome.js';
import { reflexTick } from './reflex.js';
import { World, type WorldConfig } from './world.js';

function round2(v: number): number { return Math.round(v * 100) / 100; }

// ── Seasons ──────────────────────────────────────────────

const SEASON_LENGTH = 200; // ticks per season
const SEASONS = [
  { name: 'spring',  foodMultiplier: 1.5 },
  { name: 'summer',  foodMultiplier: 2.0 },
  { name: 'autumn',  foodMultiplier: 0.8 },
  { name: 'winter',  foodMultiplier: 0.3 },
] as const;

export function computeSeason(tick: number): { name: string; foodMultiplier: number } {
  const idx = Math.floor((tick % (SEASON_LENGTH * SEASONS.length)) / SEASON_LENGTH);
  return SEASONS[idx];
}

export interface EngineConfig {
  initialCreatures: number;
  foodSpawnInterval: number;  // ticks between food spawn rounds
  world?: Partial<WorldConfig>;
}

const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  initialCreatures: 12,
  foodSpawnInterval: 5,
  world: {},
};

export class Engine {
  readonly world: World;
  readonly creatures: Creature[] = [];
  readonly consciousness: ConsciousnessManager;
  tick: number = 0;
  totalBirths: number = 0;
  totalDeaths: number = 0;
  deathsByStarvation: number = 0;
  deathsByHazard: number = 0;

  private emit: (event: SimEvent) => void;
  private config: EngineConfig;

  constructor(
    emit: (event: SimEvent) => void,
    pauseSim: () => void,
    resumeSim: () => void,
    config: Partial<EngineConfig> = {},
  ) {
    this.emit = emit;
    this.config = { ...DEFAULT_ENGINE_CONFIG, ...config };
    this.world = new World(this.config.world);
    this.consciousness = new ConsciousnessManager(emit, pauseSim, resumeSim);
    this.spawnInitialCreatures();
  }

  private spawnInitialCreatures(): void {
    for (let i = 0; i < this.config.initialCreatures; i++) {
      this.spawnCreatureRandom();
    }
  }

  private spawnCreatureRandom(): Creature {
    // Find a random walkable cell
    let x: number, y: number;
    let attempts = 0;
    do {
      x = Math.floor(Math.random() * this.world.width);
      y = Math.floor(Math.random() * this.world.height);
      attempts++;
    } while ((!this.world.isWalkable(x, y) || this.world.cellAt(x, y).danger > 0) && attempts < 200);

    const creature = new Creature(x, y);
    this.lastTerrain.set(creature.id, this.world.cellAt(x, y).terrain);
    this.creatures.push(creature);
    this.totalBirths++;
    this.emit({ type: 'creature:spawned', creature: creature.toState(), tick: this.tick });
    return creature;
  }

  spawnCreatureAt(x: number, y: number, genome?: Partial<import('../interface/state.js').GenomeState>): void {
    if (!this.world.isWalkable(x, y)) return;
    const creature = new Creature(x, y);
    if (genome) {
      Object.assign(creature.genome, genome);
    }
    this.lastTerrain.set(creature.id, this.world.cellAt(x, y).terrain);
    this.creatures.push(creature);
    this.totalBirths++;
    this.emit({ type: 'creature:spawned', creature: creature.toState(), tick: this.tick });
  }

  /** Track last terrain for each creature to detect new_terrain events */
  private lastTerrain: Map<number, string> = new Map();

  step(): void {
    this.tick++;

    // 1. Spawn food periodically (rate modulated by season)
    if (this.tick % this.config.foodSpawnInterval === 0) {
      this.world.spawnFood(computeSeason(this.tick).foodMultiplier);
    }

    // 2. Process each living creature
    const alive = this.creatures.filter(c => c.alive);
    for (const creature of alive) {
      // Base energy burn
      creature.burnBaseEnergy();
      if (!creature.alive) {
        this.handleDeath(creature, 'starvation');
        continue;
      }

      // Skip all processing while thinking — body is frozen
      if (creature.thinking) {
        const cell = this.world.cellAt(creature.x, creature.y);
        if (cell.danger > 0) {
          creature.energy -= cell.danger;
          if (creature.energy <= 0) {
            creature.energy = 0;
            this.handleDeath(creature, 'hazard');
          }
        }
        continue;
      }

      // Run embodiment onTick (creature-authored JS)
      const onTickResult = runOnTick(creature, this.world, alive, this.tick, computeSeason(this.tick).name);

      // Reflex action (uses genome base + adjustments set by onTick)
      const result = reflexTick(creature, this.world, alive);

      // Record events for next tick's onTick and for consciousness context
      creature.events = []; // clear for next tick

      if (result.action === 'eat' && result.foodEaten > 0) {
        creature.recordEvent(`Ate food (value ${result.foodEaten}) at (${creature.x},${creature.y})`);
        creature.events.push({ type: 'ate', value: result.foodEaten });
        this.emit({
          type: 'creature:ate',
          id: creature.id,
          foodValue: result.foodEaten,
          x: creature.x,
          y: creature.y,
          tick: this.tick,
        });
      }

      // Track terrain for new_terrain events
      if (result.action === 'move') {
        const cell = this.world.cellAt(creature.x, creature.y);
        const prevTerrain = this.lastTerrain.get(creature.id);
        if (prevTerrain !== undefined && cell.terrain !== prevTerrain) {
          creature.events.push({ type: 'new_terrain', terrain: cell.terrain });
          creature.recordEvent(`Entered ${cell.terrain}`);
        }
        this.lastTerrain.set(creature.id, cell.terrain);
      }

      // Hazard damage
      if (creature.alive) {
        const cell = this.world.cellAt(creature.x, creature.y);
        if (cell.danger > 0) {
          creature.energy -= cell.danger;
          creature.events.push({ type: 'hazard_damage', amount: cell.danger });
          creature.recordEvent(`Took ${cell.danger.toFixed(1)} hazard damage at (${creature.x},${creature.y})`);
          if (creature.energy <= 0) {
            creature.energy = 0;
            this.handleDeath(creature, 'hazard');
          }
        }
      }

      // Queue consciousness if onTick signaled wake
      if (creature.alive && onTickResult.wake) {
        this.consciousness.tryWake(creature, this.world, alive, this.tick, onTickResult.reason || 'unknown');
      }
    }

    // 3. Reproduction check
    const canReproduce = this.creatures.filter(c => c.alive && c.canReproduce());
    for (const parent of canReproduce) {
      this.reproduce(parent);
    }

    // 4. Clean up dead creatures
    const maxDead = 100;
    const dead = this.creatures.filter(c => !c.alive);
    if (dead.length > maxDead) {
      const toRemove = dead.slice(0, dead.length - maxDead);
      for (const d of toRemove) {
        const idx = this.creatures.indexOf(d);
        if (idx !== -1) this.creatures.splice(idx, 1);
      }
    }

    // 5. Minimum population: respawn if nearly extinct
    const livingCount = this.creatures.filter(c => c.alive).length;
    if (livingCount < 5) {
      for (let i = livingCount; i < 8; i++) {
        this.spawnCreatureRandom();
      }
      this.emit({ type: 'log', message: `Population critical (${livingCount}) — spawned reinforcements` });
    }

    // 6. Emit periodic state
    if (this.tick % 10 === 0) {
      this.emit({ type: 'stats', stats: this.getStats() });
    }
    if (this.tick % 30 === 0) {
      this.emit({ type: 'state', state: this.getWorldState() });
    }
  }

  private handleDeath(creature: Creature, cause: 'starvation' | 'hazard' | 'predation'): void {
    creature.alive = false;
    this.totalDeaths++;
    if (cause === 'starvation') this.deathsByStarvation++;
    if (cause === 'hazard') this.deathsByHazard++;

    creature.recordEvent(`Died from ${cause} at (${creature.x},${creature.y}) energy=${Math.round(creature.energy)}`);

    // No death wake-up in M6 — memory not inherited, so no lasting effect
    this.emit({ type: 'creature:died', id: creature.id, cause, tick: this.tick });
  }

  private reproduce(parent: Creature): void {
    // Find empty adjacent cell
    const dirs = [
      { dx: 0, dy: -1 }, { dx: 1, dy: 0 },
      { dx: 0, dy: 1 }, { dx: -1, dy: 0 },
    ];

    // Shuffle directions
    for (let i = dirs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
    }

    for (const dir of dirs) {
      const nx = parent.x + dir.dx;
      const ny = parent.y + dir.dy;
      if (!this.world.isWalkable(nx, ny)) continue;

      // Check no creature already there
      const occupied = this.creatures.some(c => c.alive && c.x === nx && c.y === ny);
      if (occupied) continue;

      // Birth!
      parent.payReproductionCost();
      const childGenome = mutateGenome(parent.genome);
      const child = new Creature(nx, ny, childGenome, parent.id, parent.generation + 1);

      // Lamarckian: clone embodiment from parent (memory starts empty)
      child.embodiment = {
        identity: parent.embodiment.identity,
        sensors: parent.embodiment.sensors,
        on_tick: parent.embodiment.on_tick,
        memory: '{}',
        tools: parent.embodiment.tools,
      };
      child.inheritedEmbodimentSize = computeEmbodimentSize(child.embodiment);
      this.lastTerrain.set(child.id, this.world.cellAt(nx, ny).terrain);

      this.creatures.push(child);
      this.totalBirths++;

      // Events for parent's next onTick
      parent.events.push({ type: 'reproduced', childId: child.id });
      parent.recordEvent(`Reproduced — offspring #${child.id}`);

      this.emit({ type: 'creature:spawned', creature: child.toState(), tick: this.tick });
      this.emit({ type: 'creature:reproduced', parentId: parent.id, childId: child.id, tick: this.tick });
      return; // one offspring per tick
    }
  }

  getStats(): SimStats {
    const alive = this.creatures.filter(c => c.alive);
    const n = alive.length;

    const avgTraits = n > 0 ? {
      speed: round2(alive.reduce((s, c) => s + c.genome.speed, 0) / n),
      senseRange: round2(alive.reduce((s, c) => s + c.genome.senseRange, 0) / n),
      size: round2(alive.reduce((s, c) => s + c.genome.size, 0) / n),
      metabolism: round2(alive.reduce((s, c) => s + c.genome.metabolism, 0) / n),
      diet: round2(alive.reduce((s, c) => s + c.genome.diet, 0) / n),
    } : null;

    return {
      tick: this.tick,
      creatureCount: n,
      totalBirths: this.totalBirths,
      totalDeaths: this.totalDeaths,
      avgEnergy: n > 0
        ? Math.round(alive.reduce((s, c) => s + c.energy, 0) / n * 10) / 10
        : 0,
      maxGeneration: n > 0
        ? Math.max(...alive.map(c => c.generation))
        : 0,
      avgTraits,
      deathsByStarvation: this.deathsByStarvation,
      deathsByHazard: this.deathsByHazard,
      season: computeSeason(this.tick).name,
    };
  }

  getWorldState(): WorldState {
    return {
      width: this.world.width,
      height: this.world.height,
      tick: this.tick,
      cells: this.world.cells.map(c => ({ ...c })),
      creatures: this.creatures.filter(c => c.alive).map(c => c.toState()),
      stats: this.getStats(),
    };
  }
}

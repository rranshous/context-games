import type { SimEvent } from '../interface/events.js';
import type { SimStats, WorldState } from '../interface/state.js';
import { ConsciousnessManager, type WakeReason } from './consciousness.js';
import { Creature } from './creature.js';
import { mutateGenome } from './genome.js';
import { reflexTick } from './reflex.js';
import { World, type WorldConfig } from './world.js';

function round2(v: number): number { return Math.round(v * 100) / 100; }

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
    creature.terrainsSeen.add(this.world.cellAt(x, y).terrain);
    this.creatures.push(creature);
    this.totalBirths++;
    this.emit({ type: 'creature:spawned', creature: creature.toState() });
    return creature;
  }

  spawnCreatureAt(x: number, y: number, genome?: Partial<import('../interface/state.js').GenomeState>): void {
    if (!this.world.isWalkable(x, y)) return;
    const creature = new Creature(x, y);
    if (genome) {
      Object.assign(creature.genome, genome);
    }
    creature.terrainsSeen.add(this.world.cellAt(x, y).terrain);
    this.creatures.push(creature);
    this.totalBirths++;
    this.emit({ type: 'creature:spawned', creature: creature.toState() });
  }

  step(): void {
    this.tick++;

    // 1. Spawn food periodically
    if (this.tick % this.config.foodSpawnInterval === 0) {
      this.world.spawnFood();
    }

    // 2. Run reflex for each living creature
    const alive = this.creatures.filter(c => c.alive);
    for (const creature of alive) {
      // Base energy burn
      creature.burnBaseEnergy();
      if (!creature.alive) {
        this.handleDeath(creature, 'starvation');
        continue;
      }

      // Skip reflex while thinking — body is frozen
      if (creature.thinking) {
        // Still take hazard damage
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

      // Reflex action
      const result = reflexTick(creature, this.world, alive);

      if (result.action === 'eat' && result.foodEaten > 0) {
        creature.recordEvent(`Ate food (value ${result.foodEaten}) at (${creature.x},${creature.y})`);
        this.emit({
          type: 'creature:ate',
          id: creature.id,
          foodValue: result.foodEaten,
          x: creature.x,
          y: creature.y,
        });
      }

      // Track terrain visits for new_terrain wake trigger
      if (result.action === 'move') {
        const cell = this.world.cellAt(creature.x, creature.y);
        if (!creature.terrainsSeen.has(cell.terrain)) {
          creature.recordEvent(`Entered ${cell.terrain} for the first time`);
        }
      }

      // Hazard damage
      if (creature.alive) {
        const cell = this.world.cellAt(creature.x, creature.y);
        if (cell.danger > 0) {
          creature.energy -= cell.danger;
          creature.recordEvent(`Took ${cell.danger.toFixed(1)} hazard damage at (${creature.x},${creature.y})`);
          if (creature.energy <= 0) {
            creature.energy = 0;
            this.handleDeath(creature, 'hazard');
          }
        }
      }

      // Consciousness check
      if (creature.alive) {
        const wakeReason = this.checkWake(creature);
        if (wakeReason) {
          this.consciousness.tryWake(creature, this.world, alive, this.tick, wakeReason);
        }
      }
    }

    // 3. Reproduction check
    const canReproduce = this.creatures.filter(c => c.alive && c.canReproduce());
    for (const parent of canReproduce) {
      this.reproduce(parent);
    }

    // 4. Clean up dead creatures (keep in list for history but mark)
    // Remove long-dead creatures to prevent memory bloat
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
    if (livingCount < 3) {
      for (let i = livingCount; i < 5; i++) {
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

    // Free death wake-up
    if (!creature.thinking) {
      this.consciousness.tryWake(
        creature, this.world, this.creatures.filter(c => c.alive),
        this.tick, 'death',
      );
    }

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
      child.terrainsSeen.add(this.world.cellAt(nx, ny).terrain);
      this.creatures.push(child);
      this.totalBirths++;

      parent.justReproduced = true;
      parent.recordEvent(`Reproduced — offspring #${child.id}`);

      this.emit({ type: 'creature:spawned', creature: child.toState() });
      this.emit({ type: 'creature:reproduced', parentId: parent.id, childId: child.id });
      return; // one offspring per tick
    }
  }

  private checkWake(creature: Creature): WakeReason | null {
    if (!this.consciousness.enabled) return null;
    if (creature.thinking) return null;

    // Crisis: energy below 25%, with 20-tick cooldown
    if (creature.energyRatio < 0.25 && this.tick - creature.lastWakeTick > 20) {
      return 'crisis';
    }

    // Just reproduced (consume flag)
    if (creature.justReproduced) {
      creature.justReproduced = false;
      return 'reproduced';
    }

    // New terrain type
    const cell = this.world.cellAt(creature.x, creature.y);
    if (!creature.terrainsSeen.has(cell.terrain)) {
      return 'new_terrain';
    }

    // Periodic: genome-controlled interval
    if (this.tick - creature.lastWakeTick >= creature.genome.wakeInterval) {
      return 'periodic';
    }

    return null;
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

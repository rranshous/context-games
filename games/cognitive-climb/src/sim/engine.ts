import type { SimEvent } from '../interface/events.js';
import type { SimStats, WorldState } from '../interface/state.js';
import { Creature } from './creature.js';
import { mutateGenome } from './genome.js';
import { reflexTick } from './reflex.js';
import { World, type WorldConfig } from './world.js';

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
  tick: number = 0;
  totalBirths: number = 0;
  totalDeaths: number = 0;

  private emit: (event: SimEvent) => void;
  private config: EngineConfig;

  constructor(emit: (event: SimEvent) => void, config: Partial<EngineConfig> = {}) {
    this.emit = emit;
    this.config = { ...DEFAULT_ENGINE_CONFIG, ...config };
    this.world = new World(this.config.world);
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
    } while (!this.world.isWalkable(x, y) && attempts < 200);

    const creature = new Creature(x, y);
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

      // Reflex action
      const result = reflexTick(creature, this.world, alive);

      if (result.action === 'eat' && result.foodEaten > 0) {
        this.emit({
          type: 'creature:ate',
          id: creature.id,
          foodValue: result.foodEaten,
          x: creature.x,
          y: creature.y,
        });
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
      this.creatures.push(child);
      this.totalBirths++;

      this.emit({ type: 'creature:spawned', creature: child.toState() });
      this.emit({ type: 'creature:reproduced', parentId: parent.id, childId: child.id });
      return; // one offspring per tick
    }
  }

  getStats(): SimStats {
    const alive = this.creatures.filter(c => c.alive);
    return {
      tick: this.tick,
      creatureCount: alive.length,
      totalBirths: this.totalBirths,
      totalDeaths: this.totalDeaths,
      avgEnergy: alive.length > 0
        ? Math.round(alive.reduce((s, c) => s + c.energy, 0) / alive.length * 10) / 10
        : 0,
      maxGeneration: alive.length > 0
        ? Math.max(...alive.map(c => c.generation))
        : 0,
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

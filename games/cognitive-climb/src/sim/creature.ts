import type { GenomeState, CreatureState } from '../interface/state.js';
import type { Rule } from './rules.js';
import { randomGenome } from './genome.js';

let nextId = 1;

export class Creature {
  readonly id: number;
  x: number;
  y: number;
  energy: number;
  maxEnergy: number;
  age: number = 0;
  generation: number;
  genome: GenomeState;
  parentId: number | null;
  alive: boolean = true;

  /** Persistent memory dict (like exp 10's mem) */
  mem: Record<string, unknown> = {};

  /** Behavioral rules created by consciousness (max 5) */
  rules: Rule[] = [];

  /** Ticks since last ate — for hunger urgency */
  ticksSinceAte: number = 0;

  /** Movement accumulator for fractional speed */
  moveAccumulator: number = 0;

  // ── Consciousness tracking ─────────────────────────────
  /** True while an API call is in-flight */
  thinking: boolean = false;
  /** Tick when consciousness last fired (staggered by id) */
  lastWakeTick: number;
  /** Set after reproduction, consumed by wake check */
  justReproduced: boolean = false;
  /** Terrain types this creature has visited */
  terrainsSeen: Set<string> = new Set();
  /** Recent events for consciousness context (capped buffer) */
  recentEvents: string[] = [];

  private static MAX_RECENT_EVENTS = 15;

  constructor(
    x: number,
    y: number,
    genome?: GenomeState,
    parentId?: number,
    generation?: number,
  ) {
    this.id = nextId++;
    this.x = x;
    this.y = y;
    this.genome = genome ?? randomGenome();
    this.parentId = parentId ?? null;
    this.generation = generation ?? 0;

    // max energy scales with size
    this.maxEnergy = 50 + this.genome.size * 30;
    this.energy = this.maxEnergy * 0.6; // start at 60%

    // Stagger periodic wake-ups so creatures don't all wake on the same tick
    this.lastWakeTick = -(this.id % Math.round(this.genome.wakeInterval));
  }

  /** Record an event for consciousness context (capped circular buffer) */
  recordEvent(event: string): void {
    this.recentEvents.push(event);
    if (this.recentEvents.length > Creature.MAX_RECENT_EVENTS) {
      this.recentEvents.shift();
    }
  }

  /** Energy cost per tick from just existing */
  get baseBurnRate(): number {
    // bigger + faster = more expensive
    return 0.3 * this.genome.size * (0.5 + this.genome.speed * 0.5) / this.genome.metabolism;
  }

  get moveCost(): number {
    return 0.5 * this.genome.size / this.genome.metabolism;
  }

  get energyRatio(): number {
    return this.energy / this.maxEnergy;
  }

  burnBaseEnergy(): void {
    this.energy -= this.baseBurnRate;
    this.age++;
    this.ticksSinceAte++;
    if (this.energy <= 0) {
      this.energy = 0;
      this.alive = false;
    }
  }

  feed(foodValue: number): number {
    const gained = foodValue * 5 * this.genome.metabolism;
    this.energy = Math.min(this.maxEnergy, this.energy + gained);
    this.ticksSinceAte = 0;
    return gained;
  }

  canReproduce(): boolean {
    return this.energy > this.maxEnergy * 0.7 && this.age > 30;
  }

  payReproductionCost(): void {
    this.energy *= 0.4; // reproduction costs 60% of current energy
  }

  toState(): CreatureState {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
      energy: Math.round(this.energy * 10) / 10,
      maxEnergy: Math.round(this.maxEnergy * 10) / 10,
      age: this.age,
      generation: this.generation,
      genome: this.genome,
      parentId: this.parentId,
      thinking: this.thinking || undefined,
      rules: this.rules.length > 0 ? this.rules : undefined,
    };
  }
}

import type { CreatureState, SimStats } from '../interface/state.js';

// ── Types ───────────────────────────────────────────────

export interface StatsSnapshot {
  tick: number;
  alive: number;
  totalBirths: number;
  totalDeaths: number;
  avgEnergy: number;
  maxGeneration: number;
  avgTraits: { speed: number; senseRange: number; size: number; metabolism: number; diet: number } | null;
  variantCount: number;
  dominantVariantPct: number;
  season: string;
}

export interface Milestone {
  tick: number;
  text: string;
}

// ── Stats History Store ─────────────────────────────────

const MAX_SNAPSHOTS = 3000;

export class StatsHistoryStore {
  private snapshots: StatsSnapshot[] = [];
  readonly milestones: Milestone[] = [];

  record(stats: SimStats, creatures: CreatureState[]): void {
    // Compute variant distribution
    const variantMap = new Map<number, number>();
    for (const c of creatures) {
      const len = c.embodiment.on_tick.length;
      variantMap.set(len, (variantMap.get(len) ?? 0) + 1);
    }
    let dominantCount = 0;
    for (const count of variantMap.values()) {
      if (count > dominantCount) dominantCount = count;
    }

    this.snapshots.push({
      tick: stats.tick,
      alive: stats.creatureCount,
      totalBirths: stats.totalBirths,
      totalDeaths: stats.totalDeaths,
      avgEnergy: stats.avgEnergy,
      maxGeneration: stats.maxGeneration,
      avgTraits: stats.avgTraits ? { ...stats.avgTraits } : null,
      variantCount: variantMap.size,
      dominantVariantPct: creatures.length > 0 ? Math.round(dominantCount / creatures.length * 100) : 0,
      season: stats.season ?? 'spring',
    });

    if (this.snapshots.length > MAX_SNAPSHOTS) {
      this.snapshots.shift();
    }
  }

  addMilestone(tick: number, text: string): void {
    this.milestones.push({ tick, text });
  }

  getHistory(): StatsSnapshot[] {
    return this.snapshots;
  }

  /** Return evenly-sampled subset of snapshots for charts/AI context */
  getSampledHistory(maxPoints: number): StatsSnapshot[] {
    if (this.snapshots.length <= maxPoints) return [...this.snapshots];
    const step = (this.snapshots.length - 1) / (maxPoints - 1);
    const result: StatsSnapshot[] = [];
    for (let i = 0; i < maxPoints; i++) {
      result.push(this.snapshots[Math.round(i * step)]);
    }
    return result;
  }

  getLatest(): StatsSnapshot | null {
    return this.snapshots.length > 0 ? this.snapshots[this.snapshots.length - 1] : null;
  }

  size(): number {
    return this.snapshots.length;
  }
}

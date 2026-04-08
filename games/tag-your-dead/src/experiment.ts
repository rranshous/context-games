// ── A/B Experiment: Reflex Layer ON vs OFF ──
//
// Design:
//   All 5 AI cars reflect normally (Claude rewrites on_tick after death).
//   The ONLY difference: some cars have reflex probes feeding into the
//   tendency softmax (experimental group), others don't (control group).
//
//   Hypothesis: the learned probe bias helps Claude's reflection produce
//   better strategies faster.
//
// Assignment:
//   Deterministic by car name. 2 cars get reflex, 3 are controls.
//   Viper + Ghost = reflex (the two most complex evolvers in prior runs).
//   Bruiser + Rattler + Dust Devil = control.
//   This is intentionally NOT random — we want the strongest evolvers
//   in the experimental group to maximize signal. If probes don't help
//   even the best evolvers, they don't help anyone.
//
// Metrics tracked per life:
//   - survivalSeconds: how long they lived
//   - scorePerSecond: score gained / seconds alive
//   - timeAsIt: seconds spent as IT
//   - tagShedTime: avg seconds from becoming IT to passing it
//   - obstacleCollisions: total obstacle hits
//   - boostEfficiency: effectiveBoosts / boostCount
//   - onTickLength: code size at death (tracks evolution)

import { ExperimentGroup, ExperimentLifeRecord, ExperimentSummary, LifeResult } from './types.js';

// ── Group Assignment ──

const REFLEX_CARS = new Set(['viper', 'ghost']);

export function getExperimentGroup(carId: string): ExperimentGroup {
  return REFLEX_CARS.has(carId) ? 'reflex' : 'control';
}

export function isReflexEnabled(carId: string): boolean {
  return REFLEX_CARS.has(carId);
}

// ── Experiment Log ──

export class ExperimentLog {
  private records: ExperimentLifeRecord[] = [];
  private initialCodeSizes: Map<string, number> = new Map();

  /** Record the starting code size for a car (call at game start). */
  recordInitialCodeSize(carId: string, codeLength: number): void {
    if (!this.initialCodeSizes.has(carId)) {
      this.initialCodeSizes.set(carId, codeLength);
    }
  }

  /** Record a death. */
  recordLife(
    carId: string,
    carName: string,
    life: LifeResult,
    onTickLength: number,
    gameTime: number,
  ): void {
    const record: ExperimentLifeRecord = {
      carId,
      carName,
      group: getExperimentGroup(carId),
      lifeIndex: this.records.filter(r => r.carId === carId).length,
      life,
      onTickLength,
      gameTime,
    };
    this.records.push(record);

    // Log individual death
    const avgShed = life.tagShedTimes.length > 0
      ? (life.tagShedTimes.reduce((a, b) => a + b, 0) / life.tagShedTimes.length).toFixed(1)
      : 'n/a';
    const boostEff = life.boostCount > 0
      ? ((life.effectiveBoosts / life.boostCount) * 100).toFixed(0) + '%'
      : 'n/a';

    console.log(
      `[EXPERIMENT] ${record.group.toUpperCase()} ${carName} life #${record.lifeIndex} | ` +
      `survived=${life.survivedSeconds.toFixed(1)}s | ` +
      `score/s=${life.scorePerSecond.toFixed(2)} | ` +
      `itTime=${life.timeAsIt.toFixed(1)}s | ` +
      `tagShed=${avgShed}s | ` +
      `obstacles=${life.obstacleCollisions} | ` +
      `boostEff=${boostEff} | ` +
      `code=${onTickLength}chars`
    );
  }

  /** Get summary for one group. */
  summarizeGroup(group: ExperimentGroup): ExperimentSummary | null {
    const groupRecords = this.records.filter(r => r.group === group);
    if (groupRecords.length === 0) return null;

    const carIds = [...new Set(groupRecords.map(r => r.carId))];
    const lives = groupRecords.map(r => r.life);

    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

    const allTagSheds = lives.flatMap(l => l.tagShedTimes);
    const allBoostCounts = lives.map(l => l.boostCount);
    const allEffective = lives.map(l => l.effectiveBoosts);
    const totalBoosts = allBoostCounts.reduce((a, b) => a + b, 0);
    const totalEffective = allEffective.reduce((a, b) => a + b, 0);

    // Code growth: latest code size / initial code size, averaged per car
    const growths: number[] = [];
    for (const carId of carIds) {
      const initial = this.initialCodeSizes.get(carId) ?? 1;
      const carRecords = groupRecords.filter(r => r.carId === carId);
      const latest = carRecords[carRecords.length - 1]?.onTickLength ?? initial;
      growths.push(latest / initial);
    }

    return {
      group,
      carIds,
      lives: groupRecords.length,
      avgSurvival: avg(lives.map(l => l.survivedSeconds)),
      avgScorePerSecond: avg(lives.map(l => l.scorePerSecond)),
      avgTimeAsIt: avg(lives.map(l => l.timeAsIt)),
      avgTagShedTime: avg(allTagSheds),
      avgObstacleCollisions: avg(lives.map(l => l.obstacleCollisions)),
      avgBoostEfficiency: totalBoosts > 0 ? totalEffective / totalBoosts : 0,
      avgCodeGrowth: avg(growths),
    };
  }

  /** Print a full comparison table to console. */
  printComparison(): void {
    const reflex = this.summarizeGroup('reflex');
    const control = this.summarizeGroup('control');

    if (!reflex || !control) {
      console.log('[EXPERIMENT] Not enough data yet for comparison.');
      return;
    }

    const fmt = (n: number, d: number = 2) => n.toFixed(d);
    const pct = (n: number) => (n * 100).toFixed(0) + '%';

    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║           REFLEX A/B EXPERIMENT — COMPARISON                ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log(`║ Metric                │ REFLEX (n=${reflex.lives})     │ CONTROL (n=${control.lives})    ║`);
    console.log('╠───────────────────────┼──────────────────┼──────────────────╣');
    console.log(`║ Cars                  │ ${reflex.carIds.join(', ').padEnd(16)} │ ${control.carIds.join(', ').padEnd(16)} ║`);
    console.log(`║ Avg survival (s)      │ ${fmt(reflex.avgSurvival).padEnd(16)} │ ${fmt(control.avgSurvival).padEnd(16)} ║`);
    console.log(`║ Avg score/s           │ ${fmt(reflex.avgScorePerSecond).padEnd(16)} │ ${fmt(control.avgScorePerSecond).padEnd(16)} ║`);
    console.log(`║ Avg time as IT (s)    │ ${fmt(reflex.avgTimeAsIt).padEnd(16)} │ ${fmt(control.avgTimeAsIt).padEnd(16)} ║`);
    console.log(`║ Avg tag shed (s)      │ ${fmt(reflex.avgTagShedTime).padEnd(16)} │ ${fmt(control.avgTagShedTime).padEnd(16)} ║`);
    console.log(`║ Avg obstacle hits     │ ${fmt(reflex.avgObstacleCollisions, 1).padEnd(16)} │ ${fmt(control.avgObstacleCollisions, 1).padEnd(16)} ║`);
    console.log(`║ Boost efficiency      │ ${pct(reflex.avgBoostEfficiency).padEnd(16)} │ ${pct(control.avgBoostEfficiency).padEnd(16)} ║`);
    console.log(`║ Avg code growth       │ ${fmt(reflex.avgCodeGrowth, 1).padEnd(16)}× │ ${fmt(control.avgCodeGrowth, 1).padEnd(16)}× ║`);
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    // Delta analysis
    const delta = (label: string, r: number, c: number, higherIsBetter: boolean) => {
      const diff = r - c;
      const pctDiff = c !== 0 ? ((diff / Math.abs(c)) * 100).toFixed(0) : 'n/a';
      const better = higherIsBetter ? diff > 0 : diff < 0;
      const arrow = better ? '▲' : diff === 0 ? '─' : '▼';
      console.log(`  ${arrow} ${label}: reflex ${higherIsBetter ? (diff > 0 ? 'better' : 'worse') : (diff < 0 ? 'better' : 'worse')} by ${pctDiff}%`);
    };

    console.log('[EXPERIMENT] Delta analysis (reflex vs control):');
    delta('Survival', reflex.avgSurvival, control.avgSurvival, true);
    delta('Score/s', reflex.avgScorePerSecond, control.avgScorePerSecond, true);
    delta('Time as IT', reflex.avgTimeAsIt, control.avgTimeAsIt, false);
    delta('Tag shed speed', reflex.avgTagShedTime, control.avgTagShedTime, false);
    delta('Obstacle hits', reflex.avgObstacleCollisions, control.avgObstacleCollisions, false);
    delta('Boost efficiency', reflex.avgBoostEfficiency, control.avgBoostEfficiency, true);
    delta('Code growth', reflex.avgCodeGrowth, control.avgCodeGrowth, true);
    console.log('');
  }

  /** Get all records (for external analysis). */
  getAllRecords(): ExperimentLifeRecord[] {
    return [...this.records];
  }

  /** Get record count per group. */
  getCounts(): { reflex: number; control: number } {
    return {
      reflex: this.records.filter(r => r.group === 'reflex').length,
      control: this.records.filter(r => r.group === 'control').length,
    };
  }
}

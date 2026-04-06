// ── Tick-Level Reward Signal ──
// Composes a continuous reward from moment-to-moment game events.
// Fed to the TD learner every tick. Most ticks produce tiny rewards;
// kill/death ticks produce large spikes.
//
// Design: rewards should be DENSE (something nonzero most ticks) so the
// TD learner has gradient signal frequently. Sparse rewards (only on
// kills) would converge too slowly for online learning.

import { Car } from '../car';

export interface RewardSnapshot {
  hp: number;
  score: number;
  damageDealt: number;
  kills: number;
  alive: boolean;
  isIt: boolean;
}

export function captureRewardSnapshot(car: Car): RewardSnapshot {
  return {
    hp: car.hp,
    score: car.score,
    damageDealt: car.damageDealt,
    kills: car.kills,
    alive: car.alive,
    isIt: car.isIt,
  };
}

/** Compute the reward delta between two consecutive snapshots. */
export function computeReward(prev: RewardSnapshot, curr: RewardSnapshot): number {
  let r = 0;

  // Survival: small positive per tick alive
  if (curr.alive) r += 0.001;

  // Damage dealt this tick (delta of cumulative)
  const dmgDelta = curr.damageDealt - prev.damageDealt;
  if (dmgDelta > 0) r += dmgDelta * 0.005;

  // Kill this tick (delta of cumulative)
  const killDelta = curr.kills - prev.kills;
  if (killDelta > 0) r += killDelta * 1.0;

  // HP lost this tick
  const hpLost = prev.hp - curr.hp;
  if (hpLost > 0) r -= hpLost * 0.003;

  // Death this tick
  if (prev.alive && !curr.alive) r -= 1.0;

  // Gaining IT tag (risky — 3x damage but timer pressure)
  if (!prev.isIt && curr.isIt) r -= 0.1;

  // Losing IT tag (good — you tagged someone)
  if (prev.isIt && !curr.isIt && curr.alive) r += 0.3;

  return r;
}

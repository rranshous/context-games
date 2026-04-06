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

  // ── Session 10 rebalance ──
  // First version had +0.001/tick survival reward, which made passive spinning
  // (hard_turn_right 100%) the optimal strategy. Cars that spin in circles
  // never take damage and accumulate survival reward faster than aggressive
  // cars accumulate damage-dealt reward. The fix: remove passive survival
  // reward entirely. Reward comes ONLY from dealing damage, getting kills,
  // and passing the IT tag. You have to engage to earn reward.

  // Damage dealt this tick — primary reward signal for aggression
  const dmgDelta = curr.damageDealt - prev.damageDealt;
  if (dmgDelta > 0) r += dmgDelta * 0.01;

  // Kill — big spike
  const killDelta = curr.kills - prev.kills;
  if (killDelta > 0) r += killDelta * 2.0;

  // HP lost this tick — mild negative to prefer dealing damage over trading
  const hpLost = prev.hp - curr.hp;
  if (hpLost > 0) r -= hpLost * 0.002;

  // Death — moderate negative (not huge — dying is part of the game)
  if (prev.alive && !curr.alive) r -= 0.5;

  // Score gain this tick — aligns with the game's own scoring
  const scoreDelta = curr.score - prev.score;
  if (scoreDelta > 0) r += scoreDelta * 0.002;

  // Losing IT tag to someone else (you tagged them — good!)
  if (prev.isIt && !curr.isIt && curr.alive) r += 0.5;

  return r;
}

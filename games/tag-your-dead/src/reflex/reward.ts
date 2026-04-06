// ── Tick-Level Reward Signal ──
//
// Iteration 3. Tried:
//   v1: hand-shaped (6 components) → spinning was optimal (passive survival too dense)
//   v2: raw score delta → spinning still optimal (game score includes +1/sec survival)
//
// The game's scoring was designed for human players where survival is an
// achievement. For an RL reward signal, we need to reward what you DO,
// not what you ARE (alive). Solution: use score delta but subtract the
// passive baseline that any alive car earns regardless of action.
//
// reward = (score_delta) - (passive_baseline_per_tick)
//
// This means a car that just sits still earns ~0 reward. A car that deals
// damage earns positive. A car that dies earns negative (score halved).
// The game's own balance between damage/kills/survival is preserved for
// everything EXCEPT the free survival drip.

import { Car } from '../car';
import { CONFIG } from '../config';

export interface RewardSnapshot {
  score: number;
}

export function captureRewardSnapshot(car: Car): RewardSnapshot {
  return { score: car.score };
}

// Passive score per tick: CONFIG.SCORE.PER_SECOND / assumed 60fps
const PASSIVE_PER_TICK = CONFIG.SCORE.PER_SECOND / 60;

/** Reward = score delta minus passive baseline. */
export function computeReward(prev: RewardSnapshot, curr: RewardSnapshot): number {
  const delta = curr.score - prev.score;
  return delta - PASSIVE_PER_TICK;
}

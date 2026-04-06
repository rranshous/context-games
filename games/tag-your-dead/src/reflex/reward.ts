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

export interface RewardSnapshot {
  score: number;
}

export function captureRewardSnapshot(car: Car): RewardSnapshot {
  return { score: car.score };
}

/** Reward = score delta. That's it. The game's own scoring IS the reward.
 *  With the tendency system, the probes are a gentle lean — not the entire
 *  behavior. The on_tick code carries the strategy. If the body's lean
 *  helps what the driver is doing, score goes up. */
export function computeReward(prev: RewardSnapshot, curr: RewardSnapshot): number {
  return curr.score - prev.score;
}

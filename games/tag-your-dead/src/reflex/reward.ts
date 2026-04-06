// ── Tick-Level Reward Signal ──
// Uses the game's own score delta as the reward. No hand-designed reward
// shaping — the game designer already balanced survival (+1/sec), damage
// (+0.5/hit), kills (+50), and death penalty (score halved). We trust
// that balance instead of second-guessing it with ML-specific weights.
//
// This is the same principle as using natural language for features
// instead of hand-designed numeric vectors: lean on existing design work
// rather than re-engineering it for the ML pipeline.

import { Car } from '../car';

export interface RewardSnapshot {
  score: number;
}

export function captureRewardSnapshot(car: Car): RewardSnapshot {
  return {
    score: car.score,
  };
}

/** Reward = score delta. That's it. */
export function computeReward(prev: RewardSnapshot, curr: RewardSnapshot): number {
  return curr.score - prev.score;
}

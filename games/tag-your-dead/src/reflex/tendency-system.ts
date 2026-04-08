// ── Tendency System ──
// Every tick, on_tick code registers named tendencies with magnitudes
// (e.g., me.ram_nearest(0.8)). The accumulator softmax-composes all
// active tendencies into a net steer/accel output.
//
// Every tick:
//   1. Each tendency fires and produces a directional vector (steer, accel)
//   2. Each tendency has a magnitude from on_tick code (me.ram_nearest(0.8))
//   3. Softmax across all tendencies → each gets a share of the total
//   4. Net steer = sum(share_i * direction_i.steer)
//   5. Net accel = sum(share_i * direction_i.accel)
//   6. Apply to car controls
//
// The softmax makes the system ordinal: only relative proportions matter.
// (0.8, 0.2, 0.4) and (0.4, 0.1, 0.2) produce identical behavior.

import { MeAPI, WorldAPI } from '../soma';
import { TENDENCY_DEFS, TENDENCY_NAMES, TENDENCY_COUNT, TendencyVector } from './actions';

/** Accumulated tendency magnitudes for one tick. */
export class TendencyAccumulator {
  /** Magnitudes from on_tick calls (authored). */
  onTickMagnitudes: Float32Array;

  constructor() {
    this.onTickMagnitudes = new Float32Array(TENDENCY_COUNT);
  }

  /** Reset for a new tick. */
  clear(): void {
    this.onTickMagnitudes.fill(0);
  }

  /** Called by the on_tick API: me.ram_nearest(0.8) → setOnTick('ram_nearest', 0.8). */
  setOnTick(name: string, magnitude: number): void {
    const idx = TENDENCY_NAMES.indexOf(name);
    if (idx < 0) return;
    this.onTickMagnitudes[idx] = Math.max(0, Math.min(1, magnitude));
  }

  /** Compose all tendencies via softmax → net (steer, accel).
   *  Returns the clamped controls to apply to the car. */
  compose(me: MeAPI, world: WorldAPI): { steer: number; accel: number } {
    const totals = this.onTickMagnitudes;

    // Compute directions + filter by availability
    const directions: (TendencyVector | null)[] = [];
    const effective = new Float32Array(TENDENCY_COUNT);
    for (let i = 0; i < TENDENCY_COUNT; i++) {
      if (totals[i] < 0.001 || !TENDENCY_DEFS[i].available(me, world)) {
        directions.push(null);
        effective[i] = 0;
      } else {
        directions.push(TENDENCY_DEFS[i].direction(me, world));
        effective[i] = totals[i];
      }
    }

    // Softmax: shares = totals / sum(totals)
    let sum = 0;
    for (let i = 0; i < TENDENCY_COUNT; i++) sum += effective[i];
    if (sum < 0.001) {
      // Nothing active — no tendency, no movement
      return { steer: 0, accel: 0 };
    }

    let netSteer = 0;
    let netAccel = 0;
    for (let i = 0; i < TENDENCY_COUNT; i++) {
      if (!directions[i]) continue;
      const share = effective[i] / sum;
      netSteer += share * directions[i]!.steer;
      netAccel += share * directions[i]!.accel;
    }

    return {
      steer: Math.max(-1, Math.min(1, netSteer)),
      accel: Math.max(-1, Math.min(1, netAccel)),
    };
  }
}

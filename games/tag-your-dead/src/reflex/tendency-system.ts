// ── Tendency System ──
// Replaces the argmax action-selection reflex with a fire-all-compose system.
//
// Every tick:
//   1. Each tendency fires and produces a directional vector (steer, accel)
//   2. Each tendency has a magnitude from TWO sources:
//      a. The probe (learned, from TD on reservoir activations)
//      b. The on_tick code (authored, explicit calls like me.ram_nearest(0.8))
//   3. Total magnitude per tendency = probe_mag + ontick_mag
//   4. Softmax across all tendencies → each gets a share of the total
//   5. Net steer = sum(share_i * direction_i.steer)
//   6. Net accel = sum(share_i * direction_i.accel)
//   7. Apply to car controls
//
// The softmax makes the system ordinal: only relative proportions matter.
// (0.8, 0.2, 0.4) and (0.4, 0.1, 0.2) produce identical behavior.

import { MeAPI, WorldAPI } from '../soma';
import { TENDENCY_DEFS, TENDENCY_NAMES, TENDENCY_COUNT, TendencyVector } from './actions';

/** Accumulated tendency magnitudes for one tick. Both layers write here. */
export class TendencyAccumulator {
  /** Magnitudes from tendency probes (learned). */
  probeMagnitudes: Float32Array;
  /** Magnitudes from on_tick calls (authored). */
  onTickMagnitudes: Float32Array;

  constructor() {
    this.probeMagnitudes = new Float32Array(TENDENCY_COUNT);
    this.onTickMagnitudes = new Float32Array(TENDENCY_COUNT);
  }

  /** Reset for a new tick. */
  clear(): void {
    this.probeMagnitudes.fill(0);
    this.onTickMagnitudes.fill(0);
  }

  /** Called by the on_tick API: me.ram_nearest(0.8) → setOnTick('ram_nearest', 0.8). */
  setOnTick(name: string, magnitude: number): void {
    const idx = TENDENCY_NAMES.indexOf(name);
    if (idx < 0) return;
    this.onTickMagnitudes[idx] = Math.max(0, Math.min(1, magnitude));
  }

  /** Set probe magnitudes from the TD learner. */
  setProbes(magnitudes: Float32Array): void {
    for (let i = 0; i < TENDENCY_COUNT && i < magnitudes.length; i++) {
      this.probeMagnitudes[i] = magnitudes[i];
    }
  }

  /** Compose all tendencies via softmax → net (steer, accel).
   *  Returns the clamped controls to apply to the car. */
  compose(me: MeAPI, world: WorldAPI): { steer: number; accel: number } {
    // Total magnitude per tendency = probe + on_tick
    const totals = new Float32Array(TENDENCY_COUNT);
    for (let i = 0; i < TENDENCY_COUNT; i++) {
      totals[i] = this.probeMagnitudes[i] + this.onTickMagnitudes[i];
    }

    // Compute directions + filter by availability
    const directions: (TendencyVector | null)[] = [];
    for (let i = 0; i < TENDENCY_COUNT; i++) {
      if (totals[i] < 0.001 || !TENDENCY_DEFS[i].available(me, world)) {
        directions.push(null);
        totals[i] = 0;
      } else {
        directions.push(TENDENCY_DEFS[i].direction(me, world));
      }
    }

    // Softmax: shares = totals / sum(totals)
    let sum = 0;
    for (let i = 0; i < TENDENCY_COUNT; i++) sum += totals[i];
    if (sum < 0.001) {
      // Nothing active — no tendency, no movement
      return { steer: 0, accel: 0 };
    }

    let netSteer = 0;
    let netAccel = 0;
    for (let i = 0; i < TENDENCY_COUNT; i++) {
      if (!directions[i]) continue;
      const share = totals[i] / sum;
      netSteer += share * directions[i]!.steer;
      netAccel += share * directions[i]!.accel;
    }

    return {
      steer: Math.max(-1, Math.min(1, netSteer)),
      accel: Math.max(-1, Math.min(1, netAccel)),
    };
  }
}

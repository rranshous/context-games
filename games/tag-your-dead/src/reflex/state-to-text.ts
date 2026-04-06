// ── State-to-Text for Demolition Derby ──
// Converts a car's view of the world into a natural language string for the
// reservoir's forward pass.
//
// Session 10b experiment: added ORIENTING CONTEXT — a brief framing sentence
// that tells the model what kind of situation this is. The hypothesis: the
// LLM has strong pre-trained representations for concepts like "demolition
// derby", "ram", "survive", "danger" that would shape the activation space
// toward game-relevant semantic dimensions, potentially making the linear
// probes' job easier.
//
// Previous version (no context): "I am damaged. car close northwest (IT)."
// New version (with context): "Demolition derby. Ram cars to score. Being
//   IT means 3x damage but a death timer. I am damaged. car close..."
//
// Budget: ~60-100 tokens. Slightly longer than before but the context prefix
// is constant (cached by the tokenizer), so incremental cost is minimal.

import { MeAPI, WorldAPI } from '../soma';

function bearing(angle: number): string {
  const a = ((angle * 180 / Math.PI) + 360 + 22.5) % 360;
  const compass = ['east','southeast','south','southwest','west','northwest','north','northeast'];
  return compass[Math.floor(a / 45)];
}

function distBucket(d: number): string {
  if (d < 100) return 'very close';
  if (d < 300) return 'close';
  if (d < 600) return 'medium';
  if (d < 1200) return 'far';
  return 'distant';
}

function hpBucket(hp: number, maxHp: number): string {
  const frac = hp / maxHp;
  if (frac > 0.7) return 'healthy';
  if (frac > 0.4) return 'damaged';
  if (frac > 0.15) return 'critical';
  return 'nearly dead';
}

// ── Orienting context ──
// Constant prefix that grounds the model's activations in game semantics.
// distilgpt2 was trained on web text — it has representations for "demolition
// derby", "ram", "chase", "survive", "danger", "kill" that are richer than
// its representations for "IT" or "car close northwest" in isolation.
const CONTEXT = 'Demolition derby. Ram other cars to score points. Being IT means dealing 3x damage but dying if the timer runs out. ';

/** Generate a single-tick state description (no context prefix, no score). */
function tickSnapshot(me: MeAPI, world: WorldAPI): string {
  const parts: string[] = [];
  parts.push(hpBucket(me.hp, me.maxHp) + '.');
  if (me.isIt) parts.push(`IT, ${Math.round(me.itTimer)}s left.`);
  if (me.speed > 150) parts.push('Fast.');
  else if (me.speed > 60) parts.push('Moving.');
  else parts.push('Slow.');

  const visible = world.otherCars
    .filter(c => c.alive)
    .map(c => ({ c, dist: me.distanceTo(c.x, c.y), angle: me.angleTo(c.x, c.y) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 2);

  if (visible.length === 0) {
    parts.push('No cars visible.');
  } else {
    for (const { c, dist, angle } of visible) {
      const tag = c.isIt ? ' IT' : '';
      const health = c.hp < 30 ? ' weak' : '';
      parts.push(`Car ${distBucket(dist)} ${bearing(angle)}${tag}${health}.`);
    }
  }
  if (me.isBoosting) parts.push('Boosting!');
  return parts.join(' ');
}

/**
 * Rolling history of recent state snapshots. Stored per-car in CarReflex.
 * Each entry is a short tick-level description sampled every N ticks.
 */
export class StateHistory {
  private buffer: string[] = [];
  private maxEntries: number;

  constructor(maxEntries: number = 4) {
    this.maxEntries = maxEntries;
  }

  push(snapshot: string): void {
    this.buffer.push(snapshot);
    if (this.buffer.length > this.maxEntries) this.buffer.shift();
  }

  clear(): void {
    this.buffer = [];
  }

  /** Build the full state-to-text with temporal context.
   *  Format: orienting context + recent history + current state + score. */
  toText(currentSnapshot: string, score: number): string {
    const parts: string[] = [CONTEXT];
    // Recent history (oldest first) with temporal labels
    if (this.buffer.length > 0) {
      const labels = ['Earlier', 'Then', 'Recently', 'Just now'];
      const startIdx = Math.max(0, labels.length - this.buffer.length);
      for (let i = 0; i < this.buffer.length; i++) {
        parts.push(`${labels[startIdx + i]}: ${this.buffer[i]}`);
      }
    }
    parts.push(`Now: ${currentSnapshot}`);
    parts.push(`Score: ${score}.`);
    return parts.join(' ');
  }
}

/** Generate the state-to-text string for the reservoir. If a StateHistory
 *  is provided, includes recent trajectory. Otherwise, single snapshot. */
export function stateToText(me: MeAPI, world: WorldAPI, history?: StateHistory): string {
  const snapshot = tickSnapshot(me, world);
  if (history) {
    return history.toText(snapshot, Math.floor(me.score));
  }
  // Fallback: single snapshot with context + score
  return CONTEXT + snapshot + ` Score: ${Math.floor(me.score)}.`;
}

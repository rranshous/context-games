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

export function stateToText(me: MeAPI, world: WorldAPI): string {
  const parts: string[] = [CONTEXT];

  // Self status
  parts.push(`I am ${hpBucket(me.hp, me.maxHp)}.`);
  if (me.isIt) {
    parts.push(`I am IT, ${Math.round(me.itTimer)}s left — I need to ram someone fast.`);
  }
  if (me.speed > 150) parts.push('Moving fast.');
  else if (me.speed > 60) parts.push('Moving.');
  else parts.push('Slow.');

  // Nearby cars (sorted by distance, top 3)
  const visible = world.otherCars
    .filter(c => c.alive)
    .map(c => ({
      c,
      dist: me.distanceTo(c.x, c.y),
      angle: me.angleTo(c.x, c.y),
    }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 3);

  if (visible.length === 0) {
    parts.push('No other cars in sight.');
  } else {
    for (const { c, dist, angle } of visible) {
      const tag = c.isIt ? ', IT' : '';
      const health = c.hp < 30 ? ', weak' : '';
      parts.push(`Car ${distBucket(dist)} to the ${bearing(angle)}${tag}${health}.`);
    }
  }

  // Boost status
  if (me.isBoosting) parts.push('Boosting!');
  else if (me.boostCooldownFrac >= 1) parts.push('Boost ready.');

  // Score (awareness of own performance)
  parts.push(`Score: ${Math.floor(me.score)}.`);

  return parts.join(' ');
}

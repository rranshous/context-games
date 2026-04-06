// ── State-to-Text for Demolition Derby ──
// Converts a car's view of the world into a short natural language string
// for the reservoir's forward pass. Uses relative bearings and qualitative
// descriptions — the LLM has strong priors for these words.
//
// Budget: ~50-80 tokens. Keeps reservoir latency under 40ms on CPU.

import { MeAPI, WorldAPI, OtherCarAPI } from '../soma';

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

export function stateToText(me: MeAPI, world: WorldAPI): string {
  const parts: string[] = [];

  // Self status
  parts.push(`I am ${hpBucket(me.hp, me.maxHp)}.`);
  if (me.isIt) {
    parts.push(`I am IT, ${Math.round(me.itTimer)}s left.`);
  }
  if (me.speed > 150) parts.push('moving fast.');
  else if (me.speed > 60) parts.push('moving.');
  else parts.push('slow.');

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
    parts.push('no cars visible.');
  } else {
    for (const { c, dist, angle } of visible) {
      const tag = c.isIt ? ' (IT)' : '';
      const health = c.hp < 30 ? ', weak' : '';
      parts.push(`car ${distBucket(dist)} ${bearing(angle)}${tag}${health}.`);
    }
  }

  // Boost status
  if (me.isBoosting) parts.push('boosting!');
  else if (me.boostCooldownFrac >= 1) parts.push('boost ready.');

  return parts.join(' ');
}

// Is the price fair? Pit two units against each other in open ground, the same matter's
// worth of each, and see who's left. A fair price means no unit wins everything: each
// beats some and loses to others, by about as much.
//
//   node tools/duel.mjs [--budget 2000] [--runs 4]
//
// Prints a table: each row's unit against each column's, as the share of its side's
// matter still standing when the fight ends (+ it won, − it lost).

import { RIVAL_UNITS } from '../public/js/levels.js';
import { Sim } from '../public/js/sim.js';
import { price } from '../public/js/spec.js';

const arg = (n, d) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d);
const BUDGET = Number(arg('--budget', 2000)), RUNS = Number(arg('--runs', 4));
const S = (size, health, armor, speed, damage, rate, range, sight, ...abilities) => ({ size, stats: { health, armor, speed, damage, rate, range, sight }, abilities });

export const UNITS = {
  ...Object.fromEntries(Object.entries(RIVAL_UNITS).map(([k, u]) => [k, u])),
  rifle: { name: 'Rifle', aid: 'brackett', spec: S(2, 4, 4, 5, 4, 4, 5, 5) },
  brawler: { name: 'Brawler', aid: 'brackett', spec: S(3, 7, 7, 3, 6, 3, 1, 3) },
  gun: { name: 'Gun', aid: 'brackett', spec: S(3, 3, 2, 2, 7, 2, 8, 5, 'siege', 'blast') },
  biter: { name: 'Biter', aid: 'hollis', spec: S(1, 3, 1, 8, 3, 6, 1, 4) },
  hulk: { name: 'Hulk', aid: 'hollis', spec: S(4, 9, 4, 3, 6, 3, 1, 3, 'regenerate') },
  wasp: { name: 'Wasp', aid: 'hollis', spec: S(2, 3, 1, 7, 4, 5, 3, 6, 'wings') },
};

const LEVEL = { w: 1400, h: 900, deposits: [], seed: 1 };

export function duel(a, b, budget = BUDGET) {
  const sim = new Sim(LEVEL, [{ aid: a.aid, roster: [a] }, { aid: b.aid, roster: [b] }]);
  sim.rocks = [];
  for (const h of sim.hqs) { h.x = -9999; h.y = -9999; h.sight = 0; h.range = 0; }   // no bases: just the two groups
  const groups = [a, b].map((u, side) => {
    const p = sim.sides[side].roster[0].priced, n = Math.max(1, Math.round(budget / p.cost));
    return Array.from({ length: n }, (_, i) => sim.spawn(side, sim.sides[side].roster[0], { x: side ? 900 : 500, y: 450 + (i - n / 2) * 30, r: 0 }));
  });
  for (const side of [0, 1]) sim.command(side, groups[side].map((u) => u.id), { kind: 'fight', x: side ? 400 : 1000, y: 450 });
  let t = 0;
  while (t < 180 && sim.units(0).length && sim.units(1).length) {
    sim.step(1 / 20); t += 1 / 20;
    sim.hqs.forEach((h) => { h.hp = h.maxHp; });
  }
  const left = (side) => sim.units(side).reduce((n, u) => n + (u.young ? 0 : (u.hp / u.maxHp) * u.design.priced.cost), 0);
  const total = (side) => groups[side].length * sim.sides[side].roster[0].priced.cost;
  return left(0) / total(0) - left(1) / total(1);   // + a won, − b won, by how much of its worth was left
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const keys = arg('--units', Object.keys(UNITS).join(',')).split(',');
  console.log(`${''.padEnd(9)}${keys.map((k) => k.slice(0, 6).padStart(7)).join('')}   cost`);
  for (const ka of keys) {
    const row = keys.map((kb) => {
      if (ka === kb) return '      ·';
      let sum = 0;
      for (let r = 0; r < RUNS; r++) sum += duel(UNITS[ka], UNITS[kb]);
      const v = Math.round((sum / RUNS) * 100);
      return `${v > 0 ? '+' : ''}${v}`.padStart(7);
    });
    const avg = row.filter((x) => x.trim() !== '·').reduce((n, x) => n + Number(x), 0) / (keys.length - 1);
    console.log(`${ka.padEnd(9)}${row.join('')}   ${price(UNITS[ka].spec, UNITS[ka].aid).cost}  avg ${avg > 0 ? '+' : ''}${avg.toFixed(0)}`);
  }
}

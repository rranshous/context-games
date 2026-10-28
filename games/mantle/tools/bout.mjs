// Play matches headless: a plain scripted commander against each map's rival, to see that
// the maps can be won and get harder. The commander here is no genius: it takes its half of
// the deposits, builds down its roster, and attacks once it has a big enough army.
//
//   node tools/bout.mjs [--aid brackett] [--level ford] [--runs 5] [--roster mine]
//
// --roster mine plays the kept designs in data/designs for that aid; otherwise a plain
// roster of rival units from that aid's lab.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { LEVELS, RIVAL_UNITS } from '../public/js/levels.js';
import { Sim } from '../public/js/sim.js';
import { Rival } from '../public/js/rival.js';

const arg = (n, d) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d);
const aid = arg('--aid', 'brackett'), runs = Number(arg('--runs', 5)), only = arg('--level');
const DT = 1 / 20, LIMIT = 20 * 60;

const PLAIN = {
  brackett: ['picket', 'rook', 'mortar', 'bastion'],
  hollis: ['skitter', 'spitter', 'delver', 'moth'],
};
let roster;
if (arg('--roster') === 'mine') {
  const dir = join(import.meta.dirname, '..', 'data', 'designs');
  roster = readdirSync(dir).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8'))).filter((d) => d.aid === aid).slice(0, 5);
} else roster = PLAIN[aid].map((k) => RIVAL_UNITS[k]);

function commander(sim) {
  const hq = sim.hqs[0], foe = sim.hqs[1];
  let clock = 0, next = 0, attackAt = 10;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  return (dt) => {
    if ((clock += dt) < 1) return;
    clock = 0;
    if (sim.produce(0, next % sim.sides[0].roster.length)) next++;
    const mine = sim.units(0);
    const ours = [...sim.deposits].sort((a, b) => dist(a, hq) - dist(b, hq)).slice(0, Math.ceil(sim.deposits.length / 2));
    ours.forEach((d, i) => { const u = mine[i]; if (u && u.order.kind === 'idle' && dist(u, d) > 60) sim.command(0, [u.id], { kind: 'fight', x: d.x, y: d.y }); });
    const intruder = sim.units(1).find((u) => dist(u, hq) < 450);
    if (intruder) return sim.command(0, mine.map((u) => u.id), { kind: 'fight', x: intruder.x, y: intruder.y });
    const army = mine.reduce((n, u) => n + (u.young ? 0 : u.design.priced.supply), 0);
    if (army >= attackAt) { sim.command(0, mine.map((u) => u.id), { kind: 'fight', x: foe.x, y: foe.y }); attackAt += 4; }
  };
}

for (const level of LEVELS.filter((l) => !only || l.id === only)) {
  const results = [];
  for (let run = 0; run < runs; run++) {
    const rivalRoster = level.units.map((k) => RIVAL_UNITS[k]);
    const sim = new Sim(level, [{ aid, roster }, { aid: 'rival', roster: rivalRoster, income: level.rival.income }]);
    const rival = new Rival(sim, 1, level.rival, level.units);
    const me = commander(sim);
    while (sim.winner == null && sim.t < LIMIT) { me(DT); rival.tick(DT); sim.step(DT); }
    results.push({ winner: sim.winner, t: Math.round(sim.t), stats: sim.stats });
  }
  const won = results.filter((r) => r.winner === 0);
  console.log(`${level.name.padEnd(15)} won ${won.length}/${runs}  ${results.map((r) => `${r.winner === 0 ? 'W' : r.winner === 1 ? 'L' : '-'}${Math.floor(r.t / 60)}:${String(r.t % 60).padStart(2, '0')}`).join(' ')}  made/lost ${results.map((r) => `${r.stats[0].made}/${r.stats[0].lost} v ${r.stats[1].made}/${r.stats[1].lost}`).join(', ')}`);
}

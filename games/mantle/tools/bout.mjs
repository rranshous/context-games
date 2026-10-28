// Play matches headless: a plain scripted commander against each map's rival, to see that
// the maps can be won and get harder. The commander here is no genius: it takes its half of
// the deposits, builds down its roster, and attacks once it has a big enough army.
//
//   node tools/bout.mjs [--aid brackett] [--level ford] [--runs 5] [--roster mine]
//
// Rosters: --roster player (the default) is what a person might design with that aid: a
// line unit, a heavy, something with reach, a support, a fast one. --roster plain is
// rival units from that aid's lab; --roster mine is the kept designs in data/designs.
//
// (A "smarter" commander, one that held each deposit with a single unit and waited to
// outnumber the rival, lost nearly everything by feeding units in one at a time; see the
// journal. The plain one is the measuring stick.)

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { LEVELS, RIVAL_UNITS } from '../public/js/levels.js';
import { Sim } from '../public/js/sim.js';
import { Rival } from '../public/js/rival.js';

const arg = (n, d) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d);
const aid = arg('--aid', 'brackett'), runs = Number(arg('--runs', 5)), only = arg('--level');
const DT = 1 / 20, LIMIT = 20 * 60;

const S = (size, health, armor, speed, damage, rate, range, sight, ...abilities) => ({ size, stats: { health, armor, speed, damage, rate, range, sight }, abilities });
const PLAYER = {
  brackett: { Rifle: S(2, 4, 4, 5, 4, 4, 5, 5), Brawler: S(3, 7, 7, 3, 6, 3, 1, 3), Gun: S(3, 3, 2, 2, 7, 2, 8, 5, 'siege', 'blast'), Fixer: S(2, 4, 3, 5, 1, 1, 1, 5, 'rotors', 'repair'), Runner: S(1, 2, 2, 9, 2, 4, 3, 8) },
  hollis: { Biter: S(1, 3, 1, 8, 3, 6, 1, 4), Spitter: S(2, 4, 1, 4, 4, 4, 6, 5, 'venom'), Hulk: S(4, 9, 4, 3, 6, 3, 1, 3, 'regenerate'), Wasp: S(2, 3, 1, 7, 4, 5, 3, 6, 'wings'), Nurse: S(2, 4, 2, 4, 1, 1, 1, 4, 'mend') },
};
const PLAIN = {
  brackett: ['picket', 'rook', 'mortar', 'bastion'],
  hollis: ['skitter', 'spitter', 'delver', 'moth'],
};
let roster;
const which = arg('--roster', 'player');
if (which === 'player') roster = Object.entries(PLAYER[aid]).map(([name, spec]) => ({ name, spec, aid }));
else if (which === 'mine') {
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
    sim.setRally(0, sim.hqs[0].x + 110, sim.hqs[0].y - 110);
    const me = commander(sim);
    let next = 0;
    while (sim.winner == null && sim.t < LIMIT) {
      me(DT); rival.tick(DT); sim.step(DT);
      if (process.argv.includes('--trace') && sim.t >= next) {
        next += 30;
        const sum = (side) => sim.units(side).map((u) => `${u.name[0]}${u.order.kind[0]}${Math.round(100 * u.hp / u.maxHp)}`).join(' ');
        console.log(`  ${Math.round(sim.t)}s hq ${sim.hqs.map((h) => Math.round(h.hp))} matter ${sim.sides.map((x) => Math.round(x.matter))} dep ${sim.deposits.map((d) => d.owner ?? '-').join('')}\n    me: ${sum(0)}\n    them: ${sum(1)}`);
      }
    }
    results.push({ winner: sim.winner, t: Math.round(sim.t), stats: sim.stats });
  }
  const won = results.filter((r) => r.winner === 0);
  console.log(`${level.name.padEnd(15)} won ${won.length}/${runs}  ${results.map((r) => `${r.winner === 0 ? 'W' : r.winner === 1 ? 'L' : '-'}${Math.floor(r.t / 60)}:${String(r.t % 60).padStart(2, '0')}`).join(' ')}  made/lost ${results.map((r) => `${r.stats[0].made}/${r.stats[0].lost} v ${r.stats[1].made}/${r.stats[1].lost}`).join(', ')}`);
}

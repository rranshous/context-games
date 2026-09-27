// bench.ts — run a world headless and fast with scripted kings, for balance work.
//
//   npm run bench -- [days=720] [seed=4242]
//
// Prints realm standings every 60 days and the chronicle tail at the end.

import { World } from './world.js';
import { Court } from './court.js';

process.env.SCRIBE_BRAIN = 'script'; // the bench loop is synchronous; no minds here
const days = parseInt(process.argv[2] ?? '720', 10);
const seed = parseInt(process.argv[3] ?? '4242', 10);

let t = performance.now();
const realms = parseInt(process.env.REALMS ?? '6', 10);
const w = new World(seed, 1, { brains: new Array(realms).fill('script'), rebelBrain: 'script' });
w.populate();
console.log(`mapgen+populate ${(performance.now() - t).toFixed(0)}ms, ${w.map.settlements.length} settlements, ${w.realms.length} realms`);
const court = new Court(() => w);

t = performance.now();
let last = t;
for (let d = 1; d <= days; d++) {
  for (let h = 0; h < 24; h++) { w.step(); court.tick(); }
  if (d % 60 === 0 || d === days) {
    const now = performance.now();
    const line = w.realms.map(r => r.alive
      ? `${r.id}:${w.held(r.id)}t/${w.soldiersOf(r.id)}s/${Math.round(r.gold)}g${w.enemiesOf(r.id).length ? '⚔' + w.enemiesOf(r.id).join('') : ''}`
      : `${r.id}:†`).join(' ');
    console.log(`day ${String(d).padStart(5)} ${((now - last) / (Math.min(60, d) * 24)).toFixed(2)}ms/t armies ${w.armies.size} ${line}`);
    last = now;
  }
  if (w.endsAt >= 0) { console.log(`age ended on day ${d}`); break; }
}
console.log('--- chronicle tail');
for (const e of w.chronicle.slice(-(parseInt(process.env.TAIL ?? '30', 10)))) console.log(String(Math.floor(e.tick / 24)).padStart(5), e.text);

const count = (re: RegExp) => w.chronicle.filter(e => re.test(e.text)).length;
console.log('--- tallies (last 600 entries): ' + [
  ['captures', / takes |falls to/], ['surrenders', /yields to the/], ['wars declared', /declares war/], ['peace', /swear peace/], ['deaths', /takes the throne/],
  ['rebellions', /rises in rebellion/], ['mercs', /sellswords/], ['alliances', /swear alliance/], ['calls to arms', /honors its alliance/], ['betrayals', /betrays the alliance/], ['revolts', /rise against/], ['turncoats', /turn their coats/], ['gifts', / sends [0-9,]+ crowns to /], ['desertion', /Desertion bleeds/], ['dry', /runs dry/],
].map(([n, re]) => `${n} ${count(re as RegExp)}`).join(', '));

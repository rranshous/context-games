// Time the sim on a saved world, and fingerprint where it ends up, so a speed-up can be
// checked to change nothing:
//   node dist/bench.mjs <checkpoint.andnow.gz> [ticks, default 200]
// Prints ms/tick every 50 ticks, then the hash of the whole saved world at the end (same
// checkpoint and ticks → same hash, or the change altered the run).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { loadWorld, saveWorld } from './sim/save';

const [file, ticksArg] = process.argv.slice(2);
if (!file) { console.log('usage: node dist/bench.mjs <checkpoint.andnow.gz> [ticks]'); process.exit(1); }
const ticks = Number(ticksArg ?? 200);
const world = loadWorld(gunzipSync(readFileSync(file)));
const t0 = world.t;
console.log(`bench: tick ${t0}, ${world.living().length} alive, ${ticks} ticks`);
let start = performance.now(), lap = start;
for (let k = 1; k <= ticks && !world.result.over; k++) {
  world.tick();
  if (k % 50 === 0) { const now = performance.now(); console.log(`  t${world.t} ${((now - lap) / 50).toFixed(1)} ms/tick · ${world.living().length} alive`); lap = now; }
}
const ms = (performance.now() - start) / (world.t - t0);
const hash = createHash('sha1').update(saveWorld(world, '')).digest('hex').slice(0, 16);
console.log(`${ms.toFixed(1)} ms/tick over ${world.t - t0} ticks · hash ${hash}`);

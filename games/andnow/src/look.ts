// Look at a petri dish: run it and, at each --at tick, write a picture of the plate
// (PNG, each genome its own colour, toxin bands tinted, food yellow, debris grey) and a
// census of the most common genomes, each with which of its cells the IP actually ran
// over the next --watch ticks (* ran, · never ran).
//
// With --frames from:to:step it writes only pictures (frame-<tick>.png), for time-lapses.
//
//   node dist/look.mjs <out-dir> [warriors/amoeba.warrior ...] [--seed 1] [--at 50000,100000] [--watch 400] [--px 4] [--frames a:b:step]
//                      [dish settings: --size --toxin ... see src/sim/dish.ts]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { WALL } from './sim/board';
import { applyDish, armorOf, DISH_DEFAULTS, genomeOf } from './sim/dish';
import { parseWarrior } from './sim/warrior-file';
import { DEBRIS, World } from './sim/world';

const args = process.argv.slice(2);
const val = (k: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : null; };
const valued = new Set(['seed', 'at', 'watch', 'px', 'frames', ...Object.keys(DISH_DEFAULTS)].map((k) => `--${k}`));
const [out, ...files] = args.filter((a, i) => !a.startsWith('--') && !valued.has(args[i - 1]));
if (!files.length) files.push('warriors/amoeba.warrior');
applyDish(val);
const at = (val('at') ?? '50000').split(',').map(Number).sort((a, b) => a - b);
const WATCH = Number(val('watch') ?? 400), PX = Number(val('px') ?? 4);
mkdirSync(out, { recursive: true });

const world = new World(Number(val('seed') ?? 1), files.map((f) => parseWarrior(readFileSync(f, 'utf8'), basename(f, '.warrior'))));

/** A stable colour per genome. */
function hue(g: string): [number, number, number] {
  let h = 2166136261;
  for (let k = 0; k < g.length; k++) h = Math.imul(h ^ g.charCodeAt(k), 16777619);
  const H = ((h >>> 0) % 360) / 60, S = 0.75, L = 0.55 + (((h >>> 9) % 20) - 10) / 100;
  const C = (1 - Math.abs(2 * L - 1)) * S, X = C * (1 - Math.abs((H % 2) - 1)), m = L - C / 2;
  const [r, g2, b] = H < 1 ? [C, X, 0] : H < 2 ? [X, C, 0] : H < 3 ? [0, C, X] : H < 4 ? [0, X, C] : H < 5 ? [X, 0, C] : [C, 0, X];
  return [Math.round((r + m) * 255), Math.round((g2 + m) * 255), Math.round((b + m) * 255)];
}

function png(w: number, h: number, rgb: Uint8Array): Buffer {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) rgb.subarray(y * w * 3, (y + 1) * w * 3).forEach((v, k) => { raw[y * (w * 3 + 1) + 1 + k] = v; });
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const TINT = [[14, 17, 23], [30, 18, 34], [44, 20, 40], [58, 22, 46], [72, 24, 50], [86, 26, 54], [100, 28, 58], [114, 30, 62]];

function picture(t: number, genomes: Map<number, string>, name = `t${t}`) {
  const { w, h } = world, W = w * PX, H = h * PX;
  const rgb = new Uint8Array(W * H * 3);
  const tox = world.board.toxin;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = world.idx(x, y), o = world.owner[i];
    let c: number[];
    if (world.board.terrain[i] === WALL) c = [0, 0, 0];
    else if (o >= 0) c = hue(genomes.get(o) ?? '');
    else if (o === DEBRIS) c = [90, 90, 90];
    else if (world.resource[i]) c = [230, 200, 60];
    else c = TINT[Math.min(TINT.length - 1, tox?.[i] ?? 0)];
    for (let dy = 0; dy < PX; dy++) for (let dx = 0; dx < PX; dx++) {
      const p = ((y * PX + dy) * W + x * PX + dx) * 3;
      // Cell borders: darken the last row/column of each owned cell so bodies read as shapes.
      const edge = o >= 0 && PX >= 3 && (dx === PX - 1 || dy === PX - 1) && world.owner[world.idx(x + (dx === PX - 1 ? 1 : 0), y + (dy === PX - 1 ? 1 : 0))] !== o;
      rgb[p] = edge ? c[0] * 0.4 : c[0]; rgb[p + 1] = edge ? c[1] * 0.4 : c[1]; rgb[p + 2] = edge ? c[2] * 0.4 : c[2];
    }
  }
  writeFileSync(`${out}/${name}.png`, png(W, H, rgb));
}

const frames = val('frames');
if (frames) {
  const [a, b, step] = frames.split(':').map(Number);
  for (let T = a; T <= b && world.living().length; T += step) {
    while (world.t < T && world.living().length) world.tick();
    picture(world.t, new Map(world.living().map((wr) => [wr.id, genomeOf(world, wr.id)])), `frame-${String(world.t).padStart(7, '0')}`);
  }
  console.log(`${out}: frames ${a}–${world.t}`);
  process.exit(0);
}

for (const T of at) {
  while (world.t < T && world.living().length) world.tick();
  const living = world.living();
  const genomes = new Map<number, string>(), counts = new Map<string, number[]>();
  for (const wr of living) { const g = genomeOf(world, wr.id); genomes.set(wr.id, g); (counts.get(g) ?? counts.set(g, []).get(g)!).push(wr.id); }
  picture(world.t, genomes);
  const top = [...counts.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 25);
  // Watch one of each top genome: which cells does its IP run? (relative to its bounding box)
  const ran = new Map<number, Set<string>>();
  for (const [, ids] of top) ran.set(ids[0], new Set());
  const t0 = world.t;
  while (world.t < t0 + WATCH && world.living().length) {
    world.tick();
    for (const [id, set] of ran) {
      const wr = world.warriors[id];
      if (!wr.alive) continue;
      const cells = world.cellsOf(id);
      const x0 = Math.min(...cells.map((c) => c % world.w)), y0 = Math.min(...cells.map((c) => (c / world.w) | 0));
      set.add(`${wr.ipX - x0},${wr.ipY - y0}`);
    }
  }
  const lines = [`t${t0}: ${living.length} alive, ${counts.size} genomes${living.length ? '' : ' (extinct)'}`, ''];
  for (const [g, ids] of top) {
    const set = ran.get(ids[0])!, alive = world.warriors[ids[0]].alive;
    const [r, gg, b] = hue(g);
    lines.push(`${String(ids.length).padStart(4)} ×  armor ${armorOf(world, ids[0])}  #${[r, gg, b].map((v) => v.toString(16).padStart(2, '0')).join('')}${alive ? '' : '  (watched one died)'}`);
    g.split('/').forEach((row, y) => {
      const mask = [...row].map((ch, x) => (ch === ' ' ? ' ' : set.has(`${x},${y}`) ? '*' : '·')).join('');
      lines.push(`      ${row.padEnd(14)}  ${mask}`);
    });
  }
  writeFileSync(`${out}/t${t0}.txt`, lines.join('\n') + '\n');
  console.log(`${out}/t${t0}.png + .txt (${living.length} alive)`);
}

// World-state fingerprints for replay checks (golden replays, Potluck canaries).
import { parseWarrior } from './warrior-file';
import { World } from './world';

export const TICKS = 2000;
export const CHECKPOINT = 50; // also keep the running hash every N ticks, to locate a divergence

function fnv(h: number, v: number): number {
  h ^= v & 0xff; h = Math.imul(h, 16777619);
  h ^= (v >>> 8) & 0xff; h = Math.imul(h, 16777619);
  h ^= (v >>> 16) & 0xff; h = Math.imul(h, 16777619);
  h ^= (v >>> 24) & 0xff; h = Math.imul(h, 16777619);
  return h >>> 0;
}
const fnum = (h: number, x: number) => fnv(fnv(h, Math.floor(x * 1e6)), Math.floor(x * 1e6 / 4294967296));
const fstr = (h: number, s: string) => { for (let i = 0; i < s.length; i++) h = fnv(h, s.charCodeAt(i)); return h; };

/** Fingerprint of everything observable in the world. */
export function stateHash(w: World, h: number): number {
  h = fnv(h, w.t);
  for (let i = 0; i < w.owner.length; i++) { h = fnv(h, w.owner[i]); h = fnv(h, w.code[i]); h = fnv(h, w.resource[i]); }
  for (const x of w.allWarriors()) {
    for (const v of [x.alive ? 1 : 0, x.ipX, x.ipY, x.ox, x.oy, x.dir, x.cellCount, x.executed, x.lastOk ? 1 : 0, x.diedAt ?? -1,
      x.stats.collected, x.stats.bombHits, x.stats.poisonWrites, x.stats.kills, x.leftHomeAt ?? -1,
      x.harmedAt ?? -1]) h = fnv(h, v);
    h = fnum(fnum(fnum(h, x.maxSize), x.speed), x.accum);
    h = fstr(h, x.lastAct + (x.deathReason ?? ''));
    h = fnv(h, x.stack.length);
    for (const v of x.stack) h = fnv(h, v);
  }
  h = fnv(h, w.events.length);
  const e = w.events[w.events.length - 1];
  if (e) h = fstr(h, `${e.t}${e.kind}${e.text}`);
  h = fstr(h, w.result.reason);
  return h;
}

export interface Case { sources: string[]; seed: number }
export interface Replay { name: string; ticks: number; checkpoints: number[]; final: number }

/** Run a case for up to TICKS ticks, folding the state hash every tick. */
export function replay(c: Case, glyphs?: Record<string, number>): Replay {
  const specs = c.sources.map((s) => parseWarrior(s));
  const w = new World(c.seed, specs);
  let h = 2166136261;
  const checkpoints: number[] = [];
  for (let t = 0; t < TICKS && !w.result.over; t++) {
    w.tick();
    h = stateHash(w, h);
    if (w.t % CHECKPOINT === 0) checkpoints.push(h);
    if (glyphs) for (const x of w.allWarriors()) if (x.alive) glyphs[x.lastAct] = (glyphs[x.lastAct] ?? 0) + 1;
  }
  return { name: `${specs.map((s) => s.name).join(' vs ')} @${c.seed}`, ticks: w.t, checkpoints, final: h };
}

// Schedules for the parallel engine (src/par.ts). Browser-safe.
//
// A tick's turns run in a fixed order, and two turns only need that order kept between
// them if they could touch the same thing. So each turn gets a footprint, worked out at
// the start of the tick, that bounds anything it can do:
//   - a body takes at most ⌊accum + speed⌋ steps and moves at most a cell a step, so its
//     box grows by at most that (M);
//   - it reads within M ± (sight + 16), the scan window; a child lands within a body-width of M;
//   - any body whose box comes within bite range (M ± bombRange) may lose cells anywhere
//     (a bite can cut it in two), so its whole box is in, and the body itself;
//   - and whoever last harmed me (my death pays them, wherever they are).
// Footprints are kept as 16×16 chunks plus objects (bodies; crowded tiles).
//
// Turns are dealt to workers by region (columns of equal head count). A worker runs its
// own turns in order and, before each one, waits for the latest earlier turn on another
// worker that overlaps it: wait (k, p) means "worker k's turns through position p are in".
// A wait always points earlier in the order, so nobody can wait on a worker waiting on them.
import { CONFIG, Warrior, World } from './world';
import { inside } from './replica';

export const CH = 16;

/** One worker's share of a phase. */
export interface Share {
  ids: Int32Array;      // bodies, in order
  pos: Int32Array;      // their positions in the phase's order
  waitOff: Int32Array;  // waits of share item j: waitK/waitPos[waitOff[j] .. waitOff[j + 1])
  waitK: Int32Array;
  waitPos: Int32Array;
  flush: Uint8Array;    // 1: someone waits on this one, send it right after
}

export interface Plan {
  phase: number;
  n: number;
  base: number;         // warriors.length at the start (children's provisional ids come after)
  slots: Int32Array;    // per worker [first, end) provisional ids
  shares: Share[];
  levels: number;       // sync depth (for reports)
}

type Rect = [number, number, number, number];

/** Column cuts with an equal number of bodies each side. */
function cuts(xs: Int32Array, K: number): Int32Array {
  const s = xs.slice().sort();
  const out = new Int32Array(K - 1);
  for (let i = 0; i < K - 1; i++) out[i] = s[Math.floor(((i + 1) * s.length) / K)] ?? 0;
  return out;
}
const workerAt = (c: Int32Array, x: number) => { let k = 0; while (k < c.length && x >= c[k]) k++; return k; };

/** Builds the waits from each item's keys (chunks in a typed table, objects in a map). */
class Deps {
  private lastPos: Int32Array;
  private lastW: Int32Array;
  private lastL: Int32Array;
  private stamp: Int32Array;
  private mark: Int32Array;
  private gen = 0;
  private obj = new Map<number, number>(); // key → item index
  private wantFrom: Int32Array;
  private items: number[] = [];
  readonly worker: Int32Array;
  readonly level: Int32Array;
  readonly flush: Uint8Array;
  readonly waits: number[][];
  private cur = 0; private curW = 0; private L = 1;

  constructor(nChunks: number, readonly n: number, readonly K: number) {
    this.lastPos = new Int32Array(nChunks); this.lastW = new Int32Array(nChunks); this.lastL = new Int32Array(nChunks);
    this.stamp = new Int32Array(nChunks); this.mark = new Int32Array(nChunks);
    this.worker = new Int32Array(n); this.level = new Int32Array(n); this.flush = new Uint8Array(n);
    this.waits = new Array(n);
    this.wantFrom = new Int32Array(K);
  }
  start(i: number, w: number) {
    this.cur = i; this.curW = w; this.L = 1; this.worker[i] = w; this.gen++;
    this.wantFrom.fill(-1); this.items.length = 0;
  }
  private dep(j: number) {
    const w = this.worker[j];
    if (w !== this.curW) {
      if (j > this.wantFrom[w]) this.wantFrom[w] = j;
      this.L = Math.max(this.L, this.level[j] + 1);
    } else this.L = Math.max(this.L, this.level[j]);
  }
  chunk(c: number) {
    if (this.mark[c] === this.gen) return;
    this.mark[c] = this.gen;
    if (this.stamp[c] === 1) this.dep(this.lastPos[c]); else this.stamp[c] = 1;
    this.items.push(c);
  }
  object(key: number) {
    const j = this.obj.get(key);
    if (j !== undefined) { if (j === this.cur) return; this.dep(j); }
    this.obj.set(key, this.cur);
  }
  end() {
    const i = this.cur;
    for (const c of this.items) { this.lastPos[c] = i; this.lastW[c] = this.curW; }
    this.level[i] = this.L;
    const ws: number[] = [];
    for (let k = 0; k < this.K; k++) if (this.wantFrom[k] >= 0) { ws.push(k, this.wantFrom[k]); this.flush[this.wantFrom[k]] = 1; }
    this.waits[i] = ws;
  }
}

function shares(d: Deps, ids: Int32Array, K: number): Share[] {
  const out: Share[] = [];
  for (let k = 0; k < K; k++) {
    const mine: number[] = [];
    for (let i = 0; i < d.n; i++) if (d.worker[i] === k) mine.push(i);
    const waitOff = new Int32Array(mine.length + 1), wk: number[] = [], wp: number[] = [];
    mine.forEach((i, j) => { const ws = d.waits[i]; for (let q = 0; q < ws.length; q += 2) { wk.push(ws[q]); wp.push(ws[q + 1]); } waitOff[j + 1] = wk.length; });
    out.push({
      ids: Int32Array.from(mine, (i) => ids[i]), pos: Int32Array.from(mine), waitOff,
      waitK: Int32Array.from(wk), waitPos: Int32Array.from(wp), flush: Uint8Array.from(mine, (i) => d.flush[i]),
    });
  }
  return out;
}

/** The turns' plan, from the world at the start of the turns (after begin, regrow, drift). */
export function planTurns(world: World, order: Warrior[], K: number): Plan {
  const io = inside(world), W = world.w, H = world.h, n = order.length;
  const cw = Math.ceil(W / CH), chh = Math.ceil(H / CH);
  // Moving boxes.
  const box = new Int32Array(n * 4), steps = new Int32Array(n), xs = new Int32Array(n);
  const credits = new Map<number, number>();
  for (const v of world.living()) { const h = v.lastHarm; if (h && world.t - h.t <= CONFIG.creditWindow) credits.set(h.by, (credits.get(h.by) ?? 0) + 1); }
  for (let i = 0; i < n; i++) {
    const wr = order[i];
    let x0 = wr.ipX, y0 = wr.ipY, x1 = wr.ipX, y1 = wr.ipY;
    for (const c of io.cellSets.get(wr.id) ?? []) { const x = c % W, y = (c / W) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const cr = credits.get(wr.id) ?? 0;
    const speed = cr ? Math.max(wr.speed, Math.min(CONFIG.speedCap, wr.speed + cr * CONFIG.killPay * CONFIG.speedCap)) : wr.speed;
    const s = wr.alive ? Math.max(0, Math.floor(wr.accum + speed)) : 0;
    steps[i] = s; xs[i] = wr.ipX;
    box[i * 4] = x0 - s; box[i * 4 + 1] = y0 - s; box[i * 4 + 2] = x1 + s; box[i * 4 + 3] = y1 + s;
  }
  // Bodies by the chunks their boxes touch (to find who's within bite range).
  const nChunks = cw * chh;
  const head = new Map<number, number[]>();
  const rectChunks = (r: Rect, f: (c: number) => void) => {
    const cx0 = Math.max(0, Math.floor(r[0] / CH)), cy0 = Math.max(0, Math.floor(r[1] / CH));
    const cx1 = Math.min(cw - 1, Math.floor(r[2] / CH)), cy1 = Math.min(chh - 1, Math.floor(r[3] / CH));
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) f(cy * cw + cx);
  };
  for (let i = 0; i < n; i++) rectChunks([box[i * 4], box[i * 4 + 1], box[i * 4 + 2], box[i * 4 + 3]], (c) => { let l = head.get(c); if (!l) head.set(c, l = []); l.push(i); });
  // Crowding: a tile's count only rises between recounts, so it's only order-sensitive if
  // the births that could land in it this tick might carry it over the limit.
  const T = CONFIG.tile, tw = io.tw, tc = io.tileCount;
  const tileRect = (r: Rect, f: (k: number) => void) => {
    const tx0 = Math.max(0, Math.floor(r[0] / T)), ty0 = Math.max(0, Math.floor(r[1] / T));
    const tx1 = Math.min(tw - 1, Math.floor(r[2] / T)), ty1 = Math.min(Math.ceil(H / T) - 1, Math.floor(r[3] / T));
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) f(ty * tw + tx);
  };
  const child = (i: number): Rect => {
    const mw = box[i * 4 + 2] - box[i * 4] + 1, mh = box[i * 4 + 3] - box[i * 4 + 1] + 1;
    return [box[i * 4] - mw - 2, box[i * 4 + 1] - mh - 2, box[i * 4 + 2] + mw + 2, box[i * 4 + 3] + mh + 2];
  };
  const crowd = CONFIG.crowd, might = new Map<number, number>();
  if (crowd > 0) for (let i = 0; i < n; i++) if (steps[i]) tileRect(child(i), (k) => might.set(k, (might.get(k) ?? 0) + steps[i]));
  const hot = (k: number) => tc[k] < crowd && tc[k] + (might.get(k) ?? 0) >= crowd;
  // Workers by column; then each turn's keys, in order.
  const K2 = Math.min(K, Math.max(1, n));
  const cut = cuts(xs, K2);
  const d = new Deps(nChunks, n, K);
  const reachR = CONFIG.sight + 16, biteR = Math.max(CONFIG.bombRange, CONFIG.writeRange);
  const OBJ_TILE = -1e9; // (tile keys, apart from body ids)
  const seen = new Set<number>();
  for (let i = 0; i < n; i++) {
    const wr = order[i];
    d.start(i, workerAt(cut, xs[i]));
    const m: Rect = [box[i * 4], box[i * 4 + 1], box[i * 4 + 2], box[i * 4 + 3]];
    const chunk = (c: number) => d.chunk(c);
    rectChunks([m[0] - reachR, m[1] - reachR, m[2] + reachR, m[3] + reachR], chunk);
    if (steps[i]) rectChunks(child(i), chunk);
    d.object(wr.id);
    const h = wr.lastHarm;
    if (h && world.t - h.t <= CONFIG.creditWindow) d.object(h.by);
    const bite: Rect = [m[0] - biteR, m[1] - biteR, m[2] + biteR, m[3] + biteR];
    seen.clear();
    rectChunks(bite, (c) => {
      for (const j of head.get(c) ?? []) {
        if (j === i || seen.has(j)) continue;
        seen.add(j);
        const o: Rect = [box[j * 4], box[j * 4 + 1], box[j * 4 + 2], box[j * 4 + 3]];
        if (o[0] > bite[2] || bite[0] > o[2] || o[1] > bite[3] || bite[1] > o[3]) continue;
        rectChunks(o, chunk);
        d.object(order[j].id);
      }
    });
    if (crowd > 0 && steps[i]) { tileRect(m, (k) => { if (hot(k)) d.object(OBJ_TILE - k); }); tileRect(child(i), (k) => { if (hot(k)) d.object(OBJ_TILE - k); }); }
    d.end();
  }
  // Child ids: each worker gets room for one child per step of its turns.
  const base = world.warriors.length, slots = new Int32Array(K * 2);
  let at = base;
  for (let k = 0; k < K; k++) {
    let room = 1;
    for (let i = 0; i < n; i++) if (d.worker[i] === k) room += steps[i];
    slots[k * 2] = at; slots[k * 2 + 1] = at + room; at += room;
  }
  let levels = 0;
  for (let i = 0; i < n; i++) if (d.level[i] > levels) levels = d.level[i];
  return { phase: world.t * 2, n, base, slots, shares: shares(d, Int32Array.from(order, (w) => w.id), K), levels };
}

/**
 * The upkeep plan: every living body, in id order. Upkeep only touches the body's own
 * cells, so the only order that matters is with whoever its death would pay. Every
 * replica builds this itself, from the same state.
 */
export function planUpkeep(world: World, list: Warrior[], K: number): Plan {
  const n = list.length, xs = Int32Array.from(list, (w) => w.ipX);
  const cut = cuts(xs, Math.min(K, Math.max(1, n)));
  const d = new Deps(1, n, K);
  for (let i = 0; i < n; i++) {
    const wr = list[i];
    d.start(i, workerAt(cut, xs[i]));
    d.object(wr.id);
    const h = wr.lastHarm;
    if (h && world.t - h.t <= CONFIG.creditWindow) d.object(h.by);
    d.end();
  }
  let levels = 0;
  for (let i = 0; i < n; i++) if (d.level[i] > levels) levels = d.level[i];
  return { phase: world.t * 2 + 1, n, base: world.warriors.length, slots: new Int32Array(K * 2), shares: shares(d, Int32Array.from(list, (w) => w.id), K), levels };
}

// Plans for the parallel engine (src/par.ts). Browser-safe.
//
// A tick's turns run in a fixed order, and two turns only need it kept between them if they
// could touch the same thing. So each turn gets a footprint, worked out at the start of the
// tick from compact summaries of the bodies, that bounds anything it can do:
//   - a body takes at most ⌊accum + speed⌋ steps and moves at most a cell a step, so its box
//     grows by at most that (M);
//   - it reads within M ± (sight + 16), the scan window, and writes within M ± bite range;
//     a child lands within a body-width of M;
//   - any body whose box comes within bite range may lose cells anywhere (a bite can cut it
//     in two), so its whole box is written, and the body itself is in (an object);
//   - so are children born this tick within bite range (to whoever bore them, "children of
//     B"), whoever last harmed me (my death pays them), and crowded tiles.
// A body can only do what its glyphs let it (capsOf): with no B or W it touches no other
// body, with no S it reads no further than it can see, with no D it has no children, with no
// M, A, F or G it doesn't move. The glyphs it has at the start of the tick are the glyphs it
// has all tick, unless a W can reach it (a WRITE could give it anything): then it gets all.
// Cells are shared memory (one copy), tracked in 32×32 chunks (16 made the plan slower and no better): a read waits for the last
// write, a write for the last write and every read since. Objects (bodies) are copies, one
// per worker: an object's next user waits for its last user, and if that was on another
// worker, the object is sent across.
//
// Turns are dealt to workers by strip (columns of whole tiles). A worker runs any of its
// turns whose waits are done, in whatever order, so nothing waits on a stuck neighbour
// that it doesn't have to. (Written flat, typed arrays and no closures: it runs every tick
// on one thread, and a first version spent 40% of its time collecting garbage.)
import { CODE } from './glyphs';
import { CONFIG } from './world';

export const CH = 32;

/** Living bodies at the start of a phase, in id order. */
export interface Summaries {
  n: number;
  id: Int32Array;
  ipX: Int32Array; ipY: Int32Array;
  box: Int32Array;      // x0, y0, x1, y1 per body (its cells' bounding box)
  accum: Float64Array; speed: Float64Array;
  harmBy: Int32Array; harmT: Int32Array; // last harm (-1: none)
  caps: Uint8Array;     // what its glyphs let it do (capsOf)
}

export function emptySummaries(n: number): Summaries {
  return {
    n, id: new Int32Array(n), ipX: new Int32Array(n), ipY: new Int32Array(n), box: new Int32Array(n * 4),
    accum: new Float64Array(n), speed: new Float64Array(n), harmBy: new Int32Array(n).fill(-1), harmT: new Int32Array(n), caps: new Uint8Array(n),
  };
}

export const SCAN = 1, SIGHT = 2, BITE = 4, WRITE = 8, DIVIDE = 16, MOVE = 32, HALT = 64, ALL = 127;
const CAP_OF = new Uint8Array(256);
for (const [g, c] of [['S', SCAN], ['L', SIGHT], ['R', SIGHT], ['B', BITE], ['W', WRITE], ['D', DIVIDE], ['M', MOVE], ['A', MOVE], ['F', MOVE], ['G', MOVE], ['@', HALT]] as const) CAP_OF[CODE[g]] = c;

/** What a body's glyphs let it do this tick: a bit per kind of reach (SCAN, BITE, ...). */
export function capsOf(code: ArrayLike<number>, cells: Iterable<number>): number {
  let c = 0;
  for (const i of cells) c |= CAP_OF[code[i]];
  return c;
}

/** One worker's share of a phase. */
export interface Share {
  ids: Int32Array;       // bodies, by position
  pos: Int32Array;       // their positions in the phase's order
  predOff: Int32Array;   // waits of item j: positions preds[predOff[j] .. predOff[j + 1])
  preds: Int32Array;
  packsIn: Int32Array;   // objects to receive before item j runs
  outOff: Int32Array;    // after item j: send object outKey to worker outW, for its item at outPos
  outKey: Int32Array; outW: Int32Array; outPos: Int32Array;
  notify: Int32Array;    // after item j: bitmask of workers with an item waiting on it
  sendKey: Int32Array;   // at the start: objects this worker holds that another's item needs first
  sendW: Int32Array; sendPos: Int32Array;
  // Plans come in waves (the front of the order first, so workers start while the rest is
  // planned): what a wave adds to items of earlier ones.
  lateOut: Int32Array;   // [position, key, worker, its position]...: after that item, send the object (now, if it's done)
  lateNote: Int32Array;  // [position, mask]...: after that item, wake these workers (now, if it's done)
}

export interface Plan {
  n: number;
  shares: Share[];
  /** Where each object ends up, by its dense key (turns: body s, then n + s for its children; upkeep: index), −1 if unused. */
  keyHolder: Int8Array;
  levels: number;
  remote: number;        // waits across workers (for reports)
  room: Int32Array;      // per worker: most children its items could have (turns)
}

/** Key for "the children body `id` has had this tick". */
export const childrenKey = (id: number) => -1 - id;

/** A growable Int32 list. */
class Buf {
  a = new Int32Array(1 << 12);
  n = 0;
  push(v: number) {
    if (this.n === this.a.length) { const b = new Int32Array(this.a.length * 2); b.set(this.a); this.a = b; }
    this.a[this.n++] = v;
  }
}

/** An Int32Array that grows (and is kept: a plan a tick would otherwise make megabytes of garbage). */
const grown = (a: Int32Array, n: number): Int32Array => (a.length >= n ? a : new Int32Array(Math.max(n, a.length * 2)));

/**
 * Builds waits: chunk reads and writes in shared memory; objects as copies handed on.
 * Objects are dense keys [0, nKeys); `keyOf` turns one into what workers call it (a body id,
 * a childrenKey, or null: a tile, only ordered). Its arrays live on between plans, marked
 * with a stamp instead of cleared.
 */
class Builder {
  private lastW = new Int32Array(0); private lastWAt = new Int32Array(0);  // chunk → last writer + 1, and the plan that set it
  private rHead = new Int32Array(0);                                      // chunk → newest reader since the last write (pool index + 1)
  private rPool = new Buf();                                              // [pos, next] pairs
  private wMark = new Int32Array(0); private rMark = new Int32Array(0);
  private objLast = new Int32Array(0); private objAt = new Int32Array(0); // key → last user, and the plan that set it
  private handLast = new Int32Array(0); private handAt = new Int32Array(0); // (the same, walking hand-offs wave by wave)
  private predMark: Int32Array = new Int32Array(0);
  private plan = 0;   // this plan's stamp
  private g0 = 0;     // marks this plan: g0 + item + 1
  private cur = 0; private curW = 0; private g = 0;
  worker: Int32Array = new Int32Array(0);
  level: Int32Array = new Int32Array(0);
  predStart: Int32Array = new Int32Array(0); readonly preds = new Buf();
  objStart: Int32Array = new Int32Array(0); readonly objs = new Buf();
  n = 0;
  remote = 0;

  reset(nChunks: number, n: number, nKeys: number) {
    if (this.g0 + n + 1 > 2e9) { this.g0 = 0; this.wMark.fill(0); this.rMark.fill(0); this.predMark.fill(0); }
    this.g0 += this.n + 1;
    this.plan++;
    this.n = n; this.remote = 0;
    if (this.lastW.length < nChunks) {
      this.lastW = new Int32Array(nChunks); this.lastWAt = new Int32Array(nChunks); this.rHead = new Int32Array(nChunks);
      this.wMark = new Int32Array(nChunks); this.rMark = new Int32Array(nChunks);
    }
    if (this.objLast.length < nKeys) { this.objLast = new Int32Array(nKeys); this.objAt = new Int32Array(nKeys); this.handLast = new Int32Array(nKeys); this.handAt = new Int32Array(nKeys); }
    this.predMark = grown(this.predMark, n); this.worker = grown(this.worker, n); this.level = grown(this.level, n);
    this.predStart = grown(this.predStart, n + 1); this.objStart = grown(this.objStart, n + 1);
    this.preds.n = 0; this.objs.n = 0; this.rPool.n = 0;
  }
  start(i: number, w: number) {
    this.cur = i; this.curW = w; this.worker[i] = w; this.g = this.g0 + i + 1;
    this.predStart[i] = this.preds.n; this.objStart[i] = this.objs.n;
    this.level[i] = 1;
  }
  private dep(j: number) {
    if (this.predMark[j] === this.g) return;
    this.predMark[j] = this.g;
    this.preds.push(j);
    const far = this.worker[j] !== this.curW;
    const l = this.level[j] + (far ? 1 : 0);
    if (l > this.level[this.cur]) this.level[this.cur] = l;
    if (far) this.remote++;
  }
  write(c: number) {
    const g = this.g;
    if (this.wMark[c] === g) return;
    this.wMark[c] = g;
    if (this.lastWAt[c] === this.plan) {
      const lw = this.lastW[c] - 1;
      if (lw !== this.cur) this.dep(lw);
      const pool = this.rPool.a;
      for (let r = this.rHead[c]; r; r = pool[r]) { const j = pool[r - 1]; if (j !== this.cur) this.dep(j); }
    } else {
      // (First this plan: readers before it, if any, were linked from rHead in this plan only.)
      this.lastWAt[c] = this.plan;
      const pool = this.rPool.a;
      for (let r = this.rMark[c] > this.g0 ? this.rHead[c] : 0; r; r = pool[r]) { const j = pool[r - 1]; if (j !== this.cur) this.dep(j); }
    }
    this.rHead[c] = 0;
    this.lastW[c] = this.cur + 1;
  }
  read(c: number) {
    const g = this.g;
    if (this.wMark[c] === g || this.rMark[c] === g) return;
    const first = this.rMark[c] <= this.g0; // (no reader yet this plan)
    this.rMark[c] = g;
    const written = this.lastWAt[c] === this.plan;
    if (written) this.dep(this.lastW[c] - 1);
    this.rPool.push(this.cur); this.rPool.push(first && !written ? 0 : this.rHead[c]);
    this.rHead[c] = this.rPool.n - 1;
  }
  object(key: number) {
    if (this.objAt[key] === this.plan) {
      const j = this.objLast[key];
      if (j === this.cur) return;
      this.dep(j);
    } else this.objAt[key] = this.plan;
    this.objLast[key] = this.cur;
    this.objs.push(key);
  }
  /** Items before `i` are all built (their waits and objects end here). */
  seal(i: number) { this.predStart[i] = this.preds.n; this.objStart[i] = this.objs.n; }

  private used: number[] = [];
  private sharesPlan = 0;
  beginShares() { this.sharesPlan++; this.used = []; }

  /**
   * Each worker's share of items [a, b): their waits, and which objects go where. Hand-offs
   * from, and wake-ups after, items of earlier waves go out as late ones to whoever ran them.
   */
  range(a: number, b: number, ids: Int32Array, K: number, keyOf: (key: number) => number | null, holderOf: (key: number) => number): Share[] {
    const worker = this.worker, P = this.preds.a, O = this.objs.a, ps = this.predStart, os = this.objStart, m = b - a;
    const notify = new Int32Array(m);
    const lateNote: number[][] = Array.from({ length: K }, () => []);
    for (let i = a; i < b; i++) for (let q = ps[i]; q < ps[i + 1]; q++) {
      const j = P[q], bit = 1 << worker[i];
      if (worker[j] === worker[i]) continue;
      if (j >= a) notify[j - a] |= bit; else lateNote[worker[j]].push(j, bit);
    }
    // Objects: walk each key's users in order; a hand-off between workers is a send.
    const outFrom = new Buf(), outKey = new Buf(), outW = new Buf(), outPos = new Buf();
    const sends: number[][] = Array.from({ length: K }, () => []), lateOut: number[][] = Array.from({ length: K }, () => []);
    const packsIn = new Int32Array(m), outCount = new Int32Array(m);
    const last = this.handLast, at = this.handAt, plan = this.sharesPlan;
    for (let i = a; i < b; i++) {
      const w = worker[i];
      for (let q = os[i]; q < os[i + 1]; q++) {
        const key = O[q], real = keyOf(key);
        if (real === null) continue; // (a tile count is shared memory: only the order matters)
        if (at[key] !== plan) {
          at[key] = plan; this.used.push(key);
          const h = holderOf(real);
          if (h >= 0 && h !== w) { sends[h].push(real, w, i); packsIn[i - a]++; }
        } else {
          const j = last[key];
          if (worker[j] !== w) {
            packsIn[i - a]++;
            if (j >= a) { outFrom.push(j - a); outKey.push(real); outW.push(w); outPos.push(i); outCount[j - a]++; }
            else lateOut[worker[j]].push(j, real, w, i);
          }
        }
        last[key] = i;
      }
    }
    // Outs grouped by sender item.
    const outStart = new Int32Array(m + 1);
    for (let i = 0; i < m; i++) outStart[i + 1] = outStart[i] + outCount[i];
    const fill = outStart.slice(0, m), oK = new Int32Array(outFrom.n), oW = new Int32Array(outFrom.n), oP = new Int32Array(outFrom.n);
    for (let q = 0; q < outFrom.n; q++) { const x = fill[outFrom.a[q]]++; oK[x] = outKey.a[q]; oW[x] = outW.a[q]; oP[x] = outPos.a[q]; }
    const count = new Int32Array(K), np = new Int32Array(K), no = new Int32Array(K);
    for (let i = a; i < b; i++) { const k = worker[i]; count[k]++; np[k] += ps[i + 1] - ps[i]; no[k] += outCount[i - a]; }
    const shares: Share[] = [];
    for (let k = 0; k < K; k++) {
      const c = count[k], sd = sends[k];
      shares.push({
        ids: new Int32Array(c), pos: new Int32Array(c), predOff: new Int32Array(c + 1), preds: new Int32Array(np[k]),
        packsIn: new Int32Array(c), outOff: new Int32Array(c + 1), outKey: new Int32Array(no[k]), outW: new Int32Array(no[k]), outPos: new Int32Array(no[k]),
        notify: new Int32Array(c),
        sendKey: Int32Array.from({ length: sd.length / 3 }, (_, q) => sd[q * 3]), sendW: Int32Array.from({ length: sd.length / 3 }, (_, q) => sd[q * 3 + 1]),
        sendPos: Int32Array.from({ length: sd.length / 3 }, (_, q) => sd[q * 3 + 2]),
        lateOut: Int32Array.from(lateOut[k]), lateNote: Int32Array.from(lateNote[k]),
      });
    }
    const jAt = new Int32Array(K), pAt = new Int32Array(K), oAt = new Int32Array(K);
    for (let i = a; i < b; i++) {
      const k = worker[i], sh = shares[k], j = jAt[k]++, r = i - a;
      sh.ids[j] = ids[i]; sh.pos[j] = i; sh.packsIn[j] = packsIn[r]; sh.notify[j] = notify[r];
      sh.preds.set(P.subarray(ps[i], ps[i + 1]), pAt[k]); pAt[k] += ps[i + 1] - ps[i]; sh.predOff[j + 1] = pAt[k];
      const o0 = outStart[r], o1 = outStart[r + 1];
      sh.outKey.set(oK.subarray(o0, o1), oAt[k]); sh.outW.set(oW.subarray(o0, o1), oAt[k]); sh.outPos.set(oP.subarray(o0, o1), oAt[k]);
      oAt[k] += o1 - o0; sh.outOff[j + 1] = oAt[k];
    }
    return shares;
  }

  /** Where each object ended up (its last user's worker), by dense key; −1 if unused. */
  holders(nKeys: number): Int8Array {
    const keyHolder = new Int8Array(nKeys).fill(-1);
    for (const key of this.used) keyHolder[key] = this.worker[this.handLast[key]];
    return keyHolder;
  }
}
const turnBuilder = new Builder(), upkeepBuilder = new Builder();

/** Index of `id` in a sorted Int32Array, or -1. */
function find(sorted: Int32Array, n: number, id: number) {
  let lo = 0, hi = n - 1;
  while (lo <= hi) { const m = (lo + hi) >> 1, v = sorted[m]; if (v === id) return m; if (v < id) lo = m + 1; else hi = m - 1; }
  return -1;
}

export interface World0 { w: number; h: number; t: number; tw: number; tileCount: ArrayLike<number> }

/** Worker of a column x, given the strip cuts (x where each worker after the first starts). */
export const stripOf = (cuts: Int32Array, x: number) => { let k = 0; while (k < cuts.length && x >= cuts[k]) k++; return k; };

/**
 * The turns' plan, made a wave at a time (wave(a, b): items a..b-1, in turn order). `order`
 * lists summary indices in turn order; `holder` says which worker holds each body now.
 */
export class TurnPlan {
  readonly n: number;
  readonly room: Int32Array;   // per worker: most children its items could have
  private item: (i: number) => void;
  private ids: Int32Array;
  private keyOf: (key: number) => number | null;
  private holderOf: (real: number) => number;
  private nKeys: number;
  private built = 0;

  constructor(world: World0, readonly S: Summaries, readonly order: Int32Array, readonly cuts: Int32Array, readonly K: number, holder: (id: number) => number) {
  const W = world.w, H = world.h, n = order.length;
  this.n = n;
  const cw = Math.ceil(W / CH), chh = Math.ceil(H / CH), nChunks = cw * chh;
  // Credits: a death pays its killer's speed, so a killer may get more steps this tick.
  const credits = new Map<number, number>();
  for (let s = 0; s < S.n; s++) if (S.harmBy[s] >= 0 && world.t - S.harmT[s] <= CONFIG.creditWindow) credits.set(S.harmBy[s], (credits.get(S.harmBy[s]) ?? 0) + 1);
  // Moving boxes (items 0..n-1, by position) and child landings (items n..2n-1).
  const box = new Int32Array(n * 8), steps = new Int32Array(n), kids = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const s = order[i];
    const cr = credits.get(S.id[s]) ?? 0, sp = S.speed[s];
    const speed = cr ? Math.max(sp, Math.min(CONFIG.speedCap, sp + cr * CONFIG.killPay * CONFIG.speedCap)) : sp;
    const st = Math.max(0, Math.floor(S.accum[s] + speed));
    steps[i] = st;
    const mv = S.caps[s] & MOVE ? st : 0; // (no M, A, F or G: it stays where it is)
    const x0 = S.box[s * 4] - mv, y0 = S.box[s * 4 + 1] - mv, x1 = S.box[s * 4 + 2] + mv, y1 = S.box[s * 4 + 3] + mv;
    box[i * 4] = x0; box[i * 4 + 1] = y0; box[i * 4 + 2] = x1; box[i * 4 + 3] = y1;
    const mw = x1 - x0 + 1, mh = y1 - y0 + 1, c = (n + i) * 4;
    box[c] = x0 - mw - 2; box[c + 1] = y0 - mh - 2; box[c + 2] = x1 + mw + 2; box[c + 3] = y1 + mh + 2;
  }
  const cx = (x: number) => Math.min(cw - 1, Math.max(0, Math.floor(x / CH)));
  const cy = (y: number) => Math.min(chh - 1, Math.max(0, Math.floor(y / CH)));
  // What each can do: its glyphs, or everything if a WRITE could have reached it earlier in
  // the tick (it could have been given any glyph, a W too: so in turn order, a body that
  // might hold a W by its turn reaches on).
  const caps = new Uint8Array(n), wR = CONFIG.writeRange;
  for (let i = 0; i < n; i++) caps[i] = S.caps[order[i]];
  {
    let any = false;
    for (let i = 0; i < n && !any; i++) if (caps[i] & WRITE) any = true;
    if (any) {
      const grid = new Map<number, number[]>(), G = 64; // (reach boxes of writers so far)
      for (let i = 0; i < n; i++) {
        const s = order[i], st = steps[i];
        if (caps[i] !== ALL) {
          // (Tested as if it could move: given a W, it could be given an M too.)
          const x0 = S.box[s * 4] - st, y0 = S.box[s * 4 + 1] - st, x1 = S.box[s * 4 + 2] + st, y1 = S.box[s * 4 + 3] + st;
          search: for (let y = Math.floor(y0 / G); y <= Math.floor(y1 / G); y++) for (let x = Math.floor(x0 / G); x <= Math.floor(x1 / G); x++) {
            for (const j of grid.get(y * 100000 + x) ?? []) {
              if (box[j * 4] - wR > x1 || x0 > box[j * 4 + 2] + wR || box[j * 4 + 1] - wR > y1 || y0 > box[j * 4 + 3] + wR) continue;
              caps[i] = ALL;
              box[i * 4] = x0; box[i * 4 + 1] = y0; box[i * 4 + 2] = x1; box[i * 4 + 3] = y1;
              const mw = x1 - x0 + 1, mh = y1 - y0 + 1, c = (n + i) * 4;
              box[c] = x0 - mw - 2; box[c + 1] = y0 - mh - 2; box[c + 2] = x1 + mw + 2; box[c + 3] = y1 + mh + 2;
              break search;
            }
          }
        }
        if (caps[i] & WRITE) {
          const x0 = box[i * 4], y0 = box[i * 4 + 1], x1 = box[i * 4 + 2], y1 = box[i * 4 + 3];
          for (let y = Math.floor((y0 - wR) / G); y <= Math.floor((y1 + wR) / G); y++) for (let x = Math.floor((x0 - wR) / G); x <= Math.floor((x1 + wR) / G); x++) {
            const k = y * 100000 + x; let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(i);
          }
        }
      }
    }
  }
  // Crowding: a tile's count only rises between recounts, so it's only order-sensitive if
  // the births that could land in it this tick might carry it over the limit; and a parent
  // whose every tile is already full can't divide at all.
  const T = CONFIG.tile, tw = world.tw, th = Math.ceil(H / T), tc = world.tileCount, crowd = CONFIG.crowd;
  const tx = (x: number) => Math.min(tw - 1, Math.max(0, Math.floor(x / T))), ty = (y: number) => Math.min(th - 1, Math.max(0, Math.floor(y / T)));
  for (let i = 0; i < n; i++) {
    kids[i] = caps[i] & DIVIDE && steps[i] ? 1 : 0;
    if (kids[i] && crowd > 0) {
      let room = false;
      for (let y = ty(box[i * 4 + 1]); y <= ty(box[i * 4 + 3]) && !room; y++) for (let x = tx(box[i * 4]); x <= tx(box[i * 4 + 2]); x++) if (tc[y * tw + x] < crowd) { room = true; break; }
      if (!room) kids[i] = 0;
    }
  }
  // Who's where, by chunk (CSR).
  const cnt = new Int32Array(nChunks + 1);
  for (let item = 0; item < 2 * n; item++) {
    if (item >= n && !kids[item - n]) continue;
    const b = item * 4;
    for (let y = cy(box[b + 1]); y <= cy(box[b + 3]); y++) for (let x = cx(box[b]); x <= cx(box[b + 2]); x++) cnt[y * cw + x + 1]++;
  }
  for (let c = 0; c < nChunks; c++) cnt[c + 1] += cnt[c];
  const at = cnt.slice(0, nChunks), cell = new Int32Array(cnt[nChunks]);
  for (let item = 0; item < 2 * n; item++) {
    if (item >= n && !kids[item - n]) continue;
    const b = item * 4;
    for (let y = cy(box[b + 1]); y <= cy(box[b + 3]); y++) for (let x = cx(box[b]); x <= cx(box[b + 2]); x++) cell[at[y * cw + x]++] = item;
  }
  const might = new Map<number, number>();
  if (crowd > 0) for (let i = 0; i < n; i++) {
    if (!kids[i]) continue;
    const b = (n + i) * 4;
    for (let y = ty(box[b + 1]); y <= ty(box[b + 3]); y++) for (let x = tx(box[b]); x <= tx(box[b + 2]); x++) might.set(y * tw + x, (might.get(y * tw + x) ?? 0) + steps[i]);
  }
  const hot = (k: number) => tc[k] < crowd && tc[k] + (might.get(k) ?? 0) >= crowd;

  // Object keys, dense: a body by its summary index, its children after those, then tiles.
  const nT = tw * th, KID = S.n, TILE = 2 * S.n;
  const b = turnBuilder;
  b.reset(nChunks, n, TILE + nT);
  b.beginShares();
  const seen = new Int32Array(2 * n);
  this.item = (i: number) => {
    const s = order[i], cp = caps[i];
    b.start(i, stripOf(cuts, S.ipX[s]));
    const x0 = box[i * 4], y0 = box[i * 4 + 1], x1 = box[i * 4 + 2], y1 = box[i * 4 + 3];
    // Reach: the scan window, or as far as it can see, bite or write; or just next to itself.
    const readR = cp & SCAN ? CONFIG.sight + 16 : cp & SIGHT ? CONFIG.sight : cp & BITE ? CONFIG.bombRange : cp & WRITE ? CONFIG.writeRange : 1;
    const harmR = cp & BITE ? CONFIG.bombRange : cp & WRITE ? CONFIG.writeRange : 0;
    const biteR = Math.max(1, harmR);
    const bx0 = x0 - biteR, by0 = y0 - biteR, bx1 = x1 + biteR, by1 = y1 + biteR;
    // Writes first (a chunk both read and written counts as written).
    for (let y = cy(by0); y <= cy(by1); y++) for (let x = cx(bx0); x <= cx(bx1); x++) b.write(y * cw + x);
    if (kids[i]) {
      const c = (n + i) * 4;
      for (let y = cy(box[c + 1]); y <= cy(box[c + 3]); y++) for (let x = cx(box[c]); x <= cx(box[c + 2]); x++) b.write(y * cw + x);
      b.object(KID + s);
    }
    b.object(s);
    if (cp & HALT && S.harmBy[s] >= 0 && world.t - S.harmT[s] <= CONFIG.creditWindow) { const k = find(S.id, S.n, S.harmBy[s]); if (k >= 0) b.object(k); }
    // Bodies (and children) within bite range: their whole boxes, and the objects.
    if (harmR) for (let y = cy(by0); y <= cy(by1); y++) for (let x = cx(bx0); x <= cx(bx1); x++) {
      const c = y * cw + x;
      for (let q = cnt[c]; q < cnt[c + 1]; q++) {
        const item = cell[q];
        if (seen[item] === i + 1) continue;
        seen[item] = i + 1;
        const j = item < n ? item : item - n;
        if (j === i || (item >= n && j > i)) continue; // (me; or children not born yet when I go)
        const o = item * 4;
        if (box[o] > bx1 || bx0 > box[o + 2] || box[o + 1] > by1 || by0 > box[o + 3]) continue;
        for (let yy = cy(box[o + 1]); yy <= cy(box[o + 3]); yy++) for (let xx = cx(box[o]); xx <= cx(box[o + 2]); xx++) b.write(yy * cw + xx);
        b.object(item < n ? order[j] : KID + order[j]);
      }
    }
    if (crowd > 0 && kids[i]) {
      for (let y = ty(y0); y <= ty(y1); y++) for (let x = tx(x0); x <= tx(x1); x++) if (hot(y * tw + x)) b.object(TILE + y * tw + x);
      const c = (n + i) * 4;
      for (let y = ty(box[c + 1]); y <= ty(box[c + 3]); y++) for (let x = tx(box[c]); x <= tx(box[c + 2]); x++) if (hot(y * tw + x)) b.object(TILE + y * tw + x);
    }
    for (let y = cy(y0 - readR); y <= cy(y1 + readR); y++) for (let x = cx(x0 - readR); x <= cx(x1 + readR); x++) b.read(y * cw + x);
  };
  this.ids = new Int32Array(n);
  for (let i = 0; i < n; i++) this.ids[i] = S.id[order[i]];
  this.keyOf = (key: number) => key < KID ? S.id[key] : key < TILE ? childrenKey(S.id[key - KID]) : null;
  this.holderOf = (real) => real >= 0 ? holder(real) : -1; // (children start nowhere)
  this.nKeys = TILE;
  // Child ids: each worker gets room for one child per step of its turns that could divide.
  this.room = new Int32Array(K).fill(1);
  for (let i = 0; i < n; i++) if (kids[i]) this.room[stripOf(cuts, S.ipX[order[i]])] += steps[i];
  }

  /** Items [a, b): each worker's share of them. */
  wave(a: number, b: number): Share[] {
    if (a !== this.built) throw new Error('par plan: waves out of order');
    const bd = turnBuilder;
    for (let i = a; i < b; i++) { bd.start(i, stripOf(this.cuts, this.S.ipX[this.order[i]])); this.item(i); }
    bd.seal(b);
    this.built = b;
    return bd.range(a, b, this.ids, this.K, this.keyOf, this.holderOf);
  }

  /** Once every wave is out: where each object ended up (turns: body s, then n + s for its children). */
  holders() { return turnBuilder.holders(this.nKeys); }
  get levels() { let l = 0; for (let i = 0; i < this.n; i++) if (turnBuilder.level[i] > l) l = turnBuilder.level[i]; return l; }
  get remote() { return turnBuilder.remote; }
}

/** The whole turns' plan in one wave (for tools and tests). */
export function planTurns(world: World0, S: Summaries, order: Int32Array, cuts: Int32Array, K: number, holder: (id: number) => number): Plan {
  const p = new TurnPlan(world, S, order, cuts, K, holder);
  const shares = p.wave(0, p.n);
  return { n: p.n, shares, keyHolder: p.holders(), levels: p.levels, remote: p.remote, room: p.room };
}

/**
 * The upkeep plan: every living body, in id order, each on the worker that holds it. Upkeep
 * only touches a body's own cells, so the only order that matters is with whoever its death
 * would pay.
 */
export function planUpkeep(t: number, ids: Int32Array, harmBy: Int32Array, harmT: Int32Array, K: number, holder: (id: number) => number): Plan {
  const n = ids.length;
  const b = upkeepBuilder;
  b.reset(1, n, n);
  b.beginShares();
  for (let i = 0; i < n; i++) {
    b.start(i, holder(ids[i]));
    b.object(i);
    if (harmBy[i] >= 0 && t - harmT[i] <= CONFIG.creditWindow) { const k = find(ids, n, harmBy[i]); if (k >= 0) b.object(k); }
  }
  b.seal(n);
  const shares = b.range(0, n, ids, K, (key) => ids[key], holder);
  const keyHolder = b.holders(n);
  let levels = 0;
  for (let i = 0; i < n; i++) if (b.level[i] > levels) levels = b.level[i];
  return { n, shares, keyHolder, levels, remote: b.remote, room: new Int32Array(K) };
}

// The world: board, cells, warriors, and the tick loop. Pure logic, no DOM, so it runs
// the same in the browser viewer and the headless runner.
//
// Core rules (see docs/journal.md for why):
// - A warrior is a 4-connected cloud of cells it owns; each cell holds one glyph.
// - One IP per warrior. It runs only its own cells. It advances to the next own cell
//   in its direction, skipping gaps, and wraps to the far end of its body on that
//   row/column. It rides on its cell: if the cell moves, the IP moves with it.
// - All coordinates in instructions are relative to the warrior's body frame: an origin
//   that starts at the IP's start cell and moves with SHIFT.
// - The IP is hidden from other warriors. Losing the IP's cell, or executing `@`, kills.
// - Pieces cut off from the IP's piece become debris.
// - Max size decays all the way to 0 (slower the smaller it is) and speed toward a floor;
//   resources push them back up. A body whose max size falls below 1 starves.
// - Last standing wins; at the tick cap, the biggest body (most cells) wins.
import { Board, climbStepH, FLOOR, makeBoard, makeClimb, makeClimbStep, makeIsland, makePlate, WALL } from './board';
import {
  CLASSIC_GLYPHS, CODE, COST, DX, DY, GLYPHS, T_DEBRIS, T_ENEMY, T_NOTHING, T_RESOURCE, T_SIZE, T_SPEED, T_WALL,
} from './glyphs';
import { makeRng, Rng, streamSeed } from './rng';
import { WarriorSpec } from './warrior-file';

/**
 * The rules' version. Bump it with any change that makes runs play out differently (the
 * golden replays fail): a bake records it, and the viewer lists only runs on the current rules.
 * 1: the climb's runs before this was kept; 2: per-body random streams; 3: ids by zone, rich corpses; 4: the climb's hunger is cell upkeep (no per-step size cap); 5: fat stores food.
 */
export const RULES = 5;
export const NONE = -1;
/**
 * Ids. The board's columns are cut into ZONES bands, and each band numbers its own births:
 * a body's id is n·ZONES + zone, its zone's nth birth. A body names its children from its
 * zone (where its IP was at its last upkeep), so whoever runs a band's turns can number its
 * births without hearing from anyone else (a parallel engine, one day). Founders are the
 * exception: founder k is id k (each zone's slot 0 is kept for a founder), so founders are
 * still 0, 1, 2, … and there can be at most ZONES of them.
 */
export const ZONES = 64;
/** A body's link to its Cells (under a symbol: not saved, filled in on first use). */
const CELLS = Symbol('cells');
const K = CODE['K'];
const INSUL = CODE['I'], FLIP = CODE['~'], DOUBLE = CODE['x'], MASK = CODE['n'], FAT = CODE['.'], MOVE = CODE['M'], BITE = CODE['B'], COLLECT = CODE['C'];

/** The Climb: what a body's chemistry adds up to (see World.traitsOf). */
/**
 * A body's cells: a Set<number> in all that matters (insertion order, a delete keeps the rest
 * in order), but a plain array, quicker to walk and with no hash table to reallocate. Bodies
 * are small; membership is the owner grid's job (owner[i] === id), so add doesn't check.
 * (Dead cells, thousands of them, stay a real Set.) Saved as a Set.
 */
export class Cells {
  /** The same cells in board order (cellsOf's cache), or null once they change. */
  sorted: number[] | null = null;
  /**
   * The Climb: the body's `traits` still describe these cells. Cleared when a cell joins or
   * leaves, or a code in one changes (a whole-body shift keeps it: the same body one step
   * over), so upkeep recomputes traits only for bodies that changed. Not saved: a loaded
   * world recomputes everyone once.
   */
  fresh = false;
  constructor(public items: number[] = []) {}
  get size() { return this.items.length; }
  add(i: number) { this.items.push(i); this.sorted = null; this.fresh = false; return this; }
  delete(i: number) { const k = this.items.indexOf(i); if (k < 0) return false; this.items.splice(k, 1); this.sorted = null; this.fresh = false; return true; }
  clear() { this.items.length = 0; this.sorted = null; this.fresh = false; }
  [Symbol.iterator]() { return this.items[Symbol.iterator](); }
}
/** What `cellSets` holds: a body's Cells, or the dead cells' Set. */
type CellSet = Cells | Set<number>;
const newCells = (id: number): CellSet => (id === DEBRIS ? new Set<number>() : new Cells());

export interface Traits { armor: number; insulation: number; mass: number; fat: number; move: number; bite: number; plants: boolean; meat: boolean; pace: number }
export const DEBRIS = -2;
// (step's per-code tables: an instruction's cycle cost, and whether it's an action.)
const OP_COST = Array.from(GLYPHS, (g) => COST[g] ?? 1);
const OP_ACTS = Uint8Array.from(GLYPHS, (g) => +'MFXGCBWDA'.includes(g));
let SHIFT_CODES = new Uint8Array(1024); // (opShift's scratch: the moving body's codes)
const SCAN_KEYS = new Float64Array(64 * 64); // (ringScan's scratch: its window is at most 61×61)

export const CONFIG = {
  sight: 14,            // LoS range from each cell (Chebyshev)
  bombRange: 6,         // BOMB reach from the cell that sees the target
  writeRange: 2,        // WRITE reach into foreign cells, from the cell that sees the target
  killPay: 0.25,        // duels: a kill's corpse holds this fraction of the victim's max size on top of its debris
  creditWindow: 500,    // a death within this many ticks of being bitten or written into is a kill: its corpse is rich (see die)
  stackMax: 64,
  sizeCap: 64,
  startSize: 40,        // every warrior starts with this max size (the most cells its body may have)
  startCells: 30,       // a warrior file holds at most this many cells: the rest of max size is room to GROW
  sizeDecay: 0.004,     // per tick at the starting max size; scales with √(max size / startSize), so
                        // 40→8 takes ~11000 ticks and 8→starved another ~6000 (~17000 from 40)
  divideMin: 16,        // DIVIDE needs at least this max size (and 2× its cells)
  sizePickup: 4,
  debrisPickup: 0.5,
  speedStart: 2,
  speedFloor: 1,
  speedCap: 8,
  speedDecay: 0.001,    // per tick
  speedPickup: 1,
  spawnInterval: 120,   // ticks between respawns at an empty spot
  tickCap: 5000,
  copyError: 0.02,      // DIVIDE: chance each copied cell becomes a random glyph
  maxWarriors: 64,      // DIVIDE fails while this many warriors are alive
  reaperCap: 0,         // petri dish: with this many alive, a birth kills the oldest living warrior (0 = off)
  lifespan: 0,          // petri dish: typical lifespan in ticks; each warrior's is 50–150% of it (0 = off)
  endless: false,       // petri dish: don't end when one lineage is left (only the tick cap ends it)
  plate: 0,             // petri dish: board is a round plate this many cells across (0 = rooms board)
  plateBands: 5,        // plate: toxin levels, clean middle (0) to rim (bands-1)
  plateFood: 5,         // plate: about one food spot per this many cells squared
  toxinRate: 0.001,     // plate: each tick, a cell one toxin level above my armor (K count) dies with this chance…
  toxinStep: 10,        // …and each further level multiplies it by this (MEGA-plate bands were 10× steps)
  foodRipen: 0,         // petri dish: an uneaten size pickup grows by one pickup's worth every this many ticks (0 = off)…
  foodRipeMax: 5,       // …up to this many pickups' worth
  copyInsert: 0,        // DIVIDE: chance the child gains a fat cell (.) stuck to its body
  copyDelete: 0,        // DIVIDE: chance the child loses one cell (never its IP cell; stays connected)
  island: false,        // island survival: side view, islanders vs sea creatures (board width = plate)
  climb: false,         // The Climb: fixed width (plate), steps up (air: insulation) and down (water: armor), 10× taller and richer each
  climbBase: 20,        // climb: step 0's height in rows (step ±n is base × 10^n)
  climbSteps: 2,        // climb: steps each way
  crowd: 24,            // climb: DIVIDE fails where the parent's tile already holds this many bodies (0 = no limit)
  stomach: 4,           // climb: each cell adds this much to a body's largest max size (its store)…
  fatStore: 16,         // …and each fat cell this much: fat is where a body keeps food (and starving sheds it first)
  climbStarve: 1500,    // climb: ticks a full body of plain cells lasts unfed at step 0 (each cell burns stomach / this a tick)
  shellBurn: 1,         // climb: armor (K) and insulation (I) cells burn this many times a plain cell…
  fatBurn: 0.5,         // …and fat this many; every cell burns 2^|its step| times more (the cold and the pressure)
  tile: 64,             // climb: food regrows only in tiles near life (the world's upkeep goes where the action is)
  starve: 600,          // island: ticks an unfed seal with max size 20 lasts (about a tenth of a lifetime)
  sharkStarve: 6000,    // island: the same for a shark (10× a seal's, as is its lifespan: about 10 meals a life for both)
  sharkLife: 10,        // island: a sea creature's lifespan is this many times CONFIG.lifespan
  paceMass: 11,         // island: pace = (1 + M cells) / (1 + mass / this); the seal founder's mass is 11
  paceSpeed: 2,         // island: instructions per tick at pace 1
  armorBites: 3,        // island: bites an armor (K) cell takes before it breaks
  sharkCap: 128,        // island: a sea creature's largest max size
  kelpFeed: 8,         // island: max size a seal gains from a kelp (times its ripeness), a real meal
  depth: 0.75,          // island: the sea is this many times as deep as it is wide
  calm: 0.25,           // island: top share of the water with no pressure (seals overlap sharks below `shallows`)
  shallows: 0.4,        // island: sea creatures can't swim into this top share of the water (blocked, never hurt)
  sharkArrive: 60000,   // island: the reef channel opens and the sea founders arrive at this tick (0 = at the start)
  seals: 60,            // island: each islander founder starts with this many copies spread through the calm water
  sharkFull: 0.75,      // island: a sea creature at this share of its size cap is full and won't bite
  biteRange: 2,         // island: a sea creature's BOMB reach (a bite, not a shot)
  seaFeed: 2,           // island: max size a sea creature gains per dead cell it collects
  sinkEvery: 6,         // island: dead cells sink one row every this many ticks (marine snow)
  rot: 0.003,           // island: per tick, a dead cell that can't sink rots away with this chance
  corpse: 0.33,         // island: share of a dead body's cells left as dead cells (the rest dissolves)
};

export interface Warrior {
  id: number;
  lineage: number; // the founder's id. Decides who won and who gets scored; in play, kin are rivals like anyone else
  gen: number;    // 0 for founders, parent's + 1 for children of DIVIDE
  zone: number;   // the band of columns it names its children from: its IP's at its last upkeep (see ZONES)
  realm: number;  // island survival: 0 islander (eats vegetation), 1 sea creature (eats dead cells); always 0 elsewhere
  parent?: number;
  born: number;   // tick of birth (0 for founders)
  diesAt?: number; // petri dish: death of old age (lifespan drawn at birth, 50–150% of CONFIG.lifespan)
  aged?: number;   // island survival: biological age, which advances at the body's pace (dies at diesAt − born)
  pace?: number;   // island survival: the body's pace (speed, hunger and aging all scale with it)
  traits?: Traits; // The Climb: what the body's chemistry adds up to (recomputed every tick)
  dents?: number;  // island survival: bites taken on armor since an armor cell last broke (it breaks at CONFIG.armorBites)
  name: string;
  alive: boolean;
  ipX: number;
  ipY: number;
  // Body-frame origin: instruction offsets are relative to this point. It starts at the
  // IP's start cell and moves only with SHIFT, so a SCAN result stays valid while the IP
  // walks on through the body.
  ox: number;
  oy: number;
  dir: number;
  stack: number[];
  maxSize: number;
  speed: number;
  accum: number;
  lastOk: boolean;
  lastAct: string; // glyph of the last action (M F X G C B W)
  cellCount: number;
  executed: number;
  stats: {
    collected: number; bombHits: number; poisonWrites: number; kills: number;
    // Self-modification: writes into my own cells (that changed a glyph), cells grown, swaps, flows.
    selfWrites: number; grows: number; swaps: number; flows: number;
    oozes: number;
    rooms: number;    // rooms (not its start room) its whole body has been inside, each counted once
    squeezed: number; // ticks with at least half of a 4+ cell body inside narrow passages (≤ 2 wide)
  };
  harmedAt?: number; // when something last bombed or wrote into me
  home: { x: number; y: number; w: number; h: number }; // start room
  leftHomeAt?: number; // first tick no cell of the body was in the start room
  roomsSeen: Set<number>; // board.rooms indices its whole body has been inside (children inherit a copy)
  deathReason?: string;
  diedAt?: number;
  spec: WarriorSpec;
  [CELLS]?: Cells;
}

/**
 * A body with every field, in one order: bodies then share one hidden class, so the hot loops'
 * property reads stay fast (bodies that grew their optional fields in different orders, or came
 * back from a save with different ones, ran ~6 shapes and slowed every read of a body).
 */
export function shaped(w: Warrior): Warrior {
  return {
    id: w.id, lineage: w.lineage, gen: w.gen, zone: w.zone, realm: w.realm, parent: w.parent, born: w.born,
    diesAt: w.diesAt, aged: w.aged, pace: w.pace, traits: w.traits, dents: w.dents, name: w.name, alive: w.alive,
    ipX: w.ipX, ipY: w.ipY, ox: w.ox, oy: w.oy, dir: w.dir, stack: w.stack, maxSize: w.maxSize, speed: w.speed,
    accum: w.accum, lastOk: w.lastOk, lastAct: w.lastAct, cellCount: w.cellCount, executed: w.executed, stats: w.stats,
    harmedAt: w.harmedAt, home: w.home, leftHomeAt: w.leftHomeAt, roomsSeen: w.roomsSeen, deathReason: w.deathReason,
    diedAt: w.diedAt, spec: w.spec, [CELLS]: undefined, // (not copied: a spread child must find its own)
  };
}

export interface WorldEvent { t: number; kind: string; text: string; who?: number }

export interface MatchResult {
  over: boolean;
  winner: number | null; // warrior id, or null for draw / not over
  reason: string;
}

export class World {
  board: Board;
  w: number;
  h: number;
  owner: Int32Array;
  code: Uint8Array;
  resource: Uint8Array; // 0 none, 1 size, 2 speed
  ripe: Float32Array;   // size pickups: how many pickups' worth (1 when it appears; grows with foodRipen)
  /** Floor cells in a passage at most 2 wide (the floor run through them, across or down, is ≤ 2). */
  narrow: Uint8Array;
  /** Dead cells: what each is worth, in quarters of an ordinary dead cell (0: ordinary). A kill's corpse is rich, see die. */
  flesh: Uint8Array;
  /** Every body ever, by id (the dead share one record per lineage, see kill): zoneBodies[zone][n]. */
  private zoneBodies: Warrior[][] = Array.from({ length: ZONES }, () => []);
  private zoneNext: number[] = new Array(ZONES).fill(1); // each zone's next n (0 is a founder's)
  /** The living warriors (a long dish has far more dead than alive). Rebuilt lazily after deaths. */
  private livingList: Warrior[] = [];
  private livingDirty = false;
  private bornIn = new Map<number, number>(); // lineage → warriors born so far (for names)
  t = 0;
  rng: Rng;
  events: WorldEvent[] = [];
  /** Every bomb hit and poison write so far, kin included (the per-warrior stats count rivals only). */
  attacks = { bombs: 0, poisons: 0 };
  result: MatchResult = { over: false, winner: null, reason: '' };
  private spawnTimers: number[];

  constructor(public seed: number, specs: WarriorSpec[]) {
    this.board = CONFIG.climb ? makeClimb(seed, CONFIG.plate || 2000, CONFIG.climbBase, CONFIG.climbSteps, CONFIG.plateFood)
      : CONFIG.island ? makeIsland(seed, CONFIG.plate || 360, CONFIG.plateBands, CONFIG.plateFood, CONFIG.shallows, CONFIG.calm, CONFIG.depth)
      : CONFIG.plate ? makePlate(seed, CONFIG.plate, CONFIG.plateBands, CONFIG.plateFood) : makeBoard(seed);
    this.w = this.board.w;
    this.h = this.board.h;
    this.owner = new Int32Array(this.w * this.h).fill(NONE);
    this.code = new Uint8Array(this.w * this.h);
    this.resource = new Uint8Array(this.w * this.h);
    this.ripe = new Float32Array(this.w * this.h).fill(1);
    this.rng = makeRng(seed);
    this.spawnTimers = this.board.spawns.map(() => 0);
    for (const s of this.board.spawns) this.resource[s.y * this.w + s.x] = s.kind;
    this.narrow = new Uint8Array(this.w * this.h);
    this.flesh = new Uint8Array(this.w * this.h);
    if (CONFIG.climb) this.initTiles();
    for (let y = 0; y < this.h && !CONFIG.climb; y++) { // (narrow passages only feed a GA stat; too slow on a climb-sized world)
      for (let x = 0; x < this.w; x++) {
        if (!this.isFloor(x, y)) continue;
        let a = x, b = x, c = y, d = y;
        while (this.isFloor(a - 1, y)) a--;
        while (this.isFloor(b + 1, y)) b++;
        while (this.isFloor(x, c - 1)) c--;
        while (this.isFloor(x, d + 1)) d++;
        if (b - a < 2 || d - c < 2) this.narrow[this.idx(x, y)] = 1;
      }
    }
    // Island survival: sea founders arrive at CONFIG.sharkArrive, once there's prey in the water.
    for (const s of specs) {
      if (CONFIG.island && s.realm === 'sea' && CONFIG.sharkArrive > 0) this.arriving.push(s);
      else this.place(s);
    }
    if (CONFIG.island || CONFIG.climb) this.settle();
  }

  /** Glyphs a copy error or WRITE can produce: The Climb's chemistry glyphs exist only there. */
  glyphCount() { return CONFIG.climb ? GLYPHS.length : CLASSIC_GLYPHS; }

  // ---------- The Climb: upkeep only near life ----------

  /** Tiles (CONFIG.tile square): which spawns each holds, whether it's active, and when it last was. */
  private spawnsInTile: number[][] = [];
  private tileActive = new Uint8Array(0);
  private tileLast = new Float64Array(0);
  private activeTiles: number[] = [];
  private tileCount = new Uint16Array(0); // bodies (by IP) per tile, recounted with the active tiles and on each birth
  private tileOf(x: number, y: number) { return Math.floor(y / CONFIG.tile) * this.tw + Math.floor(x / CONFIG.tile); }
  private tw = 0;

  private initTiles() {
    const T = CONFIG.tile;
    this.tw = Math.ceil(this.w / T);
    const n = this.tw * Math.ceil(this.h / T);
    this.spawnsInTile = Array.from({ length: n }, () => []);
    this.tileActive = new Uint8Array(n);
    this.tileLast = new Float64Array(n);
    this.tileCount = new Uint16Array(n);
    this.board.spawns.forEach((s, k) => this.spawnsInTile[Math.floor(s.y / T) * this.tw + Math.floor(s.x / T)].push(k));
  }

  /** How many tiles the world is spending upkeep on right now (of how many). */
  tileStats() { return { active: this.activeTiles.length, total: this.tileActive.length }; }

  /**
   * Mark the tiles around every living body active. A tile that wakes after a long sleep
   * catches up at once: its plants regrow and ripen as if time had passed there too.
   */
  private refreshTiles() {
    const T = CONFIG.tile, th = this.tileActive.length / this.tw;
    const next = new Uint8Array(this.tileActive.length);
    this.tileCount.fill(0);
    for (const wr of this.living()) {
      this.tileCount[this.tileOf(wr.ipX, wr.ipY)]++;
      const tx = Math.floor(wr.ipX / T), ty = Math.floor(wr.ipY / T);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = tx + dx, y = ty + dy;
        if (x >= 0 && y >= 0 && x < this.tw && y < th) next[y * this.tw + x] = 1;
      }
    }
    this.activeTiles = [];
    for (let k = 0; k < next.length; k++) {
      if (!next[k]) continue;
      this.activeTiles.push(k);
      if (!this.tileActive[k]) {
        const gap = this.t - this.tileLast[k];
        for (const sk of this.spawnsInTile[k]) {
          const s = this.board.spawns[sk], i = this.idx(s.x, s.y);
          if (this.resource[i] === 0 && this.owner[i] === NONE && gap >= this.regrowAt(s.y)) { this.resource[i] = s.kind; this.ripe[i] = 1; this.spawnTimers[sk] = 0; }
          if (this.resource[i] === 1 && CONFIG.foodRipen > 0) this.ripe[i] = Math.min(CONFIG.foodRipeMax, this.ripe[i] + gap / CONFIG.foodRipen);
        }
      }
    }
    for (const k of this.activeTiles) this.tileLast[k] = this.t;
    this.tileActive = next;
  }

  // ---------- The Climb: a world that grows a step wherever life reaches its edge ----------

  /** Rows joined on above the original world so far: every y has moved down by this much (a viewer keeps its camera on the same spot with it). */
  yShift = 0;

  private growClimb() {
    const M = 256;
    let top = Infinity, bottom = -1;
    for (const wr of this.living()) { if (wr.ipY < top) top = wr.ipY; if (wr.ipY > bottom) bottom = wr.ipY; }
    const low = bottom >= this.h - M; // (before growing up moves the bottom)
    if (top < M) this.addStep(1);
    if (low) this.addStep(-1);
  }

  /**
   * Join the next step on above (dir 1) or below (dir −1), made from its own rng, and open
   * the old wall row between. Below appends rows. Above prepends them, so everything that
   * holds a row or a cell index moves down: the grids, cell sets, spawns, tiles, IPs and
   * origins, homes and starts, sea level.
   */
  addStep(dir: 1 | -1) {
    const b = this.board, w = this.w, T = CONFIG.tile, oldH = this.h;
    const n = dir > 0 ? b.stepHi! + 1 : b.stepLo! - 1, H = climbStepH(b.climbBase!, n), h = oldH + H;
    if (n > 127 || n < -128) return; // (Int8 steps: a long way off)
    if (dir > 0 && H % T) throw new Error(`step ${n} is ${H} rows, not whole ${T}-row tiles`);
    const made = makeClimbStep(this.seed, w, n, H, b.foodSpacing!);
    const D = dir > 0 ? H : 0, dI = D * w, newTop = dir > 0 ? 0 : oldH; // (rows the old world moves down; where the new step starts)
    const grown = <A extends Int32Array | Uint8Array | Int8Array | Float32Array>(a: A, fill: number): A => {
      const out = new (a.constructor as { new (n: number): A })(w * h);
      if (fill) out.fill(fill);
      out.set(a, dI);
      return out;
    };
    const terrain = grown(b.terrain, 0), step = grown(b.step!, 0);
    terrain.set(made.terrain, newTop * w);
    step.fill(n, newTop * w, (newTop + H) * w);
    // Open the old wall row, then wall off whatever of the new step can't be reached from it.
    const wallRow = dir > 0 ? H : oldH - 1;
    for (let x = 1; x < w - 1; x++) terrain[wallRow * w + x] = FLOOR;
    const edge = dir > 0 ? 0 : h - 1;
    for (let x = 0; x < w; x++) terrain[edge * w + x] = WALL;
    const seen = new Uint8Array(w * (H + 1)), q: number[] = []; // (the new rows plus the opened row)
    const r0 = dir > 0 ? 0 : wallRow; // first row covered by `seen`
    for (let x = 1; x < w - 1; x++) { const k = (wallRow - r0) * w + x; seen[k] = 1; q.push(k); }
    for (let j = 0; j < q.length; j++) {
      const k = q[j], x = k % w;
      for (const nb of [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, k - w, k + w]) {
        if (nb < 0 || nb >= seen.length || seen[nb] || terrain[r0 * w + nb] !== FLOOR) continue;
        seen[nb] = 1; q.push(nb);
      }
    }
    for (let y = newTop; y < newTop + H; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (terrain[i] === FLOOR && !seen[i - r0 * w]) terrain[i] = WALL;
    }
    this.owner = grown(this.owner, NONE);
    this.code = grown(this.code, 0);
    this.resource = grown(this.resource, 0);
    this.ripe = grown(this.ripe, 1);
    this.narrow = grown(this.narrow, 0);
    this.flesh = grown(this.flesh, 0);
    b.terrain = terrain; b.step = step; b.h = h; this.h = h;
    // Rows and cell indices that moved (each shared object once: homes are often the start rects).
    if (D) {
      const moved = new Set<object>();
      const shift = (r: { y: number } | undefined) => { if (r && !moved.has(r)) { moved.add(r); r.y += D; } };
      for (const s of b.spawns) s.y += D;
      for (const r of b.starts) shift(r);
      for (const wr of new Set(this.allWarriors())) { wr.ipY += D; wr.oy += D; shift(wr.home); }
      for (const [id, set] of this.cellSets) { const out = newCells(id); for (const i of set) out.add(i + dI); this.cellSets.set(id, out); }
      for (const wr of this.livingList) wr[CELLS] = undefined;
      this.sortedCells.clear();
      b.seaLevel! += D;
      this.yShift += D;
    }
    // New plants, fresh and ripe.
    for (const sp of made.spawns) {
      const s = { x: sp.x, y: sp.y + newTop, kind: sp.kind };
      if (terrain[s.y * w + s.x] !== FLOOR) continue; // (walled off as unreachable)
      b.spawns.push(s);
      this.spawnTimers.push(0);
      const i = s.y * w + s.x;
      this.resource[i] = s.kind; this.ripe[i] = 1;
    }
    // Steps: index by step − stepLo.
    if (dir > 0) { b.stepTop = b.stepTop!.map((t) => t + H); b.stepTop.push(0); b.stepH!.push(H); b.stepHi = n; }
    else { b.stepTop!.unshift(oldH); b.stepH!.unshift(H); b.stepLo = n; }
    // Tiles: whole tile rows were added above, or rows below (which may fill out the last tile row).
    const tileRows = Math.ceil(h / T), dT = (D / T) * this.tw, nt = tileRows * this.tw;
    const tiles = <A extends Uint8Array | Float64Array | Uint16Array>(a: A): A => { const out = new (a.constructor as { new (n: number): A })(nt); out.set(a, dT); return out; };
    this.tileActive = tiles(this.tileActive);
    this.tileLast = tiles(this.tileLast); // (new tiles: last seen at 0, so they wake with everything grown and ripe)
    this.tileCount = tiles(this.tileCount);
    this.activeTiles = this.activeTiles.map((k) => k + dT);
    this.spawnsInTile = Array.from({ length: nt }, () => []);
    b.spawns.forEach((s, k) => this.spawnsInTile[Math.floor(s.y / T) * this.tw + Math.floor(s.x / T)].push(k));
    this.terrainVersion++;
    this.log('grow', `the world grows: step ${n > 0 ? '+' : ''}${n} joins on ${dir > 0 ? 'above' : 'below'} (${H} rows)`);
  }

  /** Climb: ticks for a plant to regrow; sunlight makes it faster the higher the step. */
  private regrowAt(y: number) {
    const n = this.board.step ? this.board.step[y * this.w] : 0;
    return Math.max(1, Math.round(CONFIG.spawnInterval / (1 + Math.max(0, n))));
  }

  /** Climb: how much richer food is at this cell's step (10× per step out). */
  richness(i: number) { return this.board.step ? 10 ** Math.abs(this.board.step[i]) : 1; }


  // ---------- setup ----------

  private arriving: WarriorSpec[] = [];
  /** Bumped whenever the terrain changes (the island's channel opening), so a viewer can redraw scenery. */
  terrainVersion = 0;

  private place(spec: WarriorSpec, at?: [number, number]): Warrior {
    const nth = this.bornIn.size; // (founders so far; duels give each its own start)
    if (nth >= ZONES) throw new Error(`at most ${ZONES} founders`);
    if (spec.cells.length > CONFIG.startCells) {
      throw new Error(`${spec.name} has ${spec.cells.length} cells; the limit is ${CONFIG.startCells}`);
    }
    // Island survival: a warrior file's `realm: sea` header starts it in the deep.
    const realm = this.board.startRealm ? (spec.realm === 'sea' ? 1 : 0) : 0;
    // (The Climb: `realm: deep` starts a warrior at the top of step −1; there are no realms.)
    const room = CONFIG.climb ? this.board.starts[spec.realm === 'deep' ? 1 : 0]
      : this.board.startRealm ? this.board.starts[this.board.startRealm.indexOf(realm)] : this.board.starts[nth % this.board.starts.length];
    // Island survival: founders of one realm share a start, side by side.
    const before = this.board.startRealm ? this.livingList.filter((w) => w.realm === realm && w.gen === 0).length : 0;
    const shift = before ? (before % 2 ? 1 : -1) * Math.ceil(before / 2) * (spec.width + 3) : 0;
    let ox = at ? at[0] : room.x + Math.floor((room.w - spec.width) / 2) + shift;
    let oy = at ? at[1] : room.y + Math.floor((room.h - spec.height) / 2);
    // Centred if it fits there, else the nearest free spot in the start. (The Climb's founders
    // share a start, and its rock is ragged: the second founder used to land on the first,
    // leaving it a ghost of 10 cells it didn't own, and on some seeds a hunter met rock.)
    if (!at) {
      const fits = (x: number, y: number) => spec.cells.every((c) => this.isFree(x + c.x, y + c.y));
      const near = (n: number) => Array.from({ length: n + 1 }, (_, k) => (k % 2 ? 1 : -1) * Math.ceil(k / 2));
      search: for (const dy of near(room.h)) for (const dx of near(room.w)) {
        if (fits(ox + dx, oy + dy)) { ox += dx; oy += dy; break search; }
      }
    }
    const id = nth;
    const wr: Warrior = shaped({
      id, lineage: id, gen: 0, realm, zone: this.zoneOf(ox + spec.ip.x), born: 0, name: spec.name, alive: true, ipX: ox + spec.ip.x, ipY: oy + spec.ip.y,
      ox: ox + spec.ip.x, oy: oy + spec.ip.y, dir: spec.dir,
      stack: [], maxSize: CONFIG.climb ? spec.cells.reduce((n, c) => n + (c.code === FAT ? CONFIG.fatStore : CONFIG.stomach), 0) : CONFIG.island ? (realm ? CONFIG.sharkCap : CONFIG.sizeCap) : CONFIG.startSize, speed: CONFIG.speedStart, // island and climb founders start full
      accum: 0, lastOk: true, lastAct: '', cellCount: 0, executed: 0, spec,
      stats: { collected: 0, bombHits: 0, poisonWrites: 0, kills: 0, selfWrites: 0, grows: 0, swaps: 0, flows: 0, oozes: 0, squeezed: 0, rooms: 0 }, home: room, roomsSeen: new Set(),
    });
    if (CONFIG.lifespan > 0) wr.diesAt = Math.floor(this.lifeOf(wr.realm) * (0.5 + this.rng()));
    for (const c of spec.cells) {
      const x = ox + c.x, y = oy + c.y;
      if (!this.isFloor(x, y)) throw new Error(`${spec.name} does not fit in its start room`);
      const i = this.idx(x, y);
      this.setOwner(i, id);
      this.code[i] = c.code;
      this.resource[i] = 0;
      wr.cellCount++;
    }
    this.enroll(wr);
    this.bornIn.set(id, 1);
    return wr;
  }

  /** A body by id. */
  /** A body by id (undefined, as an array would give, for an id no body has). */
  warrior(id: number): Warrior { return this.zoneBodies[id % ZONES]?.[Math.floor(id / ZONES)]; }
  /** How many bodies have ever lived. */
  everLived() { let n = this.bornIn.size; for (const k of this.zoneNext) n += k - 1; return n; }
  /** Every body ever, in id order (the dead as their lineage's shared record). Slow on a long run. */
  allWarriors(): Warrior[] {
    const out: Warrior[] = [], zs = this.zoneBodies, most = Math.max(...this.zoneNext);
    for (let n = 0; n < most; n++) for (const z of zs) { const wr = z[n]; if (wr) out.push(wr); }
    return out;
  }
  /** The band of columns x is in. */
  zoneOf(x: number) { return Math.min(ZONES - 1, Math.max(0, Math.floor(x * ZONES / this.w))); }
  /** The id of a zone's next birth (taken). */
  private nextId(zone: number) { return this.zoneNext[zone]++ * ZONES + zone; }
  /** A new body joins: under its id, and at the end of the living. */
  private enroll(wr: Warrior) {
    this.zoneBodies[wr.id % ZONES][Math.floor(wr.id / ZONES)] = wr;
    this.livingList.push(wr);
  }

  /** After a load: the living back in one shape (see shaped). */
  reshape() {
    this.livingList = this.living().map((wr) => (this.zoneBodies[wr.id % ZONES][Math.floor(wr.id / ZONES)] = shaped(wr)));
  }

  /** Living warriors, in id order. */
  living(): Warrior[] {
    if (this.livingDirty) { this.livingList = this.livingList.filter((w) => w.alive); this.livingDirty = false; }
    return this.livingList;
  }

  // ---------- helpers ----------

  idx(x: number, y: number) { return y * this.w + x; }
  inBounds(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  isFloor(x: number, y: number) { return this.inBounds(x, y) && this.board.terrain[this.idx(x, y)] === FLOOR; }
  ownerAt(x: number, y: number) { return this.inBounds(x, y) ? this.owner[this.idx(x, y)] : NONE; }
  /** Free for this warrior to move into: free, or (island) vegetation a sea creature swims over (it stays) or a dead cell it eats. */
  private passable(wr: Warrior, x: number, y: number) {
    if (this.sharkBlocked(wr, y)) return false;
    if (this.isFree(x, y)) return true;
    if (!CONFIG.island || wr.realm !== 1 || !this.isFloor(x, y)) return false;
    const o = this.owner[this.idx(x, y)];
    return o === NONE || o === DEBRIS;
  }

  /** Island survival: sea creatures can't get into the shallows or onto land (blocked, never hurt). */
  private sharkBlocked(wr: Warrior, y: number) {
    return CONFIG.island && wr.realm === 1 && y < (this.board.sharkLine ?? 0);
  }

  /** Floor with nothing on it: no cell, no debris, no resource. */
  isFree(x: number, y: number) {
    if (!this.isFloor(x, y)) return false;
    const i = this.idx(x, y);
    return this.owner[i] === NONE && this.resource[i] === 0;
  }

  // Cells by owner (warrior id, or DEBRIS), kept in step with `owner` by setOwner, so
  // nothing has to scan the whole board to find a warrior's cells.
  private cellSets = new Map<number, CellSet>();
  private sortedCells = new Map<number, number[]>(); // (the dead cells' cellsOf cache: a body's is on its Cells)
  /** A code in one of a body's cells changed: its traits are stale (see Cells.fresh). */
  private changed(id: number) { const s = this.cellSets.get(id); if (s instanceof Cells) s.fresh = false; }
  /** A body's cells (its Cells, or undefined with none), linked from the body to save a lookup. */
  private cells(wr: Warrior): Cells | undefined { return (wr[CELLS] ??= this.cellSets.get(wr.id) as Cells | undefined); }

  /** The way `owner` changes (opShift does a bulk equivalent). */
  private setOwner(i: number, v: number) {
    const o = this.owner[i];
    if (o === v) return;
    if (o !== NONE) { this.cellSets.get(o)!.delete(i); if (o === DEBRIS) { this.flesh[i] = 0; this.sortedCells.delete(DEBRIS); } }
    this.owner[i] = v;
    if (v !== NONE) {
      let set = this.cellSets.get(v);
      if (!set) { set = newCells(v); this.cellSets.set(v, set); }
      set.add(i);
      if (v === DEBRIS) this.sortedCells.delete(DEBRIS);
    }
  }

  /** cellsOf for a body in hand (by its link, no lookup by id). */
  private mineOf(wr: Warrior): number[] {
    const c = this.cells(wr);
    return c ? (c.sorted ??= Array.from(Int32Array.from(c.items).sort())) : [];
  }

  /** A warrior's (or DEBRIS's) cells in board order. Treat the array as read-only. */
  cellsOf(id: number): number[] {
    const set = this.cellSets.get(id);
    if (!set) return []; // (the dead: nothing cached for them)
    // Typed-array sort is numeric and native (no comparator callback).
    if (set instanceof Cells) return set.sorted ??= Array.from(Int32Array.from(set.items).sort());
    let out = this.sortedCells.get(id);
    if (!out) {
      out = Array.from(Int32Array.from(set).sort());
      this.sortedCells.set(id, out);
    }
    return out;
  }

  private log(kind: string, text: string, who?: number) {
    this.events.push({ t: this.t, kind, text, who });
    if (this.events.length > 2000) this.events.splice(0, 500);
  }

  // Walls block LoS; cells don't. Bresenham, endpoints excluded.
  clearLine(x0: number, y0: number, x1: number, y1: number): boolean {
    let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, x = x0, y = y0;
    while (true) {
      if (x === x1 && y === y1) return true;
      if (!(x === x0 && y === y0) && this.board.terrain[this.idx(x, y)] !== FLOOR) return false;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  }

  /** Index of one of my cells that sees (x,y) within `range`, or -1. Own cells always count as seen. */
  seer(id: number, x: number, y: number, range = CONFIG.sight, mine?: number[]): number {
    if (this.ownerAt(x, y) === id) return this.idx(x, y);
    for (const c of mine ?? this.cellsOf(id)) {
      const cx = c % this.w, cy = (c / this.w) | 0;
      if (Math.max(Math.abs(cx - x), Math.abs(cy - y)) > range) continue;
      if (this.clearLine(cx, cy, x, y)) return c;
    }
    return -1;
  }

  /** 4-connected check of a warrior's cells from its IP. Returns unreached cells. */
  private unreached(wr: Warrior): number[] {
    const mine = this.mineOf(wr);
    const seen = new Set<number>();
    const start = this.idx(wr.ipX, wr.ipY);
    if (this.owner[start] !== wr.id) return mine;
    const queue = [start];
    seen.add(start);
    while (queue.length) {
      const c = queue.pop()!;
      const x = c % this.w, y = (c / this.w) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d], ny = y + DY[d];
        if (this.ownerAt(nx, ny) !== wr.id) continue;
        const n = this.idx(nx, ny);
        if (!seen.has(n)) { seen.add(n); queue.push(n); }
      }
    }
    return mine.filter((c) => !seen.has(c));
  }

  /** A cell of a body turns to a dead cell, or (island, climb) maybe dissolves. True if it's left as a dead cell. */
  private toDebris(i: number): boolean {
    const o = this.owner[i];
    if (o >= 0) this.warrior(o).cellCount--;
    // Island survival: only part of a seal's body is left to sink, and none of a shark's.
    if ((CONFIG.island || CONFIG.climb) && (CONFIG.island && o >= 0 && this.warrior(o).realm === 1 || this.rng() >= CONFIG.corpse)) { this.setOwner(i, NONE); this.code[i] = 0; return false; }
    this.setOwner(i, DEBRIS);
    return true;
  }

  /** What eating the dead cell at i is worth, as a multiple of an ordinary one. */
  private worth(i: number) { const f = this.flesh[i]; return f ? f / 4 : 1; }

  /** Deaths so far by realm and cause (`0|core frozen`), kept as a tally since dishes forget the dead. */
  deaths = new Map<string, number>();
  private tombstones = new Map<number, Warrior>();

  /** A new child's name: its founder's name and its id. (Counts it in its lineage's births.) */
  private childName(lineage: number, id: number) {
    this.bornIn.set(lineage, (this.bornIn.get(lineage) ?? 1) + 1);
    return `${this.warrior(lineage).name}·${id}`;
  }

  /** Descendants a founder has had (alive or dead). */
  bornCount(lineage: number) { return (this.bornIn.get(lineage) ?? 1) - 1; }

  private kill(wr: Warrior, reason: string) {
    if (!wr.alive) return;
    this.die(wr, reason);
    // Its cells are debris or eaten now: drop its empty cell set (millions of them leaked).
    this.cellSets.delete(wr.id); wr[CELLS] = undefined;
    const k = `${wr.realm}|${reason.replace(/ by .*/, '').replace(/ \(.*/, '')}`;
    this.deaths.set(k, (this.deaths.get(k) ?? 0) + 1);
    // A petri dish runs for hundreds of thousands of births: keeping every dead body
    // ran a long dish out of memory. The dead (founders aside) share one record per
    // lineage, which is all anything needs of them (lineage, realm, not alive). It's made
    // from the founder as it began, not from whichever descendant happened to die first.
    if (CONFIG.endless && wr.gen > 0) {
      let tomb = this.tombstones.get(wr.lineage);
      if (!tomb) {
        const f = this.warrior(wr.lineage), s = f.spec;
        tomb = {
          id: f.id, lineage: f.id, gen: 1, realm: f.realm, zone: f.zone, born: 0, name: `${f.name} (dead)`, alive: false, deathReason: 'dead',
          ipX: 0, ipY: 0, ox: 0, oy: 0, dir: s.dir, stack: [], maxSize: 0, speed: 0, accum: 0, lastOk: true, lastAct: '', cellCount: 0, executed: 0,
          stats: { collected: 0, bombHits: 0, poisonWrites: 0, kills: 0, selfWrites: 0, grows: 0, swaps: 0, flows: 0, oozes: 0, squeezed: 0, rooms: 0 },
          home: f.home, roomsSeen: new Set(), spec: s,
        };
        this.tombstones.set(wr.lineage, tomb);
      }
      this.zoneBodies[wr.id % ZONES][Math.floor(wr.id / ZONES)] = tomb;
    }
  }

  /**
   * A death. Its cells are left as dead cells (island, climb: some of them). A kill (a death
   * within creditWindow ticks of being bitten or written into) leaves a rich corpse: its dead
   * cells share the whole body's worth (duels: a cut of its max size on top), for whoever eats
   * them, the killer or not. Nothing is paid to anyone: a death touches only the dead.
   */
  private die(wr: Warrior, reason: string) {
    wr.alive = false;
    this.livingDirty = true;
    wr.deathReason = reason;
    wr.diedAt = this.t;
    const cells = this.mineOf(wr).slice(), kept: number[] = [];
    for (const c of cells) if (this.toDebris(c)) kept.push(c);
    const kill = wr.harmedAt !== undefined && this.t - wr.harmedAt <= CONFIG.creditWindow;
    if (kill && kept.length) {
      const m = CONFIG.island || CONFIG.climb ? (cells.length + 1) / kept.length : 1 + CONFIG.killPay * wr.maxSize / (CONFIG.debrisPickup * kept.length);
      const q = Math.min(255, Math.round(4 * m));
      for (const c of kept) this.flesh[c] = q;
    }
    this.log('death', `${wr.name} died: ${reason}${kill && kept.length ? ', a rich corpse' : ''}`, wr.id);
  }

  /** Destroy a cell outright (bomb). Handles core loss and disconnection. */
  /** Destroy a cell outright: a bomb (`by`), or the plate's toxin (no `by`). */
  private destroy(i: number, by?: Warrior, cause = 'core poisoned by the toxin') {
    const o = this.owner[i];
    this.setOwner(i, NONE);
    this.code[i] = 0;
    if (o < 0) return;
    const victim = this.warrior(o);
    victim.cellCount--;
    if (by) victim.harmedAt = this.t;
    if (i === this.idx(victim.ipX, victim.ipY)) {
      if (by && by.lineage !== victim.lineage) by.stats.kills++; // (only rivals' kills count in the stats the GA scores)
      this.kill(victim, by ? `core bombed by ${by.name}` : cause);
      return;
    }
    const cut = this.unreached(victim);
    if (cut.length) {
      for (const c of cut) this.toDebris(c);
      this.log('cut', `${victim.name} lost ${cut.length} cells cut off`, victim.id);
    }
  }

  // ---------- tick ----------

  /**
   * One tick: the clock, growth and tiles; plants regrow; dead cells sink; every body's turn,
   * in a rotating order so nobody always moves first; upkeep for every body; the end check.
   */
  tick() {
    if (!this.beginTick()) return;
    this.regrow();
    this.drift();
    // (No copies of the list: births only append to it and deaths filter a new one, so its
    // first n are the bodies alive when each loop began.)
    const living = this.living(), n = living.length;
    for (let k = 0; k < n; k++) { const wr = living[(this.t + k) % n]; if (wr.alive) this.turn(wr); }
    const after = this.living(), m = after.length;
    for (let k = 0; k < m; k++) { const wr = after[k]; if (wr.alive) this.upkeep(wr); }
    this.checkOver();
  }

  /** Start a tick: the clock, the climb's growth and tiles. False once the match is over. */
  private beginTick(): boolean {
    if (this.result.over) return false;
    this.t++;
    if (CONFIG.climb && this.t % 100 === 0) this.growClimb();
    if (CONFIG.climb && (this.t % 20 === 1 || !this.activeTiles.length)) this.refreshTiles();
    return true;
  }

  /** Plants regrow at empty spots (the climb: only in active tiles). */
  private regrow() {
    // Respawn resources at empty spots. A spot doesn't regrow while anything sits on or
    // touches it, so camping a spawn doesn't work: you have to leave and come back.
    const spawns = this.board.spawns;
    if (CONFIG.climb) { for (const t of this.activeTiles) for (const k of this.spawnsInTile[t]) this.regrowSpawn(k); }
    else for (let k = 0; k < spawns.length; k++) this.regrowSpawn(k);
  }

  /** One spawn point's regrowth. */
  private regrowSpawn(k: number) {
    const s = this.board.spawns[k];
    const i = this.idx(s.x, s.y);
    // Food left alone ripens (petri dish): picked-over ground stays poor, untouched ground
    // gets rich, so whoever first breaks into new territory feasts.
    if (CONFIG.foodRipen > 0 && this.resource[i] === 1) this.ripe[i] = Math.min(CONFIG.foodRipeMax, this.ripe[i] + 1 / CONFIG.foodRipen);
    let touched = this.resource[i] !== 0 || this.owner[i] !== NONE;
    for (let d = 0; d < 4 && !touched; d++) touched = this.ownerAt(s.x + DX[d], s.y + DY[d]) !== NONE;
    if (touched) { this.spawnTimers[k] = 0; return; }
    if (++this.spawnTimers[k] >= (CONFIG.climb ? this.regrowAt(s.y) : CONFIG.spawnInterval)) {
      this.resource[i] = s.kind;
      this.ripe[i] = 1;
      this.spawnTimers[k] = 0;
    }
  }

  /** Dead cells sink (island, climb); island sharks arrive. */
  private drift() {
    this.stream(-1);
    if (CONFIG.island || CONFIG.climb) this.islandTick();
    if (this.arriving.length && this.t >= CONFIG.sharkArrive) this.arrive();
  }

  /**
   * Point the rng at this tick's stream for `key` (a body's turn 2·id, its upkeep 2·id+1, the
   * drift −1). Whatever happens inside, kills and births included, draws from that stream.
   */
  private stream(key: number) { this.rng.state = streamSeed(this.seed, this.t, key); }

  /** One body's turn. */
  private turn(wr: Warrior) {
    this.stream(2 * wr.id);
    wr.accum += wr.speed;
    while (wr.accum >= 1 && wr.alive) wr.accum -= this.step(wr);
  }

  /** Upkeep for one living body: whole-body stats, the climb's cold and pressure, pace, hunger, aging; shed or die. */
  private upkeep(wr: Warrior) {
    this.stream(2 * wr.id + 1);
    // Whole-body measures: a tip poking into a corridor mouth is neither leaving nor squeezing.
    const cells = this.cells(wr);
    const tox = this.board.toxinBy ? this.board.toxinBy[wr.realm] : this.board.toxin;
    let doomed: number[] | undefined, swept = false, burn = 0;
    if (cells) {
      const hm = wr.home, w = this.w, narrowAt = this.narrow;
      let home = 0, narrow = 0, x0 = w, y0 = this.h, x1 = -1, y1 = -1;
      // (Where the cells are only matters until it has left home, or where there are rooms to visit.)
      if (wr.leftHomeAt === undefined || this.board.rooms.length) {
        for (const c of cells) {
          const y = (c / w) | 0, x = c - y * w;
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
          if (x >= hm.x && y >= hm.y && x < hm.x + hm.w && y < hm.y + hm.h) home++;
          if (narrowAt[c]) narrow++;
        }
      } else if (CONFIG.climb && !tox) {
        // (One pass for the narrow passages and the climb's cold and pressure below: the
        // same draws in the same order, from one walk of the cells instead of two.)
        const tr = this.freshTraits(wr, cells as Cells), st = this.board.step!, insulation = tr.insulation, armor = tr.armor;
        const shell = CONFIG.shellBurn, fat = CONFIG.fatBurn;
        const items = (cells as Cells).items;
        for (let j = 0; j < items.length; j++) {
          const c = items[j];
          if (narrowAt[c]) narrow++;
          const n = st[c], g = this.code[c];
          burn += (g === K || g === INSUL ? shell : g === FAT ? fat : 1) * (1 << (n < 0 ? -n : n));
          if (!n) continue;
          const over = n > 0 ? n - insulation : -n - armor;
          if (over > 0 && this.rng() < CONFIG.toxinRate * CONFIG.toxinStep ** (over - 1)) (doomed ??= []).push(c);
        }
        swept = true;
      } else for (const c of cells) if (narrowAt[c]) narrow++;
      if (wr.leftHomeAt === undefined && home === 0 && cells.size > 0) {
        wr.leftHomeAt = this.t;
        this.log('left', `${wr.name} left its start room (whole body)`, wr.id);
      }
      if (cells.size >= 4 && 2 * narrow >= cells.size) wr.stats.squeezed++;
      const rooms = this.board.rooms;
      if (home === 0) for (let k = 0; k < rooms.length; k++) {
        const r = rooms[k];
        if (x0 < r.x || y0 < r.y || x1 >= r.x + r.w || y1 >= r.y + r.h || wr.roomsSeen.has(k)) continue;
        if (r.x === hm.x && r.y === hm.y) continue;
        wr.roomsSeen.add(k);
        wr.stats.rooms++;
        this.log('room', `${wr.name} moved its whole body into another room`, wr.id);
      }
    }
    // Plate toxin: each cell on a level above my armor (my K cells) may die.
    if (tox && cells) {
      let armor = 0;
      for (const c of cells) if (this.code[c] === K) armor++;
      const doomed: number[] = [];
      for (const c of cells) { const over = tox[c] - armor; if (over > 0 && this.rng() < CONFIG.toxinRate * CONFIG.toxinStep ** (over - 1)) doomed.push(c); }
      const cause = !this.board.toxinBy ? undefined : wr.realm ? 'core crushed (too shallow)' : 'core crushed by the pressure';
      for (const c of doomed) { if (!wr.alive) break; if (this.owner[c] === wr.id) this.destroy(c, undefined, cause); }
      if (!wr.alive) return;
    }
    if (CONFIG.climb && cells) {
      // The Climb: too high freezes (short of insulation), too deep crushes (short of armor),
      // one level per step short, as harsh as the island's pressure.
      const st = this.board.step!;
      if (!swept) {
        const tr = this.freshTraits(wr, cells as Cells), shell = CONFIG.shellBurn, fat = CONFIG.fatBurn;
        for (const c of cells) {
          const n = st[c], g = this.code[c];
          burn += (g === K || g === INSUL ? shell : g === FAT ? fat : 1) * (1 << (n < 0 ? -n : n));
          if (!n) continue;
          const over = n > 0 ? n - tr.insulation : -n - tr.armor;
          if (over > 0 && this.rng() < CONFIG.toxinRate * CONFIG.toxinStep ** (over - 1)) (doomed ??= []).push(c);
        }
      }
      if (doomed) for (const c of doomed) { if (!wr.alive) break; if (this.owner[c] === wr.id) this.destroy(c, undefined, st[c] > 0 ? 'core frozen (too high)' : 'core crushed by the pressure'); }
      if (!wr.alive) return;
    }
    if (CONFIG.island || CONFIG.climb) {
      // Island survival: the body sets the pace, and the pace sets speed, hunger and aging,
      // so every body gets about the same meals (and moves) per lifetime. An unfed body at
      // pace 1 with max size 20 lasts `starve` ticks. The Climb: pace sets speed and aging,
      // but hunger is the body's upkeep: every cell burns, whatever the pace (see burn above).
      const pace = CONFIG.climb ? (wr.traits ??= this.traitsOf(wr)).pace : this.paceOf(wr);
      wr.pace = pace;
      wr.speed = CONFIG.paceSpeed * pace;
      if (CONFIG.climb) wr.maxSize = Math.max(0, wr.maxSize - burn * CONFIG.stomach / CONFIG.climbStarve);
      else {
        const hunger = pace * (Math.sqrt(20) - 1) * 2 * Math.sqrt(CONFIG.startSize) / CONFIG.sizeDecay / (wr.realm ? CONFIG.sharkStarve : CONFIG.starve);
        wr.maxSize = Math.max(0, wr.maxSize - hunger * CONFIG.sizeDecay * Math.sqrt(wr.maxSize / CONFIG.startSize));
      }
      wr.aged = (wr.aged ?? 0) + pace;
    } else {
      wr.maxSize = Math.max(0, wr.maxSize - CONFIG.sizeDecay * Math.sqrt(wr.maxSize / CONFIG.startSize));
      wr.speed = Math.max(CONFIG.speedFloor, wr.speed - CONFIG.speedDecay);
    }
    if (wr.maxSize < 1) this.kill(wr, 'starved (max size fell to 0)');
    else if (wr.cellCount > Math.floor(wr.maxSize)) this.shed(wr);
    if (!wr.alive) return;
    if (wr.cellCount <= 0) this.kill(wr, 'no cells left');
    else if (wr.diesAt !== undefined && (CONFIG.island || CONFIG.climb ? (wr.aged ?? 0) >= wr.diesAt - wr.born : this.t >= wr.diesAt)) this.kill(wr, 'old age');
    else wr.zone = this.zoneOf(wr.ipX);
  }

  /** The Climb: a body's traits, recomputed only if its cells changed since (see Cells.fresh). */
  private freshTraits(wr: Warrior, cells: Cells): Traits {
    if (wr.traits && cells.fresh) return wr.traits;
    cells.fresh = true;
    return wr.traits = this.traitsOf(wr);
  }

  /**
   * Island survival: a settled archipelago. Each islander founder gets CONFIG.seals copies
   * of itself (its descendants, generation 1) scattered through the calm water.
   */
  private settle() {
    for (const f of this.livingList.filter((w) => w.realm === 0 && w.gen === 0)) {
      const S = this.board.surface ?? 0, calm = this.board.calmLine ?? S;
      // (The Climb: each founder's copies spread across its own start.)
      const room = this.board.starts[f.spec.realm === 'deep' ? 1 : 0];
      for (let n = 0, tries = 0; n < CONFIG.seals && tries < CONFIG.seals * 50; tries++) {
        const bay = this.board.starts[1], x0 = bay.x + bay.w + 2; // (not in the sharks' walled bay)
        const ox = CONFIG.climb ? room.x + Math.floor(this.rng() * Math.max(1, room.w - f.spec.width)) : x0 + Math.floor(this.rng() * (this.w - 1 - x0 - f.spec.width));
        const oy = CONFIG.climb ? room.y + Math.floor(this.rng() * Math.max(1, room.h - f.spec.height)) : S + Math.floor(this.rng() * Math.max(1, calm - S - f.spec.height));
        if (!f.spec.cells.every((c) => this.isFree(ox + c.x, oy + c.y))) continue;
        const zone = this.zoneOf(ox + f.spec.ip.x), id = this.nextId(zone);
        const wr: Warrior = shaped({
          ...f, id, zone, gen: 1, parent: f.id, name: this.childName(f.lineage, id), ipX: ox + f.spec.ip.x, ipY: oy + f.spec.ip.y, ox: ox + f.spec.ip.x, oy: oy + f.spec.ip.y,
          stack: [], cellCount: 0, executed: 0, roomsSeen: new Set(),
          stats: { collected: 0, bombHits: 0, poisonWrites: 0, kills: 0, selfWrites: 0, grows: 0, swaps: 0, flows: 0, oozes: 0, squeezed: 0, rooms: 0 },
        });
        if (CONFIG.lifespan > 0) wr.diesAt = Math.floor(this.lifeOf(0) * (0.5 + this.rng()));
        this.enroll(wr);
        for (const c of f.spec.cells) { const i = this.idx(ox + c.x, oy + c.y); this.setOwner(i, id); this.code[i] = c.code; wr.cellCount++; }
        n++;
      }
    }
  }

  /**
   * Island survival: a body's pace, from what it's made of. Move cells (M) quicken it; mass
   * slows it, with armor (K) and fat (.) counting double. The seal founder is 1.
   */
  paceOf(wr: Warrior): number {
    let m = 0, mass = 0;
    for (const c of this.mineOf(wr)) {
      const g = this.code[c];
      if (g === CODE['M']) m++;
      mass += g === K || g === CODE['.'] ? 2 : 1;
    }
    return (1 + m) / (1 + mass / CONFIG.paceMass);
  }

  /** Size cap for a realm (island sea creatures are big and need room to breed; a climb body's store is its cells', fat holding most). */
  private capOf(wr: Warrior) {
    if (CONFIG.climb) {
      const cells = this.cells(wr), fat = cells ? this.freshTraits(wr, cells).fat : 0;
      return CONFIG.stomach * (wr.cellCount - fat) + CONFIG.fatStore * fat;
    }
    return CONFIG.island && wr.realm === 1 ? CONFIG.sharkCap : CONFIG.sizeCap;
  }

  /**
   * The Climb: a body's chemistry. Each cell adds to its traits: K armor, I insulation, M
   * move, B bite (and a taste for meat), C a taste for plants (if C outnumber B); K, I and fat (.) weigh 2, the
   * rest 1. Modifier cells change the cells beside them (of the same body): ~ flips K ⇄ I,
   * x doubles a cell's trait, n makes a cell weigh nothing. Pace = (1 + move) / (1 + mass / 11).
   */
  traitsOf(wr: Warrior): Traits {
    const w = this.w, id = wr.id;
    let armor = 0, insulation = 0, mass = 0, move = 0, bite = 0, plants = 0, meat = 0, fat = 0;
    const cells = (this.cellSets.get(id) as Cells | undefined)?.items;
    if (cells) for (let j = 0; j < cells.length; j++) {
      const c = cells[j];
      let g = this.code[c], flip = false, dbl = 1, weightless = false;
      for (let k = 0; k < 4; k++) {
        const nb = k === 0 ? c - 1 : k === 1 ? c + 1 : k === 2 ? c - w : c + w;
        if (this.owner[nb] !== id) continue;
        const m = this.code[nb];
        if (m === FLIP) flip = !flip; else if (m === DOUBLE) dbl *= 2; else if (m === MASK) weightless = true;
      }
      if (flip) g = g === K ? INSUL : g === INSUL ? K : g;
      if (!weightless) mass += g === K || g === INSUL || g === FAT ? 2 : 1;
      if (g === K) armor += dbl;
      else if (g === INSUL) insulation += dbl;
      else if (g === MOVE) move += dbl;
      else if (g === BITE) { bite += dbl; meat++; }
      else if (g === COLLECT) plants++;
      else if (g === FAT) fat++;
    }
    // Diet: any B gives a taste for meat; plants need more C than B (so a hunter's one C, for collecting, doesn't make it a grazer).
    return { armor, insulation, mass, fat, move, bite: Math.max(1, bite), plants: plants > meat, meat: meat > 0, pace: (1 + move) / (1 + mass / CONFIG.paceMass) };
  }

  /** The Climb: how much of a food a body digests (a body that eats both gets 60% of each). */
  private dietShare(wr: Warrior, food: 'plants' | 'meat') {
    const t = wr.traits;
    if (!CONFIG.climb || !t) return 1;
    if (!t[food]) return 0;
    return t.plants && t.meat ? 0.6 : 1;
  }

  /** Typical lifespan for a realm (island sea creatures live CONFIG.sharkLife times longer). */
  private lifeOf(realm: number) { return CONFIG.lifespan * (CONFIG.island && realm === 1 ? CONFIG.sharkLife : 1); }

  /** Island survival: weather opens the reef channel and the waiting sea founders swim in, each once its spot is clear. */
  private arrive() {
    if (this.board.reef?.length) {
      for (const i of this.board.reef) this.board.terrain[i] = FLOOR;
      this.board.reef = [];
      this.terrainVersion++;
      this.log('arrive', 'weather opens a channel through the reef');
    }
    for (let k = 0; k < this.arriving.length; k++) {
      const spec = this.arriving[k];
      // Any clear spot in the bay, top rows first.
      const room = this.board.starts[this.board.startRealm!.indexOf(1)];
      let at: [number, number] | null = null;
      for (let oy = room.y + 1; oy + spec.height <= room.y + room.h && !at; oy += 2) {
        for (let ox = room.x; ox + spec.width <= room.x + room.w && !at; ox++) {
          if (spec.cells.every((c) => this.isFloor(ox + c.x, oy + c.y) && this.owner[this.idx(ox + c.x, oy + c.y)] === NONE)) at = [ox, oy];
        }
      }
      if (!at) continue;
      const wr = this.place(spec, at);
      wr.born = this.t;
      if (CONFIG.lifespan > 0) wr.diesAt = this.t + Math.floor(this.lifeOf(1) * (0.5 + this.rng()));
      this.arriving.splice(k--, 1);
      this.log('arrive', `${spec.name} arrives`, wr.id);
    }
  }

  /** Island survival, once a tick: dead cells sink (and rot where they can't). */
  private islandTick() {
    if (this.t % CONFIG.sinkEvery === 0) this.sink(this.cellsOf(DEBRIS).slice().reverse());
  }

  /**
   * Dead cells sink, bottom rows first so a column of them falls together, and rot where they
   * can't. Each column draws from its own stream, so columns don't depend on each other.
   * `dead` is in descending index order.
   */
  private sink(dead: number[]) {
    const col = new Map<number, number>();
    for (const c of dead) {
      const below = c + this.w, x = c % this.w;
      // Through vegetation too (a dead cell may rest on a plant; whoever eats there gets both).
      if (this.isFloor(x, ((c / this.w) | 0) + 1) && this.owner[below] === NONE) {
        this.setOwner(below, DEBRIS); this.code[below] = this.code[c]; this.flesh[below] = this.flesh[c];
        this.setOwner(c, NONE); this.code[c] = 0;
        continue;
      }
      this.rng.state = col.get(x) ?? streamSeed(this.seed, this.t, -2 - x);
      const rot = this.rng() < CONFIG.rot * CONFIG.sinkEvery;
      col.set(x, this.rng.state);
      if (rot) { this.setOwner(c, NONE); this.code[c] = 0; }
    }
  }

  /**
   * Upkeep: lose one cell. Burn fat first: the farthest `.` (no-op) cell whose removal
   * keeps the body connected. With no fat, drop the cell farthest (by path) from the IP,
   * which can never disconnect the rest — but is usually code, so the program rots.
   */
  private shed(wr: Warrior) {
    const start = this.idx(wr.ipX, wr.ipY);
    const dist = new Map<number, number>([[start, 0]]);
    const queue = [start];
    for (let q = 0; q < queue.length; q++) {
      const c = queue[q];
      const x = c % this.w, y = (c / this.w) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d], ny = y + DY[d];
        if (this.ownerAt(nx, ny) !== wr.id) continue;
        const ni = this.idx(nx, ny);
        if (!dist.has(ni)) { dist.set(ni, dist.get(c)! + 1); queue.push(ni); }
      }
    }
    const byFar = queue.slice(1).reverse(); // BFS order reversed = farthest first
    if (!byFar.length) return;
    let drop = byFar[0];
    for (const c of byFar) {
      if (this.code[c] !== CODE['.']) continue;
      this.setOwner(c, NONE);
      const ok = this.unreached(wr).length === 0;
      this.setOwner(c, wr.id);
      if (ok) { drop = c; break; }
    }
    // Shed cells vanish rather than becoming debris: otherwise grow → shed → collect
    // the debris is a free-size loop.
    const lost = GLYPHS[this.code[drop]] ?? '.';
    this.setOwner(drop, NONE);
    this.code[drop] = 0;
    wr.cellCount--;
    this.log('shed', `${wr.name} shed ${lost === '.' ? 'fat' : `code '${lost}'`} (max size ${Math.floor(wr.maxSize)})`, wr.id);
  }

  /** True when every living warrior is of one lineage (only possible once someone divides). */
  private oneTeamLeft(): boolean {
    let team = -1;
    for (const w of this.living()) {
      if (team === -1) team = w.lineage; else if (w.lineage !== team) return false;
    }
    return team !== -1 && this.allWarriors().some((w) => w.lineage !== team);
  }

  private checkOver() {
    const living = this.living().length;
    if (CONFIG.endless && this.t < CONFIG.tickCap) return;
    if (living > 1 && this.t < CONFIG.tickCap && !this.oneTeamLeft()) return; // nothing to decide
    // Lineages: each founder and everything it DIVIDEd into. Matches are won by lineages.
    const founders = [...this.bornIn.keys()];
    const teams = new Map<number, Warrior[]>();
    for (const w of this.living()) teams.set(w.lineage, [...(teams.get(w.lineage) ?? []), w]);
    if (founders.length > 1 && teams.size <= 1) {
      this.result = teams.size
        ? { over: true, winner: [...teams.keys()][0], reason: 'last standing' }
        : { over: true, winner: null, reason: 'mutual destruction' };
    } else if (founders.length === 1 && teams.size === 0) {
      this.result = { over: true, winner: null, reason: 'died' };
    } else if (this.t >= CONFIG.tickCap) {
      // Bodies decide it: the lineage with the most cells on the board. Collecting only
      // raises max size (the most cells a body may have), so winning on size means both
      // feeding and GROWing into it before decay sheds it again. A lineage counts all its
      // members' cells. Ties break on max size, then speed.
      const keys = (ms: Warrior[]) => [
        ms.reduce((a, w) => a + w.cellCount, 0),
        ms.reduce((a, w) => a + w.maxSize, 0),
        ms.reduce((a, w) => a + w.speed, 0),
      ];
      const ranked = [...teams.entries()].map(([team, ms]) => ({ team, k: keys(ms) }));
      const cmp = (a: { k: number[] }, b: { k: number[] }) => {
        for (let k = 0; k < a.k.length; k++) if (Math.abs(a.k[k] - b.k[k]) >= 0.01) return b.k[k] - a.k[k];
        return 0;
      };
      ranked.sort(cmp);
      const tied = ranked.length > 1 && cmp(ranked[0], ranked[1]) === 0;
      const top = ranked[0], next = ranked[1];
      const by = !next || Math.abs(top.k[0] - next.k[0]) >= 0.01 ? `biggest body (${top.k[0]} cells)`
        : Math.abs(top.k[1] - next.k[1]) >= 0.01 ? `bodies tied, larger max size (${top.k[1].toFixed(1)})`
        : `bodies and max size tied, faster (${top.k[2].toFixed(2)})`;
      this.result = tied
        ? { over: true, winner: null, reason: 'draw at tick cap' }
        : { over: true, winner: top.team, reason: `${by} at tick cap` };
    }
    if (this.result.over) this.log('over', this.result.winner === null
      ? `Match over: ${this.result.reason}`
      : `${this.warrior(this.result.winner).name} wins: ${this.result.reason}`);
  }

  // ---------- interpreter ----------

  /** The point instruction offsets are measured from. */
  private frame(wr: Warrior): [number, number] {
    return [wr.ox, wr.oy];
  }

  private pop(wr: Warrior): number { return wr.stack.length ? wr.stack.pop()! : 0; }
  private push(wr: Warrior, v: number) {
    wr.stack.push(v | 0);
    if (wr.stack.length > CONFIG.stackMax) wr.stack.shift();
  }

  /**
   * Move the IP to the next own cell in its direction, wrapping within the body: of the body's
   * cells on the IP's row (or column), the nearest ahead, counting on round the board's edge.
   * (From the body's own cells: walking the board would cross its whole width to find them.)
   */
  private advance(wr: Warrior) {
    const cells = this.mineOf(wr); // (the array: quicker to walk than the set, and any order will do)
    const w = this.w, dir = wr.dir;
    let best = -1, bestD = Infinity;
    if (dir === 0 || dir === 2) {
      const row0 = wr.ipY * w, pos = wr.ipX, fwd = dir === 0;
      for (const c of cells) {
        const p = c - row0;
        if (p < 0 || p >= w || p === pos) continue;
        const d = fwd ? (p > pos ? p - pos : p - pos + w) : (p < pos ? pos - p : pos - p + w);
        if (d < bestD) { bestD = d; best = c; }
      }
    } else {
      const h = this.h, x = wr.ipX, pos = wr.ipY, fwd = dir === 1;
      for (const c of cells) {
        const p = (c - x) / w;
        if (p !== (p | 0) || p === pos) continue; // (not in the IP's column, or the IP's own cell)
        const d = fwd ? (p > pos ? p - pos : p - pos + h) : (p < pos ? pos - p : pos - p + h);
        if (d < bestD) { bestD = d; best = c; }
      }
    }
    if (best >= 0) this.setIp(wr, best);
  }

  private setIp(wr: Warrior, i: number) {
    wr.ipX = i % this.w;
    wr.ipY = (i / this.w) | 0;
  }

  /** Execute one instruction. Returns its cycle cost. */
  private step(wr: Warrior): number {
    const op = this.code[this.idx(wr.ipX, wr.ipY)], g = GLYPHS[op] ?? '.';
    wr.executed++;
    let skip = false;
    let cost = OP_COST[op] ?? 1;
    // (pop/push are called directly: closures here would allocate on every instruction.)

    switch (g) {
      case '>': wr.dir = 0; break;
      case 'v': wr.dir = 1; break;
      case '<': wr.dir = 2; break;
      case '^': wr.dir = 3; break;
      case '_': wr.dir = this.pop(wr) === 0 ? 0 : 2; break;
      case '|': wr.dir = this.pop(wr) === 0 ? 1 : 3; break;
      case '#': skip = true; break;
      case '?': wr.dir = Math.floor(this.rng() * 4); break;
      case '@': this.kill(wr, 'executed @'); return 1;
      case 'r': wr.dir = (wr.dir + 2) % 4; break;
      case '[': wr.dir = (wr.dir + 3) % 4; break;
      case ']': wr.dir = (wr.dir + 1) % 4; break;
      case ':': { const a = this.pop(wr); this.push(wr, a); this.push(wr, a); break; }
      case '\\': { const b = this.pop(wr), a = this.pop(wr); this.push(wr, b); this.push(wr, a); break; }
      case '$': this.pop(wr); break;
      case 'o': { const b = this.pop(wr), a = this.pop(wr); this.push(wr, a); this.push(wr, b); this.push(wr, a); break; }
      case '+': { const b = this.pop(wr), a = this.pop(wr); this.push(wr, a + b); break; }
      case '-': { const b = this.pop(wr), a = this.pop(wr); this.push(wr, a - b); break; }
      case '*': { const b = this.pop(wr), a = this.pop(wr); this.push(wr, a * b); break; }
      case '/': { const b = this.pop(wr), a = this.pop(wr); this.push(wr, b === 0 ? 0 : Math.trunc(a / b)); break; }
      case '%': { const b = this.pop(wr), a = this.pop(wr); this.push(wr, b === 0 ? 0 : a % b); break; }
      case '!': this.push(wr, this.pop(wr) === 0 ? 1 : 0); break;
      case '`': { const b = this.pop(wr), a = this.pop(wr); this.push(wr, a > b ? 1 : 0); break; }
      case '=': { const b = this.pop(wr), a = this.pop(wr); this.push(wr, a === b ? 1 : 0); break; }
      case "'": {
        const sx = wr.ipX, sy = wr.ipY;
        this.advance(wr);
        this.push(wr, this.code[this.idx(wr.ipX, wr.ipY)]);
        wr.ipX = sx; wr.ipY = sy;
        skip = true;
        break;
      }
      case 'y': { const n = this.pop(wr); this.push(wr, n > 0 ? Math.floor(this.rng() * n) : 0); break; }
      case 's': this.push(wr, wr.cellCount); break;
      case 'm': this.push(wr, Math.floor(wr.maxSize)); break;
      case 'f': this.push(wr, Math.floor(wr.speed * 10)); break;
      case 'd': this.push(wr, wr.dir); break;
      case 'e': this.push(wr, wr.lastOk ? 1 : 0); break;
      case 'L': this.opLook(wr); break;
      case 'S': this.opScan(wr); break;
      case 'R': this.opRead(wr); break;
      case 'T': {
        const dy = this.pop(wr), dx = this.pop(wr);
        if (dx === 0 && dy === 0) this.push(wr, Math.floor(this.rng() * 4));
        else if (Math.abs(dx) >= Math.abs(dy)) this.push(wr, dx > 0 ? 0 : 2);
        else this.push(wr, dy > 0 ? 1 : 3);
        break;
      }
      case 'M': wr.lastOk = this.opShift(wr, this.pop(wr)); break;
      case 'A': wr.lastOk = this.opOoze(wr, this.pop(wr)); break;
      case 'F': { const d = this.pop(wr), dy = this.pop(wr), dx = this.pop(wr); wr.lastOk = this.opFlow(wr, dx, dy, d); break; }
      case 'X': {
        const dy2 = this.pop(wr), dx2 = this.pop(wr), dy1 = this.pop(wr), dx1 = this.pop(wr);
        wr.lastOk = this.opSwap(wr, dx1, dy1, dx2, dy2);
        break;
      }
      case 'G': wr.lastOk = this.opGrow(wr, this.pop(wr)); break;
      case 'C': wr.lastOk = this.opCollect(wr); break;
      case 'B': {
        if (!wr.stack.length) { wr.lastOk = this.opBombNearest(wr); break; } // empty stack: the nearest foreign cell
        const dy = this.pop(wr), dx = this.pop(wr);
        const [fx, fy] = this.frame(wr);
        wr.lastOk = this.opBombAt(wr, fx + dx, fy + dy);
        break;
      }
      case 'W': { const c = this.pop(wr), dy = this.pop(wr), dx = this.pop(wr); wr.lastOk = this.opWrite(wr, dx, dy, c); break; }
      // Copying costs a cycle per cell; a failed attempt costs 1.
      case 'D': { const before = wr.cellCount; wr.lastOk = this.opDivide(wr, this.pop(wr)); cost = wr.lastOk ? Math.max(1, before) : 1; break; }
      default:
        if (g >= '0' && g <= '9') this.push(wr, g.charCodeAt(0) - 48);
        break;
    }
    if (OP_ACTS[op]) wr.lastAct = g;
    if (!wr.alive) return cost;
    this.advance(wr);
    if (skip) this.advance(wr);
    return cost;
  }

  // ---------- sensing ----------

  private classify(x: number, y: number, me: number): number {
    if (!this.isFloor(x, y)) return T_WALL;
    const i = this.idx(x, y);
    const o = this.owner[i];
    if (o === DEBRIS) return T_DEBRIS;
    if (o >= 0 && o !== me) return T_ENEMY; // kin included: copies are rivals like anyone else
    if (this.resource[i] === 1) return T_SIZE;
    if (this.resource[i] === 2) return T_SPEED;
    return T_NOTHING;
  }

  private opLook(wr: Warrior) {
    const d = ((this.pop(wr) % 4) + 4) % 4;
    let x = wr.ipX, y = wr.ipY;
    for (let dist = 1; dist <= CONFIG.sight; dist++) {
      x += DX[d]; y += DY[d];
      if (this.ownerAt(x, y) === wr.id) continue;
      const t = this.classify(x, y, wr.id);
      if (t !== T_NOTHING) { this.push(wr, dist); this.push(wr, t); return; }
    }
    this.push(wr, 0);
    this.push(wr, T_NOTHING);
  }

  private opScan(wr: Warrior) {
    const type = this.pop(wr);
    const mine = this.mineOf(wr);
    const r = CONFIG.sight;
    const [fx, fy] = this.frame(wr);
    if (CONFIG.climb) { this.ringScan(wr, type, mine, fx, fy); return; }
    // Candidates come from where such things can be (other warriors' cells, debris,
    // spawn points), limited to a window around the IP, nearest the frame origin first,
    // ties in board order.
    const x0 = Math.max(0, wr.ipX - r - 16), x1 = Math.min(this.w - 1, wr.ipX + r + 16);
    const y0 = Math.max(0, wr.ipY - r - 16), y1 = Math.min(this.h - 1, wr.ipY + r + 16);
    const cands: [number, number, number, number][] = []; // dist, index, x, y
    const consider = (i: number) => {
      const x = i % this.w, y = (i / this.w) | 0;
      if (x < x0 || x > x1 || y < y0 || y > y1) return;
      if (CONFIG.island && wr.realm === 1 && y < (this.board.sharkLine ?? 0)) return; // sharks can't see into the shallows
      const t = this.classify(x, y, wr.id);
      const match = type === T_RESOURCE ? (t === T_SIZE || t === T_SPEED) : t === type;
      if (!match || t === T_WALL || t === T_NOTHING) return;
      cands.push([Math.abs(x - fx) + Math.abs(y - fy), i, x, y]);
    };
    if (type === T_ENEMY) {
      // (Island survival: only the other realm: a shark scanning for prey never finds sharks.)
      for (const other of this.living()) if (other.id !== wr.id && !(CONFIG.island && other.realm === wr.realm)) for (const i of this.cellSets.get(other.id) ?? []) consider(i);
    } else if (type === T_DEBRIS) {
      for (const i of this.cellSets.get(DEBRIS) ?? []) consider(i);
    } else if (type === T_SIZE || type === T_SPEED || type === T_RESOURCE) {
      for (const sp of this.board.spawns) consider(this.idx(sp.x, sp.y));
    }
    cands.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    for (const [, , x, y] of cands) {
      if (this.seer(wr.id, x, y, r, mine) >= 0) {
        this.push(wr, x - fx);
        this.push(wr, y - fy);
        this.push(wr, 1);
        return;
      }
    }
    this.push(wr, 0); this.push(wr, 0); this.push(wr, 0);
  }

  /**
   * The Climb's SCAN: the same answer as the classic scan (nearest to the frame origin,
   * then board order, among things in sight), found by searching outward ring by ring
   * (Manhattan distance from the frame origin) and stopping at the first match it can see,
   * so its cost follows what's near, not how big the world is.
   */
  private ringScan(wr: Warrior, type: number, mine: number[], fx: number, fy: number) {
    const r = CONFIG.sight, maxD = 2 * (r + 16), W = this.w;
    // Only what's within sight range of one of my cells can be seen: the window shrinks to
    // my body's bounding box grown by r (usually far smaller than the window round the IP).
    let bx0 = W, bx1 = -1;
    for (const c of mine) { const x = c % W; if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; }
    const by0 = mine.length ? (mine[0] / W) | 0 : this.h, by1 = mine.length ? (mine[mine.length - 1] / W) | 0 : -1;
    const x0 = Math.max(0, wr.ipX - r - 16, bx0 - r), x1 = Math.min(W - 1, wr.ipX + r + 16, bx1 + r);
    const y0 = Math.max(0, wr.ipY - r - 16, by0 - r), y1 = Math.min(this.h - 1, wr.ipY + r + 16, by1 + r);
    // One sweep of the window collects the matches, keyed (distance, board index), and they're
    // tried nearest first: the same order as searching ring by ring, at a fraction of the cost.
    // (classify, inlined: this is the hottest loop in a climb. The window is inside the board.)
    const terrain = this.board.terrain, owner = this.owner, resource = this.resource, me = wr.id;
    const keys = SCAN_KEYS;
    let n = 0;
    for (let y = y0; y <= y1; y++) {
      const ady = y < fy ? fy - y : y - fy;
      if (ady > maxD) continue;
      const row = y * W;
      for (let x = x0; x <= x1; x++) {
        const i = row + x, o = owner[i], res = resource[i];
        if (o === NONE && res === 0) continue;
        if (terrain[i] !== FLOOR) continue;
        const t = o === DEBRIS ? T_DEBRIS : o >= 0 && o !== me ? T_ENEMY : res === 1 ? T_SIZE : res === 2 ? T_SPEED : T_NOTHING;
        if (t === T_NOTHING) continue;
        if (!(type === T_RESOURCE ? t === T_SIZE || t === T_SPEED : t === type)) continue;
        if (t === T_ENEMY && this.warrior(o).lineage === wr.lineage) continue; // (your own kind isn't prey)
        const d = ady + (x < fx ? fx - x : x - fx);
        if (d > maxD) continue;
        keys[n++] = d * 4294967296 + i; // (exact in a double: a grown world has well over 2^24 cells)
      }
    }
    const found = keys.subarray(0, n).sort();
    for (let k = 0; k < n; k++) {
      const i = found[k] % 4294967296, x = i % W, y = (i / W) | 0;
      if (this.seer(wr.id, x, y, r, mine) >= 0) { this.push(wr, x - fx); this.push(wr, y - fy); this.push(wr, 1); return; }
    }
    this.push(wr, 0); this.push(wr, 0); this.push(wr, 0);
  }

  private opRead(wr: Warrior) {
    const dy = this.pop(wr), dx = this.pop(wr);
    const [fx, fy] = this.frame(wr);
    const x = fx + dx, y = fy + dy;
    if (!this.inBounds(x, y) || this.owner[this.idx(x, y)] === NONE || this.seer(wr.id, x, y) < 0) {
      this.push(wr, -1);
      return;
    }
    this.push(wr, this.code[this.idx(x, y)]);
  }

  // ---------- actions ----------

  private opShift(wr: Warrior, d: number): boolean {
    d = ((d % 4) + 4) % 4;
    const mine = this.mineOf(wr);
    for (const c of mine) {
      const nx = (c % this.w) + DX[d], ny = ((c / this.w) | 0) + DY[d];
      if (this.ownerAt(nx, ny) === wr.id) continue;
      if (!this.passable(wr, nx, ny)) return false;
    }
    // Island survival: a sea creature eats the dead cells it swims into.
    if (CONFIG.island && wr.realm === 1) {
      for (const c of mine) {
        const t = c + DY[d] * this.w + DX[d];
        if (this.owner[t] !== DEBRIS) continue;
        const feed = CONFIG.seaFeed * this.worth(t);
        this.setOwner(t, NONE);
        this.code[t] = 0;
        wr.maxSize = Math.min(this.capOf(wr), wr.maxSize + feed);
        wr.stats.collected++;
      }
    }
    // Bulk move, bypassing setOwner: every destination was free or mine, so no other
    // owner's cells change, and a translation keeps board order, so the moved list is
    // still sorted. (In place: the sorted list is ours, and the set is refilled in board
    // order, as a fresh one would be.)
    const n = mine.length, codes = SHIFT_CODES.length >= n ? SHIFT_CODES : (SHIFT_CODES = new Uint8Array(2 * n));
    const owner = this.owner, code = this.code, id = wr.id, delta = DY[d] * this.w + DX[d];
    for (let k = 0; k < n; k++) { const c = mine[k]; codes[k] = code[c]; owner[c] = NONE; code[c] = 0; }
    let set = this.cells(wr);
    const fresh = !!set?.fresh;
    if (set) set.clear(); else this.cellSets.set(id, set = new Cells());
    for (let k = 0; k < n; k++) { const c = (mine[k] += delta); owner[c] = id; code[c] = codes[k]; set.add(c); }
    set.sorted = mine; set.fresh = fresh;
    wr.ipX += DX[d];
    wr.ipY += DY[d];
    wr.ox += DX[d];
    wr.oy += DY[d];
    return true;
  }

  /**
   * OOZE: amoeboid movement, one cell at a time. My rearmost cell (least far along d) that
   * can leave without splitting the body moves, code and all, to the free floor touching
   * the rest of the body that is farthest along d (ties: nearest my body's middle across
   * d). It must end up farther along d than it was. Repeated, a body pours itself through
   * any gap, its program rearranged on the way. The IP and the frame origin ride the cell
   * under them.
   */
  private opOoze(wr: Warrior, d: number): boolean {
    d = ((d % 4) + 4) % 4;
    const id = wr.id, w = this.w;
    const mine = this.cellsOf(id);
    if (mine.length < 2) return this.opShift(wr, d);
    const along = (c: number) => (c % w) * DX[d] + ((c / w) | 0) * DY[d];
    const across = (c: number) => (c % w) * DY[d] - ((c / w) | 0) * DX[d];
    let mid = 0;
    for (const c of mine) mid += across(c);
    mid /= mine.length;
    // Sources, rearmost first.
    const order = mine.slice().sort((a, b) => along(a) - along(b) || a - b);
    for (const src of order) {
      // The rest must stay connected without src.
      const rest = mine.length - 1;
      const start = mine[0] === src ? mine[1] : mine[0];
      const seen = new Set([start]);
      const queue = [start];
      while (queue.length) {
        const c = queue.pop()!;
        const x = c % w, y = (c / w) | 0;
        for (let k = 0; k < 4; k++) {
          const nx = x + DX[k], ny = y + DY[k];
          if (!this.inBounds(nx, ny)) continue;
          const n = ny * w + nx;
          if (n !== src && this.owner[n] === id && !seen.has(n)) { seen.add(n); queue.push(n); }
        }
      }
      if (seen.size !== rest) continue;
      // Destination: free floor touching the rest, farthest along d.
      let best = -1, bestAlong = along(src), bestAcross = Infinity;
      for (const c of mine) {
        if (c === src) continue;
        const x = c % w, y = (c / w) | 0;
        for (let k = 0; k < 4; k++) {
          const nx = x + DX[k], ny = y + DY[k];
          if (!this.isFree(nx, ny) || this.sharkBlocked(wr, ny)) continue;
          const t = ny * w + nx;
          const a = along(t), off = Math.abs(across(t) - mid);
          if (a > bestAlong || (a === bestAlong && best >= 0 && (off < bestAcross || (off === bestAcross && t < best)))) {
            if (a > along(src)) { best = t; bestAlong = a; bestAcross = off; }
          }
        }
      }
      if (best < 0) return false; // the rearmost movable cell has nowhere ahead to go
      this.setOwner(best, id); this.code[best] = this.code[src];
      this.setOwner(src, NONE); this.code[src] = 0;
      const bx = best % w, by = (best / w) | 0, sx = src % w, sy = (src / w) | 0;
      if (wr.ipX === sx && wr.ipY === sy) { wr.ipX = bx; wr.ipY = by; }
      if (wr.ox === sx && wr.oy === sy) { wr.ox = bx; wr.oy = by; }
      wr.stats.oozes++;
      return true;
    }
    return false;
  }

  private opFlow(wr: Warrior, dx: number, dy: number, d: number): boolean {
    d = ((d % 4) + 4) % 4;
    const [fx, fy] = this.frame(wr);
    const x = fx + dx, y = fy + dy;
    const nx = x + DX[d], ny = y + DY[d];
    if (this.ownerAt(x, y) !== wr.id || !this.isFree(nx, ny) || this.sharkBlocked(wr, ny)) return false;
    const from = this.idx(x, y), to = this.idx(nx, ny);
    const isIp = x === wr.ipX && y === wr.ipY;
    this.setOwner(to, wr.id); this.code[to] = this.code[from];
    this.setOwner(from, NONE); this.code[from] = 0;
    if (isIp) { wr.ipX = nx; wr.ipY = ny; }
    if (this.unreached(wr).length) {
      // Would disconnect: undo.
      this.setOwner(from, wr.id); this.code[from] = this.code[to];
      this.setOwner(to, NONE); this.code[to] = 0;
      if (isIp) { wr.ipX = x; wr.ipY = y; }
      return false;
    }
    wr.stats.flows++;
    return true;
  }

  private opSwap(wr: Warrior, dx1: number, dy1: number, dx2: number, dy2: number): boolean {
    const [fx, fy] = this.frame(wr);
    const a = [fx + dx1, fy + dy1], b = [fx + dx2, fy + dy2];
    if (this.ownerAt(a[0], a[1]) !== wr.id || this.ownerAt(b[0], b[1]) !== wr.id) return false;
    const ia = this.idx(a[0], a[1]), ib = this.idx(b[0], b[1]);
    if (this.code[ia] !== this.code[ib]) wr.stats.swaps++;
    [this.code[ia], this.code[ib]] = [this.code[ib], this.code[ia]];
    this.changed(wr.id);
    return true;
  }

  /** Fat only: growth is size (and a buffer that sheds first), never new code to run into. */
  private opGrow(wr: Warrior, d: number): boolean {
    d = ((d % 4) + 4) % 4;
    if (wr.cellCount >= Math.floor(wr.maxSize)) return false;
    let x = wr.ipX, y = wr.ipY;
    while (this.ownerAt(x, y) === wr.id) { x += DX[d]; y += DY[d]; }
    if (!this.isFree(x, y) || this.sharkBlocked(wr, y)) return false;
    const i = this.idx(x, y);
    this.setOwner(i, wr.id);
    this.code[i] = CODE['.'];
    wr.cellCount++;
    wr.stats.grows++;
    return true;
  }

  private opCollect(wr: Warrior): boolean {
    let got = false;
    const W = this.w, H = this.h, owner = this.owner, resource = this.resource;
    const meatShare = this.dietShare(wr, 'meat'), plantShare = this.dietShare(wr, 'plants');
    for (const c of this.mineOf(wr)) {
      const x = c % W, y = (c / W) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d], ny = y + DY[d];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const i = ny * W + nx;
        if (resource[i] === 0 && owner[i] !== DEBRIS) continue; // (nothing to eat: most neighbours)
        // Island survival: islanders eat only vegetation, sea creatures only dead cells.
        if (CONFIG.island && (wr.realm ? owner[i] !== DEBRIS : owner[i] === DEBRIS)) continue;
        // The Climb: you digest what your chemistry lets you (plants, meat, or both), and food is 10× richer each step out.
        if (CONFIG.climb && (owner[i] === DEBRIS ? !meatShare : !plantShare)) continue;
        if (this.resource[i] === 1) {
          const feed = CONFIG.climb ? CONFIG.kelpFeed * plantShare * this.richness(i) : CONFIG.island ? CONFIG.kelpFeed : CONFIG.sizePickup;
          wr.maxSize = Math.min(this.capOf(wr), wr.maxSize + feed * this.ripe[i]);
          this.log('collect', `${wr.name} took size (max ${Math.floor(wr.maxSize)})`, wr.id);
        } else if (this.resource[i] === 2) {
          wr.speed = Math.min(CONFIG.speedCap, wr.speed + CONFIG.speedPickup);
          this.log('collect', `${wr.name} took speed (${wr.speed.toFixed(2)})`, wr.id);
        } else if (this.owner[i] === DEBRIS) {
          const feed = this.worth(i) * (CONFIG.climb ? CONFIG.seaFeed * meatShare * this.richness(i) : CONFIG.island ? CONFIG.seaFeed : CONFIG.debrisPickup);
          wr.maxSize = Math.min(this.capOf(wr), wr.maxSize + feed);
          this.setOwner(i, NONE);
          this.code[i] = 0;
          if (CONFIG.island || CONFIG.climb) wr.stats.collected++;
          got = true;
          continue;
        } else continue;
        this.resource[i] = 0;
        wr.stats.collected++;
        got = true;
      }
    }
    return got;
  }

  /**
   * BOMB with an empty stack: the visible foreign cell (another warrior's) nearest my IP,
   * within range, skipping cells that hold a glyph my own body has. Kin recognition: a
   * near-copy of me is immune, a stranger is hit where it differs from me (and a warrior
   * that carries my glyphs, a mimic, is spared). Island survival: only the other realm.
   */
  private opBombNearest(wr: Warrior): boolean {
    const R = this.reach(wr);
    const mine = new Uint8Array(GLYPHS.length + 1);
    for (const c of this.mineOf(wr)) mine[this.code[c]] = 1;
    let best = -1, bx = 0, by = 0;
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const x = wr.ipX + dx, y = wr.ipY + dy, d = Math.abs(dx) + Math.abs(dy);
        if (best >= 0 && d >= best) continue;
        const o = this.ownerAt(x, y);
        if (o < 0 || o === wr.id || mine[this.code[this.idx(x, y)]] || this.seer(wr.id, x, y, R) < 0) continue;
        if (CONFIG.island && this.warrior(o).realm === wr.realm) continue; // island: sharks hunt seals, seals fight sharks
        if (CONFIG.climb && this.warrior(o).lineage === wr.lineage) continue; // climb: never your own kind (lineage)
        if (CONFIG.island && wr.realm === 1 && this.board.land?.[this.idx(x, y)]) continue;
        best = d; bx = x; by = y;
      }
    }
    return best >= 0 && this.opBombAt(wr, bx, by);
  }

  /** BOMB reach: island sharks bite (CONFIG.biteRange) rather than shoot. */
  private reach(wr: Warrior) { return CONFIG.island && wr.realm === 1 ? CONFIG.biteRange : CONFIG.bombRange; }

  private opBombAt(wr: Warrior, x: number, y: number): boolean {
    // Island survival: a full shark doesn't bite (it digests first; until hunger brings it back down).
    if (CONFIG.island && wr.realm === 1 && wr.maxSize >= CONFIG.sharkFull * CONFIG.sharkCap) return false;
    const o = this.ownerAt(x, y);
    if (CONFIG.island && wr.realm === 1 && o >= 0 && this.warrior(o).realm === 1) return false; // sharks never bite sharks
    if (CONFIG.island && wr.realm === 1 && this.board.land?.[this.idx(x, y)]) return false; // a seal hauled out is safe
    if (o === NONE || o === wr.id) return false;
    if (this.seer(wr.id, x, y, this.reach(wr)) < 0) return false;
    const victim = o >= 0 ? this.warrior(o).name : 'debris';
    if (o >= 0) this.attacks.bombs++;
    if (o >= 0 && this.warrior(o).lineage !== wr.lineage) wr.stats.bombHits++; // hits on kin earn nothing
    // Island survival: armor takes three bites. A hit on a K cell dents the body's armor;
    // every third dent breaks the cell.
    const ti = this.idx(x, y);
    if ((CONFIG.island || CONFIG.climb) && o >= 0 && this.code[ti] === K) {
      const v = this.warrior(o);
      v.dents = (v.dents ?? 0) + (CONFIG.climb ? wr.traits?.bite ?? 1 : 1); // (Climb: a stronger bite dents more)
      v.harmedAt = this.t;
      if (v.dents < CONFIG.armorBites) { this.log('bomb', `${wr.name}'s bite glanced off ${victim}'s armor`, wr.id); return true; }
      v.dents = 0;
    }
    this.destroy(ti, wr);
    this.log('bomb', `${wr.name} bombed ${victim}`, wr.id);
    return true;
  }

  /**
   * DIVIDE: copy my whole body beyond itself in direction d, as a new warrior of my lineage
   * (a rival like any other in play).
   * Needs max size ≥ 2× my cells (and ≥ divideMin); parent and child each get half the
   * max size, the same speed, and a fresh stack. Each copied cell becomes a random glyph
   * with chance CONFIG.copyError: variation, so a lineage can evolve within one match.
   */
  private opDivide(wr: Warrior, d: number): boolean {
    d = ((d % 4) + 4) % 4;
    // (Island survival: 3× my cells, so with fast hunger both halves start with some slack.)
    if (wr.maxSize < (CONFIG.island || CONFIG.climb ? 3 : 2) * wr.cellCount || wr.maxSize < CONFIG.divideMin) return false;
    if (CONFIG.reaperCap > 0) {
      // Petri dish: make room by reaping the oldest living warrior (not the parent).
      const living = this.living();
      if (living.length >= CONFIG.reaperCap) {
        const oldest = living.filter((w) => w !== wr).reduce((a, w) => (w.born < a.born ? w : a));
        this.kill(oldest, 'reaped (oldest)');
      }
    } else if (this.living().length >= CONFIG.maxWarriors) return false;
    // The Climb: crowding is local, so one booming population can't block (or reap) the rest.
    if (CONFIG.climb && CONFIG.crowd > 0 && (this.tileCount[this.tileOf(wr.ipX, wr.ipY)] ?? 0) >= CONFIG.crowd) return false;
    const mine = this.mineOf(wr);
    const xs = mine.map((c) => c % this.w), ys = mine.map((c) => (c / this.w) | 0);
    const bw = Math.max(...xs) - Math.min(...xs) + 1, bh = Math.max(...ys) - Math.min(...ys) + 1;
    const ox = DX[d] * (bw + 1), oy = DY[d] * (bh + 1); // one cell of gap beyond my body
    for (let k = 0; k < mine.length; k++) if (!this.passable(wr, xs[k] + ox, ys[k] + oy)) return false;
    // No copying through walls: the straight line from each cell to its copy must be open
    // floor, so a child is born in space its parent could reach, never in the next room over.
    const steps = Math.abs(ox) + Math.abs(oy);
    for (let k = 0; k < mine.length; k++) {
      for (let s = 1; s < steps; s++) if (this.board.terrain[this.idx(xs[k] + DX[d] * s, ys[k] + DY[d] * s)] !== FLOOR) return false;
    }
    const id = this.nextId(wr.zone);
    const child: Warrior = shaped({
      id, lineage: wr.lineage, gen: wr.gen + 1, realm: wr.realm, zone: wr.zone, parent: wr.id, born: this.t, name: this.childName(wr.lineage, id), alive: true,
      ipX: wr.ipX + ox, ipY: wr.ipY + oy, ox: wr.ox + ox, oy: wr.oy + oy, dir: wr.dir,
      stack: [], maxSize: wr.maxSize / 2, speed: wr.speed, accum: 0, lastOk: true, lastAct: '',
      cellCount: 0, executed: 0, spec: wr.spec, home: wr.home, roomsSeen: new Set(wr.roomsSeen),
      stats: { collected: 0, bombHits: 0, poisonWrites: 0, kills: 0, selfWrites: 0, grows: 0, swaps: 0, flows: 0, oozes: 0, squeezed: 0, rooms: 0 },
    });
    if (CONFIG.lifespan > 0) child.diesAt = this.t + Math.floor(this.lifeOf(child.realm) * (0.5 + this.rng()));
    // The room a child is born in isn't one it travelled to: no "entered another room" for it.
    const cx0 = Math.min(...xs) + ox, cx1 = Math.max(...xs) + ox, cy0 = Math.min(...ys) + oy, cy1 = Math.max(...ys) + oy;
    this.board.rooms.forEach((r, k) => {
      if (cx0 >= r.x && cy0 >= r.y && cx1 < r.x + r.w && cy1 < r.y + r.h) child.roomsSeen.add(k);
    });
    this.enroll(child);
    let mutations = 0;
    for (let k = 0; k < mine.length; k++) {
      const i = this.idx(xs[k] + ox, ys[k] + oy);
      let code = this.code[mine[k]];
      if (this.rng() < CONFIG.copyError) { code = Math.floor(this.rng() * this.glyphCount()); mutations++; }
      this.setOwner(i, id);
      this.code[i] = code;
      child.cellCount++;
    }
    // Size mutations (Tierra-style): gain a fat cell stuck to the body, or lose a cell. Fat
    // is neutral, so later copy errors can turn it into something (armor, say).
    if (CONFIG.copyInsert > 0 && this.rng() < CONFIG.copyInsert) {
      const kids = this.cellsOf(id);
      const c = kids[Math.floor(this.rng() * kids.length)], d2 = Math.floor(this.rng() * 4);
      const nx = (c % this.w) + DX[d2], ny = ((c / this.w) | 0) + DY[d2];
      if (this.isFree(nx, ny)) {
        const i = this.idx(nx, ny);
        this.setOwner(i, id);
        this.code[i] = CODE['.'];
        child.cellCount++;
        mutations++;
      }
    }
    if (CONFIG.copyDelete > 0 && child.cellCount > 1 && this.rng() < CONFIG.copyDelete) {
      const ip = this.idx(child.ipX, child.ipY);
      const kids = this.cellsOf(id).filter((c) => c !== ip);
      const c = kids[Math.floor(this.rng() * kids.length)];
      this.setOwner(c, NONE);
      if (this.unreached(child).length === 0) { this.code[c] = 0; child.cellCount--; mutations++; } else this.setOwner(c, id);
    }
    wr.maxSize /= 2;
    if (CONFIG.climb) this.tileCount[this.tileOf(child.ipX, child.ipY)]++;
    this.log('birth', `${wr.name} divided: ${child.name} (generation ${child.gen}${mutations ? `, ${mutations} mutation${mutations > 1 ? 's' : ''}` : ''})`, id);
    return true;
  }

  private opWrite(wr: Warrior, dx: number, dy: number, code: number): boolean {
    const [fx, fy] = this.frame(wr);
    const x = fx + dx, y = fy + dy;
    const o = this.ownerAt(x, y);
    if (o === NONE) return false;
    if (o !== wr.id) {
      // Foreign cells must be close to one of mine (and seen from it).
      if (this.seer(wr.id, x, y, CONFIG.writeRange) < 0) return false;
    }
    const n = this.glyphCount(), c = ((code % n) + n) % n;
    if (o === wr.id && this.code[this.idx(x, y)] !== c) wr.stats.selfWrites++;
    this.code[this.idx(x, y)] = c;
    this.changed(o);
    if (o >= 0 && o !== wr.id) {
      if (c === CODE['@']) this.attacks.poisons++;
      if (c === CODE['@'] && this.warrior(o).lineage !== wr.lineage) wr.stats.poisonWrites++;
      if (o >= 0) this.warrior(o).harmedAt = this.t;
      this.log('write', `${wr.name} wrote '${GLYPHS[c]}' into ${this.warrior(o).name}`, wr.id);
    }
    return true;
  }
}

export { CODE };

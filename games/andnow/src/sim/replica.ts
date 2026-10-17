// Replicas for the parallel engine (src/par.ts): every worker holds a whole copy of the
// world, runs some of the tick's turns on it, and sends what those turns changed (a
// Batch) to everyone else. Browser-safe, no Node imports: the same code could run in a
// browser worker.
//
// Children born during the turns get provisional ids and names (a worker can't know how
// many children turns on other workers had first); once every turn is in, relabel() gives
// them the ids and names the serial order would have, on every replica alike.
import { CONFIG, DEBRIS, Tracker, Warrior, World, WorldEvent } from './world';

/** World internals the replicas reach into. */
export interface Inside {
  cellSets: Map<number, Set<number>>;
  sortedCells: Map<number, number[]>;
  livingList: Warrior[];
  livingDirty: boolean;
  tombstones: Map<number, Warrior>;
  bornIn: Map<number, number>;
  tileCount: Uint16Array;
  tw: number;
}
export const inside = (w: World) => w as unknown as Inside;

/** A body as sent: everything but what it shares with its lineage (spec, home). */
export type Pack = Omit<Warrior, 'spec' | 'home' | 'roomsSeen'> & { roomsSeen: number[]; cells?: number[] };

/** What some turns (or upkeeps) on one worker changed, in the order they ran. */
export interface Batch {
  from: number;
  phase: number;          // the tick × 2 (turns) or + 1 (upkeep)
  upTo: number;           // the last position (in the phase's order) this batch covers
  done: boolean;          // the sender's last batch of the phase
  cells: Int32Array;      // [index, owner, code, resource] per changed cell
  bodies: Pack[];         // changed bodies, alive ones with their cells (in set order)
  dead: number[];         // [id, lineage] per body that died
  tiles: number[];        // crowding counts, +1 each
  births: number[];       // [provisional id, position, seq] per child
  // Output only (the main replica keeps these; workers don't need them):
  events: [number, WorldEvent][];
  deaths: [number, string, number][];
  attacks: [number, number];
}

const TOKEN = '\u0000';
const provName = (id: number) => `${TOKEN}${id}${TOKEN}`;

/** Listens to one worker's turns and packs what they changed. */
export class Recorder implements Tracker {
  cells = new Set<number>();
  bodies = new Set<number>();
  tiles: number[] = [];
  births: number[] = [];
  events: [number, WorldEvent][] = [];
  deaths: [number, string, number][] = [];
  pos = 0;
  private seq = 0;
  private next = 0;
  private end = 0;
  private shadow = new Map<string, number>();
  private attacks0: [number, number] = [0, 0];

  constructor(readonly world: World, readonly from: number) {}

  /** Start a phase: ids for children come from [next, end). */
  begin(next: number, end: number) {
    this.next = next; this.end = end; this.seq = 0;
    this.shadow = new Map(this.world.deaths);
    this.attacks0 = [this.world.attacks.bombs, this.world.attacks.poisons];
  }
  cell(i: number) { this.cells.add(i); }
  body(id: number) { if (id >= 0) this.bodies.add(id); }
  tile(k: number) { this.tiles.push(k); }
  newId() {
    if (this.next >= this.end) throw new Error('par: out of reserved child ids');
    const id = this.next++;
    this.births.push(id, this.pos, this.seq++);
    return id;
  }
  childName(id: number) { return provName(id); }

  /** After each turn: its events and deaths, tagged with its position. */
  after(pos: number) {
    const w = this.world;
    for (const e of w.events) this.events.push([pos, e]);
    w.events.length = 0;
    for (const [k, n] of w.deaths) { const d = n - (this.shadow.get(k) ?? 0); if (d) { this.deaths.push([pos, k, d]); this.shadow.set(k, n); } }
  }

  /** Everything since the last flush. */
  flush(phase: number, upTo: number, done: boolean): Batch {
    const w = this.world, io = inside(w);
    const cells = new Int32Array(this.cells.size * 4);
    let k = 0;
    for (const i of this.cells) { cells[k++] = i; cells[k++] = w.owner[i]; cells[k++] = w.code[i]; cells[k++] = w.resource[i]; }
    const bodies: Pack[] = [], dead: number[] = [];
    for (const id of this.bodies) {
      const wr = w.warriors[id];
      if (!wr) continue;
      if (!wr.alive || wr.id !== id) { dead.push(id, wr.lineage); continue; } // (a tombstone sits where the dead were)
      const { spec, home, roomsSeen, ...rest } = wr;
      void spec; void home;
      bodies.push({ ...rest, roomsSeen: [...roomsSeen], cells: [...(io.cellSets.get(id) ?? [])] });
    }
    const a = w.attacks;
    const b: Batch = {
      from: this.from, phase, upTo, done, cells, bodies, dead, tiles: this.tiles, births: this.births,
      events: this.events, deaths: this.deaths, attacks: [a.bombs - this.attacks0[0], a.poisons - this.attacks0[1]],
    };
    this.attacks0 = [a.bombs, a.poisons];
    this.cells = new Set(); this.bodies = new Set(); this.tiles = []; this.births = [];
    this.events = []; this.deaths = [];
    return b;
  }
}

/** Apply another worker's batch to this replica (not its outputs: see mergeOutputs). */
export function applyBatch(w: World, b: Batch) {
  const io = inside(w), { owner, code, resource } = w;
  let debris = io.cellSets.get(DEBRIS);
  if (!debris) { debris = new Set(); io.cellSets.set(DEBRIS, debris); }
  const c = b.cells;
  let debrisChanged = false;
  for (let k = 0; k < c.length; k += 4) {
    const i = c[k], o = c[k + 1], old = owner[i];
    if (old !== o) {
      if (old === DEBRIS) { debris.delete(i); debrisChanged = true; }
      if (o === DEBRIS) { debris.add(i); debrisChanged = true; }
    }
    owner[i] = o; code[i] = c[k + 2]; resource[i] = c[k + 3];
  }
  if (debrisChanged) io.sortedCells.delete(DEBRIS);
  for (const p of b.bodies) {
    let wr = w.warriors[p.id];
    if (!wr) { // a child born on another worker
      const f = w.warriors[p.lineage];
      wr = { spec: f.spec, home: f.home } as Warrior;
      w.warriors[p.id] = wr;
    }
    const { cells, roomsSeen, ...rest } = p;
    Object.assign(wr, rest);
    wr.roomsSeen = new Set(roomsSeen);
    io.cellSets.set(p.id, new Set(cells));
    io.sortedCells.delete(p.id);
  }
  for (let k = 0; k < b.dead.length; k += 2) bury(w, b.dead[k], b.dead[k + 1]);
  for (const k of b.tiles) io.tileCount[k]++;
}

/** A body that died on another worker: what kill() does, minus what its own batch carried. */
function bury(w: World, id: number, lineage: number) {
  const io = inside(w), wr = w.warriors[id];
  if (!wr || !wr.alive) { // (a child born and dead in one batch, or the dead again)
    if (!wr) w.warriors[id] = io.tombstones.get(lineage)!;
    io.cellSets.delete(id); io.sortedCells.delete(id);
    return;
  }
  wr.alive = false;
  io.livingDirty = true;
  io.cellSets.delete(id); io.sortedCells.delete(id);
  if (CONFIG.endless && wr.gen > 0) w.warriors[id] = io.tombstones.get(wr.lineage)!;
}

/**
 * Once every turn is in: children get the ids (base, base + 1, ...) and names they'd have had
 * born one after another in turn order. `births` is every worker's [prov, position, seq].
 * Returns the map from provisional to final id (for the main replica's events).
 */
export function relabel(w: World, base: number, births: number[]): Map<number, number> {
  const io = inside(w);
  const list: [number, number, number][] = [];
  for (let k = 0; k < births.length; k += 3) list.push([births[k], births[k + 1], births[k + 2]]);
  list.sort((a, b) => a[1] - b[1] || a[2] - b[2]);
  const map = new Map<number, number>();
  const slots = list.map(([p]) => w.warriors[p]);
  const sets = list.map(([p]) => io.cellSets.get(p));
  for (const [p] of list) { io.cellSets.delete(p); io.sortedCells.delete(p); }
  w.warriors.length = base;
  list.forEach(([p], k) => {
    const f = base + k, wr = slots[k];
    map.set(p, f);
    w.warriors.push(wr);
    if (wr.id === p && wr !== io.tombstones.get(wr.lineage)) { // (the child itself, not a tombstone)
      wr.id = f;
      wr.name = w.childName(wr.lineage);
    } else w.childName(wr.lineage); // (a dead child still took its birth number)
    const set = sets[k];
    if (set) { for (const c of set) w.owner[c] = f; io.cellSets.set(f, set); }
  });
  // The living: everyone from before, then the children in id order.
  io.livingList = io.livingList.filter((x) => x.id < base);
  for (const wr of slots) if (wr.alive && wr.id >= base) io.livingList.push(wr);
  io.livingDirty = true;
  return map;
}

/** Names in text from before relabel(): provisional tokens become the children's names. */
export function renameText(w: World, text: string, map: Map<number, number>) {
  if (!text.includes(TOKEN)) return text;
  return text.replace(/\u0000(\d+)\u0000/g, (_, p) => w.warriors[map.get(Number(p)) ?? -1]?.name ?? '?');
}

/** The main replica's outputs from a phase's batches, in the order the serial tick has them. */
export function mergeOutputs(w: World, batches: Batch[], map?: Map<number, number>) {
  const events: [number, number, WorldEvent][] = [], deaths: [number, number, string, number][] = [];
  let seq = 0;
  for (const b of batches) {
    for (const [p, e] of b.events) events.push([p, seq++, e]);
    for (const [p, k, d] of b.deaths) deaths.push([p, seq++, k, d]);
    w.attacks.bombs += b.attacks[0]; w.attacks.poisons += b.attacks[1];
  }
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  deaths.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  for (const [, , e] of events) {
    if (map && e.who !== undefined && map.has(e.who)) e.who = map.get(e.who);
    if (map) e.text = renameText(w, e.text, map);
    w.events.push(e);
    if (w.events.length > 2000) w.events.splice(0, 500);
  }
  for (const [, , k, d] of deaths) w.deaths.set(k, (w.deaths.get(k) ?? 0) + d);
}

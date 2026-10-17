// Bodies as sent between the parallel engine's workers (src/par.ts). Cells are shared
// memory; a body (its fields and its cell set, whose order matters) is a copy, and moves
// to whichever worker touches it next. Browser-safe.
import { CONFIG, Warrior, World } from './world';

/** World internals the engine reaches into. */
export interface Inside {
  cellSets: Map<number, Set<number>>;
  sortedCells: Map<number, number[]>;
  livingList: Warrior[];
  livingDirty: boolean;
  tombstones: Map<number, Warrior>;
  bornIn: Map<number, number>;
  tileCount: Uint16Array;
  tileActive: Uint8Array;
  tileLast: Float64Array;
  activeTiles: number[];
  spawnTimers: number[];
  spawnsInTile: number[][];
  tw: number;
}
export const inside = (w: World) => w as unknown as Inside;

/** A body as sent: everything but what it shares with its lineage (spec, home). Dead: just who. */
export type Pack = (Omit<Warrior, 'spec' | 'home' | 'roomsSeen'> & { roomsSeen: number[]; cells: number[] }) | { id: number; lineage: number; dead: true };

export function packBody(w: World, id: number): Pack {
  const wr = w.warriors[id];
  if (!wr.alive || wr.id !== id) return { id, lineage: wr.lineage, dead: true };
  const { spec, home, roomsSeen, ...rest } = wr;
  void spec; void home;
  return { ...rest, roomsSeen: [...roomsSeen], cells: [...(inside(w).cellSets.get(id) ?? [])] };
}

/** Take in a body sent from another worker (a child new to this one, too). */
export function applyPack(w: World, p: Pack) {
  const io = inside(w);
  if ('dead' in p) { bury(w, p.id, p.lineage); return; }
  let wr = w.warriors[p.id];
  if (!wr || wr.id !== p.id || !('spec' in wr)) { // (new here, or a stub)
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

/** A body that died elsewhere: what kill() leaves behind. */
export function bury(w: World, id: number, lineage: number) {
  const io = inside(w), wr = w.warriors[id];
  if (wr?.alive) { wr.alive = false; io.livingDirty = true; }
  io.cellSets.delete(id); io.sortedCells.delete(id);
  if (CONFIG.endless && (!wr || wr.gen > 0)) w.warriors[id] = io.tombstones.get(lineage)!;
}

/** A body this worker only knows by name (lineage and name never change): enough for a scan. */
export function stub(id: number, lineage: number, name: string): Warrior {
  return { id, lineage, name, alive: true, gen: 1 } as Warrior;
}

/** The token a child is named by until the tick's births are all in. */
export const provName = (id: number) => `\u0000${id}\u0000`;

/** Names in text from before the relabel: provisional tokens become the children's names. */
export function renameText(text: string, name: (prov: number) => string) {
  if (!text.includes('\u0000')) return text;
  return text.replace(/\u0000(\d+)\u0000/g, (_, p) => name(Number(p)));
}

// flow.ts — integer-cost distance fields over the land grid (Dial's algorithm)
//
// One field per destination settlement, shared by every soldier heading there.
// That's what lets a hundred thousand hands march without a single path search.

import { MAP_W, MAP_H } from '../shared/types.js';

export const UNREACHABLE = 0xffff;

export interface FieldResult {
  dist: Uint16Array;
  label: Uint16Array; // which source reached this tile first
}

/**
 * Multi-source shortest path. `cost[i]` is the cost to enter tile i (0 = impassable).
 * Returns distance to the nearest source and which source that was.
 */
export function distanceField(cost: Uint8Array, sources: number[], maxCost = 16): FieldResult {
  const n = MAP_W * MAP_H;
  const dist = new Uint16Array(n).fill(UNREACHABLE);
  const label = new Uint16Array(n).fill(UNREACHABLE);

  // Circular bucket queue — edge costs are small integers
  const nb = maxCost + 1;
  const buckets: number[][] = Array.from({ length: nb }, () => []);
  let pending = 0;

  sources.forEach((s, i) => {
    dist[s] = 0;
    label[s] = i;
    buckets[0].push(s);
    pending++;
  });

  let d = 0;
  while (pending > 0) {
    const bucket = buckets[d % nb];
    while (bucket.length > 0) {
      const i = bucket.pop()!;
      pending--;
      if (dist[i] !== d) continue; // stale entry
      const x = i % MAP_W, y = (i - x) / MAP_W;
      const l = label[i];
      for (let k = 0; k < 4; k++) {
        let j: number;
        if (k === 0) { if (x === 0) continue; j = i - 1; }
        else if (k === 1) { if (x === MAP_W - 1) continue; j = i + 1; }
        else if (k === 2) { if (y === 0) continue; j = i - MAP_W; }
        else { if (y === MAP_H - 1) continue; j = i + MAP_W; }
        const c = cost[j];
        if (c === 0) continue;
        const nd = d + c;
        if (nd < dist[j] && nd < UNREACHABLE) {
          dist[j] = nd;
          label[j] = l;
          buckets[nd % nb].push(j);
          pending++;
        }
      }
    }
    d++;
  }
  return { dist, label };
}

/** LRU cache of single-destination fields, keyed by settlement id. */
export class FieldCache {
  private fields = new Map<number, Uint16Array>();
  constructor(private cost: Uint8Array, private tileOf: (id: number) => number, private cap = 40) {}

  get(id: number): Uint16Array {
    let f = this.fields.get(id);
    if (f) {
      this.fields.delete(id);
      this.fields.set(id, f);
      return f;
    }
    f = distanceField(this.cost, [this.tileOf(id)]).dist;
    this.fields.set(id, f);
    if (this.fields.size > this.cap) {
      const oldest = this.fields.keys().next().value!;
      this.fields.delete(oldest);
    }
    return f;
  }

  clear() {
    this.fields.clear();
  }
}

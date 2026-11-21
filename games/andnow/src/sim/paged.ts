// A big, mostly-uniform typed array held in pages: a page whose entries are all one value is
// just that value. Reads and writes like the array (get/set), saves as it (see save.ts: the
// same entry and the same bytes), so a save can't tell. For World.deadAs: a byte for every
// body ever born, near a GB in a long climb, where long stretches are one lineage's dead.
export type PagedKind = 'Uint8Array' | 'Uint16Array' | 'Int32Array';
type Page = number | Uint8Array | Uint16Array | Int32Array;
const KINDS = { Uint8Array, Uint16Array, Int32Array } as const;
const BITS = 12, P = 1 << BITS; // (4096 entries a page)

export class Paged {
  pages: Page[] = [];
  constructor(public kind: PagedKind = 'Uint8Array', public length = 0) {
    for (let k = 0; k < Math.ceil(length / P); k++) this.pages.push(0);
  }
  get byteLength() { return this.length * KINDS[this.kind].BYTES_PER_ELEMENT; }
  get(n: number): number {
    if (n >= this.length) return 0;
    const p = this.pages[n >>> BITS];
    return typeof p === 'number' ? p : p[n & (P - 1)];
  }
  set(n: number, v: number) {
    const k = n >>> BITS;
    let p = this.pages[k];
    if (typeof p === 'number') {
      if (p === v) return;
      p = this.pages[k] = new KINDS[this.kind](P).fill(p);
    }
    p[n & (P - 1)] = v;
    // (A page all of one value folds back to it: in a whole page only, a short last page's tail being 0s.)
    if ((k + 1) * P <= this.length) { for (let j = 0; j < P; j++) if (p[j] !== v) return; this.pages[k] = v; }
  }
  /** The same values in a kind and length of its own (longer: the new tail is 0s). */
  recast(kind: PagedKind, length: number): Paged {
    const out = new Paged(kind, length);
    for (let k = 0; k < this.pages.length; k++) {
      const p = this.pages[k];
      out.pages[k] = typeof p === 'number' ? p : kind === this.kind ? p : KINDS[kind].from(p);
    }
    // (A short last page that's now whole may fold.)
    const k = this.pages.length - 1;
    if (k >= 0 && typeof out.pages[k] !== 'number' && (k + 1) * P <= length) { const p = out.pages[k] as Uint8Array; if (p.every((x) => x === p[0])) out.pages[k] = p[0]; }
    return out;
  }
  static from(a: Uint8Array | Uint16Array | Int32Array): Paged {
    const out = new Paged(a.constructor.name as PagedKind, a.length);
    for (let k = 0; k < out.pages.length; k++) {
      const s = a.subarray(k * P, (k + 1) * P), v = s[0];
      let same = s.length === P;
      for (let j = 1; same && j < s.length; j++) same = s[j] === v;
      out.pages[k] = same ? v : (() => { const p = new KINDS[out.kind](P); p.set(s); return p; })();
    }
    return out;
  }
  /** The array's bytes, a piece at a time (what saving the plain array would write). */
  *bytes(): Generator<Uint8Array> {
    const C = KINDS[this.kind], B = C.BYTES_PER_ELEMENT;
    let uniform: Uint8Array | undefined, uv = NaN;
    for (let k = 0; k < this.pages.length; k++) {
      const p = this.pages[k], n = Math.min(P, this.length - k * P);
      if (typeof p === 'number') {
        if (uv !== p) { const a = new C(P).fill(p); uniform = new Uint8Array(a.buffer); uv = p; }
        yield uniform!.subarray(0, n * B);
      } else yield new Uint8Array(p.buffer, p.byteOffset, n * B);
    }
  }
}

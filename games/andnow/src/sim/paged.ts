// A big, mostly-uniform typed array held in pages: a page whose entries are all one value is
// just that value. Reads and writes like the array (get/set, values stored as the array would
// store them), saves as it (see save.ts: the same entry and the same bytes), so a save can't
// tell. For what's big and nearly empty: World.deadAs (a byte for every body ever born, near a GB
// in a long climb), and the grids that matter only at a few cells (ripe, flesh, narrow).
export type PagedKind = 'Uint8Array' | 'Uint16Array' | 'Int32Array' | 'Float32Array';
type Typed = Uint8Array | Uint16Array | Int32Array | Float32Array;
type Page = number | Typed;
const KINDS = { Uint8Array, Uint16Array, Int32Array, Float32Array } as const;
const ROUND = { Uint8Array: new Uint8Array(1), Uint16Array: new Uint16Array(1), Int32Array: new Int32Array(1), Float32Array: new Float32Array(1) };

export class Paged {
  pages: Page[] = [];
  private P: number;
  private zero: boolean | undefined; // (isZero's cache: undefined after a write that may change it)
  /** `bits`: log2 of a page's entries (smaller pages for values scattered thinly). */
  constructor(public kind: PagedKind = 'Uint8Array', public length = 0, fill = 0, private bits = 12) {
    this.P = 1 << bits;
    fill = this.round(fill);
    for (let k = 0; k < Math.ceil(length / this.P); k++) this.pages.push(fill);
  }
  get byteLength() { return this.length * KINDS[this.kind].BYTES_PER_ELEMENT; }
  /** v as the array would hold it. */
  private round(v: number) { const r = ROUND[this.kind]; r[0] = v; return r[0]; }
  get(n: number): number {
    if (!(n >= 0 && n < this.length)) return undefined as unknown as number; // (as the array reads out of range)
    const p = this.pages[n >>> this.bits];
    return typeof p === 'number' ? p : p[n & (this.P - 1)];
  }
  set(n: number, v: number) {
    if (!(n >= 0 && n < this.length)) return;
    v = this.round(v);
    if (v !== 0 || this.zero === false) this.zero = undefined;
    const k = n >>> this.bits, P = this.P;
    let p = this.pages[k];
    if (typeof p === 'number') {
      if (p === v) return;
      p = this.pages[k] = new KINDS[this.kind](P).fill(p);
    } else if (p[n & (P - 1)] === v) return;
    p[n & (P - 1)] = v;
    // (A page all of one value folds back to it: whole pages only, a short last page's tail is unused.)
    if ((k + 1) * P <= this.length) { for (let j = 0; j < P; j++) if (p[j] !== v) return; this.pages[k] = v; }
  }
  /** Every entry 0. */
  isZero(): boolean {
    if (this.zero === undefined) {
      this.zero = true;
      for (let k = 0; k < this.pages.length && this.zero; k++) {
        const p = this.pages[k];
        if (typeof p === 'number') { if (p !== 0) this.zero = false; }
        else { const n = Math.min(this.P, this.length - k * this.P); for (let j = 0; j < n; j++) if (p[j] !== 0) { this.zero = false; break; } }
      }
    }
    return this.zero;
  }
  /** The same values in a kind and length of its own (longer: the new tail is 0s). */
  recast(kind: PagedKind, length: number): Paged {
    const out = new Paged(kind, length, 0, this.bits);
    for (let k = 0; k < this.pages.length; k++) {
      const p = this.pages[k];
      out.pages[k] = typeof p === 'number' ? p : kind === this.kind ? p : KINDS[kind].from(p);
    }
    out.fold(this.pages.length - 1); // (a short last page that's now whole)
    return out;
  }
  /** A copy `length` long, these values starting at `at`, `fill` elsewhere (a grid growing rows). */
  grown(length: number, at: number, fill: number): Paged {
    const out = new Paged(this.kind, length, fill, this.bits), P = this.P;
    for (let k = 0; k < this.pages.length; k++) {
      const p = this.pages[k], n = Math.min(P, this.length - k * P), base = at + k * P;
      if (typeof p === 'number') { if (p !== out.round(fill)) for (let j = 0; j < n; j++) out.set(base + j, p); }
      else for (let j = 0; j < n; j++) out.set(base + j, p[j]);
    }
    return out;
  }
  private fold(k: number) {
    const p = this.pages[k];
    if (k < 0 || typeof p === 'number' || (k + 1) * this.P > this.length) return;
    for (let j = 1; j < p.length; j++) if (p[j] !== p[0]) return;
    this.pages[k] = p[0];
  }
  static from(a: Typed, bits = 12): Paged {
    const out = new Paged(a.constructor.name as PagedKind, a.length, 0, bits), P = out.P;
    for (let k = 0; k < out.pages.length; k++) {
      const s = a.subarray(k * P, (k + 1) * P), v = s[0];
      let same = s.length === P;
      for (let j = 1; same && j < s.length; j++) same = s[j] === v;
      if (same) out.pages[k] = v;
      else { const p = new KINDS[out.kind](P); p.set(s); out.pages[k] = p; }
    }
    return out;
  }
  /** The array's bytes, a piece at a time (what saving the plain array would write). */
  *bytes(): Generator<Uint8Array> {
    const C = KINDS[this.kind], B = C.BYTES_PER_ELEMENT, P = this.P;
    // (Runs of constant pages go out together, up to 1 MB at a time.)
    const R = Math.max(1, (1 << 20) / (P * B));
    let run: Uint8Array | undefined, rv = 0;
    for (let k = 0; k < this.pages.length;) {
      const p = this.pages[k];
      if (typeof p === 'number') {
        let m = 1;
        while (m < R && k + m < this.pages.length && this.pages[k + m] === p) m++;
        if (!run || rv !== p) { run = new Uint8Array(new C(R * P).fill(p).buffer); rv = p; }
        const n = Math.min(m * P, this.length - k * P);
        yield run!.subarray(0, n * B);
        k += m;
      } else {
        yield new Uint8Array(p.buffer, p.byteOffset, Math.min(P, this.length - k * P) * B);
        k++;
      }
    }
  }
}

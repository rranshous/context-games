import { describe, it, expect } from 'vitest';
import { scanRange, grindName, grindWords } from '../src/scan.ts';
import { createKernel } from '../src/wasm/kernel.ts';
import { spiritAt, cellAtIndex, cellDigest, auraField, nameStrength, wordOf, type Spirit } from '@truenames/universe';

/** A spirit-class being in the depth-12 layer (two facets). */
const KNOWN = '012341174703';

describe('scanRange', () => {
  it('finds exactly what spiritAt finds (a known being\'s neighborhood)', () => {
    const hits: Spirit[] = [];
    // all 64 cells under 0123411747 at depth 12, which includes KNOWN
    scanRange('0123411747', 2, 0n, 64n, (s) => hits.push(s));
    const direct: string[] = [];
    for (let i = 0n; i < 64n; i++) { const c = cellAtIndex('0123411747', 2, i); if (spiritAt(c)) direct.push(c); }
    expect(hits.map((h) => h.cell)).toEqual(direct);
    expect(direct).toContain(KNOWN);
  });
  it('respects start/count across a carry boundary', () => {
    // index 7 -> 20 in octal crosses the "07" -> "10" carry; compare to direct enumeration
    for (const [start, count] of [[7n, 5n], [0n, 1n], [60n, 10n]] as const) {
      const seen: string[] = [];
      scanRange('012341174', 3, start, count, (s) => seen.push(s.cell));
      const direct: string[] = [];
      for (let i = start; i < start + count && i < 512n; i++) { const c = cellAtIndex('012341174', 3, i); if (spiritAt(c)) direct.push(c); }
      expect(seen).toEqual(direct);
    }
    const all: string[] = [];
    scanRange('012341174', 3, 0n, 512n, (s) => all.push(s.cell));
    expect(all).toContain(KNOWN);
  });
});

describe('grindName', () => {
  it('reports improvements that verify', () => {
    const pub = new Uint8Array(32).fill(3);
    const best = grindName(cellDigest(KNOWN), auraField(pub), 0n, 300, 0);
    expect(best).not.toBeNull();
    expect(nameStrength(KNOWN, pub, best!.nonce)).toBe(best!.strength);
  });
});

describe('scanRange with the WASM kernel', () => {
  it('finds exactly what the BigInt path finds, across a depth-12 block', () => {
    const k = createKernel();
    const a: string[] = [], b: string[] = [];
    const ha = scanRange('01234117', 4, 0n, 4096n, (s) => a.push(s.cell));
    const hb = scanRange('01234117', 4, 0n, 4096n, (s) => b.push(s.cell), k);
    expect(a).toContain(KNOWN);
    expect(b).toEqual(a);
    expect(hb).toBe(ha);
  });
  it('grindName via kernel matches reference improvements', () => {
    const k = createKernel();
    const pub = new Uint8Array(32).fill(9);
    const d = cellDigest(KNOWN), au = auraField(pub);
    const x: number[] = [], y: number[] = [];
    grindName(d, au, 5n, 2000, 0, (_n, s) => x.push(s));
    grindName(d, au, 5n, 2000, 0, (_n, s) => y.push(s), k);
    expect(y).toEqual(x);
  });
});

describe('grindWords', () => {
  it('keeps the best word per facet, each verifiable, and the kernel agrees', () => {
    const pub = new Uint8Array(32).fill(4);
    const d = cellDigest(KNOWN), au = auraField(pub);
    const ref: [bigint, number, number][] = [], fast: [bigint, number, number][] = [];
    const bestsA = [0, 0], bestsB = [0, 0];
    grindWords(d, au, 11n, 3000, 2, bestsA, (n, s, f) => ref.push([n, s, f]));
    grindWords(d, au, 11n, 3000, 2, bestsB, (n, s, f) => fast.push([n, s, f]), createKernel());
    expect(fast).toEqual(ref);
    expect(bestsB).toEqual(bestsA);
    expect(new Set(ref.map((r) => r[2]))).toEqual(new Set([0, 1])); // both facets revealed something
    for (const [n, s, f] of ref) expect(wordOf(KNOWN, pub, n)).toEqual({ strength: s, facet: f });
  });
});

import { describe, it, expect } from 'vitest';
import { scanRange, grindName } from '../src/scan.ts';
import { createKernel } from '../src/wasm/kernel.ts';
import { spiritAt, cellAtIndex, cellDigest, auraField, nameStrength, type Spirit } from '@truenames/universe';

describe('scanRange', () => {
  it('finds exactly what spiritAt finds (hearth-god neighborhood)', () => {
    const hits: Spirit[] = [];
    // all 64 cells under 0110 at depth 6, which includes 011010
    scanRange('0110', 2, 0n, 64n, (s) => hits.push(s));
    const direct: string[] = [];
    for (let i = 0n; i < 64n; i++) { const c = cellAtIndex('0110', 2, i); if (spiritAt(c)) direct.push(c); }
    expect(hits.map((h) => h.cell)).toEqual(direct);
    expect(direct).toContain('011010');
  });
  it('respects start/count across a carry boundary', () => {
    // index 7 -> 20 in octal crosses the "07" -> "10" carry; compare to direct enumeration
    for (const [start, count] of [[7n, 5n], [0n, 1n], [60n, 10n]] as const) {
      const seen: string[] = [];
      scanRange('011', 3, start, count, (s) => seen.push(s.cell));
      const direct: string[] = [];
      for (let i = start; i < start + count && i < 512n; i++) { const c = cellAtIndex('011', 3, i); if (spiritAt(c)) direct.push(c); }
      expect(seen).toEqual(direct);
    }
    const all: string[] = [];
    scanRange('011', 3, 0n, 512n, (s) => all.push(s.cell));
    expect(all).toContain('011010');
  });
});

describe('grindName', () => {
  it('reports improvements that verify', () => {
    const pub = new Uint8Array(32).fill(3);
    const best = grindName(cellDigest('011010'), auraField(pub), 0n, 300, 0);
    expect(best).not.toBeNull();
    expect(nameStrength('011010', pub, best!.nonce)).toBe(best!.strength);
  });
});

describe('scanRange with the WASM kernel', () => {
  it('finds exactly what the BigInt path finds, across a whole depth-7 block', () => {
    const k = createKernel();
    const a: string[] = [], b: string[] = [];
    const ha = scanRange('01', 5, 0n, 4096n, (s) => a.push(s.cell));
    const hb = scanRange('01', 5, 0n, 4096n, (s) => b.push(s.cell), k);
    expect(b).toEqual(a);
    expect(hb).toBe(ha);
  });
  it('grindName via kernel matches reference improvements', () => {
    const k = createKernel();
    const pub = new Uint8Array(32).fill(9);
    const d = cellDigest('011010'), au = auraField(pub);
    const x: number[] = [], y: number[] = [];
    grindName(d, au, 5n, 2000, 0, (_n, s) => x.push(s));
    grindName(d, au, 5n, 2000, 0, (_n, s) => y.push(s), k);
    expect(y).toEqual(x);
  });
});

import { describe, it, expect } from 'vitest';
import { createKernel } from '../src/wasm/kernel.ts';
import { poseidon3, poseidon4 } from '../../universe/src/poseidon.ts';
import { P, cellDigest, auraField, nameHashRaw, bits } from '@truenames/universe';
import { grindName } from '../src/scan.ts';

const KNOWN = '012341174703';

describe.each([true, false])('WASM Poseidon kernel (optimized=%s)', (optimized) => {
  const k = createKernel({ optimized });
  let x = 12345n;
  const rnd = () => (x = (x * 6364136223846793005n + 1442695040888963407n) % P);

  it('hash3/hash4 are bit-identical to the reference', () => {
    const edge = [0n, 1n, P - 1n, P - 2n, 2n ** 253n, 2n ** 32n - 1n, 2n ** 32n];
    for (let i = 0; i < 300; i++) {
      const a = [rnd(), rnd(), rnd(), rnd()];
      if (i < edge.length) a[i % 4] = edge[i]!;
      expect(k.hash3(a[0]!, a[1]!, a[2]!)).toBe(poseidon3(a.slice(0, 3)));
      expect(k.hash4(a[0]!, a[1]!, a[2]!, a[3]!)).toBe(poseidon4(a));
    }
  });

  it('grind finds exactly the improvements the reference finds', () => {
    const d = cellDigest(KNOWN);
    const a = auraField(new Uint8Array(32).fill(5));
    const start = 2n ** 64n - 700n; // cross a 64-bit limb boundary
    const fast: [bigint, number][] = [];
    const slow: [bigint, number][] = [];
    k.grind(d, a, start, 3000, 0, (n, s) => fast.push([n, s]));
    grindName(d, a, start, 3000, 0, (n, s) => slow.push([n, s]));
    expect(fast).toEqual(slow);
    for (const [n, s] of fast) expect(bits(nameHashRaw(d, a, n))).toBe(s);
  });
});

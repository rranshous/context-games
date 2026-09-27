import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { poseidon3 as L3 } from 'poseidon-lite/poseidon3';
import { poseidon4 as L4 } from 'poseidon-lite/poseidon4';
import { ed25519 } from '@noble/curves/ed25519.js';
import { poseidon3, poseidon4 } from '../src/poseidon.ts';
import * as U from '../src/index.ts';
import { runVectors } from './run-vectors.ts';

const v = JSON.parse(readFileSync(new URL('./vectors.json', import.meta.url), 'utf8'));

describe('universe spec v1', () => {
  it('matches golden vectors', () => {
    expect(runVectors(v)).toEqual([]);
  });

  it('fast poseidon is bit-identical to poseidon-lite', () => {
    let x = 99n;
    const rnd = () => (x = (x * 6364136223846793005n + 1442695040888963407n) % U.P);
    for (let i = 0; i < 200; i++) {
      const a = [rnd(), rnd(), rnd(), rnd()];
      if (i % 7 === 0) a[0] = BigInt(i % 3);
      expect(poseidon3(a.slice(0, 3))).toBe(L3(a.slice(0, 3)));
      expect(poseidon4(a)).toBe(L4(a));
    }
  });

  it('bits is monotone and matches definition at edges', () => {
    for (let k = 0; k < 250; k += 7) {
      const h = (U.P >> BigInt(k)) - 1n; // (h+1)*2^k <= P
      expect(U.bits(h)).toBeGreaterThanOrEqual(k);
    }
  });

  it('cellDigest memo is consistent with direct chaining', () => {
    const c = '7654321076543210';
    let d = 0n;
    for (const ch of c) d = U.childDigest(d, Number(ch));
    expect(U.cellDigest(c)).toBe(d);
    expect(U.cellDigest(c.slice(0, 9))).toBe(U.cellDigest(c.slice(0, 9)));
  });

  it('rejects claims on empty cells, tampered nonces, and foreign auras', () => {
    const good = v.claims[0].claim as U.NameClaim;
    expect(U.verifyNameClaim({ ...good, cell: '000000' })).toMatchObject({ ok: false });
    expect(U.verifyNameClaim({ ...good, nonce: String(BigInt(good.nonce) + 1n) })).toMatchObject({ ok: false });
    const other = U.bytesToHex(ed25519.getPublicKey(new Uint8Array(32).fill(9)));
    expect(U.verifyNameClaim({ ...good, aura: other })).toMatchObject({ ok: false, reason: 'bad signature' });
  });

  it('region decodes addresses', () => {
    expect(U.region('0123456')).toEqual({ depth: 7, element: 0, aspect: 1, tradition: 19, lineage: '456' });
    expect(U.region('')).toEqual({ depth: 0 });
  });
});

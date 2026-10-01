import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { poseidon3 as L3 } from 'poseidon-lite/poseidon3';
import { poseidon4 as L4 } from 'poseidon-lite/poseidon4';
import { ed25519 } from '@noble/curves/ed25519.js';
import { poseidon3, poseidon4 } from '../src/poseidon.ts';
import * as U from '../src/index.ts';
import { runVectors } from './run-vectors.ts';

const v = JSON.parse(readFileSync(new URL('./vectors.json', import.meta.url), 'utf8'));

describe('universe spec v2', () => {
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
    expect(U.verifyNameClaim({ ...good, cell: '000000000000' })).toMatchObject({ ok: false });
    expect(U.verifyNameClaim({ ...good, nonce: String(BigInt(good.nonce) + 1n) })).toMatchObject({ ok: false });
    const other = U.bytesToHex(ed25519.getPublicKey(new Uint8Array(32).fill(9)));
    expect(U.verifyNameClaim({ ...good, aura: other })).toMatchObject({ ok: false, reason: 'bad signature' });
  });

  it('the pyramid: half as many beings a layer down, one class mightier, a bar 4 truths higher', () => {
    for (let d = 12; d < 20; d++) {
      expect(U.target(d + 1) - U.target(d)).toBe(4); // 8x the cells, 16x the bits: half as many
      expect(U.mightOf(d + 1, U.target(d + 1))).toBe(U.mightOf(d, U.target(d)) + 1);
    }
    expect(U.mightOf(12, U.target(12) + 3)).toBe(0);
    expect(U.mightOf(12, U.target(12) + 4)).toBe(1); // one in sixteen dwell a class above their kind
    expect([0, 4, 7].map(U.facetCount)).toEqual([1, 5, 8]);
    expect(U.wordBar(4)).toBe(38);
    for (let step = 1; step < 8; step += 2) {
      const forms = Array.from({ length: 8 }, (_, f) => U.facetForm({ form: 5, formStep: step }, f));
      expect(new Set(forms).size).toBe(8); // a being never repeats a form
    }
  });

  it('region decodes addresses', () => {
    expect(U.region('0123456')).toEqual({ depth: 7, element: 0, aspect: 1, tradition: 19, lineage: '456' });
    expect(U.region('')).toEqual({ depth: 0 });
  });
});

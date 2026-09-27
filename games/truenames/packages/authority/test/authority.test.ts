import { describe, it, expect } from 'vitest';
import { ed25519 } from '@noble/curves/ed25519.js';
import { signNameClaim, nameStrength, MIN_NAME_BITS, bytesToHex } from '@truenames/universe';
import { allocate, LocalAuthority, TUNABLES, capacityOf, castCap } from '../src/index.ts';

const GOD = '011010';

describe('allocate', () => {
  it('never exceeds pool, request or cap', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let trial = 0; trial < 500; trial++) {
      const n = 1 + Math.floor(rnd() * 6);
      const reqs = Array.from({ length: n }, () => ({ request: rnd() * 50, effective: 8 + rnd() * 16, cap: rnd() * 40 }));
      const pool = rnd() * 120;
      const g = allocate(pool, reqs);
      const sum = g.reduce((a, b) => a + b, 0);
      expect(sum).toBeLessThanOrEqual(pool + 1e-9);
      g.forEach((x, i) => {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(Math.min(reqs[i]!.request, reqs[i]!.cap) + 1e-9);
      });
      // water-filling: either the pool is exhausted or everyone got their limit
      const allFull = g.every((x, i) => Math.abs(x - Math.min(reqs[i]!.request, reqs[i]!.cap)) < 1e-9);
      expect(allFull || Math.abs(sum - pool) < 1e-9).toBe(true);
    }
  });
  it('weights ∝ 2^effective when nobody is capped', () => {
    const g = allocate(30, [{ request: 1e9, effective: 10, cap: 1e9 }, { request: 1e9, effective: 12, cap: 1e9 }]);
    expect(g[1]! / g[0]!).toBeCloseTo(4, 9);
    expect(g[0]! + g[1]!).toBeCloseTo(30, 9);
  });
  it('redistributes leftovers of capped casters', () => {
    const g = allocate(100, [{ request: 5, effective: 20, cap: 1e9 }, { request: 1e9, effective: 10, cap: 1e9 }]);
    expect(g[0]).toBeCloseTo(5);
    expect(g[1]).toBeCloseTo(95);
  });
});

function keyFor(n: number) {
  const sk = new Uint8Array(32).fill(n);
  return { sk, aura: bytesToHex(ed25519.getPublicKey(sk)) };
}
function learn(a: LocalAuthority, sk: Uint8Array, aura: string, min = MIN_NAME_BITS) {
  const pub = ed25519.getPublicKey(sk);
  let n = 0n;
  while (nameStrength(GOD, pub, n) < min) n++;
  return a.submitName(signNameClaim(GOD, n, sk));
}

describe('LocalAuthority', () => {
  it('accepts a real name, rejects an unknown caster, only raises', () => {
    const a = new LocalAuthority();
    const { sk, aura } = keyFor(1);
    const r = learn(a, sk, aura);
    expect(r.accepted).toBe(true);
    expect(a.nameBook(aura)[GOD]).toBe(r.strength);
    expect(learn(a, sk, aura).accepted).toBe(false); // same nonce, not truer
    a.submitCast({ aura: 'nobody', cell: GOD, request: 10, target: { kind: 'self' }, tick: 0 });
    expect(a.tick().casts[0]!.refused).toBe('unknown-name');
  });

  it('spam collapses output', () => {
    const run = (every: number) => {
      const a = new LocalAuthority();
      a.grantSyntheticName('x', GOD, 16);
      const grants: number[] = [];
      let recoils = 0;
      for (let i = 0; i < 100; i++) {
        if (i % every === 0) a.submitCast({ aura: 'x', cell: GOD, request: 1e9, target: { kind: 'self' }, tick: i });
        for (const c of a.tick().casts) { grants.push(c.grant); if (c.recoil) recoils++; }
      }
      return { grants, total: grants.reduce((x, y) => x + y, 0), recoils };
    };
    const spam = run(1), slow = run(5);
    expect(spam.grants.at(-1)!).toBeLessThan(spam.grants[0]! / 4); // per-cast output collapses
    expect(spam.total).toBeLessThan(slow.total); // spamming loses output
    expect(spam.recoils).toBeGreaterThan(10); // and it hurts
    expect(slow.recoils).toBe(0);
  });

  it('truer names dominate contention; weak solo name is capped', () => {
    const a = new LocalAuthority();
    a.grantSyntheticName('weak', GOD, 12);
    a.grantSyntheticName('true', GOD, 20);
    a.submitCast({ aura: 'weak', cell: GOD, request: 1e9, target: { kind: 'self' }, tick: 0 });
    a.submitCast({ aura: 'true', cell: GOD, request: 1e9, target: { kind: 'self' }, tick: 0 });
    const [w, t] = a.tick().casts;
    expect(t!.grant).toBeGreaterThan(w!.grant * 8);
    // solo weak name, full pool, still capped
    const b = new LocalAuthority();
    b.grantSyntheticName('weak', GOD, 12);
    b.submitCast({ aura: 'weak', cell: GOD, request: 1e9, target: { kind: 'self' }, tick: 0 });
    const solo = b.tick();
    expect(solo.casts[0]!.grant).toBeLessThan(solo.pools[GOD]!.cap * 0.1);
  });

  it('capacity grows only from names above threshold', () => {
    expect(capacityOf([12, 12, 12])).toBe(TUNABLES.capBase);
    expect(capacityOf([22])).toBeCloseTo(TUNABLES.capBase + 1);
    expect(castCap(TUNABLES.capRef + 2, 1)).toBeCloseTo(TUNABLES.castCapBase * 2);
  });

  it('pools refill lazily up to cap', () => {
    const a = new LocalAuthority();
    a.grantSyntheticName('x', GOD, 24);
    const cap = a.poolInfo(GOD)!.cap;
    a.submitCast({ aura: 'x', cell: GOD, request: 1e9, target: { kind: 'self' }, tick: 0 });
    a.tick();
    const low = a.poolInfo(GOD)!.level;
    expect(low).toBeLessThan(cap);
    for (let i = 0; i < 500; i++) a.tick();
    expect(a.poolInfo(GOD)!.level).toBe(cap);
  });
});

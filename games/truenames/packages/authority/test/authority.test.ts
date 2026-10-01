import { describe, it, expect } from 'vitest';
import { ed25519 } from '@noble/curves/ed25519.js';
import { spiritAt, wordBar, type NameClaim } from '@truenames/universe';
import { LocalAuthority, TUNABLES, capacityOf, castCap, spiritStats, wordKey, type ProofVerifier } from '../src/index.ts';
import vectors from '../../universe/test/vectors.json' with { type: 'json' };

/** A spirit-class being found in the depth-12 layer (one class above its depth): two facets, bar 26. */
const GOD = '012341174703';
const BAR = wordBar(spiritAt(GOD)!.magnitude);
const GEN = spiritStats(spiritAt(GOD)!).generosity;

describe('LocalAuthority', () => {
  it('accepts a real word (grasped, signed), keys it by facet, rejects an unknown caster, only raises', () => {
    const a = new LocalAuthority();
    const good = vectors.claims[0]!.claim as NameClaim; // a grasped word, ground once for the golden vectors
    const r = a.submitName(good);
    expect(r).toMatchObject({ accepted: true });
    expect(a.nameBook(good.aura)[wordKey(good.cell, r.facet!)]).toBe(r.strength);
    expect(a.submitName(good).accepted).toBe(false); // same nonce, not truer
    a.submitCast({ aura: 'nobody', spirit: GOD, request: 10, target: { kind: 'self' }, tick: 0 });
    expect(a.tick().casts[0]!.refused).toBe('unknown-name');
  });

  it('a word for one facet does not speak another', () => {
    const a = new LocalAuthority();
    a.grantSyntheticName('x', GOD, BAR, 1);
    a.submitCast({ aura: 'x', spirit: GOD, facet: 0, request: 10, target: { kind: 'self' }, tick: 0 });
    expect(a.tick().casts[0]!.refused).toBe('unknown-name');
    a.submitCast({ aura: 'x', spirit: GOD, facet: 1, request: 10, target: { kind: 'self' }, tick: 1 });
    expect(a.tick().casts[0]!.refused).toBeUndefined();
    // a being answers once a breath, whichever facet is spoken
    a.grantSyntheticName('x', GOD, BAR, 0);
    a.submitCast({ aura: 'x', spirit: GOD, facet: 0, request: 10, target: { kind: 'self' }, tick: 2 });
    a.submitCast({ aura: 'x', spirit: GOD, facet: 1, request: 10, target: { kind: 'self' }, tick: 2 });
    expect(a.tick().casts.map((c) => c.refused)).toEqual([undefined, 'duplicate']);
  });

  it('spam collapses output', () => {
    const run = (every: number) => {
      const a = new LocalAuthority();
      a.grantSyntheticName('x', GOD, BAR + 4);
      const grants: number[] = [];
      let recoils = 0;
      for (let i = 0; i < 100; i++) {
        if (i % every === 0) a.submitCast({ aura: 'x', spirit: GOD, request: 1e9, target: { kind: 'self' }, tick: i });
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

  it('vessels are per caster: nobody else drains yours', () => {
    const a = new LocalAuthority();
    a.grantSyntheticName('me', GOD, BAR + 4);
    a.grantSyntheticName('rival', GOD, BAR + 18);
    for (let i = 0; i < 20; i++) {
      a.submitCast({ aura: 'rival', spirit: GOD, request: 1e9, target: { kind: 'self' }, tick: i });
      a.tick();
    }
    expect(a.poolInfo('rival', GOD)!.level).toBeLessThan(a.poolInfo('rival', GOD)!.cap * 0.5);
    expect(a.poolInfo('me', GOD)!.level).toBe(a.poolInfo('me', GOD)!.cap);
    a.submitCast({ aura: 'me', spirit: GOD, request: 1e9, target: { kind: 'self' }, tick: 20 });
    expect(a.tick().casts[0]!.grant).toBeCloseTo(Math.min(castCap(BAR + 4, GEN), a.poolInfo('me', GOD)!.cap), 5);
  });

  it('a word just grasped is capped well below its vessel', () => {
    const b = new LocalAuthority();
    b.grantSyntheticName('weak', GOD, BAR);
    b.submitCast({ aura: 'weak', spirit: GOD, request: 1e9, target: { kind: 'self' }, tick: 0 });
    const solo = b.tick();
    expect(solo.casts[0]!.grant).toBeCloseTo(castCap(BAR, GEN), 5);
    expect(solo.casts[0]!.grant).toBeLessThan(solo.pools['weak|' + GOD]!.cap * 0.5);
  });

  it('mightier beings: the bar rises 4 truths a class, and a fresh word draws ×4 a class', () => {
    expect(wordBar(4) - wordBar(0)).toBe(16);
    expect(castCap(wordBar(4), 1) / castCap(wordBar(0), 1)).toBeCloseTo(256);
  });

  it('capacity grows only from names above threshold', () => {
    expect(capacityOf([22, 22, 22])).toBe(TUNABLES.capBase);
    expect(capacityOf([32])).toBeCloseTo(TUNABLES.capBase + 1);
    expect(castCap(TUNABLES.capRef + 2, 1)).toBeCloseTo(TUNABLES.castCapBase * 2);
  });

  it('pools refill lazily up to cap', () => {
    const a = new LocalAuthority();
    a.grantSyntheticName('x', GOD, BAR + 8);
    const cap = a.poolInfo('x', GOD)!.cap;
    a.submitCast({ aura: 'x', spirit: GOD, request: 1e9, target: { kind: 'self' }, tick: 0 });
    a.tick();
    const low = a.poolInfo('x', GOD)!.level;
    expect(low).toBeLessThan(cap);
    for (let i = 0; i < 500; i++) a.tick();
    expect(a.poolInfo('x', GOD)!.level).toBe(cap);
  });

  it('accepts proven names only through its verifier and only for its round', async () => {
    const traits = { form: 0, formStep: 0, weightIdx: 3, generosityIdx: 9, temperIdx: 1, flavor: 42n };
    const stub: ProofVerifier = {
      async verify(claim: any, context) {
        if (claim.context !== context) return { ok: false, reason: 'wrong journey' };
        return { ok: true, name: { aura: 'me', spirit: 't:123', magnitude: 4, strength: 40, facet: 2, traits } };
      },
    };
    const a = new LocalAuthority({ proofs: stub, context: 7n });
    expect((await a.submitProvenName({ context: 8n })).accepted).toBe(false);
    const ok = await a.submitProvenName({ context: 7n });
    expect(ok).toMatchObject({ accepted: true, strength: 40, spirit: 't:123' });
    expect(a.poolInfo('me', 't:123')!.cap).toBeCloseTo(TUNABLES.poolBase * 2 ** (TUNABLES.poolExp * 4));
    a.submitCast({ aura: 'me', spirit: 't:123', facet: 2, request: 1e9, target: { kind: 'self' }, tick: 0 });
    expect(a.tick().casts[0]!.grant).toBeGreaterThan(0);
    // a plain authority refuses proofs
    expect((await new LocalAuthority().submitProvenName({})).accepted).toBe(false);
  });
});

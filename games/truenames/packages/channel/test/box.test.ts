import { describe, it, expect } from 'vitest';
import { ed25519 } from '@noble/curves/ed25519.js';
import { pairKey, sealBox, openBox } from '../src/box.ts';

const aura = () => { const secret = ed25519.utils.randomSecretKey(); return { secret, pub: ed25519.getPublicKey(secret) }; };

describe('sealed boxes between auras', () => {
  it('two auras derive the same key and can open each other\'s boxes; a third cannot', () => {
    const a = aura(), b = aura(), c = aura();
    const ab = pairKey(a.secret, a.pub, b.pub), ba = pairKey(b.secret, b.pub, a.pub);
    expect(ab).toEqual(ba);
    const box = sealBox(ab, { k: 'orders', names: [{ cell: '312662277504', facets: 1, bests: [27] }] });
    expect(box).not.toContain('312662277504');
    expect(openBox(ba, box)).toEqual({ k: 'orders', names: [{ cell: '312662277504', facets: 1, bests: [27] }] });
    // c, claiming to be a, cannot seal a box that opens between a and b, nor open theirs
    const ca = pairKey(c.secret, c.pub, b.pub);
    expect(() => openBox(ba, sealBox(ca, { k: 'found' }))).toThrow();
    expect(() => openBox(pairKey(c.secret, c.pub, a.pub), box)).toThrow();
  });

  it('an altered box does not open', () => {
    const a = aura(), b = aura();
    const k = pairKey(a.secret, a.pub, b.pub);
    const box = sealBox(k, { k: 'found', nonce: '123' });
    const bad = box.slice(0, 40) + (box[40] === 'A' ? 'B' : 'A') + box.slice(41);
    expect(() => openBox(k, bad)).toThrow();
  });
});

import { Session, freshKey } from '../src/box.ts';

describe('sessions between auras', () => {
  const setup = () => {
    const a = aura(), b = aura();
    const pa = pairKey(a.secret, a.pub, b.pub), pb = pairKey(b.secret, b.pub, a.pub);
    const fa = freshKey(), fb = freshKey();
    const aPub = fa.pub, bPub = fb.pub, aSecret = fa.secret.slice(), bSecret = fb.secret.slice();
    return { a, b, pa, pb, sa: Session.make(pa, fa, bPub), sb: Session.make(pb, fb, aPub), fa, fb, aSecret, bSecret };
  };

  it('both sides make the same session, and their fresh secrets are wiped', () => {
    const { sa, sb, fa, fb } = setup();
    expect(sb.open(sa.seal({ k: 'orders' }))).toEqual({ k: 'orders' });
    expect(sa.open(sb.seal({ k: 'found' }))).toEqual({ k: 'found' });
    expect(fa.secret.every((x) => x === 0) && fb.secret.every((x) => x === 0)).toBe(true);
  });

  it('a replayed box is refused', () => {
    const { sa, sb } = setup();
    const box = sa.seal({ k: 'stop' });
    expect(sb.open(box)).toEqual({ k: 'stop' });
    expect(() => sb.open(box)).toThrow(/replayed/);
  });

  it('forward secrecy: a recorded session box does not open with the pair key, nor with a new session', () => {
    const { pa, sa, pb, aSecret } = setup();
    const recorded = sa.seal({ k: 'orders', names: [{ cell: '312662277504' }] });
    expect(() => openBox(pa, recorded)).toThrow(); // the auras alone (pair key) open nothing
    const later = Session.make(pb, freshKey(), x25519FromSecret(aSecret));
    expect(() => later.open(recorded)).toThrow(); // nor does any later session
  });
});

import { x25519 } from '@noble/curves/ed25519.js';
const x25519FromSecret = (s: Uint8Array) => x25519.getPublicKey(s);

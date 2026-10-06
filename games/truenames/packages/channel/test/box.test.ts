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

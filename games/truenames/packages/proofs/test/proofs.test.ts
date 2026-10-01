import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ed25519 } from '@noble/curves/ed25519.js';
import { cellDigest, traitHashFromDigest, nameStrength, spiritAt, wordOf, wordBar, facetForm, MIN_NAME_BITS } from '@truenames/universe';
import vectors from '../../universe/test/vectors.json' with { type: 'json' };
import { proveName, verifyZkName, parsePublic, type Artifacts } from '../src/index.ts';

const art = (f: string) => fileURLToPath(new URL(`../artifacts/${f}`, import.meta.url));
const artifacts: Artifacts = { wasm: art('name.wasm'), zkey: art('name.zkey') };
const vkey = () => JSON.parse(readFileSync(art('name.vkey.json'), 'utf8'));

// the golden-vector test aura and its grasped word on the hearth (a wisp: one facet), ground once for the vectors
const SECRET = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const PUB = ed25519.getPublicKey(SECRET);
const GOD = vectors.words[0]!.cell;
const NONCE = BigInt(vectors.words[0]!.nonce);
/** A spirit-class being (one class above its depth): two facets. */
const KNOWN = '012341174703';

describe('zero-knowledge word claims', () => {
  it('proves the details, never the source: no address, no trait hash, no nonce', async () => {
    const s = nameStrength(GOD, PUB, NONCE);
    const god = spiritAt(GOD)!;
    expect(s).toBeGreaterThanOrEqual(wordBar(god.magnitude));
    const claim = await proveName({ cell: GOD, nonce: NONCE, secretKey: SECRET, magnitude: god.magnitude, strength: s, context: 777n }, artifacts);
    const pub = parsePublic(claim.publicSignals);
    const t = god.traits;
    // eleven public signals: round tag, element, facet, form, weight, generosity, temper, aura field, might, strength, context
    expect(claim.publicSignals).toEqual([pub.roundTag, String(god.element), '0', String(t.form), String(t.weightIdx), String(t.generosityIdx), String(t.temperIdx), claim.publicSignals[7], String(god.magnitude), String(s), '777']);
    const traitHash = traitHashFromDigest(cellDigest(GOD)).toString();
    const digest = cellDigest(GOD).toString();
    for (const secret of [traitHash, digest, NONCE.toString(), GOD]) expect(claim.publicSignals).not.toContain(secret);
    expect(Object.keys(claim).sort()).toEqual(['aura', 'kind', 'proof', 'publicSignals', 'sig', 'spec']);
    const v = await verifyZkName(claim, vkey(), 777n);
    expect(v).toMatchObject({ ok: true, name: { strength: s, magnitude: god.magnitude, facet: 0, element: god.element, traits: { form: t.form, formStep: 0, weightIdx: t.weightIdx, generosityIdx: t.generosityIdx, temperIdx: t.temperIdx, flavor: 0n } } });
  });

  it('reveals which facet a word touched, and that facet\'s form', async () => {
    const sp = spiritAt(KNOWN)!;
    expect(sp.magnitude).toBe(1); // two facets
    for (const n of [0n, 1n, 2n, 3n]) {
      const w = wordOf(KNOWN, PUB, n)!;
      const claim = await proveName({ cell: KNOWN, nonce: n, secretKey: SECRET, magnitude: 1, strength: w.strength, context: 9n }, artifacts);
      const pub = parsePublic(claim.publicSignals);
      expect(pub.facet).toBe(w.facet);
      expect(pub.traits.form).toBe(facetForm(sp.traits, w.facet));
    }
  });

  it('the round tag identifies a being within one round only (both facets share it)', async () => {
    const a = await proveName({ cell: KNOWN, nonce: 0n, secretKey: SECRET, magnitude: 1, strength: 0, context: 1n }, artifacts);
    const b = await proveName({ cell: KNOWN, nonce: 1n, secretKey: SECRET, magnitude: 1, strength: 0, context: 1n }, artifacts);
    const c = await proveName({ cell: KNOWN, nonce: 0n, secretKey: SECRET, magnitude: 1, strength: 0, context: 2n }, artifacts);
    expect(parsePublic(a.publicSignals).roundTag).toBe(parsePublic(b.publicSignals).roundTag); // same being, same round
    expect(parsePublic(a.publicSignals).roundTag).not.toBe(parsePublic(c.publicSignals).roundTag); // another round: unlinkable
  });

  it('truths may be understated, never overstated; might is exact', async () => {
    const s = nameStrength(GOD, PUB, NONCE);
    const god = spiritAt(GOD)!;
    const low = await proveName({ cell: GOD, nonce: NONCE, secretKey: SECRET, magnitude: god.magnitude, strength: MIN_NAME_BITS, context: 1n }, artifacts);
    expect((await verifyZkName(low, vkey(), 1n)).ok).toBe(true);
    await expect(proveName({ cell: GOD, nonce: NONCE, secretKey: SECRET, magnitude: god.magnitude, strength: s + 1, context: 1n }, artifacts)).rejects.toThrow();
    await expect(proveName({ cell: GOD, nonce: NONCE, secretKey: SECRET, magnitude: god.magnitude + 1, strength: 12, context: 1n }, artifacts)).rejects.toThrow();
    await expect(proveName({ cell: KNOWN, nonce: 0n, secretKey: SECRET, magnitude: 0, strength: 0, context: 1n }, artifacts)).rejects.toThrow(); // understating might would change the facet count
    // not a being at all
    await expect(proveName({ cell: '000000000000', nonce: NONCE, secretKey: SECRET, magnitude: 0, strength: 0, context: 1n }, artifacts)).rejects.toThrow();
  });

  it('rejects the wrong journey, a stolen proof, and tampering', async () => {
    const god = spiritAt(GOD)!;
    const claim = await proveName({ cell: GOD, nonce: NONCE, secretKey: SECRET, magnitude: god.magnitude, strength: 22, context: 5n }, artifacts);
    expect(await verifyZkName(claim, vkey(), 6n)).toMatchObject({ ok: false, reason: 'wrong journey' });
    // someone else presents your proof under their aura
    const thief = ed25519.utils.randomSecretKey();
    const stolen = { ...claim, aura: Buffer.from(ed25519.getPublicKey(thief)).toString('hex') };
    expect(await verifyZkName(stolen, vkey(), 5n)).toMatchObject({ ok: false, reason: 'proof is for another aura' });
    // bump the claimed strength in the public signals
    const bumped = { ...claim, publicSignals: claim.publicSignals.map((x, i) => (i === 9 ? '40' : x)) };
    const r = await verifyZkName(bumped, vkey(), 5n);
    expect(r.ok).toBe(false);
  });
}, 120_000);

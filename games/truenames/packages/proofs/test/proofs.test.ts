import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ed25519 } from '@noble/curves/ed25519.js';
import { cellDigest, traitHashFromDigest, nameStrength, spiritAt, MIN_NAME_BITS } from '@truenames/universe';
import { proveName, verifyZkName, parsePublic, type Artifacts } from '../src/index.ts';

const art = (f: string) => fileURLToPath(new URL(`../artifacts/${f}`, import.meta.url));
const artifacts: Artifacts = { wasm: art('name.wasm'), zkey: art('name.zkey') };
const vkey = () => JSON.parse(readFileSync(art('name.vkey.json'), 'utf8'));

// the golden-vector test aura and its valid hearth-god name (15 truths)
const SECRET = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const PUB = ed25519.getPublicKey(SECRET);
const GOD = '011010';
let NONCE = 0n;

describe('zero-knowledge name claims', () => {
  beforeAll(() => {
    while (nameStrength(GOD, PUB, NONCE) < MIN_NAME_BITS) NONCE++;
  });

  it('proves the details, never the source: no address, no trait hash, no nonce', async () => {
    const s = nameStrength(GOD, PUB, NONCE);
    const god = spiritAt(GOD)!;
    const claim = await proveName({ cell: GOD, nonce: NONCE, secretKey: SECRET, magnitude: god.magnitude, strength: s, context: 777n }, artifacts);
    const pub = parsePublic(claim.publicSignals);
    const t = god.traits;
    // ten public signals: round tag, element, form, weight, generosity, temper, aura field, magnitude, strength, context
    expect(claim.publicSignals).toEqual([pub.roundTag, '0', String(t.form), String(t.weightIdx), String(t.generosityIdx), String(t.temperIdx), claim.publicSignals[6], String(god.magnitude), String(s), '777']);
    const traitHash = traitHashFromDigest(cellDigest(GOD)).toString();
    const digest = cellDigest(GOD).toString();
    for (const secret of [traitHash, digest, NONCE.toString(), GOD]) expect(claim.publicSignals).not.toContain(secret);
    expect(Object.keys(claim).sort()).toEqual(['aura', 'kind', 'proof', 'publicSignals', 'sig', 'spec']);
    const v = await verifyZkName(claim, vkey(), 777n);
    expect(v).toMatchObject({ ok: true, name: { strength: s, magnitude: god.magnitude, element: 0, traits: { form: t.form, weightIdx: t.weightIdx, generosityIdx: t.generosityIdx, temperIdx: t.temperIdx, flavor: 0n } } });
  });

  it('the round tag identifies a spirit within one round only', async () => {
    const a = await proveName({ cell: GOD, nonce: NONCE, secretKey: SECRET, magnitude: 3, strength: 12, context: 1n }, artifacts);
    const b = await proveName({ cell: GOD, nonce: NONCE, secretKey: SECRET, magnitude: 1, strength: 12, context: 1n }, artifacts);
    const c = await proveName({ cell: GOD, nonce: NONCE, secretKey: SECRET, magnitude: 3, strength: 12, context: 2n }, artifacts);
    expect(parsePublic(a.publicSignals).roundTag).toBe(parsePublic(b.publicSignals).roundTag); // same spirit, same round
    expect(parsePublic(a.publicSignals).roundTag).not.toBe(parsePublic(c.publicSignals).roundTag); // another round: unlinkable
  });

  it('a proof may understate, never overstate', async () => {
    const s = nameStrength(GOD, PUB, NONCE);
    const low = await proveName({ cell: GOD, nonce: NONCE, secretKey: SECRET, magnitude: 1, strength: MIN_NAME_BITS, context: 1n }, artifacts);
    expect((await verifyZkName(low, vkey(), 1n)).ok).toBe(true);
    await expect(proveName({ cell: GOD, nonce: NONCE, secretKey: SECRET, magnitude: 3, strength: s + 1, context: 1n }, artifacts)).rejects.toThrow();
    await expect(proveName({ cell: GOD, nonce: NONCE, secretKey: SECRET, magnitude: 4, strength: 12, context: 1n }, artifacts)).rejects.toThrow();
    // not a spirit at all
    await expect(proveName({ cell: '000000', nonce: NONCE, secretKey: SECRET, magnitude: 0, strength: 0, context: 1n }, artifacts)).rejects.toThrow();
  });

  it('rejects the wrong journey, a stolen proof, and tampering', async () => {
    const claim = await proveName({ cell: GOD, nonce: NONCE, secretKey: SECRET, magnitude: 3, strength: 12, context: 5n }, artifacts);
    expect(await verifyZkName(claim, vkey(), 6n)).toMatchObject({ ok: false, reason: 'wrong journey' });
    // someone else presents your proof under their aura
    const thief = ed25519.utils.randomSecretKey();
    const stolen = { ...claim, aura: Buffer.from(ed25519.getPublicKey(thief)).toString('hex') };
    expect(await verifyZkName(stolen, vkey(), 5n)).toMatchObject({ ok: false, reason: 'proof is for another aura' });
    // bump the claimed strength in the public signals
    const bumped = { ...claim, publicSignals: claim.publicSignals.map((x, i) => (i === 8 ? '30' : x)) };
    const r = await verifyZkName(bumped, vkey(), 5n);
    expect(r.ok).toBe(false);
  });
}, 120_000);

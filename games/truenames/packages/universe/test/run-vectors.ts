// Shared vector runner: used by the Node test and the browser-worker check.
import * as U from '../src/index.ts';

export function runVectors(v: any): string[] {
  const fails: string[] = [];
  const eq = (label: string, got: unknown, want: unknown) => {
    const g = JSON.stringify(got), w = JSON.stringify(want);
    if (g !== w) fails.push(`${label}: got ${g} want ${w}`);
  };
  eq('spec', U.SPEC_VERSION, v.spec);
  eq('seed', U.SEED.toString(), v.seed);
  for (const b of v.bits) eq(`bits(${b.h})`, U.bits(BigInt(b.h)), b.bits);
  for (const c of v.cellDigest) eq(`cellDigest(${c.cell})`, U.cellDigest(c.cell).toString(), c.digest);
  for (const t of v.target) eq(`target(${t.depth})`, U.target(t.depth), t.target);
  for (const s of v.spiritAt) {
    const got = U.spiritAt(s.cell);
    eq(`spiritAt(${s.cell})`, got && { ...got, traits: { ...got.traits, flavor: got.traits.flavor.toString() } }, s.spirit);
  }
  const pub = U.hexToBytes(v.aura.pubkey);
  eq('auraField', U.auraField(pub).toString(), v.aura.field);
  for (const n of v.nameStrength) {
    eq(`nameHash(${n.nonce})`, U.nameHash(n.cell, pub, BigInt(n.nonce)).toString(), n.hash);
    eq(`nameStrength(${n.nonce})`, U.nameStrength(n.cell, pub, BigInt(n.nonce)), n.strength);
  }
  for (const c of v.claims) eq(`verifyNameClaim(${c.claim.sig.slice(0, 8)})`, U.verifyNameClaim(c.claim), c.result);
  return fails;
}

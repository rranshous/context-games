// Generates packages/universe/test/vectors.json. Run ONCE for spec 1, commit, never regenerate.
import { writeFileSync, existsSync } from 'node:fs';
import { ed25519 } from '@noble/curves/ed25519.js';
import * as U from '@truenames/universe';

export const TEST_SECRET = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const OUT = new URL('../../../packages/universe/test/vectors.json', import.meta.url);

export function vectors(args: string[]) {
  if (existsSync(OUT) && !args.includes('--force')) {
    console.error('vectors.json exists. Spec 1 vectors are law; refusing to regenerate (use --force only with a spec bump).');
    process.exit(1);
  }
  const P = U.P;
  const bitsIn = [0n, 1n, P - 1n, P - 2n, P >> 1n, (P >> 1n) - 1n, P >> 2n, P >> 10n, P >> 100n, P >> 200n, P >> 253n, 12345n];
  const cells = ['', '0', '07', '012345670123', '0123456701234567012345670123456701234567'];
  const hits = ['011010', '567171', '570476', '615043', '651063', '005420', '027345', '033121', '076656', '110062', '136143', '253312'];
  const misses = ['000000', '011011', '777777', '0110100', '1234567', '01234567012', '7', '01101', '777'];
  const pub = ed25519.getPublicKey(TEST_SECRET);
  const aura = U.auraField(pub);
  const nonces = [0n, 1n, 2n, 1000n, 123456789n, P - 1n];
  // grind a valid claim on the hearth-god for the test aura
  const god = '011010';
  let n = 0n;
  while (U.nameStrength(god, pub, n) < U.MIN_NAME_BITS) n++;
  const good = U.signNameClaim(god, n, TEST_SECRET);
  const bad = { ...good, sig: good.sig.slice(0, -2) + (good.sig.endsWith('00') ? '01' : '00') };
  const ser = (s: U.Spirit | null) => s && { ...s, traits: { ...s.traits, flavor: s.traits.flavor.toString() } };
  const v = {
    spec: U.SPEC_VERSION,
    seed: U.SEED.toString(),
    bits: bitsIn.map((h) => ({ h: h.toString(), bits: U.bits(h) })),
    cellDigest: cells.map((c) => ({ cell: c, digest: U.cellDigest(c).toString() })),
    target: Array.from({ length: 20 }, (_, d) => ({ depth: d, target: U.target(d) })),
    spiritAt: [...hits, ...misses].map((c) => ({ cell: c, spirit: ser(U.spiritAt(c)) })),
    aura: { secret: U.bytesToHex(TEST_SECRET), pubkey: U.bytesToHex(pub), field: aura.toString() },
    nameStrength: nonces.map((nn) => ({ cell: god, nonce: nn.toString(), hash: U.nameHash(god, pub, nn).toString(), strength: U.nameStrength(god, pub, nn) })),
    claims: [
      { claim: good, result: U.verifyNameClaim(good) },
      { claim: bad, result: U.verifyNameClaim(bad) },
    ],
  };
  writeFileSync(OUT, JSON.stringify(v, null, 1) + '\n');
  console.log('wrote vectors; good claim strength', v.claims[0]!.result);
}

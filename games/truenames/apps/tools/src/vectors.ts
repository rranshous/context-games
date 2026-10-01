// Generates packages/universe/test/vectors.json. Run ONCE per spec version, commit, never regenerate.
// Spec v2: the hits are charted beings (found by god-finder scans; see world.ts), and the grasped words
// for the test auras are ground on all cores (a wisp's bar is 22 truths: minutes, not milliseconds).
import { writeFileSync, existsSync } from 'node:fs';
import { ed25519 } from '@noble/curves/ed25519.js';
import * as U from '@truenames/universe';
import { HEARTH_GOD } from '../../../packages/dungeon/src/world.ts';
import { parallelGrind } from './par.ts';

export const TEST_SECRET = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
/** A second test aura (shared races, two-player tests). */
export const TEST_SECRET_2 = Uint8Array.from({ length: 32 }, (_, i) => 200 - i);
const OUT = new URL('../../../packages/universe/test/vectors.json', import.meta.url);

export async function vectors(args: string[]) {
  if (existsSync(OUT) && !args.includes('--force')) {
    console.error('vectors.json exists. Spec vectors are law; refusing to regenerate (use --force only with a spec bump).');
    process.exit(1);
  }
  const P = U.P;
  const bitsIn = [0n, 1n, P - 1n, P - 2n, P >> 1n, (P >> 1n) - 1n, P >> 2n, P >> 10n, P >> 100n, P >> 200n, P >> 253n, 12345n];
  const cells = ['', '0', '07', '012345670123', '0123456701234567012345670123456701234567'];
  // fixed cells (not the CHARTED list, which may grow): the hearth, the spirit-class outlier, and wisps of four elements
  const hits = [HEARTH_GOD, '012341174703', '274112260672', '036207712712', '150513103736', '274107616230', '445762731153', '445716773537', '036221100226', '150543077073'];
  const misses = ['000000000000', '011010', '777777777777', '0123411747031', '01234117470', '036207712713', '7', '01101', '777'];
  const pub = ed25519.getPublicKey(TEST_SECRET);
  const aura = U.auraField(pub);
  const nonces = [0n, 1n, 2n, 1000n, 123456789n, P - 1n];
  const god = HEARTH_GOD;
  const bar = U.wordBar(U.spiritAt(god)!.magnitude);
  console.log(`grinding grasped words (${bar} truths) on the hearth for the two test auras…`);
  const w1 = await parallelGrind(god, pub, bar);
  const pub2 = ed25519.getPublicKey(TEST_SECRET_2);
  const w2 = await parallelGrind(god, pub2, bar);
  const good = U.signNameClaim(god, w1.nonce, TEST_SECRET);
  const bad = { ...good, sig: good.sig.slice(0, -2) + (good.sig.endsWith('00') ? '01' : '00') };
  const ser = (s: U.Spirit | null) => s && { ...s, traits: { ...s.traits, flavor: s.traits.flavor.toString() } };
  const v = {
    spec: U.SPEC_VERSION,
    seed: U.SEED.toString(),
    bits: bitsIn.map((h) => ({ h: h.toString(), bits: U.bits(h) })),
    cellDigest: cells.map((c) => ({ cell: c, digest: U.cellDigest(c).toString() })),
    target: Array.from({ length: 25 }, (_, d) => ({ depth: d, target: U.target(d) })),
    spiritAt: [...hits, ...misses].map((c) => ({ cell: c, spirit: ser(U.spiritAt(c)) })),
    facets: hits.map((c) => { const s = U.spiritAt(c)!; return { cell: c, count: U.facetCount(s.magnitude), forms: Array.from({ length: U.facetCount(s.magnitude) }, (_, f) => U.facetForm(s.traits, f)), bar: U.wordBar(s.magnitude) }; }),
    aura: { secret: U.bytesToHex(TEST_SECRET), pubkey: U.bytesToHex(pub), field: aura.toString() },
    nameStrength: nonces.map((nn) => ({ cell: '012341174703', nonce: nn.toString(), hash: U.nameHash('012341174703', pub, nn).toString(), strength: U.nameStrength('012341174703', pub, nn), word: U.wordOf('012341174703', pub, nn) })),
    claims: [
      { claim: good, result: U.verifyNameClaim(good) },
      { claim: bad, result: U.verifyNameClaim(bad) },
    ],
    /** Grasped words on the hearth for the test auras, so tests needn't grind (not spec law; convenient fixtures). */
    words: [
      { secret: U.bytesToHex(TEST_SECRET), cell: god, nonce: w1.nonce.toString(), strength: w1.strength },
      { secret: U.bytesToHex(TEST_SECRET_2), cell: god, nonce: w2.nonce.toString(), strength: w2.strength },
    ],
  };
  writeFileSync(OUT, JSON.stringify(v, null, 1) + '\n');
  console.log('wrote vectors; good claim', v.claims[0]!.result, 'second word', w2.strength);
}

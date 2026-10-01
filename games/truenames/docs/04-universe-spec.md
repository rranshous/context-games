# 04 · Universe spec (v2)

This is the frozen contract for `packages/universe`. **Once a seed is published, anything in this doc that changes a hash output changes the whole universe.** Changes require bumping `SPEC_VERSION` and regenerating golden vectors.

```
SPEC_VERSION = 2
```

## Field and hash
- Hash: **Poseidon** over the BN254 scalar field, as implemented by `poseidon-lite` (`poseidon2`, `poseidon3`, `poseidon4`).
- `p = 21888242871839275222246405745257275088548364400416034343698204186575808495617`
- All hash inputs are field elements (`bigint`, `0 ≤ x < p`). All outputs are field elements.
- Why Poseidon: it is SNARK-friendly, so a later ZK phase can prove statements about names without changing the universe.

## Domain tags
Small constants, so no two hash uses can collide:
```
TAG_CELL   = 1n
TAG_SPIRIT = 2n
TAG_TRAITS = 3n
TAG_AURA   = 4n
TAG_NAME   = 5n
```

## Seed
`SEED` is a field element, published per universe:
```
SEED = 0x7472_7565_6e61_6d65_735f_7632   // ASCII "truenames_v2"
```
(Per-epoch seeds are possible later; see [08](08-open-questions.md).)

## Cells
A cell is a path of octants from the root: `path = [o1, o2, …, od]`, each `o ∈ 0..7`. `depth = d`.

Text form: a string of octal digits, e.g. `"0374161"`. Root is `""`.

### Cell digest (chained)
```
digest(root)          = 0n
digest(path ++ [o])   = poseidon3([TAG_CELL, digest(path), BigInt(o)])
```
- Supports unbounded depth.
- Scanning all 8 children of a known cell costs one hash each, so scanning under a prefix is cheap once the prefix digest is cached.
- Computing a cell from scratch costs `depth` hashes. Cache prefix digests.

### Regions
Derived from the path, no hashing:
| Field | Source |
|---|---|
| `element` | `path[0]` |
| `aspect` | `path[1]` |
| `tradition` | `path[2] * 8 + path[3]` (64 per aspect) |
| `lineage` | `path[4..]` prefix, used for flavor only |

Element ids: `0 fire, 1 frost, 2 storm, 3 stone, 4 tide, 5 shadow, 6 light, 7 rot`. Aspect ids reuse the same table (fire/storm = aspect 2 under element 0).

## Difficulty bits
Poseidon outputs are uniform in `[0, p)`, not in `[0, 2^256)`, so "leading zeros" is defined relative to `p`:

```ts
// Largest k such that (h + 1) * 2^k <= p.   P(bits(h) >= k) = 2^-k (to within rounding).
export function bits(h: bigint): number {
  let k = 0;
  let x = h + 1n;
  while ((x << 1n) <= P) { x <<= 1n; k++; }
  return k;
}
```
Use this everywhere a hash is scored. Don't use raw `clz` on the 256-bit representation.

## Beings (the pyramid of might)
```
spiritHash(cell) = poseidon3([TAG_SPIRIT, SEED, digest(cell)])
exists(cell)     = depth >= MIN_SPIRIT_DEPTH && bits(spiritHash) >= target(depth)
might(cell)      = (depth - MIN_SPIRIT_DEPTH) + floor((bits(spiritHash) - target(depth)) / MIGHT_ROLL_BITS)
```
Code calls might `magnitude`. Constants, frozen with the spec:
```
MIN_SPIRIT_DEPTH = 12          // depths 1–11 are regions and empty reaches
target(d)        = 4d - 26     // 22 bits at depth 12, +4 per layer
MIGHT_ROLL_BITS  = 4           // a being one class above its depth: 1 in 16; two: 1 in 256
```
Each layer has 8× the cells (3 bits) and needs 4 more bits, so it holds **half as many beings**, each **16× harder to find**, and **one class mightier** (wisp 0, spirit 1, power 2, dominion 3, god 4, great god 5, elder god 6, primordial 7). Depth sets the class; the surplus bits are a rare step up.

## Facets
A being has `facetCount(might) = min(MAX_FACETS, might + 1)` facets (`MAX_FACETS = 8`): a wisp one, a god five, a primordial eight. Each facet has a form; no being repeats one:
```
facetForm(traits, f) = (traits.form + f * traits.formStep) mod 8      // formStep is odd
```

## Traits
A separate hash so traits are independent of magnitude:
```
traitHash(cell) = poseidon3([TAG_TRAITS, SEED, digest(cell)])
```
Decode from the low bits (`t = traitHash`):
| Trait | Bits | Range | Meaning |
|---|---|---|---|
| `form` | `t & 0b111` | 0–7 | The first facet's form (see 03) |
| `formStep` | `((t >> 3) & 0b11) * 2 + 1` | 1, 3, 5, 7 | Step between facet forms |
| `weightIdx` | `(t >> 5) & 0xF` | 0–15 | Strain weight index |
| `generosityIdx` | `(t >> 9) & 0xF` | 0–15 | Cast-cap multiplier index |
| `temperIdx` | `(t >> 13) & 0x7` | 0–7 | Backlash style |
| `flavor` | `t >> 16` | rest | Sigil, public name syllables, palette, cosmetics |

The universe returns **integer indices only**. The authority maps indices to floats via tunables (e.g. `weight = 0.5 + weightIdx / 6`). This keeps `universe` float-free.

## Aura
An aura is an ed25519 public key (32 bytes). To field:
```
hi = bytes[0..16]  as big-endian bigint   (128 bits)
lo = bytes[16..32] as big-endian bigint   (128 bits)
auraField(pubkey) = poseidon3([TAG_AURA, hi, lo])
```

## Words of power
```
nameHash(cell, aura, nonce) = poseidon4([TAG_NAME, digest(cell), auraField(aura), nonce])
strength (truths)           = bits(nameHash)
facet                       = (nameHash & 0xFFFF) mod facetCount(might)      // the facet the word touched
wordBar(might)              = WORD_BAR_BASE + WORD_BAR_STEP * might          // 22 + 4·might
grasped                     = strength >= wordBar(might)
resonance                   = strength - wordBar(might)
```
- `nonce` is a field element. Workers start from a random 64-bit offset and increment, so parallel workers don't overlap.
- Meditation can't aim at a facet: each word lands on the facet its low bits pick (independent of the leading bits that set its truths). You keep the truest word per facet.
- `MIN_NAME_BITS = WORD_BAR_BASE = 22` (a wisp's bar) is the least truths any grasped word holds.
- A word is valid only if `exists(cell)`.

## Word submission (v2, clear text)
Used inside the sanctum, which knows the address anyway. Games never receive these; they receive zero-knowledge claims (below).
```ts
interface NameClaim {
  spec: 2;
  cell: string;        // octal path
  aura: string;        // hex ed25519 pubkey
  nonce: string;       // decimal field element
  sig: string;         // hex ed25519 signature
}
```
Signed message: UTF-8 bytes of `truenames/word/v2|${cell}|${nonce}`, signed by the aura's private key.

Verification:
1. `exists(cell)`.
2. Signature valid for `aura`.
3. `strength = bits(nameHash(cell, aura, nonce))`, and `strength >= wordBar(might)`.
4. Returns `{ strength, facet }`; store if `strength > best[aura][cell#facet]`.

Signing is why grinding someone else's name is safe: only they can submit it.

## Zero-knowledge word claim (games)
What a world receives at the threshold, produced by `packages/proofs` (Groth16 over BN254, circuit generated from these same constants). The circuit is part of the contract: changing what it checks or reveals means a new circuit, a new trusted setup, and a new `vkey`.
```
private: digits[0..depth), depth, nonce
public in:  auraField, magnitude (might, exact), strength, context
public out: roundTag = poseidon3([TAG_ROUND, digest(cell), context])      // TAG_ROUND = 101: the being, this round only
            element, facet, form (that facet's), weightIdx, generosityIdx, temperIdx
checks:     MIN_SPIRIT_DEPTH ≤ depth ≤ 24
            roll = might - (depth - 12) ∈ [0, 3]
            target(depth) + 4·roll ≤ bits(spiritHash) < target(depth) + 4·(roll + 1)   // might is exact
            bits(nameHash(cell, aura, nonce)) ≥ strength                               // a lower bound
            facet = (nameHash & 0xFFFF) mod min(8, might + 1);  form = facetForm(traits, facet)
```
- **Might is exact**, not a lower bound: it sets the facet count, which decides which facet (and form) a word is. A world refuses a word below its bar (`strength < wordBar(might)`).
- The **trait hash never leaves the proof**, so the claim can't identify the being (flavor bits would). The round tag identifies it within one context only and is unlinkable across contexts. Two words for the same being share a round tag (and a vessel); a world refuses the same (round tag, facet) twice.
- Beings more than 3 classes above their depth (1 in 65,536) can't be proven by this circuit.
- The 11 public signals are signed by the aura (ed25519) so a claim is bound to its holder; message `truenames/zkword/v2|signals`.
- Verification: `context` must equal the world's issued context, `auraField` must match the signing key, then `groth16.verify` against the committed `vkey`.

## Public API (`packages/universe`)
```ts
export const SPEC_VERSION: 2;
export const P: bigint;
export function bits(h: bigint): number;

export type Cell = string;                       // octal path
export function cellDigest(cell: Cell): bigint;  // memoized by prefix
export function childDigest(parent: bigint, octant: number): bigint;
export function region(cell: Cell): { element: number; aspect?: number; tradition?: number; depth: number };

export function target(depth: number): number;
export function spiritAt(cell: Cell): Spirit | null;
export interface Spirit { cell: Cell; depth: number; magnitude: number; element: number; aspect: number; tradition: number; traits: Traits }
export interface Traits { form: number; formStep: number; weightIdx: number; generosityIdx: number; temperIdx: number; flavor: bigint }
export function mightOf(depth: number, bits: number): number;
export function facetCount(might: number): number;
export function facetForm(traits: Traits, facet: number): number;
export function wordBar(might: number): number;
export function facetOfHash(nameHash: bigint, facets: number): number;
export function wordOf(cell: Cell, aura: Uint8Array, nonce: bigint): { strength: number; facet: number } | null;

export function auraField(pubkey: Uint8Array): bigint;
export function nameStrength(cell: Cell, aura: Uint8Array, nonce: bigint): number;
export function verifyNameClaim(claim: NameClaim): { ok: true; strength: number } | { ok: false; reason: string };
export const SEED: bigint, MIN_SPIRIT_DEPTH: 12, WORD_BAR_BASE: 22, WORD_BAR_STEP: 4, MIN_NAME_BITS: 22, MIGHT_ROLL_BITS: 4, MAX_FACETS: 8;
```
(Plus helpers the meditation and proofs packages use: `spiritFromDigest`, `decodeTraits`, `nameHash`, `signNameClaim`.)

## Golden vectors
`packages/universe/test/vectors.json`, generated once and then treated as law:
- `bits` on edge values: `0`, `p-1`, `p>>k` for several `k`.
- `cellDigest` for `""`, `"0"`, `"07"`, a depth-12 path, a depth-40 path.
- `spiritAt` for ≥ 20 cells, including hits and misses.
- `auraField` and `nameStrength` for a fixed test keypair.
- One full `NameClaim` that verifies, and one with a bad signature.

Tests run the same vectors in Node and inside a browser Web Worker.

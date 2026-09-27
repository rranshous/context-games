// Truenames universe, spec v1. See docs/04-universe-spec.md.
// Pure and deterministic: bigint only, no floats, no randomness, no clocks.
import { poseidon3, poseidon4 } from './poseidon.ts';
import { ed25519 } from '@noble/curves/ed25519.js';

export const SPEC_VERSION = 1 as const;

export const P = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export const TAG_CELL = 1n;
export const TAG_SPIRIT = 2n;
export const TAG_TRAITS = 3n;
export const TAG_AURA = 4n;
export const TAG_NAME = 5n;

/** The published seed for universe v1. A field element. Frozen. */
export const SEED = 0x7472_7565_6e61_6d65_735f_7631n; // "truenames_v1"

export const MIN_SPIRIT_DEPTH = 6;
export const MIN_NAME_BITS = 12; // frozen after M0 bench (see journal)

export const ELEMENTS = ['fire', 'frost', 'storm', 'stone', 'tide', 'shadow', 'light', 'rot'] as const;

/** Largest k such that (h + 1) * 2^k <= P.  P(bits(h) >= k) = 2^-k. */
export function bits(h: bigint): number {
  let k = 0;
  let x = h + 1n;
  while ((x << 1n) <= P) {
    x <<= 1n;
    k++;
  }
  return k;
}

/** Spirit-existence target at a depth. Universe constant. */
export function target(depth: number): number {
  return 4 + ((3 * depth) >> 1); // integer arithmetic only
}

// ---------- cells ----------

export type Cell = string; // octal path, "" is root

const CELL_RE = /^[0-7]*$/;

export function isCell(s: string): s is Cell {
  return CELL_RE.test(s);
}

export function childDigest(parent: bigint, octant: number): bigint {
  if (!Number.isInteger(octant) || octant < 0 || octant > 7) throw new Error(`bad octant ${octant}`);
  return poseidon3([TAG_CELL, parent, BigInt(octant)]);
}

// Prefix memo. Bounded so long scans don't grow it forever; entries are
// cheap to recompute so a crude clear-on-full policy is fine.
const DIGEST_MEMO = new Map<string, bigint>([['', 0n]]);
const DIGEST_MEMO_MAX = 200_000;

export function cellDigest(cell: Cell): bigint {
  const hit = DIGEST_MEMO.get(cell);
  if (hit !== undefined) return hit;
  if (!isCell(cell)) throw new Error(`bad cell "${cell}"`);
  // walk up to the longest memoized prefix
  let i = cell.length - 1;
  let d: bigint | undefined;
  while (i >= 0 && (d = DIGEST_MEMO.get(cell.slice(0, i))) === undefined) i--;
  let acc = d ?? 0n;
  if (DIGEST_MEMO.size > DIGEST_MEMO_MAX) {
    DIGEST_MEMO.clear();
    DIGEST_MEMO.set('', 0n);
  }
  for (let j = Math.max(i, 0); j < cell.length; j++) {
    acc = childDigest(acc, cell.charCodeAt(j) - 48);
    // memoize prefixes only (the leaf itself is usually scanned once)
    if (j < cell.length - 1) DIGEST_MEMO.set(cell.slice(0, j + 1), acc);
  }
  return acc;
}

export interface Region {
  depth: number;
  element?: number;
  aspect?: number;
  tradition?: number;
  lineage?: string;
}

export function region(cell: Cell): Region {
  const r: Region = { depth: cell.length };
  if (cell.length >= 1) r.element = cell.charCodeAt(0) - 48;
  if (cell.length >= 2) r.aspect = cell.charCodeAt(1) - 48;
  if (cell.length >= 4) r.tradition = (cell.charCodeAt(2) - 48) * 8 + (cell.charCodeAt(3) - 48);
  if (cell.length >= 5) r.lineage = cell.slice(4);
  return r;
}

// ---------- spirits ----------

export interface Traits {
  form: number;
  weightIdx: number;
  generosityIdx: number;
  temperIdx: number;
  flavor: bigint;
}

export interface Spirit {
  cell: Cell;
  depth: number;
  magnitude: number;
  element: number;
  aspect: number;
  tradition: number;
  traits: Traits;
}

export function spiritHashFromDigest(digest: bigint): bigint {
  return poseidon3([TAG_SPIRIT, SEED, digest]);
}

export function traitHashFromDigest(digest: bigint): bigint {
  return poseidon3([TAG_TRAITS, SEED, digest]);
}

export function decodeTraits(t: bigint): Traits {
  return {
    form: Number(t & 0b111n),
    weightIdx: Number((t >> 3n) & 0xfn),
    generosityIdx: Number((t >> 7n) & 0xfn),
    temperIdx: Number((t >> 11n) & 0x7n),
    flavor: t >> 14n,
  };
}

/** Spirit check given a precomputed digest. The hot path for scrying. */
export function spiritFromDigest(cell: Cell, digest: bigint): Spirit | null {
  const depth = cell.length;
  if (depth < MIN_SPIRIT_DEPTH) return null;
  const b = bits(spiritHashFromDigest(digest));
  const tgt = target(depth);
  if (b < tgt) return null;
  const r = region(cell);
  return {
    cell,
    depth,
    magnitude: b - tgt,
    element: r.element!,
    aspect: r.aspect!,
    tradition: r.tradition!,
    traits: decodeTraits(traitHashFromDigest(digest)),
  };
}

export function spiritAt(cell: Cell): Spirit | null {
  if (!isCell(cell) || cell.length < MIN_SPIRIT_DEPTH) return null;
  return spiritFromDigest(cell, cellDigest(cell));
}

// ---------- auras and names ----------

function bytesToBigBE(b: Uint8Array): bigint {
  let x = 0n;
  for (const v of b) x = (x << 8n) | BigInt(v);
  return x;
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) throw new Error('bad hex');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesToHex(b: Uint8Array): string {
  let s = '';
  for (const v of b) s += v.toString(16).padStart(2, '0');
  return s;
}

export function auraField(pubkey: Uint8Array): bigint {
  if (pubkey.length !== 32) throw new Error('aura must be 32 bytes');
  const hi = bytesToBigBE(pubkey.subarray(0, 16));
  const lo = bytesToBigBE(pubkey.subarray(16, 32));
  return poseidon3([TAG_AURA, hi, lo]);
}

export function nameHashRaw(digest: bigint, aura: bigint, nonce: bigint): bigint {
  return poseidon4([TAG_NAME, digest, aura, nonce]);
}

export function nameHash(cell: Cell, aura: Uint8Array, nonce: bigint): bigint {
  return nameHashRaw(cellDigest(cell), auraField(aura), nonce);
}

export function nameStrength(cell: Cell, aura: Uint8Array, nonce: bigint): number {
  return bits(nameHash(cell, aura, nonce));
}

// ---------- claims ----------

export interface NameClaim {
  spec: 1;
  cell: string; // octal path
  aura: string; // hex ed25519 pubkey
  nonce: string; // decimal field element
  sig: string; // hex ed25519 signature
}

export function claimMessage(cell: Cell, nonce: bigint | string): Uint8Array {
  return new TextEncoder().encode(`truenames/name/v1|${cell}|${nonce.toString()}`);
}

export function signNameClaim(cell: Cell, nonce: bigint, secretKey: Uint8Array): NameClaim {
  const pub = ed25519.getPublicKey(secretKey);
  const sig = ed25519.sign(claimMessage(cell, nonce), secretKey);
  return { spec: 1, cell, aura: bytesToHex(pub), nonce: nonce.toString(), sig: bytesToHex(sig) };
}

export function verifyNameClaim(
  claim: NameClaim,
): { ok: true; strength: number } | { ok: false; reason: string } {
  if (claim.spec !== 1) return { ok: false, reason: 'unknown spec' };
  if (!isCell(claim.cell)) return { ok: false, reason: 'bad cell' };
  if (!spiritAt(claim.cell)) return { ok: false, reason: 'no spirit at cell' };
  if (!/^[0-9]+$/.test(claim.nonce)) return { ok: false, reason: 'bad nonce' };
  const nonce = BigInt(claim.nonce);
  if (nonce >= P) return { ok: false, reason: 'nonce out of field' };
  let aura: Uint8Array, sig: Uint8Array;
  try {
    aura = hexToBytes(claim.aura);
    sig = hexToBytes(claim.sig);
  } catch {
    return { ok: false, reason: 'bad hex' };
  }
  if (aura.length !== 32) return { ok: false, reason: 'bad aura' };
  let sigOk = false;
  try {
    sigOk = ed25519.verify(sig, claimMessage(claim.cell, claim.nonce), aura);
  } catch {
    sigOk = false;
  }
  if (!sigOk) return { ok: false, reason: 'bad signature' };
  const strength = nameStrength(claim.cell, aura, nonce);
  if (strength < MIN_NAME_BITS) return { ok: false, reason: `too weak (${strength} < ${MIN_NAME_BITS})` };
  return { ok: true, strength };
}

// ---------- enumeration helpers ----------

/** The i-th cell `extra` levels below `prefix`, in index (Z) order. */
export function cellAtIndex(prefix: Cell, extra: number, index: bigint): Cell {
  let s = index.toString(8);
  if (s.length > extra) throw new Error('index out of range');
  return prefix + s.padStart(extra, '0');
}

export function cellsBelow(extra: number): bigint {
  return 1n << BigInt(3 * extra);
}

export function elementName(e: number): string {
  return ELEMENTS[e] ?? '?';
}

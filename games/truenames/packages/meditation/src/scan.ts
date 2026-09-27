// Hot loops shared by browser workers and Node tools. No DOM, no timers.
import {
  type Cell,
  type Spirit,
  bits,
  cellDigest,
  childDigest,
  nameHashRaw,
  spiritFromDigest,
  cellsBelow,
} from '@truenames/universe';

/**
 * Scan `count` cells `extra` levels below `prefix`, starting at `start` (Z-order index).
 * Keeps a digest stack so consecutive siblings cost ~1.14 child hashes + 1 spirit hash.
 * Returns hashes spent. `onHit` is called for every spirit found.
 */
export function scanRange(
  prefix: Cell,
  extra: number,
  start: bigint,
  count: bigint,
  onHit: (s: Spirit) => void,
): number {
  if (extra <= 0) throw new Error('extra must be >= 1');
  const total = cellsBelow(extra);
  let end = start + count;
  if (end > total) end = total;
  if (start >= end) return 0;

  let hashes = 0;
  // digit stack for the current index (most significant first)
  const digits = new Array<number>(extra);
  let idx = start;
  for (let k = extra - 1; k >= 0; k--) {
    digits[k] = Number(idx & 7n);
    idx >>= 3n;
  }
  // digests[k] = digest of prefix + digits[0..k]
  const digests = new Array<bigint>(extra);
  let parent = cellDigest(prefix);
  for (let k = 0; k < extra; k++) {
    parent = childDigest(parent, digits[k]!);
    digests[k] = parent;
    hashes++;
  }
  const base = prefix;
  for (let i = start; i < end; i++) {
    const leaf = digests[extra - 1]!;
    const cell = base + digits.join('');
    const s = spiritFromDigest(cell, leaf);
    hashes++;
    if (s) {
      hashes++; // trait hash
      onHit(s);
    }
    if (i + 1n >= end) break;
    // increment digits, recompute changed suffix
    let k = extra - 1;
    while (k >= 0 && digits[k] === 7) {
      digits[k] = 0;
      k--;
    }
    if (k < 0) break;
    digits[k]!++;
    for (let j = k; j < extra; j++) {
      const p = j === 0 ? cellDigest(prefix) : digests[j - 1]!;
      digests[j] = childDigest(p, digits[j]!);
      hashes++;
    }
  }
  return hashes;
}

/**
 * Grind `count` nonces for a name. Returns the best (nonce, strength) seen,
 * only if it beats `beat`. Calls onBest on each improvement.
 */
export function grindName(
  digest: bigint,
  aura: bigint,
  startNonce: bigint,
  count: number,
  beat: number,
  onBest?: (nonce: bigint, strength: number) => void,
): { nonce: bigint; strength: number } | null {
  let best: { nonce: bigint; strength: number } | null = null;
  let n = startNonce;
  for (let i = 0; i < count; i++, n++) {
    const s = bits(nameHashRaw(digest, aura, n));
    if (s > beat) {
      beat = s;
      best = { nonce: n, strength: s };
      onBest?.(n, s);
    }
  }
  return best;
}

// JS side of the WASM Poseidon kernel. An accelerator for meditation only:
// results are cross-checked against the universe in tests, and every reported
// name is re-scored with the universe's BigInt reference before it is trusted.
import { P, C4, M4, C5, M5, TAG_NAME, bits } from '@truenames/universe';
import { KERNEL_WASM_B64, LAYOUT } from './kernel-bytes.ts';

const R = 1n << 256n;

function decodeB64(s: string): Uint8Array {
  if (typeof atob === 'function') return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  return new Uint8Array((globalThis as any).Buffer.from(s, 'base64'));
}

/** -p^{-1} mod 2^32 */
function nPrime(): bigint {
  const m = 1n << 32n;
  let inv = 1n;
  const p0 = P % m;
  for (let i = 0; i < 6; i++) inv = (inv * (2n - p0 * inv)) % m; // Newton: 2^5 -> 2^64 bits
  inv = ((inv % m) + m) % m;
  return (m - inv) % m;
}

const mod = (x: bigint) => ((x % P) + P) % P;

function modpow(b: bigint, e: bigint): bigint {
  let r = 1n;
  b = mod(b);
  while (e > 0n) {
    if (e & 1n) r = (r * b) % P;
    b = (b * b) % P;
    e >>= 1n;
  }
  return r;
}

function matmul(A: bigint[][], B: bigint[][]): bigint[][] {
  const n = A.length;
  return A.map((row) => Array.from({ length: n }, (_, j) => mod(row.reduce((acc, a, k) => acc + a * B[k]![j]!, 0n))));
}

function matinv(A: bigint[][]): bigint[][] {
  const n = A.length;
  const M = A.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1n : 0n))]);
  for (let c = 0; c < n; c++) {
    let p = c;
    while (M[p]![c] === 0n) p++;
    [M[c], M[p]] = [M[p]!, M[c]!];
    const inv = modpow(M[c]![c]!, P - 2n);
    M[c] = M[c]!.map((x) => (x * inv) % P);
    for (let r = 0; r < n; r++) {
      if (r === c || M[r]![c] === 0n) continue;
      const f = M[r]![c]!;
      M[r] = M[r]!.map((x, j) => mod(x - f * M[c]![j]!));
    }
  }
  return M.map((row) => row.slice(n));
}

/**
 * Optimized Poseidon constants (Poseidon paper, appendix B):
 * partial-round constants folded to a single scalar, and each partial mix
 * factored as M = M' * M'' with M'' sparse and M' deferred to the next round.
 * Layout: FC[8t] | A[rp] | SP[rp(2t-1)] | ML[t*t].
 */
export function optimizedConstants(Cs: readonly string[], Ms: readonly (readonly string[])[], t: number, RP: number): bigint[] {
  const c = Cs.map((x) => BigInt(x));
  const M = Ms.map((r) => r.map((x) => BigInt(x)));
  const A: bigint[] = [];
  for (let r = 4; r < 4 + RP; r++) {
    A.push(c[r * t]!);
    const hat = [0n, ...c.slice(r * t + 1, r * t + t)];
    for (let i = 0; i < t; i++) {
      const acc = M[i]!.reduce((s, m, j) => s + m * hat[j]!, 0n);
      c[(r + 1) * t + i] = mod(c[(r + 1) * t + i]! + acc);
    }
  }
  const FC = [...c.slice(0, 4 * t), ...c.slice((4 + RP) * t, (8 + RP) * t)];
  const SP: bigint[] = [];
  let cur = M;
  let Mp: bigint[][] = M;
  for (let k = 0; k < RP; k++) {
    const hatRow = cur[0]!.slice(1);
    const col = cur.slice(1).map((r) => r[0]!);
    const Ahat = cur.slice(1).map((r) => r.slice(1));
    const inv = matinv(Ahat);
    const w = inv.map((row) => mod(row.reduce((s, x, j) => s + x * col[j]!, 0n)));
    SP.push(cur[0]![0]!, ...hatRow, ...w);
    Mp = Array.from({ length: t }, (_, i) => Array.from({ length: t }, (_, j) => (i === 0 || j === 0 ? (i === j ? 1n : 0n) : Ahat[i - 1]![j - 1]!)));
    cur = matmul(M, Mp);
  }
  return [...FC, ...A, ...SP, ...Mp.flat()];
}

export interface Kernel {
  hash3(a: bigint, b: bigint, c: bigint): bigint;
  hash4(a: bigint, b: bigint, c: bigint, d: bigint): bigint;
  /** Grind nonces [start, start+count). Calls onBest for each improvement over `beat`. Returns the best, if any. */
  grind(digest: bigint, aura: bigint, start: bigint, count: number, beat: number, onBest?: (nonce: bigint, strength: number) => void): { nonce: bigint; strength: number } | null;
  /** Grind nonces [start, start+count), reporting every hash with more than floor() bits (floor is re-read after each hit). */
  grindHits(digest: bigint, aura: bigint, start: bigint, count: number, floor: () => number, onHit: (nonce: bigint, hash: bigint) => void): void;
}

let cachedModule: WebAssembly.Module | null = null;

export function kernelModule(): WebAssembly.Module {
  if (!cachedModule) cachedModule = new WebAssembly.Module(decodeB64(KERNEL_WASM_B64) as BufferSource);
  return cachedModule;
}

/** Synchronous (fine in workers and Node; the main thread should prefer workers anyway). */
export function createKernel(opts: { optimized?: boolean } = {}): Kernel {
  const inst = new WebAssembly.Instance(kernelModule(), {});
  const mem = inst.exports.memory as WebAssembly.Memory;
  const hash = inst.exports.hash as (t: number) => void;
  const grindW = inst.exports.grind as (count: number) => number;
  const dv = new DataView(mem.buffer);

  const put = (ptr: number, x: bigint) => {
    for (let i = 0; i < 8; i++) {
      dv.setUint32(ptr + 4 * i, Number(x & 0xffffffffn), true);
      x >>= 32n;
    }
  };
  const get = (ptr: number): bigint => {
    let x = 0n;
    for (let i = 7; i >= 0; i--) x = (x << 32n) | BigInt(dv.getUint32(ptr + 4 * i, true));
    return x;
  };
  const mont = (x: bigint) => (x * R) % P;

  put(LAYOUT.P, P);
  put(LAYOUT.R2, (R * R) % P);
  put(LAYOUT.ONE, 1n);
  dv.setUint32(LAYOUT.NPRIME, Number(nPrime()), true);
  C4.forEach((c, i) => put(LAYOUT.C4 + 32 * i, mont(BigInt(c))));
  M4.flat().forEach((m, i) => put(LAYOUT.M4 + 32 * i, mont(BigInt(m))));
  C5.forEach((c, i) => put(LAYOUT.C5 + 32 * i, mont(BigInt(c))));
  M5.flat().forEach((m, i) => put(LAYOUT.M5 + 32 * i, mont(BigInt(m))));
  optimizedConstants(C4, M4, 4, 56).forEach((x, i) => put(LAYOUT.OPT4 + 32 * i, mont(x)));
  optimizedConstants(C5, M5, 5, 60).forEach((x, i) => put(LAYOUT.OPT5 + 32 * i, mont(x)));
  const setOptimized = (on: boolean) => dv.setUint32(LAYOUT.NPRIME + 4, on ? 1 : 0, true);
  setOptimized(opts.optimized ?? true);

  const IN = LAYOUT.IN;
  return {
    hash3(a, b, c) {
      put(IN, a);
      put(IN + 32, b);
      put(IN + 64, c);
      hash(4);
      return get(LAYOUT.OUT);
    },
    hash4(a, b, c, d) {
      put(IN, a);
      put(IN + 32, b);
      put(IN + 64, c);
      put(IN + 96, d);
      hash(5);
      return get(LAYOUT.OUT);
    },
    grind(digest, aura, start, count, beat, onBest) {
      put(IN, TAG_NAME);
      put(IN + 32, digest);
      put(IN + 64, aura);
      put(IN + 96, start);
      let best: { nonce: bigint; strength: number } | null = null;
      let left = count;
      let base = start;
      while (left > 0) {
        put(LAYOUT.THRESH, P >> BigInt(beat + 1));
        const i = grindW(left);
        if (i < 0) break;
        const nonce = base + BigInt(i);
        const s = bits(get(LAYOUT.OUT));
        if (s > beat) {
          beat = s;
          best = { nonce, strength: s };
          onBest?.(nonce, s);
        }
        // continue after this nonce
        left -= i + 1;
        base = nonce + 1n;
        put(IN + 96, base);
      }
      return best;
    },
    grindHits(digest, aura, start, count, floor, onHit) {
      put(IN, TAG_NAME);
      put(IN + 32, digest);
      put(IN + 64, aura);
      put(IN + 96, start);
      let left = count;
      let base = start;
      while (left > 0) {
        put(LAYOUT.THRESH, P >> BigInt(floor() + 1));
        const i = grindW(left);
        if (i < 0) break;
        const nonce = base + BigInt(i);
        onHit(nonce, get(LAYOUT.OUT));
        left -= i + 1;
        base = nonce + 1n;
        put(IN + 96, base);
      }
    },
  };
}

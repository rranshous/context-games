// Generates the WASM Poseidon kernel (Montgomery arithmetic, 8x32-bit limbs) and writes it,
// base64-embedded, to packages/meditation/src/wasm/kernel-bytes.ts.
// The kernel is an accelerator only: the universe's BigInt Poseidon stays the reference,
// tests cross-check them, and every name the kernel reports is re-scored by the universe.
import { writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export const LAYOUT = {
  P: 0,
  R2: 32,
  ONE: 64,
  NPRIME: 96,
  SCRATCH: 128, // 8 slots
  STATE: 512, // 5 slots
  MIX: 704, // 5 slots
  IN: 1024, // 5 slots, canonical
  OUT: 1280,
  THRESH: 1344,
  FIXED: 1408, // 4 slots, Montgomery (grind)
  C4: 2048,
  M4: 10240,
  C5: 11264,
  M5: 22528,
  OPT4: 24576, // optimized constants for t=4
  OPT5: 40960, // optimized constants for t=5
} as const;

const L = LAYOUT;
const slot = (base: number, i: number) => base + 32 * i;

function montmul(): string {
  // CIOS Montgomery multiplication, fully unrolled. d = a*b*R^-1 mod p. Inputs < p, output < p.
  const out: string[] = [];
  out.push(`(func $mm (param $d i32) (param $a i32) (param $b i32)`);
  const locals: string[] = [];
  for (let i = 0; i < 8; i++) locals.push(`(local $a${i} i64) (local $b${i} i64) (local $n${i} i64)`);
  for (let i = 0; i < 10; i++) locals.push(`(local $t${i} i64)`);
  locals.push('(local $c i64) (local $m i64) (local $x i64) (local $np i64)');
  out.push(locals.join(' '));
  for (let i = 0; i < 8; i++) {
    out.push(`(local.set $a${i} (i64.load32_u offset=${4 * i} (local.get $a)))`);
    out.push(`(local.set $b${i} (i64.load32_u offset=${4 * i} (local.get $b)))`);
    out.push(`(local.set $n${i} (i64.load32_u offset=${L.P + 4 * i} (i32.const 0)))`);
  }
  out.push(`(local.set $np (i64.load32_u offset=${L.NPRIME} (i32.const 0)))`);
  const M32 = '(i64.const 0xffffffff)';
  for (let i = 0; i < 8; i++) {
    out.push(`(local.set $c (i64.const 0))`);
    for (let j = 0; j < 8; j++) {
      // x = t_j + a_j*b_i + c
      out.push(`(local.set $x (i64.add (i64.add (local.get $t${j}) (i64.mul (local.get $a${j}) (local.get $b${i}))) (local.get $c)))`);
      out.push(`(local.set $t${j} (i64.and (local.get $x) ${M32}))`);
      out.push(`(local.set $c (i64.shr_u (local.get $x) (i64.const 32)))`);
    }
    out.push(`(local.set $x (i64.add (local.get $t8) (local.get $c)))`);
    out.push(`(local.set $t8 (i64.and (local.get $x) ${M32}))`);
    out.push(`(local.set $t9 (i64.shr_u (local.get $x) (i64.const 32)))`);
    // m = t0 * n' mod 2^32
    out.push(`(local.set $m (i64.and (i64.mul (local.get $t0) (local.get $np)) ${M32}))`);
    out.push(`(local.set $x (i64.add (local.get $t0) (i64.mul (local.get $m) (local.get $n0))))`);
    out.push(`(local.set $c (i64.shr_u (local.get $x) (i64.const 32)))`);
    for (let j = 1; j < 8; j++) {
      out.push(`(local.set $x (i64.add (i64.add (local.get $t${j}) (i64.mul (local.get $m) (local.get $n${j}))) (local.get $c)))`);
      out.push(`(local.set $t${j - 1} (i64.and (local.get $x) ${M32}))`);
      out.push(`(local.set $c (i64.shr_u (local.get $x) (i64.const 32)))`);
    }
    out.push(`(local.set $x (i64.add (local.get $t8) (local.get $c)))`);
    out.push(`(local.set $t7 (i64.and (local.get $x) ${M32}))`);
    out.push(`(local.set $t8 (i64.add (local.get $t9) (i64.shr_u (local.get $x) (i64.const 32))))`);
  }
  // conditional subtract: if t >= p then t -= p. (t8 is 0 because p < 2^254, result < 2p < 2^256.)
  // compute u = t - p with borrow; if no final borrow, take u.
  for (let i = 0; i < 8; i++) out.push(`(local.set $a${i} (local.get $t${i}))`); // reuse a_i as u_i
  out.push(`(local.set $c (i64.const 0))`); // borrow
  for (let i = 0; i < 8; i++) {
    out.push(`(local.set $x (i64.sub (i64.sub (local.get $t${i}) (local.get $n${i})) (local.get $c)))`);
    out.push(`(local.set $a${i} (i64.and (local.get $x) ${M32}))`);
    out.push(`(local.set $c (i64.shr_u (local.get $x) (i64.const 63)))`);
  }
  // borrow set => t < p => keep t
  out.push(`(if (i64.eqz (local.get $c)) (then`);
  for (let i = 0; i < 8; i++) out.push(`(local.set $t${i} (local.get $a${i}))`);
  out.push(`))`);
  for (let i = 0; i < 8; i++) out.push(`(i64.store32 offset=${4 * i} (local.get $d) (local.get $t${i}))`);
  out.push(`)`);
  return out.join('\n');
}

function addmod(): string {
  const out: string[] = [];
  out.push(`(func $add (param $d i32) (param $a i32) (param $b i32)`);
  const ls: string[] = [];
  for (let i = 0; i < 8; i++) ls.push(`(local $s${i} i64) (local $u${i} i64)`);
  ls.push('(local $c i64) (local $x i64)');
  out.push(ls.join(' '));
  const M32 = '(i64.const 0xffffffff)';
  out.push(`(local.set $c (i64.const 0))`);
  for (let i = 0; i < 8; i++) {
    out.push(`(local.set $x (i64.add (i64.add (i64.load32_u offset=${4 * i} (local.get $a)) (i64.load32_u offset=${4 * i} (local.get $b))) (local.get $c)))`);
    out.push(`(local.set $s${i} (i64.and (local.get $x) ${M32}))`);
    out.push(`(local.set $c (i64.shr_u (local.get $x) (i64.const 32)))`);
  }
  // sum < 2p < 2^256, so c == 0 here. subtract p if sum >= p.
  out.push(`(local.set $c (i64.const 0))`);
  for (let i = 0; i < 8; i++) {
    out.push(`(local.set $x (i64.sub (i64.sub (local.get $s${i}) (i64.load32_u offset=${L.P + 4 * i} (i32.const 0))) (local.get $c)))`);
    out.push(`(local.set $u${i} (i64.and (local.get $x) ${M32}))`);
    out.push(`(local.set $c (i64.shr_u (local.get $x) (i64.const 63)))`);
  }
  out.push(`(if (i64.eqz (local.get $c)) (then`);
  for (let i = 0; i < 8; i++) out.push(`(local.set $s${i} (local.get $u${i}))`);
  out.push(`))`);
  for (let i = 0; i < 8; i++) out.push(`(i64.store32 offset=${4 * i} (local.get $d) (local.get $s${i}))`);
  out.push(`)`);
  return out.join('\n');
}

function wat(): string {
  const S0 = L.SCRATCH, S1 = slot(L.SCRATCH, 1), S2 = slot(L.SCRATCH, 2);
  return `(module
(memory (export "memory") 1)
${montmul()}
${addmod()}
(func $copy (param $d i32) (param $s i32)
  (i64.store offset=0 (local.get $d) (i64.load offset=0 (local.get $s)))
  (i64.store offset=8 (local.get $d) (i64.load offset=8 (local.get $s)))
  (i64.store offset=16 (local.get $d) (i64.load offset=16 (local.get $s)))
  (i64.store offset=24 (local.get $d) (i64.load offset=24 (local.get $s))))
(func $zero (param $d i32)
  (i64.store offset=0 (local.get $d) (i64.const 0))
  (i64.store offset=8 (local.get $d) (i64.const 0))
  (i64.store offset=16 (local.get $d) (i64.const 0))
  (i64.store offset=24 (local.get $d) (i64.const 0)))
;; STATE[0..t) <- M * STATE (M row-major t*t at $mp)
(func $mix (param $t i32) (param $mp i32)
  (local $i i32) (local $j i32) (local $row i32)
  (local.set $i (i32.const 0))
  (block $md (loop $ml
    (br_if $md (i32.ge_u (local.get $i) (local.get $t)))
    (local.set $row (i32.add (local.get $mp) (i32.shl (i32.mul (local.get $i) (local.get $t)) (i32.const 5))))
    (call $mm (i32.add (i32.const ${L.MIX}) (i32.shl (local.get $i) (i32.const 5))) (local.get $row) (i32.const ${L.STATE}))
    (local.set $j (i32.const 1))
    (block $jd (loop $jl
      (br_if $jd (i32.ge_u (local.get $j) (local.get $t)))
      (call $mm (i32.const ${S2}) (i32.add (local.get $row) (i32.shl (local.get $j) (i32.const 5))) (i32.add (i32.const ${L.STATE}) (i32.shl (local.get $j) (i32.const 5))))
      (call $add (i32.add (i32.const ${L.MIX}) (i32.shl (local.get $i) (i32.const 5))) (i32.add (i32.const ${L.MIX}) (i32.shl (local.get $i) (i32.const 5))) (i32.const ${S2}))
      (local.set $j (i32.add (local.get $j) (i32.const 1)))
      (br $jl)))
    (local.set $i (i32.add (local.get $i) (i32.const 1)))
    (br $ml)))
  (memory.copy (i32.const ${L.STATE}) (i32.const ${L.MIX}) (i32.shl (local.get $t) (i32.const 5))))
;; full round: add constants (t at $cp), s-box all, mix
(func $fullRound (param $t i32) (param $cp i32) (param $mp i32)
  (local $i i32)
  (local.set $i (i32.const 0))
  (block $d (loop $l
    (br_if $d (i32.ge_u (local.get $i) (local.get $t)))
    (call $add (i32.add (i32.const ${L.STATE}) (i32.shl (local.get $i) (i32.const 5))) (i32.add (i32.const ${L.STATE}) (i32.shl (local.get $i) (i32.const 5))) (i32.add (local.get $cp) (i32.shl (local.get $i) (i32.const 5))))
    (call $pow5 (i32.add (i32.const ${L.STATE}) (i32.shl (local.get $i) (i32.const 5))))
    (local.set $i (i32.add (local.get $i) (i32.const 1)))
    (br $l)))
  (call $mix (local.get $t) (local.get $mp)))
;; Optimized permutation. Layout at $op: FC[8*t] | A[rp] | SP[rp*(2t-1)] | ML[t*t]
(func $permOpt (param $t i32) (param $rp i32) (param $op i32) (param $mp i32)
  (local $r i32) (local $a i32) (local $sp i32) (local $ml i32) (local $j i32) (local $w i32)
  (local.set $a (i32.add (local.get $op) (i32.shl (i32.mul (i32.const 8) (local.get $t)) (i32.const 5))))
  (local.set $sp (i32.add (local.get $a) (i32.shl (local.get $rp) (i32.const 5))))
  (local.set $ml (i32.add (local.get $sp) (i32.shl (i32.mul (local.get $rp) (i32.sub (i32.shl (local.get $t) (i32.const 1)) (i32.const 1))) (i32.const 5))))
  (local.set $r (i32.const 0))
  (block $d1 (loop $l1
    (br_if $d1 (i32.ge_u (local.get $r) (i32.const 4)))
    (call $fullRound (local.get $t) (i32.add (local.get $op) (i32.shl (i32.mul (local.get $r) (local.get $t)) (i32.const 5))) (local.get $mp))
    (local.set $r (i32.add (local.get $r) (i32.const 1)))
    (br $l1)))
  ;; partial rounds with scalar constants and sparse mixes
  (local.set $r (i32.const 0))
  (block $d2 (loop $l2
    (br_if $d2 (i32.ge_u (local.get $r) (local.get $rp)))
    (call $add (i32.const ${L.STATE}) (i32.const ${L.STATE}) (i32.add (local.get $a) (i32.shl (local.get $r) (i32.const 5))))
    (call $pow5 (i32.const ${L.STATE}))
    ;; new s0 (into MIX[0]) = sp[0]*s0 + sum_j sp[j]*s_j
    (call $mm (i32.const ${L.MIX}) (local.get $sp) (i32.const ${L.STATE}))
    (local.set $j (i32.const 1))
    (block $jd (loop $jl
      (br_if $jd (i32.ge_u (local.get $j) (local.get $t)))
      (call $mm (i32.const ${S2}) (i32.add (local.get $sp) (i32.shl (local.get $j) (i32.const 5))) (i32.add (i32.const ${L.STATE}) (i32.shl (local.get $j) (i32.const 5))))
      (call $add (i32.const ${L.MIX}) (i32.const ${L.MIX}) (i32.const ${S2}))
      (local.set $j (i32.add (local.get $j) (i32.const 1)))
      (br $jl)))
    ;; s_j += w_j * s0 (old s0)
    (local.set $w (i32.add (local.get $sp) (i32.shl (i32.sub (local.get $t) (i32.const 1)) (i32.const 5))))
    (local.set $j (i32.const 1))
    (block $kd (loop $kl
      (br_if $kd (i32.ge_u (local.get $j) (local.get $t)))
      (call $mm (i32.const ${S2}) (i32.add (local.get $w) (i32.shl (local.get $j) (i32.const 5))) (i32.const ${L.STATE}))
      (call $add (i32.add (i32.const ${L.STATE}) (i32.shl (local.get $j) (i32.const 5))) (i32.add (i32.const ${L.STATE}) (i32.shl (local.get $j) (i32.const 5))) (i32.const ${S2}))
      (local.set $j (i32.add (local.get $j) (i32.const 1)))
      (br $kl)))
    (call $copy (i32.const ${L.STATE}) (i32.const ${L.MIX}))
    (local.set $sp (i32.add (local.get $sp) (i32.shl (i32.sub (i32.shl (local.get $t) (i32.const 1)) (i32.const 1)) (i32.const 5))))
    (local.set $r (i32.add (local.get $r) (i32.const 1)))
    (br $l2)))
  ;; deferred dense block
  (call $mix (local.get $t) (local.get $ml))
  (local.set $r (i32.const 4))
  (block $d3 (loop $l3
    (br_if $d3 (i32.ge_u (local.get $r) (i32.const 8)))
    (call $fullRound (local.get $t) (i32.add (local.get $op) (i32.shl (i32.mul (local.get $r) (local.get $t)) (i32.const 5))) (local.get $mp))
    (local.set $r (i32.add (local.get $r) (i32.const 1)))
    (br $l3))))
;; x <- x^5 (Montgomery)
(func $pow5 (param $x i32)
  (call $mm (i32.const ${S0}) (local.get $x) (local.get $x))
  (call $mm (i32.const ${S1}) (i32.const ${S0}) (i32.const ${S0}))
  (call $mm (local.get $x) (i32.const ${S1}) (local.get $x)))
;; Poseidon permutation on STATE[0..t)
(func $perm (param $t i32) (param $rp i32) (param $cp i32) (param $mp i32)
  (local $r i32) (local $i i32) (local $j i32) (local $total i32) (local $full i32) (local $row i32)
  (local.set $total (i32.add (local.get $rp) (i32.const 8)))
  (local.set $r (i32.const 0))
  (block $done (loop $round
    (br_if $done (i32.ge_u (local.get $r) (local.get $total)))
    ;; add round constants
    (local.set $i (i32.const 0))
    (block $ad (loop $al
      (br_if $ad (i32.ge_u (local.get $i) (local.get $t)))
      (call $add
        (i32.add (i32.const ${L.STATE}) (i32.shl (local.get $i) (i32.const 5)))
        (i32.add (i32.const ${L.STATE}) (i32.shl (local.get $i) (i32.const 5)))
        (i32.add (local.get $cp) (i32.shl (i32.add (i32.mul (local.get $r) (local.get $t)) (local.get $i)) (i32.const 5))))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $al)))
    ;; s-box: full rounds on all, partial on state[0]
    (local.set $full (i32.or (i32.lt_u (local.get $r) (i32.const 4)) (i32.ge_u (local.get $r) (i32.add (local.get $rp) (i32.const 4)))))
    (if (local.get $full)
      (then
        (local.set $i (i32.const 0))
        (block $sd (loop $sl
          (br_if $sd (i32.ge_u (local.get $i) (local.get $t)))
          (call $pow5 (i32.add (i32.const ${L.STATE}) (i32.shl (local.get $i) (i32.const 5))))
          (local.set $i (i32.add (local.get $i) (i32.const 1)))
          (br $sl))))
      (else (call $pow5 (i32.const ${L.STATE}))))
    ;; mix: MIX[i] = sum_j M[i][j] * STATE[j]
    (local.set $i (i32.const 0))
    (block $md (loop $ml
      (br_if $md (i32.ge_u (local.get $i) (local.get $t)))
      (local.set $row (i32.add (local.get $mp) (i32.shl (i32.mul (local.get $i) (local.get $t)) (i32.const 5))))
      (call $mm (i32.add (i32.const ${L.MIX}) (i32.shl (local.get $i) (i32.const 5))) (local.get $row) (i32.const ${L.STATE}))
      (local.set $j (i32.const 1))
      (block $jd (loop $jl
        (br_if $jd (i32.ge_u (local.get $j) (local.get $t)))
        (call $mm (i32.const ${S2}) (i32.add (local.get $row) (i32.shl (local.get $j) (i32.const 5))) (i32.add (i32.const ${L.STATE}) (i32.shl (local.get $j) (i32.const 5))))
        (call $add (i32.add (i32.const ${L.MIX}) (i32.shl (local.get $i) (i32.const 5))) (i32.add (i32.const ${L.MIX}) (i32.shl (local.get $i) (i32.const 5))) (i32.const ${S2}))
        (local.set $j (i32.add (local.get $j) (i32.const 1)))
        (br $jl)))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $ml)))
    (memory.copy (i32.const ${L.STATE}) (i32.const ${L.MIX}) (i32.shl (local.get $t) (i32.const 5)))
    (local.set $r (i32.add (local.get $r) (i32.const 1)))
    (br $round)))
)
(func $toMont (param $d i32) (param $s i32) (call $mm (local.get $d) (local.get $s) (i32.const ${L.R2})))
(func $fromMont (param $d i32) (param $s i32) (call $mm (local.get $d) (local.get $s) (i32.const ${L.ONE})))
(func $permT (param $t i32)
  (if (i32.load (i32.const ${L.NPRIME + 4}))
    (then
      (if (i32.eq (local.get $t) (i32.const 4))
        (then (call $permOpt (i32.const 4) (i32.const 56) (i32.const ${L.OPT4}) (i32.const ${L.M4})))
        (else (call $permOpt (i32.const 5) (i32.const 60) (i32.const ${L.OPT5}) (i32.const ${L.M5})))))
    (else
      (if (i32.eq (local.get $t) (i32.const 4))
        (then (call $perm (i32.const 4) (i32.const 56) (i32.const ${L.C4}) (i32.const ${L.M4})))
        (else (call $perm (i32.const 5) (i32.const 60) (i32.const ${L.C5}) (i32.const ${L.M5})))))))
;; hash(t): IN[0..t-1) canonical -> OUT canonical. t = inputs + 1 (4 or 5).
(func (export "hash") (param $t i32)
  (local $i i32)
  (call $zero (i32.const ${L.STATE}))
  (local.set $i (i32.const 1))
  (block $d (loop $l
    (br_if $d (i32.ge_u (local.get $i) (local.get $t)))
    (call $toMont (i32.add (i32.const ${L.STATE}) (i32.shl (local.get $i) (i32.const 5))) (i32.add (i32.const ${L.IN - 32}) (i32.shl (local.get $i) (i32.const 5))))
    (local.set $i (i32.add (local.get $i) (i32.const 1)))
    (br $l)))
  (call $permT (local.get $t))
  (call $fromMont (i32.const ${L.OUT}) (i32.const ${L.STATE})))
;; grind(count): IN = [TAG, digest, aura, nonce] canonical; THRESH canonical.
;; Returns the first i < count whose name hash h satisfies h < THRESH, with IN[3] left at that nonce; else -1 (IN[3] advanced by count).
(func (export "grind") (param $count i32) (result i32)
  (local $i i32) (local $k i32) (local $x i64) (local $c i64) (local $lt i32) (local $eq i32) (local $a i64) (local $b i64)
  (call $toMont (i32.const ${slot(L.FIXED, 0)}) (i32.const ${slot(L.IN, 0)}))
  (call $toMont (i32.const ${slot(L.FIXED, 1)}) (i32.const ${slot(L.IN, 1)}))
  (call $toMont (i32.const ${slot(L.FIXED, 2)}) (i32.const ${slot(L.IN, 2)}))
  (local.set $i (i32.const 0))
  (block $done (loop $l
    (br_if $done (i32.ge_u (local.get $i) (local.get $count)))
    (call $zero (i32.const ${L.STATE}))
    (memory.copy (i32.const ${slot(L.STATE, 1)}) (i32.const ${L.FIXED}) (i32.const 96))
    (call $toMont (i32.const ${slot(L.STATE, 4)}) (i32.const ${slot(L.IN, 3)}))
    (call $permT (i32.const 5))
    (call $fromMont (i32.const ${L.OUT}) (i32.const ${L.STATE}))
    ;; OUT < THRESH ? compare from the top limb down
    (local.set $lt (i32.const 0))
    (local.set $k (i32.const 7))
    (block $cd (loop $cl
      (local.set $a (i64.load32_u (i32.add (i32.const ${L.OUT}) (i32.shl (local.get $k) (i32.const 2)))))
      (local.set $b (i64.load32_u (i32.add (i32.const ${L.THRESH}) (i32.shl (local.get $k) (i32.const 2)))))
      (if (i64.lt_u (local.get $a) (local.get $b)) (then (local.set $lt (i32.const 1)) (br $cd)))
      (br_if $cd (i64.gt_u (local.get $a) (local.get $b)))
      (br_if $cd (i32.eqz (local.get $k)))
      (local.set $k (i32.sub (local.get $k) (i32.const 1)))
      (br $cl)))
    (if (local.get $lt) (then (return (local.get $i))))
    ;; nonce += 1 (carry through all limbs)
    (local.set $c (i64.const 1))
    (local.set $k (i32.const 0))
    (block $id (loop $il
      (br_if $id (i64.eqz (local.get $c)))
      (br_if $id (i32.ge_u (local.get $k) (i32.const 8)))
      (local.set $x (i64.add (i64.load32_u (i32.add (i32.const ${slot(L.IN, 3)}) (i32.shl (local.get $k) (i32.const 2)))) (local.get $c)))
      (i64.store32 (i32.add (i32.const ${slot(L.IN, 3)}) (i32.shl (local.get $k) (i32.const 2))) (local.get $x))
      (local.set $c (i64.shr_u (local.get $x) (i64.const 32)))
      (local.set $k (i32.add (local.get $k) (i32.const 1)))
      (br $il)))
    (local.set $i (i32.add (local.get $i) (i32.const 1)))
    (br $l)))
  (i32.const -1))
)`;
}

export async function genWasm() {
  const wabt = await require('wabt')();
  const text = wat();
  const mod = wabt.parseWat('kernel.wat', text, { bulk_memory: true });
  mod.validate();
  const { buffer } = mod.toBinary({});
  const b64 = Buffer.from(buffer).toString('base64');
  const dir = new URL('../../../packages/meditation/src/wasm/', import.meta.url);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    new URL('kernel-bytes.ts', dir),
    `// Generated by apps/tools/src/gen-wasm.ts. Do not edit.\n// Poseidon (BN254, circomlib params) in Montgomery form, 8x32-bit limbs. ${buffer.length} bytes.\nexport const KERNEL_WASM_B64 = '${b64}';\nexport const LAYOUT = ${JSON.stringify(LAYOUT)} as const;\n`,
  );
  writeFileSync(new URL('kernel.wat', dir), text);
  console.log(`wrote kernel: ${buffer.length} bytes`);
}

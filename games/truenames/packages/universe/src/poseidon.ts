// Poseidon (circomlib parameters, BN254), bit-identical to poseidon-lite@0.3.0.
// A faster straight-line implementation: reduced S-box, scalar state, no
// per-round allocation. Cross-checked against poseidon-lite in tests.
import { C4, M4, C5, M5 } from './poseidon-constants.ts';

const F = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const RF = 8;

const big = (a: string[]) => a.map((x) => BigInt(x));

function prep(C: string[], M: string[][]) {
  return { C: big(C), M: M.map(big) };
}

const P4 = prep(C4, M4); // 3 inputs, t = 4, 56 partial rounds
const P5 = prep(C5, M5); // 4 inputs, t = 5, 60 partial rounds

function pow5(v: bigint): bigint {
  const v2 = (v * v) % F;
  return (((v2 * v2) % F) * v) % F;
}

export function poseidon3(inputs: readonly bigint[]): bigint {
  const { C, M } = P4;
  const [m0, m1, m2, m3] = M as [bigint[], bigint[], bigint[], bigint[]];
  const m00 = m0[0]!, m01 = m0[1]!, m02 = m0[2]!, m03 = m0[3]!;
  const m10 = m1[0]!, m11 = m1[1]!, m12 = m1[2]!, m13 = m1[3]!;
  const m20 = m2[0]!, m21 = m2[1]!, m22 = m2[2]!, m23 = m2[3]!;
  const m30 = m3[0]!, m31 = m3[1]!, m32 = m3[2]!, m33 = m3[3]!;
  let s0 = 0n, s1 = inputs[0]!, s2 = inputs[1]!, s3 = inputs[2]!;
  const RP = 56;
  const half = RF / 2;
  const total = RF + RP;
  let ci = 0;
  for (let r = 0; r < total; r++) {
    s0 += C[ci++]!; s1 += C[ci++]!; s2 += C[ci++]!; s3 += C[ci++]!;
    if (r < half || r >= half + RP) {
      s0 = pow5(s0 % F); s1 = pow5(s1 % F); s2 = pow5(s2 % F); s3 = pow5(s3 % F);
    } else {
      s0 = pow5(s0 % F);
    }
    const n0 = (m00 * s0 + m01 * s1 + m02 * s2 + m03 * s3) % F;
    const n1 = (m10 * s0 + m11 * s1 + m12 * s2 + m13 * s3) % F;
    const n2 = (m20 * s0 + m21 * s1 + m22 * s2 + m23 * s3) % F;
    const n3 = (m30 * s0 + m31 * s1 + m32 * s2 + m33 * s3) % F;
    s0 = n0; s1 = n1; s2 = n2; s3 = n3;
  }
  return s0;
}

export function poseidon4(inputs: readonly bigint[]): bigint {
  const { C, M } = P5;
  const [m0, m1, m2, m3, m4] = M as [bigint[], bigint[], bigint[], bigint[], bigint[]];
  const m00 = m0[0]!, m01 = m0[1]!, m02 = m0[2]!, m03 = m0[3]!, m04 = m0[4]!;
  const m10 = m1[0]!, m11 = m1[1]!, m12 = m1[2]!, m13 = m1[3]!, m14 = m1[4]!;
  const m20 = m2[0]!, m21 = m2[1]!, m22 = m2[2]!, m23 = m2[3]!, m24 = m2[4]!;
  const m30 = m3[0]!, m31 = m3[1]!, m32 = m3[2]!, m33 = m3[3]!, m34 = m3[4]!;
  const m40 = m4[0]!, m41 = m4[1]!, m42 = m4[2]!, m43 = m4[3]!, m44 = m4[4]!;
  let s0 = 0n, s1 = inputs[0]!, s2 = inputs[1]!, s3 = inputs[2]!, s4 = inputs[3]!;
  const RP = 60;
  const half = RF / 2;
  const total = RF + RP;
  let ci = 0;
  for (let r = 0; r < total; r++) {
    s0 += C[ci++]!; s1 += C[ci++]!; s2 += C[ci++]!; s3 += C[ci++]!; s4 += C[ci++]!;
    if (r < half || r >= half + RP) {
      s0 = pow5(s0 % F); s1 = pow5(s1 % F); s2 = pow5(s2 % F); s3 = pow5(s3 % F); s4 = pow5(s4 % F);
    } else {
      s0 = pow5(s0 % F);
    }
    const n0 = (m00 * s0 + m01 * s1 + m02 * s2 + m03 * s3 + m04 * s4) % F;
    const n1 = (m10 * s0 + m11 * s1 + m12 * s2 + m13 * s3 + m14 * s4) % F;
    const n2 = (m20 * s0 + m21 * s1 + m22 * s2 + m23 * s3 + m24 * s4) % F;
    const n3 = (m30 * s0 + m31 * s1 + m32 * s2 + m33 * s3 + m34 * s4) % F;
    const n4 = (m40 * s0 + m41 * s1 + m42 * s2 + m43 * s3 + m44 * s4) % F;
    s0 = n0; s1 = n1; s2 = n2; s3 = n3; s4 = n4;
  }
  return s0;
}

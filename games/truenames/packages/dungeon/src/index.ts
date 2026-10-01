export * from './sim.ts';
export * from './bastion.ts';
export * from './council.ts';
export * from './racer.ts';
export * from './racing.ts';
export * from './admission.ts';
export * from './protocol.ts';
export * from './balance.ts';
export * from './world.ts';
export * from './movement.ts';
import type { ProofVerifier } from '@truenames/authority';
import { verifyZkName, type ZkNameClaim } from '@truenames/proofs';

/**
 * Verification runs single-threaded. ffjavascript's worker threads re-launch "the current script", which inside a
 * bundle (the desktop app) is the whole app. Verifying takes milliseconds anyway. snarkjs builds its curve through
 * ffjavascript's buildBn128, which returns this cached curve when one exists.
 */
let curveReady: Promise<unknown> | null = null;
function singleThreadedCurve() {
  const g = globalThis as { curve_bn128?: unknown };
  curveReady ??= g.curve_bn128 ? Promise.resolve() : import('ffjavascript').then(async (ff) => { g.curve_bn128 ??= await ff.buildBn128(true); });
  return curveReady;
}

/** A ProofVerifier over the name circuit's verification key. */
export function zkVerifier(vkey: object): ProofVerifier {
  return {
    async verify(claim, context) {
      await singleThreadedCurve();
      const r = await verifyZkName(claim as ZkNameClaim, vkey, context);
      return r.ok ? { ok: true, name: r.name } : r;
    },
  };
}

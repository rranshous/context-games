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

/** A ProofVerifier over the name circuit's verification key. */
export function zkVerifier(vkey: object): ProofVerifier {
  return {
    async verify(claim, context) {
      const r = await verifyZkName(claim as ZkNameClaim, vkey, context);
      return r.ok ? { ok: true, name: r.name } : r;
    },
  };
}

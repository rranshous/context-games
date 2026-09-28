// Proves names in zero knowledge off the main thread. Sanctum side: it sees secrets.
import { proveName } from '@truenames/proofs';
import { hexToBytes } from '@truenames/universe';
import wasmUrl from '@truenames/proofs/artifacts/name.wasm?url';
import zkeyUrl from '@truenames/proofs/artifacts/name.zkey?url';
import type { ProveJob, ProveReply } from './threshold.ts';

self.onmessage = async (e: MessageEvent<ProveJob>) => {
  const j = e.data;
  const t0 = performance.now();
  let reply: ProveReply;
  try {
    const claim = await proveName(
      { cell: j.cell, nonce: BigInt(j.nonce), secretKey: hexToBytes(j.secret), magnitude: j.magnitude, strength: j.strength, context: BigInt(j.context) },
      { wasm: wasmUrl, zkey: zkeyUrl },
    );
    reply = { id: j.id, ok: true, claim, ms: performance.now() - t0 };
  } catch (err) {
    reply = { id: j.id, ok: false, error: String(err) };
  }
  (self as unknown as Worker).postMessage(reply);
};

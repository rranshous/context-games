// The body of a meditation worker. The host app creates the actual Worker file
// and calls installWorker(self). Kept here so Node and browser share it.
import { cellDigest, type Spirit } from '@truenames/universe';
import { scanRange, grindName } from './scan.ts';
import type { WorkChunk, WorkerReply, WireSpirit } from './protocol.ts';

export function toWire(s: Spirit): WireSpirit {
  return { ...s, traits: { ...s.traits, flavor: s.traits.flavor.toString() } };
}

export function fromWire(s: WireSpirit): Spirit {
  return { ...s, traits: { ...s.traits, flavor: BigInt(s.traits.flavor) } };
}

export function runChunk(job: WorkChunk): WorkerReply {
  const t0 = performance.now();
  if (job.kind === 'scry') {
    const hits: WireSpirit[] = [];
    const hashes = scanRange(job.prefix, job.extra, BigInt(job.start), BigInt(job.count), (s) => hits.push(toWire(s)));
    return { kind: 'scried', taskId: job.taskId, start: job.start, count: job.count, hits, hashes, ms: performance.now() - t0 };
  }
  const best = grindName(cellDigest(job.cell), BigInt(job.aura), BigInt(job.startNonce), job.count, job.beat);
  return {
    kind: 'named',
    taskId: job.taskId,
    best: best && { nonce: best.nonce.toString(), strength: best.strength },
    count: job.count,
    hashes: job.count,
    ms: performance.now() - t0,
  };
}

interface WorkerScope {
  onmessage: ((e: MessageEvent<WorkChunk>) => void) | null;
  postMessage(m: WorkerReply): void;
}

export function installWorker(scope: WorkerScope) {
  scope.onmessage = (e) => {
    try {
      scope.postMessage(runChunk(e.data));
    } catch (err) {
      scope.postMessage({ kind: 'error', message: String(err) });
    }
  };
  scope.postMessage({ kind: 'ready' });
}

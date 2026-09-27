// The body of a meditation worker. The host app creates the actual Worker file
// and calls installWorker(self). Kept here so Node and browser share it.
import { cellDigest, type Spirit } from '@truenames/universe';
import { scanRange, grindName } from './scan.ts';
import type { WorkChunk, WorkerReply, WireSpirit } from './protocol.ts';
import { createKernel, type Kernel } from './wasm/kernel.ts';
import { TAG_CELL, poseidon3 } from '@truenames/universe';

/** The WASM kernel if it loads and passes a self-test against the BigInt reference; else null. */
function loadKernel(): Kernel | null {
  try {
    const k = createKernel();
    for (const [a, b, c] of [[TAG_CELL, 0n, 3n], [7n, 123456789n, 2n ** 250n]] as const) {
      if (k.hash3(a, b, c) !== poseidon3([a, b, c])) throw new Error('self-test mismatch');
    }
    return k;
  } catch (e) {
    console.warn('[meditation] WASM kernel unavailable, using BigInt', e);
    return null;
  }
}

let kernel: Kernel | null | undefined;
export function setKernelEnabled(on: boolean) {
  kernel = on ? loadKernel() : null;
}
function getKernel() {
  if (kernel === undefined) kernel = loadKernel();
  return kernel;
}
export function engineName() {
  return getKernel() ? 'wasm' : 'bigint';
}

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
    const hashes = scanRange(job.prefix, job.extra, BigInt(job.start), BigInt(job.count), (s) => hits.push(toWire(s)), getKernel());
    return { kind: 'scried', taskId: job.taskId, start: job.start, count: job.count, hits, hashes, ms: performance.now() - t0 };
  }
  const best = grindName(cellDigest(job.cell), BigInt(job.aura), BigInt(job.startNonce), job.count, job.beat, undefined, getKernel());
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
  scope.postMessage({ kind: 'ready', engine: engineName() });
}

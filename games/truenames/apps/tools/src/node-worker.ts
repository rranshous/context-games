// worker_threads entry: scans (prefix, extra, start, count) jobs and posts beings, or grinds word nonces.
import { parentPort, workerData } from 'node:worker_threads';
import { scanRange, createKernel } from '@truenames/meditation';
import { bits, nameHashRaw, type Spirit } from '@truenames/universe';

const kernel = createKernel(); // the WASM Poseidon kernel (results are re-verified with BigInt)

if (workerData.grind) {
  // grind: the first nonce in [start, start+count) whose word reaches `target` truths
  const g = workerData.grind as { digest: string; aura: string; start: string; count: number; target: number };
  const digest = BigInt(g.digest), aura = BigInt(g.aura);
  const best = kernel.grind(digest, aura, BigInt(g.start), g.count, g.target - 1);
  const ok = best && bits(nameHashRaw(digest, aura, best.nonce)) === best.strength;
  parentPort!.postMessage({ kind: 'done', found: ok ? { nonce: best!.nonce.toString(), strength: best!.strength } : null });
} else {
  const jobs = workerData.jobs as { prefix: string; extra: number; start: string; count: string }[];
  const hits: Spirit[] = [];
  let hashes = 0;
  for (const j of jobs) {
    hashes += scanRange(j.prefix, j.extra, BigInt(j.start), BigInt(j.count), (s) => hits.push(s), kernel);
    parentPort!.postMessage({ kind: 'progress', hashes });
  }
  parentPort!.postMessage({ kind: 'done', hits: hits.map((s) => ({ ...s, traits: { ...s.traits, flavor: s.traits.flavor.toString() } })), hashes });
}

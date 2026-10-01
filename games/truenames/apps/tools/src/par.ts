import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import type { Spirit } from '@truenames/universe';
import { cellsBelow } from '@truenames/universe';

/** Scan every cell `extra` levels below `prefix` using all cores. */
export async function parallelScan(prefix: string, extra: number, threads = availableParallelism()): Promise<{ hits: Spirit[]; hashes: number; secs: number }> {
  const total = cellsBelow(extra);
  const chunk = total / BigInt(threads * 8) || 1n;
  const jobs: { prefix: string; extra: number; start: string; count: string }[][] = Array.from({ length: threads }, () => []);
  let w = 0;
  for (let s = 0n; s < total; s += chunk) jobs[w++ % threads]!.push({ prefix, extra, start: s.toString(), count: chunk.toString() });
  const t0 = performance.now();
  const results = await Promise.all(jobs.map((j) => new Promise<{ hits: any[]; hashes: number }>((res, rej) => {
    const wk = new Worker(new URL('./node-worker.mjs', import.meta.url), { workerData: { jobs: j } });
    wk.on('message', (m) => { if (m.kind === 'done') { res(m); wk.terminate(); } });
    wk.on('error', rej);
  })));
  const hits: Spirit[] = results.flatMap((r) => r.hits).map((s) => ({ ...s, traits: { ...s.traits, flavor: BigInt(s.traits.flavor) } }));
  hits.sort((a, b) => (a.cell < b.cell ? -1 : 1));
  return { hits, hashes: results.reduce((a, r) => a + r.hashes, 0), secs: (performance.now() - t0) / 1000 };
}

/** Grind a word on all cores: the first nonce found (in any thread's range) that reaches `target` truths. */
export async function parallelGrind(cell: string, pubkey: Uint8Array, target: number, threads = availableParallelism()): Promise<{ nonce: bigint; strength: number }> {
  const { cellDigest, auraField } = await import('@truenames/universe');
  const digest = cellDigest(cell).toString(), aura = auraField(pubkey).toString();
  const span = 2 ** 19; // ~90 s per round per thread; a 22-truth word expects ~4M tries (one round on 8 threads)
  for (let round = 0n; ; round++) {
    const found = await Promise.all(Array.from({ length: threads }, (_, t) => new Promise<{ nonce: string; strength: number } | null>((res, rej) => {
      const start = ((round * BigInt(threads) + BigInt(t)) * BigInt(span)).toString();
      const wk = new Worker(new URL('./node-worker.mjs', import.meta.url), { workerData: { grind: { digest, aura, start, count: span, target } } });
      wk.on('message', (m) => { if (m.kind === 'done') { res(m.found); wk.terminate(); } });
      wk.on('error', rej);
    })));
    const hit = found.find(Boolean);
    if (hit) return { nonce: BigInt(hit.nonce), strength: hit.strength };
  }
}

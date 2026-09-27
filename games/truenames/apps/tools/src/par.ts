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
    const wk = new Worker(new URL('./node-worker.ts', import.meta.url), { workerData: { jobs: j }, execArgv: ['--import', 'tsx'] });
    wk.on('message', (m) => { if (m.kind === 'done') { res(m); wk.terminate(); } });
    wk.on('error', rej);
  })));
  const hits: Spirit[] = results.flatMap((r) => r.hits).map((s) => ({ ...s, traits: { ...s.traits, flavor: BigInt(s.traits.flavor) } }));
  hits.sort((a, b) => (a.cell < b.cell ? -1 : 1));
  return { hits, hashes: results.reduce((a, r) => a + r.hashes, 0), secs: (performance.now() - t0) / 1000 };
}

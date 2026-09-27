// worker_threads entry: scans a list of (prefix, extra, start, count) jobs, posts spirits.
import { parentPort, workerData } from 'node:worker_threads';
import { scanRange } from '@truenames/meditation';
import type { Spirit } from '@truenames/universe';

const jobs = workerData.jobs as { prefix: string; extra: number; start: string; count: string }[];
const hits: Spirit[] = [];
let hashes = 0;
for (const j of jobs) {
  hashes += scanRange(j.prefix, j.extra, BigInt(j.start), BigInt(j.count), (s) => hits.push(s));
  parentPort!.postMessage({ kind: 'progress', hashes });
}
parentPort!.postMessage({ kind: 'done', hits: hits.map((s) => ({ ...s, traits: { ...s.traits, flavor: s.traits.flavor.toString() } })), hashes });

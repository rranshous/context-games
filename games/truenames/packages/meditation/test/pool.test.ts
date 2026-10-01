import { describe, it, expect } from 'vitest';
import { MeditationPool } from '../src/pool.ts';
import { runChunk } from '../src/worker-body.ts';
import { hexToBytes, wordOf } from '@truenames/universe';

/** A spirit-class being in the depth-12 layer (two facets). */
const KNOWN = '012341174703';

// A fake Worker that answers asynchronously, with jitter so replies arrive out of order.
class FakeWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  constructor(private delay: () => number) { setTimeout(() => this.onmessage?.({ data: { kind: 'ready' } } as MessageEvent), 0); }
  postMessage(job: any) { const r = runChunk(job); setTimeout(() => this.onmessage?.({ data: r } as MessageEvent), this.delay()); }
  terminate() {}
}

describe('MeditationPool', () => {
  it('scans a layer completely with an in-order frontier, finds a known being', async () => {
    let j = 0;
    const found: string[] = [];
    const done = new Promise<bigint>((res) => {
      const pool = new MeditationPool(() => new FakeWorker(() => (j++ * 7) % 5) as unknown as Worker, 3, {
        onSpirit: (s) => found.push(s.cell),
        onScryDone: (t) => res(t.doneUpTo),
      });
      pool.addScry({ id: 's', prefix: '012341174', depth: 12 });
    });
    expect(await done).toBe(512n);
    expect(found).toContain(KNOWN);
  });

  it('grinds a name and reports verifiable improvements', async () => {
    const aura = '11'.repeat(32);
    const got: { nonce: bigint; strength: number; facet: number }[] = [];
    await new Promise<void>((res) => {
      const pool = new MeditationPool(() => new FakeWorker(() => 0) as unknown as Worker, 2, {
        onName: (t, nonce, strength, facet) => { got.push({ nonce, strength, facet }); if (strength >= 9) { pool.remove(t.id); res(); } },
      });
      pool.addName({ id: 'n', cell: KNOWN, aura, facets: 2, bests: [0, 0] });
    });
    for (const g of got) expect(wordOf(KNOWN, hexToBytes(aura), g.nonce)).toEqual({ strength: g.strength, facet: g.facet });
    for (const f of [0, 1]) { const s = got.filter((g) => g.facet === f).map((g) => g.strength); expect(s).toEqual([...s].sort((a, b) => a - b)); }
  });

  it('extending a scry task mid-flight never stalls the frontier', async () => {
    let j = 0;
    const done = new Promise<bigint>((res) => {
      let extended = false;
      const pool = new MeditationPool(() => new FakeWorker(() => (j++ * 5) % 7) as unknown as Worker, 3, {
        onScryProgress: (t) => {
          if (!extended && t.doneUpTo > 0n) { extended = true; pool.extendScry('s', 512n); }
        },
        onScryDone: (t) => res(t.doneUpTo),
      });
      pool.addScry({ id: 's', prefix: '011', depth: 6, stopAt: 100n });
      pool.addScry({ id: 's', prefix: '011', depth: 6, stopAt: 50n }); // duplicate add keeps the running task
    });
    expect(await done).toBe(512n);
  });

  it('a failed chunk is retried, so the scan still completes', async () => {
    let failed = 0;
    class FlakyWorker extends FakeWorker {
      postMessage(job: any) {
        if (job.kind === 'scry' && failed < 2) {
          failed++;
          setTimeout(() => (this as any).onmessage?.({ data: { kind: 'error', message: 'boom', chunk: job } } as MessageEvent), 0);
          return;
        }
        super.postMessage(job);
      }
    }
    const found: string[] = [];
    const done = new Promise<bigint>((res) => {
      const pool = new MeditationPool(() => new FlakyWorker(() => 1) as unknown as Worker, 2, {
        onSpirit: (s) => found.push(s.cell),
        onScryDone: (t) => res(t.doneUpTo),
      });
      pool.addScry({ id: 's', prefix: '012341174', depth: 12 });
    });
    expect(await done).toBe(512n);
    expect(failed).toBe(2);
    expect(found).toContain(KNOWN);
  });
});

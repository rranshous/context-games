import { describe, it, expect } from 'vitest';
import { MeditationPool } from '../src/pool.ts';
import { runChunk } from '../src/worker-body.ts';
import { nameStrength, hexToBytes } from '@truenames/universe';

// A fake Worker that answers asynchronously, with jitter so replies arrive out of order.
class FakeWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  constructor(private delay: () => number) { setTimeout(() => this.onmessage?.({ data: { kind: 'ready' } } as MessageEvent), 0); }
  postMessage(job: any) { const r = runChunk(job); setTimeout(() => this.onmessage?.({ data: r } as MessageEvent), this.delay()); }
  terminate() {}
}

describe('MeditationPool', () => {
  it('scans a layer completely with an in-order frontier, finds the hearth-god', async () => {
    let j = 0;
    const found: string[] = [];
    const done = new Promise<bigint>((res) => {
      const pool = new MeditationPool(() => new FakeWorker(() => (j++ * 7) % 5) as unknown as Worker, 3, {
        onSpirit: (s) => found.push(s.cell),
        onScryDone: (t) => res(t.doneUpTo),
      });
      pool.addScry({ id: 's', prefix: '011', depth: 6 });
    });
    expect(await done).toBe(512n);
    expect(found).toContain('011010');
  });

  it('grinds a name and reports verifiable improvements', async () => {
    const aura = '11'.repeat(32);
    const got: { nonce: bigint; strength: number }[] = [];
    await new Promise<void>((res) => {
      const pool = new MeditationPool(() => new FakeWorker(() => 0) as unknown as Worker, 2, {
        onName: (t, nonce, strength) => { got.push({ nonce, strength }); if (strength >= 9) { pool.remove(t.id); res(); } },
      });
      pool.addName({ id: 'n', cell: '011010', aura, best: 0 });
    });
    for (const g of got) expect(nameStrength('011010', hexToBytes(aura), g.nonce)).toBe(g.strength);
    expect(got.map((g) => g.strength)).toEqual([...got.map((g) => g.strength)].sort((a, b) => a - b));
  });
});

// M0 benchmark: Poseidon hash rates for scrying and naming (Node, single core).
import { cellDigest, childDigest, spiritFromDigest, nameHashRaw, auraField, bits } from '@truenames/universe';

function rate(label: string, fn: (n: number) => void, ms = 2000) {
  let n = 0;
  const t0 = performance.now();
  while (performance.now() - t0 < ms) { fn(1000); n += 1000; }
  const r = n / ((performance.now() - t0) / 1000);
  console.log(`${label.padEnd(28)} ${Math.round(r).toLocaleString()} /s`);
  return r;
}

export function bench() {
  const parent = cellDigest('00000');
  let i = 0;
  rate('scry (child+spirit check)', (n) => {
    for (let k = 0; k < n; k++) { const o = i++ & 7; const d = childDigest(parent, o); spiritFromDigest('000000', d); }
  });
  const d = cellDigest('0123456');
  const a = auraField(new Uint8Array(32).fill(7));
  let nonce = 0n;
  const r = rate('name (poseidon4 + bits)', (n) => {
    for (let k = 0; k < n; k++) bits(nameHashRaw(d, a, nonce++));
  });
  for (const s of [8, 12, 16, 20, 24]) console.log(`  strength ${s}: ~${(2 ** s / r).toFixed(2)} s per core`);
}

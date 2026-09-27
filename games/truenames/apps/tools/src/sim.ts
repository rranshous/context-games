// M3 simulation: synthetic casters on one spirit. Prints grant/strain curves as text.
import { LocalAuthority, TUNABLES } from '@truenames/authority';

const GOD = '011010';

export function cadence(strength = 16, ticks = 150) {
  console.log(`\n== cadence: one caster (strength ${strength}) casting every k ticks, ${ticks} ticks (${(ticks * TUNABLES.TICK_MS) / 1000}s) ==`);
  console.log('k  casts  total   per-cast(last)  peak strain  recoils  recoil dmg');
  for (const k of [1, 2, 3, 4, 5, 7, 10]) {
    const a = new LocalAuthority();
    a.grantSyntheticName('x', GOD, strength);
    let total = 0, casts = 0, last = 0, peak = 0, rec = 0, recDmg = 0;
    for (let i = 0; i < ticks; i++) {
      if (i % k === 0) a.submitCast({ aura: 'x', cell: GOD, request: 1e9, target: { kind: 'self' }, tick: i });
      for (const c of a.tick().casts) { total += c.grant; casts++; last = c.grant; peak = Math.max(peak, c.strainAfter); if (c.recoil) { rec++; recDmg += c.recoil; } }
    }
    console.log(`${String(k).padEnd(3)}${String(casts).padEnd(7)}${total.toFixed(0).padEnd(8)}${last.toFixed(2).padEnd(16)}${peak.toFixed(2).padEnd(13)}${String(rec).padEnd(9)}${recDmg.toFixed(0)}`);
  }
}

export function contention(ticks = 1000) {
  console.log(`\n== contention: 4 casters at strengths 12/14/18/22 all spamming every 3 ticks for ${ticks} ticks ==`);
  const a = new LocalAuthority();
  const strengths = [12, 14, 18, 22];
  strengths.forEach((s, i) => a.grantSyntheticName('c' + i, GOD, s));
  const totals = strengths.map(() => 0);
  const series: string[] = [];
  for (let i = 0; i < ticks; i++) {
    strengths.forEach((_, j) => { if ((i + j) % 3 === 0) a.submitCast({ aura: 'c' + j, cell: GOD, request: 1e9, target: { kind: 'self' }, tick: i }); });
    const r = a.tick();
    for (const c of r.casts) totals[Number(c.aura.slice(1))]! += c.grant;
    if (i % 100 === 0) series.push(`t${i}: pool ${r.pools[GOD]?.level.toFixed(0) ?? '-'}`);
  }
  strengths.forEach((s, j) => console.log(`strength ${s}: total ${totals[j]!.toFixed(0)}  (${((100 * totals[j]!) / totals.reduce((x, y) => x + y)).toFixed(1)}%)`));
  console.log(series.join('  '));
}

export function sim() {
  for (const s of [12, 16, 20]) cadence(s);
  contention();
}

// Simulation: one caster on one spirit at various cadences. Vessels are per caster, so there is no contention to simulate.
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
      if (i % k === 0) a.submitCast({ aura: 'x', spirit: GOD, request: 1e9, target: { kind: 'self' }, tick: i });
      for (const c of a.tick().casts) { total += c.grant; casts++; last = c.grant; peak = Math.max(peak, c.strainAfter); if (c.recoil) { rec++; recDmg += c.recoil; } }
    }
    console.log(`${String(k).padEnd(3)}${String(casts).padEnd(7)}${total.toFixed(0).padEnd(8)}${last.toFixed(2).padEnd(16)}${peak.toFixed(2).padEnd(13)}${String(rec).padEnd(9)}${recDmg.toFixed(0)}`);
  }
}

export function sim() {
  for (const s of [12, 16, 20]) cadence(s);
}

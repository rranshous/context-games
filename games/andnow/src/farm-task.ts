// andnow's Potluck task: runs one unit of work (src/work.ts: GA matches, a match, a solo
// probe game, a whole petri dish) in whatever browser leased it. Browser-safe (no Node
// imports). Built to dist/farm-task.mjs; every andnow tool that farms registers it.
//
// canary(): replays a slice of the golden replays (test/canary.json) and checks every
// final hash, so a device only takes work once it's shown it runs the sim identically.
import canaryCases from '../test/canary.json';
import { Case, replay } from './sim/fingerprint';
import { runWork, Work } from './work';

export function run(input: Work): unknown {
  return runWork(input);
}

export function canary(): { ok: boolean; detail: string } {
  const cases = canaryCases as { case: Case; final: number; ticks: number }[];
  let bad = 0;
  for (const c of cases) {
    const r = replay(c.case);
    if (r.final !== c.final || r.ticks !== c.ticks) bad++;
  }
  return { ok: bad === 0, detail: bad ? `${bad}/${cases.length} replays differ` : `${cases.length} replays identical` };
}

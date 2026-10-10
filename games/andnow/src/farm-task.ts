// andnow's Potluck task: runs a batch of GA matches in whatever browser leased it.
// Browser-safe (no Node imports). Built to dist/farm-task.mjs; the evolver registers it
// with the Potluck server when run with --farm.
//
// canary(): replays a slice of the golden replays (test/canary.json) and checks every
// final hash, so a device only takes work once it's shown it runs the sim identically.
import canaryCases from '../test/canary.json';
import { Batch, JobResult, runBatch } from './ga/job';
import { Case, replay } from './sim/fingerprint';

export function run(input: Batch): JobResult[] {
  return runBatch(input);
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

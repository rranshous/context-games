// The proof's verdict, by the rule set before running (journal.md, "The proof, set before
// running"): for each model, live passes if its mean score per request is at least full's
// minus 0.1, with the one-sided 95% bound by conversation above that, and it breaks no more
// games than full; under both judges.
//
//   node prove.mjs runs/proof runs/proof-opus [--without arcade-convo2]

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2), w = argv.indexOf('--without');
const without = w >= 0 ? argv[w + 1] : null;   // an id prefix to leave out, as a separate, labelled look
const [dir, opusDir] = argv.filter((a, i) => !a.startsWith('--') && (w < 0 || i !== w + 1));
const MARGIN = 0.1;

const load = (d) => Object.fromEntries(readdirSync(d).filter((f) => f.endsWith('.json')).map((f) => { const j = JSON.parse(readFileSync(join(d, f), 'utf8')); return [j.id, j]; }));
const trials = Object.values(load(dir)).filter((t) => !without || !t.id.startsWith(without));
const opus = opusDir ? load(opusDir) : {};

// One-sided 95% t quantiles by degrees of freedom (close enough past 30).
const T95 = [0, 6.314, 2.92, 2.353, 2.132, 2.015, 1.943, 1.895, 1.86, 1.833, 1.812, 1.796, 1.782, 1.771, 1.761, 1.753, 1.746, 1.74, 1.734, 1.729, 1.725, 1.721, 1.717, 1.714, 1.711, 1.708, 1.706, 1.703, 1.701, 1.699, 1.697];
const t95 = (df) => T95[df] ?? 1.645;
const mean = (a) => a.reduce((p, q) => p + q, 0) / a.length;

for (const [judge, verdictOf] of [['Sonnet', (t) => t.verdict], ['Opus', (t) => opus[t.id]?.verdict]]) {
  for (const model of ['haiku', 'sonnet']) {
    // Pair each live conversation with full's on the same script and rep.
    const by = {};
    for (const t of trials.filter((x) => x.model === model)) {
      const v = verdictOf(t);
      if (!v?.each) continue;
      (by[`${t.game}/${t.task}/${t.rep}`] ??= {})[t.approach] = { score: mean(v.each), broke: !!v.broke, requests: v.each.length };
    }
    const pairs = Object.values(by).filter((p) => p.full && p.live);
    if (!pairs.length) continue;
    const d = pairs.map((p) => p.live.score - p.full.score);
    const sd = Math.sqrt(d.reduce((s, x) => s + (x - mean(d)) ** 2, 0) / (d.length - 1));
    const lower = mean(d) - t95(d.length - 1) * sd / Math.sqrt(d.length);
    const broke = { full: pairs.filter((p) => p.full.broke).length, live: pairs.filter((p) => p.live.broke).length };
    const pass = lower > -MARGIN && broke.live <= broke.full;
    console.log(`${judge} judging ${model}: ${pairs.length} pairs, full ${mean(pairs.map((p) => p.full.score)).toFixed(3)}, live ${mean(pairs.map((p) => p.live.score)).toFixed(3)}, live − full ${mean(d).toFixed(3)} (95% lower bound ${lower.toFixed(3)}, needs > −${MARGIN}), broke full ${broke.full} live ${broke.live} → ${pass ? 'PASS' : 'FAIL'}`);
  }
}

// What's going on at an install: traffic by the hour, how the stage runs per browser, and
// trouble grouped by what it says (ops.mjs keeps it; pages send it through telemetry.js).
//
//   node tools/ops.mjs [https://gactant.com] [days]          a summary
//   node tools/ops.mjs [https://gactant.com] [days] --json   all of it
//
// Needs GACTANT_ADMIN_TOKEN in .env (the install's ADMIN_TOKEN).

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SECONDS, WRITTEN } from '../ops.mjs';

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries((existsSync(join(HERE, '.env')) ? readFileSync(join(HERE, '.env'), 'utf8') : '').split('\n')
  .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]));
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const [to = 'https://gactant.com', days = '2'] = args;
const base = to.replace(/\/$/, '');
// The admin token goes in the body: only over https, or to this machine.
if (!/^https:\/\//.test(base) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(base)) { console.error(`refusing ${base}: the admin token only goes over https (or to this machine)`); process.exit(1); }

const res = await fetch(`${base}/api/admin/ops`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base },
  body: JSON.stringify({ token: env.GACTANT_ADMIN_TOKEN ?? '', days: Number(days) }),
});
const ops = await res.json();
if (!res.ok) { console.error(ops); process.exit(1); }
if (process.argv.includes('--json')) { console.log(JSON.stringify(ops, null, 1)); process.exit(0); }

const total = {}, sums = {};
for (const h of ops.traffic) {
  for (const [k, v] of Object.entries(h.counts)) total[k] = (total[k] ?? 0) + v;
  for (const [k, v] of Object.entries(h.sums)) sums[k] = (sums[k] ?? 0) + v;
}
const pick = (prefix) => Object.entries(total).filter(([k]) => k.startsWith(prefix)).sort((a, b) => b[1] - a[1]);

console.log(`${base}, the last ${days} day(s), as of ${ops.now}. Windows holding a ludant now: ${ops.held}. Open reports of content: ${ops.flagsOpen}${ops.flagsOpen ? ' (node tools/moderate.mjs)' : ''}.\n`);
if (ops.storage) {
  const mb = (n) => `${(n / 1e6).toFixed(1)} MB`;
  console.log(`storage: ${mb(ops.storage.bytes)} in all. ${Object.entries(ops.storage.kinds).sort((a, b) => b[1].chars - a[1].chars).map(([k, v]) => `${k} ${v.docs} (${mb(v.chars)})`).join(', ')}\n`);
}
console.log('by hour (UTC): requests, sittings, trouble');
for (const h of ops.traffic) {
  const c = h.counts, req = Object.entries(c).filter(([k]) => k.startsWith('api ') && !/^api (5xx|\d{3})$/.test(k)).reduce((n, [, v]) => n + v, 0);
  const trouble = ['crash', 'fault', 'thinking', 'server'].reduce((n, k) => n + (c[`event ${k}`] ?? 0), 0) + (c['api 5xx'] ?? 0);
  console.log(`  ${h.hour.slice(0, 8)} ${h.hour.slice(8)}h  ${String(req).padStart(6)}  ${String(c['event sit'] ?? 0).padStart(4)}  ${trouble || ''}`);
}
console.log('\nroutes (count, mean ms):');
for (const [k, v] of pick('api ').filter(([k]) => !/^api (5xx|\d{3})$/.test(k)).slice(0, 25)) {
  const ms = sums[`ms ${k.slice(4)}`];
  console.log(`  ${String(v).padStart(6)}  ${ms != null ? String(Math.round(ms / v)).padStart(5) : '     '}  ${k.slice(4)}`);
}
const statuses = pick('api ').filter(([k]) => /^api (5xx|\d{3})$/.test(k));
if (statuses.length) console.log(`\nrefused or failed: ${statuses.map(([k, v]) => `${k.slice(4)} ×${v}`).join(', ')}`);
console.log('\nwhat pages noticed:', pick('event ').map(([k, v]) => `${k.slice(6)} ×${v}`).join(', ') || 'nothing');
console.log('browsers (events from):', Object.entries(pick('browser ').reduce((o, [k, v]) => { const b = k.split(' ').slice(1, -1).join(' '); o[b] = (o[b] ?? 0) + v; return o; }, {})).map(([b, v]) => `${b} ${v}`).join(', ') || 'none yet');
const perf = pick('perf ').filter(([k]) => !/ (fps|pictures|trip|speed)$/.test(k));
if (perf.length) {
  console.log('\nthe stage (mean of samples): fps / pictures a second / round trip ms / game speed');
  for (const [k, n] of perf) console.log(`  ${k.slice(5).padEnd(28)} ×${String(n).padEnd(4)} ${['fps', 'pictures', 'trip', 'speed'].map((f) => (sums[`${k} ${f}`] / n).toFixed(f === 'speed' ? 2 : 0)).join(' / ')}`);
}
const wakes = pick('wake ').filter(([k]) => !k.startsWith('wake ended ') && k.split(' ').length === 2);
if (wakes.length) {
  const mean = (k, f, n) => sums[`${k} ${f}`] / n;
  const s = (ms) => `${(ms / 1000).toFixed(1)}s`;
  console.log('\nwakes (means): turns, whole wake, waiting on the model, running tools, slowest wait, per turn; tokens in (cached) / out; section writes');
  for (const [k, n] of wakes) {
    const turns = mean(k, 'turns', n);
    console.log(`  ${k.slice(5).padEnd(34)} ×${String(n).padEnd(4)} ${turns.toFixed(1)} turns, ${s(mean(k, 'ms', n))}, model ${s(mean(k, 'modelMs', n))}, tools ${s(mean(k, 'toolMs', n))}, slowest ${s(mean(k, 'slowestMs', n))}, ${s(mean(k, 'modelMs', n) / Math.max(turns, 1))}/turn; ${Math.round(mean(k, 'tokensIn', n))} (${Math.round(mean(k, 'cachedIn', n))}) / ${Math.round(mean(k, 'tokensOut', n))}; ${mean(k, 'writes', n).toFixed(1)} writes, ${mean(k, 'trims', n).toFixed(1)} trims`);
  }
  console.log(`  ended: ${pick('wake ended ').map(([k, v]) => `${k.slice(11)} ×${v}`).join(', ')}`);
  for (const [k, n] of wakes) {
    const sometimes = (f) => { const m = total[`${k} ${f} n`]; return m ? `${s(sums[`${k} ${f}`] / m)} (×${m})` : 'none yet'; };
    console.log(`  ${k.slice(5)}: a person waited for the wake to start ${sometimes('heardMs')}; for what they did mid-wake to reach it ${sometimes('lateMs')}`);
  }
  spread('whole wakes', 'wakes ms in ');
  spread('a person waiting for a wake to start', 'wakes heardMs in ');
  spread('a person waiting mid-wake', 'wakes lateMs in ');
}

// A distribution kept as counts in ranges: the ranges, and which holds the median and the 90th percentile.
function spread(what, prefix) {
  const counts = SECONDS.map((_, i) => total[`${prefix}${i}`] ?? 0), n = counts.reduce((a, b) => a + b, 0);
  if (!n) return;
  const label = (i) => (SECONDS[i] === Infinity ? `over ${SECONDS[i - 1]}s` : `≤${SECONDS[i]}s`);
  const at = (q) => { let run = 0; for (let i = 0; i < counts.length; i++) { run += counts[i]; if (run >= q * n) return label(i); } };
  console.log(`  ${what} (×${n}): ${counts.map((c, i) => (c ? `${label(i)} ${c}` : '')).filter(Boolean).join(', ')}; median ${at(0.5)}, 90% ${at(0.9)}`);
}

const turns = pick('turn ').filter(([k]) => k.split(' ').length === 2);
if (turns.length) {
  const s = (ms) => `${(ms / 1000).toFixed(1)}s`;
  // A group's line: count, mean seconds in all and to start, mean tokens written, and how fast
  // it wrote once it started (tokens out over the time after the first token).
  const line = (k, n, name) => {
    const mean = (f) => (total[`${k} ${f} n`] ? sums[`${k} ${f}`] / total[`${k} ${f} n`] : null);
    const ms = sums[`${k} ms`] / n, first = mean('firstMs'), answer = mean('answerMs'), out = sums[`${k} tokensOut`] / n;
    const rate = first != null && ms > first ? ` ${Math.round(out / ((ms - first) / 1000))} tok/s` : '';
    return `  ${name.padEnd(30)} ×${String(n).padEnd(5)} ${s(ms)}, starts ${first != null ? s(first) : '?'}, answers ${answer != null ? s(answer) : '?'}; ${Math.round(out)} out (${Math.round(sums[`${k} reasoning`] / n)} reasoning), ${Math.round(sums[`${k} argChars`] / n)} chars of arguments;${rate}`;
  };
  console.log('\nturns (means): seconds in all, to the first token, to the first of the answer (after reasoning); tokens out (of them reasoning); arguments; tokens a second once started');
  for (const [k, n] of turns) console.log(line(k, n, k.slice(5)));
  console.log('  by how much it wrote:');
  WRITTEN.forEach((end, i) => { const k = `turns wrote ${i}`, n = total[k]; if (n) console.log(line(k, n, end === Infinity ? `  over ${WRITTEN[i - 1]} tokens` : `  up to ${end} tokens`)); });
  console.log('  by what it called:');
  for (const [k, n] of pick('turns tool ').filter(([k]) => k.split(' ').length === 3)) console.log(line(k, n, `  ${k.slice(11)}`));
  console.log('  by provider:');
  for (const [k, n] of pick('turns provider ').filter(([k]) => k.split(' ').length === 3)) console.log(line(k, n, `  ${k.slice(15)}`));
  spread('turns, in all', 'turns ms in ');
  spread('turns, to the first token', 'turns firstMs in ');
  spread('turns, to the first of the answer', 'turns answerMs in ');
}
if (total['events dropped']) console.log(`\n${total['events dropped']} events dropped (over the day's cap)`);
console.log(`\ntrouble (${ops.trouble.length} kinds kept), most recent first:`);
for (const t of ops.trouble.slice(0, 20)) {
  console.log(`  [${t.kind}] ×${t.count} ${t.where}: ${t.message.split('\n')[0].slice(0, 160)}`);
  console.log(`      last ${t.last.slice(0, 16)} first ${t.first.slice(0, 16)}  ${Object.entries(t.browsers).map(([b, n]) => `${b} ${n}`).join(', ')}${t.ludants.length ? `  in ${t.ludants.join(', ')}` : ''}`);
}

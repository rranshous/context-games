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

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries((existsSync(join(HERE, '.env')) ? readFileSync(join(HERE, '.env'), 'utf8') : '').split('\n')
  .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]));
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const [to = 'https://gactant.com', days = '2'] = args;
const base = to.replace(/\/$/, '');
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

console.log(`${base}, the last ${days} day(s), as of ${ops.now}. Windows holding a ludant now: ${ops.held}.\n`);
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
if (total['events dropped']) console.log(`\n${total['events dropped']} events dropped (over the day's cap)`);
console.log(`\ntrouble (${ops.trouble.length} kinds kept), most recent first:`);
for (const t of ops.trouble.slice(0, 20)) {
  console.log(`  [${t.kind}] ×${t.count} ${t.where}: ${t.message.split('\n')[0].slice(0, 160)}`);
  console.log(`      last ${t.last.slice(0, 16)} first ${t.first.slice(0, 16)}  ${Object.entries(t.browsers).map(([b, n]) => `${b} ${n}`).join(', ')}${t.ludants.length ? `  in ${t.ludants.join(', ')}` : ''}`);
}

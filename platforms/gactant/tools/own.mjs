// Owners: which ludants belong to which person, and giving ludants nobody owns (from
// before people) to a person.
//
//   node tools/own.mjs [site]                                 every ludant, and its owner
//   node tools/own.mjs [site] people                          every person
//   node tools/own.mjs [site] give <person> <ludant>...       give those ludants to that person
//   node tools/own.mjs [site] give <person> unowned           give every ludant nobody owns
//
// site defaults to https://gactant.com. Needs GACTANT_ADMIN_TOKEN in .env.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries((existsSync(join(HERE, '.env')) ? readFileSync(join(HERE, '.env'), 'utf8') : '').split('\n')
  .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]));
const args = process.argv.slice(2);
const base = (/^https?:/.test(args[0] ?? '') ? args.shift() : 'https://gactant.com').replace(/\/$/, '');
const call = async (path, body) => {
  const res = await fetch(`${base}/api/admin/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ token: env.GACTANT_ADMIN_TOKEN ?? '', ...body }) });
  const json = await res.json();
  if (!res.ok) throw Object.assign(new Error(json.error ?? res.status), { json });
  return json;
};

if (args[0] === 'people') {
  for (const p of await call('people', {})) console.log(`${p.id}  ${p.name.padEnd(24)} since ${p.created.slice(0, 10)}  ${p.devices.join(', ')}`);
} else if (args[0] === 'give' && args[1] && args[2]) {
  const person = args[1];
  const ids = args[2] === 'unowned' ? (await call('owners', {})).filter((l) => !l.owned).map((l) => l.id) : args.slice(2);
  for (const ludant of ids) {
    try { await call('own', { ludant, person }); console.log(`gave ${ludant}`); } catch (err) { console.log(`${ludant}: ${err.message}`); }
  }
} else {
  for (const l of await call('owners', {})) {
    console.log(`${(l.owner ?? 'NOBODY').padEnd(34)} ${l.id.padEnd(26)} ${String(l.name).padEnd(36)} by ${l.by ?? '?'}${l.from ? ` (from ${l.from})` : ''}`);
  }
}

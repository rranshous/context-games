// Owners: which ludants have one, and claiming one that doesn't (a ludant from before
// owners). Claiming prints an owner link: open it on the device that should own it.
//
//   node tools/own.mjs [site]                  every ludant, owned or not
//   node tools/own.mjs [site] claim <ludant>   a key for one with no owner yet
//
// site defaults to https://gactant.com. Needs GACTANT_ADMIN_TOKEN in .env. The link holds
// the key: anyone who opens it owns the ludant, so send it only to yourself.

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
  if (!res.ok) { console.error(json); process.exit(1); }
  return json;
};

if (args[0] === 'claim' && args[1]) {
  const { id, owner } = await call('own', { ludant: args[1] });
  console.log(`https://gactant.com/frame.html?l=${id}#own=${owner}`);
} else {
  for (const l of await call('owners', {})) {
    console.log(`${l.owned ? 'owned  ' : 'NOBODY '} ${l.id.padEnd(28)} ${String(l.name).padEnd(34)} ${l.ownedAt ? `since ${l.ownedAt.slice(0, 16)}` : ''.padEnd(22)} by ${l.by ?? '?'}${l.from ? ` (from ${l.from})` : ''}  sat with: ${l.people.join(', ')}`);
  }
}

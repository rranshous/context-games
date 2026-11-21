// Every rulebook at an install, with its source, as JSON on stdout (for reading them all, say
// before a change to what rules are given).
//
//   node tools/rulebooks.mjs [https://gactant.com] > rulebooks.json
//
// Needs GACTANT_ADMIN_TOKEN in .env (the install's ADMIN_TOKEN).

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries((existsSync(join(HERE, '.env')) ? readFileSync(join(HERE, '.env'), 'utf8') : '').split('\n')
  .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]));
const base = (process.argv[2] ?? 'https://gactant.com').replace(/\/$/, '');
// The admin token goes in the body: only over https, or to this machine.
if (!/^https:\/\//.test(base) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(base)) { console.error(`refusing ${base}: the admin token only goes over https (or to this machine)`); process.exit(1); }

const res = await fetch(`${base}/api/admin/rulebooks`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base },
  body: JSON.stringify({ token: env.GACTANT_ADMIN_TOKEN ?? '' }),
});
const out = await res.json();
if (!res.ok) { console.error(out); process.exit(1); }
console.log(JSON.stringify(out, null, 1));

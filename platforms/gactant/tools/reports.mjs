// Read what devices' check pages found (/check.html), newest first:
//
//   node tools/reports.mjs https://gactant.com [n]
//
// Needs GACTANT_ADMIN_TOKEN in .env (the install's ADMIN_TOKEN).

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries((existsSync(join(HERE, '.env')) ? readFileSync(join(HERE, '.env'), 'utf8') : '').split('\n')
  .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]));
const [to = 'https://gactant.com', n = '5'] = process.argv.slice(2);
const base = to.replace(/\/$/, '');
const res = await fetch(`${base}/api/admin/reports`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base },
  body: JSON.stringify({ token: env.GACTANT_ADMIN_TOKEN ?? '', n: Number(n) }),
});
console.log(JSON.stringify(await res.json(), null, 1));

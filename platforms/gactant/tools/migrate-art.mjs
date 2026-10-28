// Once (2026-10-28): moves the art and thumbs an install kept as data URLs in its store into
// its art store (R2 when hosted, data/pictures locally), a few ludants at a time, until
// nothing is left. Safe to run again: what has moved is skipped.
//
//   node tools/migrate-art.mjs [https://gactant.rranshous.workers.dev]
//
// Needs GACTANT_ADMIN_TOKEN in .env (the install's ADMIN_TOKEN).

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries((existsSync(join(HERE, '.env')) ? readFileSync(join(HERE, '.env'), 'utf8') : '').split('\n')
  .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]));
const base = (process.argv[2] ?? 'https://gactant.rranshous.workers.dev').replace(/\/$/, '');
const token = process.env.GACTANT_ADMIN_TOKEN ?? env.GACTANT_ADMIN_TOKEN ?? '';

for (let round = 1; ; round++) {
  const res = await fetch(`${base}/api/admin/migrate-art`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ token, n: 10 }) });
  const out = await res.json();
  if (!res.ok) { console.error(out); process.exit(1); }
  console.log(`round ${round}: moved ${out.moved} pictures${out.missing ? `, ${out.missing} listed but not kept` : ''}; ${out.left} ludants and publications left`);
  if (!out.left) break;
}

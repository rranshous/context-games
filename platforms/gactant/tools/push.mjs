// Bring publications from this install (data/published) to another, by id:
//
//   node tools/push.mjs https://gactant.com <publication id> [...]
//   node tools/push.mjs https://gactant.com --list        what there is to push
//
// The other install needs the same admin token: GACTANT_ADMIN_TOKEN in .env here, and
// ADMIN_TOKEN as a secret there (npx wrangler secret put ADMIN_TOKEN).

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries((existsSync(join(HERE, '.env')) ? readFileSync(join(HERE, '.env'), 'utf8') : '').split('\n')
  .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]));
const [to, ...ids] = process.argv.slice(2);
const dir = join(HERE, 'data', 'published');
const all = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));

if (!to || ids[0] === '--list' || !ids.length) {
  for (const p of all.sort((a, b) => a.at.localeCompare(b.at))) console.log(`${p.id.padEnd(40)} ${p.name}  (by ${p.by ?? '?'}, ${p.at.slice(0, 10)})${p.note ? `  "${p.note}"` : ''}`);
  process.exit(0);
}

const published = ids.map((id) => all.find((p) => p.id === id) ?? (console.error(`no publication ${id} here`), process.exit(1)));
const res = await fetch(`${to.replace(/\/$/, '')}/api/admin/import`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: env.GACTANT_ADMIN_TOKEN, published }),
});
console.log(res.status, await res.text());

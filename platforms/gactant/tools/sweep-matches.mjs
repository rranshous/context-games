// Sweep the hosted matches: ask Cloudflare for every Match object that holds data, and hand
// the list to the World, which archives what's due and any match its index doesn't know
// (tables.mjs, sweep). The hourly job does the first part on its own; this also finds
// strays, so no match lingers because its reference was lost.
//
//   node tools/sweep-matches.mjs [https://gactant.rranshous.workers.dev]
//
// Needs GACTANT_ADMIN_TOKEN in .env, and a Cloudflare token: CLOUDFLARE_API_TOKEN, or the
// one wrangler keeps after `npx wrangler login`.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries((existsSync(join(HERE, '.env')) ? readFileSync(join(HERE, '.env'), 'utf8') : '').split('\n')
  .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]));
const base = (process.argv[2] ?? 'https://gactant.rranshous.workers.dev').replace(/\/$/, '');
const wranglerToken = () => { try { return readFileSync(join(homedir(), '.config/.wrangler/config/default.toml'), 'utf8').match(/oauth_token = "([^"]+)"/)?.[1]; } catch { return null; } };
const cf = process.env.CLOUDFLARE_API_TOKEN ?? wranglerToken();
if (!cf) { console.error('no Cloudflare token: set CLOUDFLARE_API_TOKEN, or run npx wrangler login'); process.exit(1); }

const api = async (path) => {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, { headers: { Authorization: `Bearer ${cf}` } });
  const j = await res.json();
  if (!j.success) throw new Error(`${path}: ${JSON.stringify(j.errors)}`);
  return j;
};
const account = execFileSync('npx', ['wrangler', 'whoami'], { cwd: HERE, encoding: 'utf8' }).match(/[0-9a-f]{32}/)?.[0];
const ns = (await api(`/accounts/${account}/workers/durable_objects/namespaces`)).result.find((n) => n.script === 'gactant' && n.class === 'Match');
if (!ns) { console.log('no Match objects yet'); process.exit(0); }
const objects = [];
for (let cursor = null; ;) {
  const page = await api(`/accounts/${account}/workers/durable_objects/namespaces/${ns.id}/objects?limit=1000${cursor ? `&cursor=${cursor}` : ''}`);
  objects.push(...page.result.filter((o) => o.hasStoredData).map((o) => o.id));
  cursor = page.result_info?.cursor;
  if (!cursor || page.result.length < 1000) break;
}
console.log(`${objects.length} match objects hold data`);
const res = await fetch(`${base}/api/admin/sweep`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ token: env.GACTANT_ADMIN_TOKEN ?? '', objects }) });
console.log(res.status, await res.text());

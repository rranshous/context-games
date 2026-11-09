// Problems ludants reported to gactant's admins (surfaces/admins.js), each sent by its person:
//
//   node tools/issues.mjs [site]                     the open ones, newest first
//   node tools/issues.mjs [site] all                 every one
//   node tools/issues.mjs [site] <id>                one whole: written to issues/<id>/ (report.md,
//                                                    soma.json, and the rulebooks and match logs it names)
//   node tools/issues.mjs [site] <id> <status>       mark it (done, wontfix, …); "open" opens it again
//
// site defaults to https://gactant.com. Needs GACTANT_ADMIN_TOKEN in .env. From a network
// that blocks gactant.com, use https://gactant.rranshous.workers.dev for the admin calls;
// rulebooks and logs are then fetched from gactant.com, so they're skipped if that fails.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries((existsSync(join(HERE, '.env')) ? readFileSync(join(HERE, '.env'), 'utf8') : '').split('\n')
  .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]));
const args = process.argv.slice(2);
const base = (args[0]?.startsWith('http') ? args.shift() : 'https://gactant.com').replace(/\/$/, '');
const [what, status] = args;
const admin = async (body) => {
  const res = await fetch(`${base}/api/admin/issues`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ token: env.GACTANT_ADMIN_TOKEN ?? '', ...body }) });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? res.status);
  return json;
};

if (!what || what === 'all') {
  const list = await admin({ all: what === 'all', n: 50 });
  if (!list.length) console.log('no reports');
  for (const i of list) console.log(`${i.id}  ${i.at.slice(0, 16)}  ${i.status.padEnd(6)}  ${i.name} (${i.ludant}), sent by ${i.by}\n    ${i.title}\n    ${i.wrong.replace(/\s+/g, ' ')}\n`);
} else {
  const issue = await admin({ id: what, ...(status ? { status } : {}) });
  if (status) { console.log(`${issue.id}: ${issue.status}`); process.exit(0); }
  const dir = join(HERE, 'issues', issue.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'soma.json'), JSON.stringify(issue.soma, null, 1));
  writeFileSync(join(dir, 'table.json'), JSON.stringify(issue.table, null, 1));
  // The rulebooks it names (in its matches, or as a hash anywhere in its soma) and its matches' logs are public: fetch them.
  const site = base.endsWith('.workers.dev') ? 'https://gactant.com' : base;   // workers.dev answers only admin calls
  const get = async (path) => { try { const r = await fetch(`${site}/api/${path}`, { headers: { Origin: site } }); return r.ok ? r.json() : null; } catch { return null; } };
  const hashes = new Set([...(issue.table?.matches ?? []).map((m) => m.rulebook), ...(JSON.stringify(issue.soma).match(/\b[0-9a-f]{64}\b/g) ?? [])].filter(Boolean));
  for (const h of hashes) { const rb = await get(`rulebooks/${h}`); if (rb) writeFileSync(join(dir, `rulebook-${h.slice(0, 12)}.js`), `// ${rb.name}, ${rb.at}\n${rb.source}`); }
  for (const m of issue.table?.matches ?? []) { const log = await get(`matches/${m.id}/log`); if (log) writeFileSync(join(dir, `match-${m.id}.json`), JSON.stringify(log, null, 1)); }
  const doings = issue.doings.map((d) => `- ${d.at.slice(11, 19)} [${d.kind}] ${d.text}`).join('\n');
  writeFileSync(join(dir, 'report.md'), `# ${issue.title}\n\n${issue.name} (${issue.ludant}), sent by ${issue.by} at ${issue.at}. Status: ${issue.status}.\n\n## Trying\n\n${issue.trying || '(not said)'}\n\n## What went wrong\n\n${issue.wrong}\n\n## Tried\n\n${issue.tried || '(not said)'}\n\n## What it did, latest last\n\n${doings || '(nothing)'}\n`);
  console.log(`${issue.id}: ${issue.title}\n  written to ${dir} (report.md, soma.json, table.json${hashes.size ? `, ${hashes.size} rulebook hash(es) looked up` : ''})`);
}

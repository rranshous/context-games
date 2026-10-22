// Reports of content, and what to do about them.
//
//   node tools/moderate.mjs [site]                          open reports (pictures saved to look at)
//   node tools/moderate.mjs [site] all                      the latest 200, open or not
//   node tools/moderate.mjs [site] hide <publication> [note]   take a publication out of the lobby
//   node tools/moderate.mjs [site] restore <publication>    put it back (reports alone won't hide it again)
//   node tools/moderate.mjs [site] remove <ludant>          take a ludant down: its link says so
//   node tools/moderate.mjs [site] dismiss <flag>           close a report, nothing done
//
// site defaults to https://gactant.com. Needs GACTANT_ADMIN_TOKEN in .env.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries((existsSync(join(HERE, '.env')) ? readFileSync(join(HERE, '.env'), 'utf8') : '').split('\n')
  .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]));
const args = process.argv.slice(2);
const base = (/^https?:/.test(args[0] ?? '') ? args.shift() : 'https://gactant.com').replace(/\/$/, '');
const [action, target, ...rest] = args;
const call = async (path, body) => {
  const res = await fetch(`${base}/api/admin/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ token: env.GACTANT_ADMIN_TOKEN ?? '', ...body }) });
  const json = await res.json();
  if (!res.ok) { console.error(json); process.exit(1); }
  return json;
};

if (!action || action === 'all') {
  const flags = await call('flags', { all: action === 'all' });
  const dir = join(tmpdir(), 'gactant-reports');
  mkdirSync(dir, { recursive: true });
  if (!flags.length) console.log('no open reports');
  for (const f of flags) {
    let pic = '';
    if (f.image) { const [, type, b64] = f.image.match(/^data:image\/(\w+);base64,(.*)$/) ?? []; if (b64) { pic = join(dir, `${f.id}.${type === 'jpeg' ? 'jpg' : type}`); writeFileSync(pic, Buffer.from(b64, 'base64')); } }
    console.log(`${f.id}  ${f.at.slice(0, 16)}  [${f.status}] ${f.reason}  by ${f.by}`);
    console.log(`   ludant ${f.ludant ?? '-'}  publication ${f.published ?? '-'}${pic ? `  picture ${pic}` : ''}`);
    if (f.note) console.log(`   "${f.note}"`);
  }
} else {
  const key = { hide: 'published', restore: 'published', remove: 'ludant', dismiss: 'flag' }[action];
  if (!key || !target) { console.error('see the top of tools/moderate.mjs for how to use it'); process.exit(1); }
  console.log((await call('moderate', { action, [key]: target, note: rest.join(' ') })).done.join('\n') || 'nothing to do');
}

// Reports of content, and what to do about them.
//
//   node tools/moderate.mjs [site]                          open reports (pictures saved to look at)
//   node tools/moderate.mjs [site] all                      the latest 200, open or not
//   node tools/moderate.mjs [site] hide <publication> [note]   take a publication out of the lobby
//   node tools/moderate.mjs [site] restore <publication>    put it back (reports alone won't hide it again)
//   node tools/moderate.mjs [site] approve <publication>    vouch for it: it can be featured to newcomers
//   node tools/moderate.mjs [site] remove <ludant>          take a ludant down: its link says so
//   node tools/moderate.mjs [site] dismiss <flag>           close a report, nothing done
//   node tools/moderate.mjs [site] csam <file or url>       apparent CSAM (the Scanning Tool's email
//                                                           gives the path): preserve it privately,
//                                                           take down what used it, and print what a
//                                                           CyberTipline report needs
//   node tools/moderate.mjs [site] preserved                what's been preserved that way
//   node tools/moderate.mjs [site] lines                    once: turn publications from before sharing into lines
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
    if (f.from === 'ludant') {
      console.log(`   ${f.by} reported ${f.who || 'the person with it'}${f.personName ? ` (${f.personName}, ${f.person})` : f.person ? ` (${f.person})` : ''}:\n   "${f.note}"${f.why ? `\n   why: "${f.why}"` : ''}`);
      for (const m of f.chat ?? []) console.log(`     ${m.who}: ${m.text.replace(/\s+/g, ' ').slice(0, 300)}`);
    } else if (f.note) console.log(`   "${f.note}"`);
    // The matches it was in: their signed logs say who did what (node tools/check-match.mjs <id>).
    for (const m of f.matches ?? []) console.log(`   match ${m.id}  ${m.name} (${m.players.join(', ') || 'no players'})  ${m.n} actions when reported${m.over ? ', over' : ''}  → ${base}/api/matches/${m.id}/log`);
  }
} else if (action === 'csam') {
  if (!target) { console.error('give the matched file, like a/1234abcd.jpg, or its URL'); process.exit(1); }
  const r = await call('csam', { file: target });
  console.log(`Preserved as ${r.id}, in the private archive at ${r.preservedAt} (the picture and every ludant and publication that used it).`);
  console.log(`The picture is out of the art (${r.file}, ${r.type ?? 'already gone'}, ${r.bytes} bytes).`);
  for (const l of r.ludants) console.log(`Took down ludant ${l.id} (${l.name}), owner ${l.owner ?? 'none'}, made ${l.created}, last saved ${l.updated}${l.lineage?.from ? `, a copy of ${l.lineage.from.name}` : ''}`);
  for (const p of r.publications) console.log(`Hid publication ${p.id} (${p.name}), published by ${p.by ?? 'someone'} ${p.at}`);
  for (const p of r.people) console.log(`Person: ${p.name ?? '(no name)'} (${p.id})`);
  console.log(`
Now, by law (18 U.S.C. § 2258A), as soon as you can:
  1. Report it to NCMEC's CyberTipline: https://report.cybertip.org
     - the file's URL: ${r.url.startsWith('/') ? base + r.url : r.url} (now removed), and when it was served
     - the people above: their names on gactant and ids (gactant asks for no email; addresses are never kept)
     - this record: ${r.id}, kept in the private archive
     Don't download or open the picture to describe it; the report doesn't need you to.
  2. Keep what's preserved for at least 90 days (it's in the archive bucket; nothing deletes it).
  3. Tell Cloudflare it's removed: Security Center > Blocked Content.`);
} else if (action === 'lines') {
  // Once, after sharing replaced publishing: each ludant's publications become one public line.
  console.log(`made ${(await call('lines', {})).lines} line(s) from publications`);
} else if (action === 'preserved') {
  for (const r of await call('preserved', {})) console.log(`${r.id}  ${r.at.slice(0, 16)}  ${r.file}  ludants ${r.ludants.map((l) => l.id).join(', ') || '-'}  publications ${r.publications.map((p) => p.id).join(', ') || '-'}`);
} else {
  const key = { hide: 'published', restore: 'published', approve: 'published', remove: 'ludant', dismiss: 'flag' }[action];
  if (!key || !target) { console.error('see the top of tools/moderate.mjs for how to use it'); process.exit(1); }
  console.log((await call('moderate', { action, [key]: target, note: rest.join(' ') })).done.join('\n') || 'nothing to do');
}

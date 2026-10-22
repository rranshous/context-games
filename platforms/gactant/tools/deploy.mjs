// Deploy, checked: the smoke test first (nothing goes up if it fails), then wrangler, then
// a look at what's running, until the World answers with the version just deployed.
//
//   node tools/deploy.mjs

import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');
const step = (s) => console.log(`\n== ${s}`);

step('smoke test');
if (spawnSync(process.execPath, ['tools/smoke.mjs'], { cwd: HERE, stdio: 'inherit' }).status !== 0) { console.error('\nnot deploying: the smoke test failed'); process.exit(1); }

step('deploy');
const out = execFileSync('npx', ['wrangler', 'deploy'], { cwd: HERE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
process.stdout.write(out);
const version = out.match(/Current Version ID:\s*([0-9a-f-]+)/)?.[1];
const dev = out.match(/https:\/\/[\w.-]+\.workers\.dev/)?.[0];
if (!version) { console.error('\ncouldn\'t find the new version in wrangler\'s output'); process.exit(1); }

step(`is ${version} running?`);
const places = ['https://gactant.com', dev].filter(Boolean);
const deadline = Date.now() + 90_000;
let seen = null;
while (Date.now() < deadline) {
  for (const at of places) {
    try {
      const res = await fetch(`${at}/api/config`, { headers: { Origin: at } });
      seen = { at, version: (await res.json()).version };
      if (seen.version === version) { console.log(`yes, at ${at}`); process.exit(0); }
    } catch {}
  }
  await new Promise((r) => setTimeout(r, 3000));
}
console.error(seen ? `\nthe World still answers with ${seen.version} (at ${seen.at}). It may be busy on older code: see the journal, "The World that wouldn't update".` : `\ncouldn't reach ${places.join(' or ')} to check`);
process.exit(1);

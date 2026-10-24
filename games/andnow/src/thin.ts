// Thin a bake's checkpoints the way a bake now does as it goes (see bake-thin.ts), for runs
// baked before it did. --dry says what would go without touching anything.
//
//   node dist/thin.mjs runs/bake/<name> [...] [--dry]
//
// It won't touch a bake that's still running (its .baking pid is alive).
import { readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { bakingPid, dropFiles, toThin, type ThinMark } from './bake-thin';

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const dirs = args.filter((a) => a !== '--dry');
if (!dirs.length) { console.log('usage: node dist/thin.mjs <bake dir> [...] [--dry]'); process.exit(1); }

const gb = (n: number) => `${(n / 1e9).toFixed(1)} GB`;
let total = 0;
for (const dir of dirs) {
  const pid = bakingPid(dir);
  if (pid) { console.log(`${dir}: still baking (pid ${pid}), left alone`); continue; }
  const index = JSON.parse(readFileSync(`${dir}/index.json`, 'utf8')) as { every: number; marks: ThinMark[] };
  const gone = toThin(index.marks, index.every);
  const named = new Set(index.marks.map((m) => m.file).filter(Boolean));
  const stray = readdirSync(dir).filter((f) => f.endsWith('.andnow.gz') && !named.has(f));
  const bytes = gone.reduce((n, m) => n + statSync(`${dir}/${m.file}`).size, 0);
  const keep = index.marks.filter((m) => m.file).length - gone.length;
  console.log(`${dir}: ${index.marks.length} marks, ${gone.length} files to go (${gb(bytes)}), ${keep} kept` + (stray.length ? `; ${stray.length} files the index doesn't name, left alone: ${stray.slice(0, 5).join(' ')}` : ''));
  total += bytes;
  if (dry) continue;
  const put = () => { writeFileSync(`${dir}/index.json.tmp`, JSON.stringify(index)); renameSync(`${dir}/index.json.tmp`, `${dir}/index.json`); };
  total += dropFiles(dir, index.marks, gone, put) - bytes;
}
console.log(`${dry ? 'would free' : 'freed'} ${gb(total)}`);

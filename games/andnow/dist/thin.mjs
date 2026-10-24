// src/thin.ts
import { readdirSync, readFileSync as readFileSync2, renameSync, statSync as statSync2, writeFileSync as writeFileSync2 } from "node:fs";

// src/bake-thin.ts
import { existsSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
function keeps(t, last, every) {
  const age = last - t;
  if (age < 100 * every) return true;
  if (age < 1100 * every) return t % (10 * every) === 0;
  return t % (100 * every) === 0;
}
function toThin(marks, every) {
  if (!marks.length) return [];
  const last = marks[marks.length - 1].t;
  return marks.filter((m, i) => m.file && i > 0 && i < marks.length - 1 && !keeps(m.t, last, every));
}
var CHECKPOINT = /^t\d+\.andnow\.gz$/;
function dropFiles(dir, marks, gone, put) {
  const files = gone.map((m) => m.file).filter((f) => CHECKPOINT.test(f));
  for (const m of gone) delete m.file;
  const kept = new Set(marks.map((m) => m.file).filter(Boolean));
  put();
  let freed = 0;
  for (const f of files) {
    if (kept.has(f)) continue;
    const p = `${dir}/${f}`;
    if (!existsSync(p)) continue;
    freed += statSync(p).size;
    unlinkSync(p);
  }
  return freed;
}
function bakingPid(dir) {
  const p = `${dir}/.baking`;
  if (!existsSync(p)) return null;
  const pid = Number(readFileSync(p, "utf8"));
  try {
    process.kill(pid, 0);
    return pid;
  } catch {
    return null;
  }
}

// src/thin.ts
var args = process.argv.slice(2);
var dry = args.includes("--dry");
var dirs = args.filter((a) => a !== "--dry");
if (!dirs.length) {
  console.log("usage: node dist/thin.mjs <bake dir> [...] [--dry]");
  process.exit(1);
}
var gb = (n) => `${(n / 1e9).toFixed(1)} GB`;
var total = 0;
for (const dir of dirs) {
  const pid = bakingPid(dir);
  if (pid) {
    console.log(`${dir}: still baking (pid ${pid}), left alone`);
    continue;
  }
  const index = JSON.parse(readFileSync2(`${dir}/index.json`, "utf8"));
  const gone = toThin(index.marks, index.every);
  const named = new Set(index.marks.map((m) => m.file).filter(Boolean));
  const stray = readdirSync(dir).filter((f) => f.endsWith(".andnow.gz") && !named.has(f));
  const bytes = gone.reduce((n, m) => n + statSync2(`${dir}/${m.file}`).size, 0);
  const keep = index.marks.filter((m) => m.file).length - gone.length;
  console.log(`${dir}: ${index.marks.length} marks, ${gone.length} files to go (${gb(bytes)}), ${keep} kept` + (stray.length ? `; ${stray.length} files the index doesn't name, left alone: ${stray.slice(0, 5).join(" ")}` : ""));
  total += bytes;
  if (dry) continue;
  const put = () => {
    writeFileSync2(`${dir}/index.json.tmp`, JSON.stringify(index));
    renameSync(`${dir}/index.json.tmp`, `${dir}/index.json`);
  };
  total += dropFiles(dir, index.marks, gone, put) - bytes;
}
console.log(`${dry ? "would free" : "freed"} ${gb(total)}`);
//# sourceMappingURL=thin.mjs.map

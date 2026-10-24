// Which checkpoints a bake keeps on disk. A forever run saved every 1,000 ticks fills a disk
// (one run: 14,000 files, 58 GB), and the sim is deterministic, so any tick can be had from
// an earlier checkpoint by simulating on: only jumping there gets slower. Kept: every one for
// the newest 100, every 10th for the 1,000 before that, every 100th further back, and the
// first. A thinned mark stays in index.json with its facts (alive, biggest: the timeline and
// "biggest ever" read them) and without its file.
import { existsSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';

export interface ThinMark { t: number; file?: string }

/** Whether the checkpoint at t keeps its file, the newest being at `last`. */
export function keeps(t: number, last: number, every: number) {
  const age = last - t;
  if (age < 100 * every) return true;
  if (age < 1100 * every) return t % (10 * every) === 0;
  return t % (100 * every) === 0;
}

/** The marks whose files go now (not changed: see dropFiles). */
export function toThin(marks: ThinMark[], every: number): ThinMark[] {
  if (!marks.length) return [];
  const last = marks[marks.length - 1].t;
  return marks.filter((m, i) => m.file && i > 0 && i < marks.length - 1 && !keeps(m.t, last, every));
}

const CHECKPOINT = /^t\d+\.andnow\.gz$/;

/**
 * Take the files off these marks, save the index (by `put`), then delete the files: in that
 * order, so the index never names a file that's gone. Only checkpoint files in `dir` that no
 * kept mark names are deleted. Returns the bytes freed.
 */
export function dropFiles(dir: string, marks: ThinMark[], gone: ThinMark[], put: () => void): number {
  const files = gone.map((m) => m.file!).filter((f) => CHECKPOINT.test(f));
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

/** A running bake holds `<dir>/.baking` (its pid): thinning from outside then waits. */
export function bakingPid(dir: string): number | null {
  const p = `${dir}/.baking`;
  if (!existsSync(p)) return null;
  const pid = Number(readFileSync(p, 'utf8'));
  try { process.kill(pid, 0); return pid; } catch { return null; }
}

export function holdBaking(dir: string) { writeFileSync(`${dir}/.baking`, String(process.pid)); }

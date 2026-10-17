// Text views of the world, for the headless runner and the explorer hook.
import { glyphOf } from './glyphs';
import { DEBRIS, NONE, World } from './world';

export const LETTERS = 'ABCDEFGH';

/** Map view: walls '#', warriors by letter (IP lowercase), debris '%', size '+', speed '*'. */
export function asciiMap(world: World, opts: { glyphs?: boolean } = {}): string {
  const rows: string[] = [];
  const ips = new Set(world.allWarriors().filter((w) => w.alive).map((w) => world.idx(w.ipX, w.ipY)));
  for (let y = 0; y < world.h; y++) {
    let row = '';
    for (let x = 0; x < world.w; x++) {
      const i = world.idx(x, y);
      const o = world.owner[i];
      if (!world.isFloor(x, y)) row += '#';
      else if (o >= 0) {
        if (opts.glyphs) row += glyphOf(world.code[i]);
        else { const L = LETTERS[world.warrior(o).lineage] ?? '?'; row += ips.has(i) ? L.toLowerCase() : L; }
      } else if (o === DEBRIS) row += '%';
      else if (world.resource[i] === 1) row += '+';
      else if (world.resource[i] === 2) row += '*';
      else row += o === NONE ? ' ' : '?';
    }
    rows.push(row);
  }
  return rows.join('\n');
}

/** A warrior's body as its glyph grid (cropped to its bounding box), IP marked with brackets in the header. */
export function asciiBody(world: World, id: number): string {
  const cells = world.cellsOf(id);
  if (!cells.length) return '(no cells)';
  const xs = cells.map((c) => c % world.w), ys = cells.map((c) => (c / world.w) | 0);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const wr = world.warrior(id);
  const rows: string[] = [`ip at ${wr.ipX - x0},${wr.ipY - y0} dir ${'ESWN'[wr.dir]}`];
  for (let y = y0; y <= y1; y++) {
    let row = '';
    for (let x = x0; x <= x1; x++) {
      const i = world.idx(x, y);
      row += world.owner[i] === id ? glyphOf(world.code[i]) : ' ';
    }
    rows.push(row.replace(/\s+$/, ''));
  }
  return rows.join('\n');
}

export function statusLine(world: World): string {
  return world.allWarriors().filter((w) => w.gen === 0 || w.alive).map((w) =>
    `${LETTERS[w.lineage]}${w.gen ? `(g${w.gen})` : ''}:${w.name} ${w.alive ? `cells=${w.cellCount}/${Math.floor(w.maxSize)} spd=${w.speed.toFixed(2)}` : `dead@${w.diedAt} (${w.deathReason})`}`,
  ).join(' | ');
}

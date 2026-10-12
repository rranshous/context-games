// Warrior file format: a header of `key: value` lines, a `---` line, then the body as
// a grid of glyphs. A space means "no cell here". Use `.` for a cell that does nothing.
//
//   name: Gatherer
//   dir: E          (start direction of the IP; default E)
//   ip: 0 0         (column row of the IP's start cell in the grid; default first cell)
//   realm: sea      (island survival only: a sea creature, starting in the deep)
//   # comments are allowed in the header
//   ---
//   C6S$TM
import { CODE, DIR_NAMES } from './glyphs';

export interface WarriorSpec {
  name: string;
  dir: number;
  ip: { x: number; y: number };
  cells: { x: number; y: number; code: number }[];
  width: number;
  height: number;
  source: string;
  realm?: string; // island survival: 'sea' starts in the deep as a sea creature
}

export function parseWarrior(text: string, fallbackName = 'warrior'): WarriorSpec {
  const lines = text.replace(/\r/g, '').split('\n');
  const sep = lines.findIndex((l) => l.trim() === '---');
  if (sep < 0) throw new Error(`${fallbackName}: missing '---' line between header and body`);
  const header: Record<string, string> = {};
  for (const l of lines.slice(0, sep)) {
    if (!l.trim() || l.trim().startsWith('#')) continue;
    const m = l.match(/^\s*(\w+)\s*:\s*(.*)$/);
    if (m) header[m[1].toLowerCase()] = m[2].trim();
  }
  const grid = lines.slice(sep + 1);
  while (grid.length && !grid[grid.length - 1].trim()) grid.pop();

  const cells: WarriorSpec['cells'] = [];
  let width = 0;
  grid.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === ' ') continue;
      if (!(ch in CODE)) throw new Error(`${fallbackName}: unknown glyph '${ch}' at ${x},${y}`);
      cells.push({ x, y, code: CODE[ch] });
      width = Math.max(width, x + 1);
    }
  });
  if (!cells.length) throw new Error(`${fallbackName}: empty body`);

  let ip = { x: cells[0].x, y: cells[0].y };
  if (header.ip) {
    const [x, y] = header.ip.split(/[\s,]+/).map(Number);
    ip = { x, y };
    if (!cells.some((c) => c.x === x && c.y === y)) throw new Error(`${fallbackName}: ip ${x},${y} is not a cell`);
  }
  const dir = header.dir ? DIR_NAMES.indexOf(header.dir.toUpperCase()) : 0;
  if (dir < 0) throw new Error(`${fallbackName}: bad dir '${header.dir}'`);

  return { name: header.name || fallbackName, dir, ip, cells, width, height: grid.length, source: text, realm: header.realm };
}

// Genomes for evolving warriors: a warrior body (cells + glyphs) with an IP start cell
// and direction. Coordinates are free-form; they get normalized when written out.
import { DIR_NAMES, DX, DY, GLYPHS } from '../sim/glyphs';
import { Rng } from '../sim/rng';
import { WarriorSpec } from '../sim/warrior-file';
import { CONFIG } from '../sim/world';

export interface Cell { x: number; y: number; code: number }
export interface Genome { cells: Cell[]; ip: { x: number; y: number }; dir: number }

// Glyph weights for random cells: lean toward sensing and actions so random programs
// have a chance of doing something.
const WEIGHTS: Record<string, number> = {
  '.': 1, '>': 1, '<': 1, '^': 1, 'v': 1, '_': 0.7, '|': 0.7, '#': 0.5, '?': 0.5, '@': 0.2,
  r: 0.5, '[': 0.5, ']': 0.5, ':': 1, '\\': 1, $: 1, o: 1, '+': 0.6, '-': 0.6, '*': 0.4,
  '/': 0.3, '%': 0.3, '!': 0.6, '`': 0.5, '=': 0.4, "'": 0.4, y: 0.6, s: 0.3, m: 0.3, f: 0.2,
  d: 0.5, e: 0.8, L: 0.8, S: 2, R: 0.6, T: 2, M: 2, F: 0.6, X: 0.4, G: 0.8, C: 2, B: 1.5, W: 1.5,
};
for (let d = 0; d <= 9; d++) WEIGHTS[String(d)] = 0.35;
const TABLE: [number, number][] = [...GLYPHS].map((g, i) => [i, WEIGHTS[g] ?? 0.3]);
const TOTAL = TABLE.reduce((a, [, w]) => a + w, 0);

export function randomCode(rng: Rng): number {
  let r = rng() * TOTAL;
  for (const [c, w] of TABLE) if ((r -= w) <= 0) return c;
  return 0;
}

const pick = <T>(rng: Rng, xs: T[]): T => xs[Math.floor(rng() * xs.length)];
const key = (x: number, y: number) => `${x},${y}`;

export function clone(g: Genome): Genome {
  return { cells: g.cells.map((c) => ({ ...c })), ip: { ...g.ip }, dir: g.dir };
}

export function fromSpec(s: WarriorSpec): Genome {
  return { cells: s.cells.map((c) => ({ ...c })), ip: { ...s.ip }, dir: s.dir };
}

export function toSpec(g: Genome, name: string): WarriorSpec {
  const text = toText(g, name);
  const xs = g.cells.map((c) => c.x), ys = g.cells.map((c) => c.y);
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  return {
    name, dir: g.dir, ip: { x: g.ip.x - x0, y: g.ip.y - y0 },
    cells: g.cells.map((c) => ({ x: c.x - x0, y: c.y - y0, code: c.code })),
    width: Math.max(...xs) - x0 + 1, height: Math.max(...ys) - y0 + 1, source: text,
  };
}

export function toText(g: Genome, name: string, comments: string[] = []): string {
  const xs = g.cells.map((c) => c.x), ys = g.cells.map((c) => c.y);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
  const grid: string[][] = Array.from({ length: y1 - y0 + 1 }, () => Array(x1 - x0 + 1).fill(' '));
  for (const c of g.cells) grid[c.y - y0][c.x - x0] = GLYPHS[c.code];
  return [
    `name: ${name}`,
    ...comments.map((c) => `# ${c}`),
    `dir: ${DIR_NAMES[g.dir]}`,
    `ip: ${g.ip.x - x0} ${g.ip.y - y0}`,
    '---',
    ...grid.map((r) => r.join('').replace(/\s+$/, '')),
    '',
  ].join('\n');
}

/** Keep only the piece connected to the IP, then trim to the size limit (farthest first). */
export function repair(g: Genome): Genome {
  const at = new Map(g.cells.map((c) => [key(c.x, c.y), c]));
  if (!at.has(key(g.ip.x, g.ip.y))) {
    const c = g.cells[0] ?? { x: 0, y: 0, code: 0 };
    if (!g.cells.length) g.cells.push(c);
    g.ip = { x: c.x, y: c.y };
    at.set(key(c.x, c.y), c);
  }
  const order: Cell[] = [];
  const seen = new Set([key(g.ip.x, g.ip.y)]);
  const queue = [at.get(key(g.ip.x, g.ip.y))!];
  for (let q = 0; q < queue.length; q++) {
    const c = queue[q];
    order.push(c);
    for (let d = 0; d < 4; d++) {
      const k = key(c.x + DX[d], c.y + DY[d]);
      const n = at.get(k);
      if (n && !seen.has(k)) { seen.add(k); queue.push(n); }
    }
  }
  g.cells = order.slice(0, CONFIG.startSize);
  return g;
}

export function randomGenome(rng: Rng): Genome {
  const n = 6 + Math.floor(rng() * 15);
  const cells: Cell[] = [{ x: 0, y: 0, code: randomCode(rng) }];
  const taken = new Set([key(0, 0)]);
  // Grow mostly sideways: rows are loops, so wide bodies make runnable programs.
  const dirW = [0.35, 0.15, 0.35, 0.15];
  while (cells.length < n) {
    const from = pick(rng, cells);
    let r = rng(), d = 0;
    while ((r -= dirW[d]) > 0) d++;
    const x = from.x + DX[d], y = from.y + DY[d];
    if (taken.has(key(x, y)) || Math.abs(y) > 3) continue;
    taken.add(key(x, y));
    cells.push({ x, y, code: randomCode(rng) });
  }
  return { cells, ip: { x: 0, y: 0 }, dir: Math.floor(rng() * 4) };
}

function freeNeighbors(g: Genome): { x: number; y: number }[] {
  const taken = new Set(g.cells.map((c) => key(c.x, c.y)));
  const out: { x: number; y: number }[] = [];
  for (const c of g.cells) {
    for (let d = 0; d < 4; d++) {
      const x = c.x + DX[d], y = c.y + DY[d];
      if (!taken.has(key(x, y))) out.push({ x, y });
    }
  }
  return out;
}

const OPS: [string, number][] = [
  ['point', 4], ['add', 2], ['remove', 2], ['dupe', 1], ['swap', 1], ['ip', 0.5], ['dir', 0.5],
];
const OPS_TOTAL = OPS.reduce((a, [, w]) => a + w, 0);

/** One or more random edits (geometric count). Returns the names of the edits made. */
export function mutate(g: Genome, rng: Rng): string[] {
  const done: string[] = [];
  do {
    let r = rng() * OPS_TOTAL, op = OPS[0][0];
    for (const [name, w] of OPS) if ((r -= w) <= 0) { op = name; break; }
    switch (op) {
      case 'point': pick(rng, g.cells).code = randomCode(rng); break;
      case 'add':
      case 'dupe': {
        if (g.cells.length >= CONFIG.startSize) continue;
        const spot = pick(rng, freeNeighbors(g));
        g.cells.push({ ...spot, code: op === 'add' ? randomCode(rng) : pick(rng, g.cells).code });
        break;
      }
      case 'remove': {
        const others = g.cells.filter((c) => c.x !== g.ip.x || c.y !== g.ip.y);
        if (!others.length) continue;
        const victim = pick(rng, others);
        g.cells = g.cells.filter((c) => c !== victim);
        repair(g);
        break;
      }
      case 'swap': {
        const a = pick(rng, g.cells), b = pick(rng, g.cells);
        [a.code, b.code] = [b.code, a.code];
        break;
      }
      case 'ip': { const c = pick(rng, g.cells); g.ip = { x: c.x, y: c.y }; break; }
      case 'dir': g.dir = Math.floor(rng() * 4); break;
    }
    done.push(op);
  } while (rng() < 0.5);
  return done;
}

/**
 * 2D block crossover: line both parents up by their IP cells, take a random rectangle
 * from `b` and put it into `a` (cells b lacks inside the rectangle are removed).
 */
export function crossover(a: Genome, b: Genome, rng: Rng): Genome {
  const child = clone(a);
  const bx = b.cells.map((c) => c.x - b.ip.x), by = b.cells.map((c) => c.y - b.ip.y);
  const rx = [Math.min(...bx), Math.max(...bx)], ry = [Math.min(...by), Math.max(...by)];
  const span = (lo: number, hi: number) => {
    const p = lo + Math.floor(rng() * (hi - lo + 1)), q = lo + Math.floor(rng() * (hi - lo + 1));
    return [Math.min(p, q), Math.max(p, q)];
  };
  const [x0, x1] = span(rx[0], rx[1]), [y0, y1] = span(ry[0], ry[1]);
  const inRect = (x: number, y: number) =>
    x - child.ip.x >= x0 && x - child.ip.x <= x1 && y - child.ip.y >= y0 && y - child.ip.y <= y1;
  child.cells = child.cells.filter((c) => !inRect(c.x, c.y) || (c.x === child.ip.x && c.y === child.ip.y));
  for (const c of b.cells) {
    const x = c.x - b.ip.x + child.ip.x, y = c.y - b.ip.y + child.ip.y;
    if (!inRect(x, y)) continue;
    const existing = child.cells.find((k) => k.x === x && k.y === y);
    if (existing) existing.code = c.code;
    else child.cells.push({ x, y, code: c.code });
  }
  return repair(child);
}

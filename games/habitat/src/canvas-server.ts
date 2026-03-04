// canvas-server.ts — Shared ASCII art canvas with color legend. No AI knowledge.

export const CANVAS_WIDTH = 40;
export const CANVAS_HEIGHT = 20;
export const EMPTY_CHAR = '.';

export const COLOR_LEGEND: Record<string, string> = {
  '.': '#1a1a2e',  // dark background
  ' ': '#000000',  // void/black
  '#': '#e0e0e0',  // white
  '@': '#4488cc',  // blue
  '*': '#ddcc44',  // yellow
  '~': '#44ccbb',  // cyan
  '+': '#44bb66',  // green
  '%': '#cc4444',  // red
  '&': '#bb44cc',  // magenta
  ':': '#cc8833',  // orange
  '=': '#7a6644',  // brown
  '^': '#88aacc',  // light blue
  'O': '#ffffff',  // bright white
  'X': '#222222',  // near black
};

export class CanvasServer {
  private grid: string[][];

  constructor() {
    this.grid = [];
    for (let y = 0; y < CANVAS_HEIGHT; y++) {
      this.grid.push(Array(CANVAS_WIDTH).fill(EMPTY_CHAR));
    }
  }

  /** Read the full canvas as a multi-line string. */
  read(): string {
    return this.grid.map(row => row.join('')).join('\n');
  }

  /** Read as a 2D array (for rendering). */
  readGrid(): string[][] {
    return this.grid.map(row => [...row]);
  }

  /** Get the color legend as a description string. */
  legend(): string {
    return Object.entries(COLOR_LEGEND)
      .map(([ch, color]) => `${ch === ' ' ? '(space)' : ch} = ${color}`)
      .join('\n');
  }

  /**
   * Paint a multi-line ASCII art block at position (x, y).
   * Space characters are transparent (don't overwrite).
   * Lines are clipped to canvas bounds.
   */
  paint(x: number, y: number, art: string): { painted: number } {
    const lines = art.split('\n');
    let painted = 0;

    for (let dy = 0; dy < lines.length; dy++) {
      const gy = y + dy;
      if (gy < 0 || gy >= CANVAS_HEIGHT) continue;
      for (let dx = 0; dx < lines[dy].length; dx++) {
        const gx = x + dx;
        if (gx < 0 || gx >= CANVAS_WIDTH) continue;
        const ch = lines[dy][dx];
        if (ch === ' ') continue; // transparent
        this.grid[gy][gx] = ch;
        painted++;
      }
    }

    console.log(`[CANVAS] paint at (${x},${y}): ${painted} chars`);
    return { painted };
  }

  /** Clear the canvas to empty. */
  clear(): void {
    for (let y = 0; y < CANVAS_HEIGHT; y++) {
      for (let x = 0; x < CANVAS_WIDTH; x++) {
        this.grid[y][x] = EMPTY_CHAR;
      }
    }
    console.log('[CANVAS] cleared');
  }
}

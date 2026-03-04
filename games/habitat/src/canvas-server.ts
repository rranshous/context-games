// canvas-server.ts — Shared ASCII art canvas. Pure text, no color mapping. No AI knowledge.

export const CANVAS_WIDTH = 40;
export const CANVAS_HEIGHT = 20;

const BLANK = Array(CANVAS_HEIGHT).fill('.'.repeat(CANVAS_WIDTH)).join('\n');

export class CanvasServer {
  private content: string = BLANK;

  /** Read the full canvas as a multi-line string. */
  read(): string {
    return this.content;
  }

  /** Replace the entire canvas with new ASCII art. Pads/clips to 40×20. */
  paint(art: string): void {
    const lines = art.split('\n').slice(0, CANVAS_HEIGHT);
    const padded: string[] = [];
    for (let y = 0; y < CANVAS_HEIGHT; y++) {
      const line = lines[y] || '';
      padded.push(line.substring(0, CANVAS_WIDTH).padEnd(CANVAS_WIDTH));
    }
    this.content = padded.join('\n');
    console.log(`[CANVAS] painted (${art.length} chars input)`);
  }

  /** Clear the canvas to blank. */
  clear(): void {
    this.content = BLANK;
    console.log('[CANVAS] cleared');
  }

  toJSON(): string {
    return this.content;
  }

  static fromJSON(data: string): CanvasServer {
    const server = new CanvasServer();
    server.content = data;
    return server;
  }
}

// renderer.ts — Top-down canvas rendering

import {
  type GameState, type Unit, type Side,
  MAP_W, MAP_H, TILE_SIZE, CASTLE_WIDTH, CASTLE_HP,
  UNIT_STATS,
} from '../shared/types.js';

const CANVAS_W = MAP_W * TILE_SIZE;  // 720
const CANVAS_H = MAP_H * TILE_SIZE;  // 480

// Colors
const BG_COLOR = '#1a2a1a';
const GRID_COLOR = '#223322';
const CASTLE_LEFT_COLOR = '#4466cc';
const CASTLE_RIGHT_COLOR = '#cc4444';
const CASTLE_LEFT_DMG = '#223366';
const CASTLE_RIGHT_DMG = '#662222';

const UNIT_COLORS: Record<string, Record<string, string>> = {
  left: {
    peasant: '#6699ff',
    knight: '#3355cc',
    archer: '#55bbff',
    catapult: '#2244aa',
    jester: '#aa77ff',
  },
  right: {
    peasant: '#ff6666',
    knight: '#cc3333',
    archer: '#ff8855',
    catapult: '#aa2222',
    jester: '#ff77aa',
  },
};

const UNIT_RADIUS: Record<string, number> = {
  peasant: 4,
  knight: 7,
  archer: 5,
  catapult: 8,
  jester: 5,
};

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  selectedUnitIds: Set<number> = new Set();
  selectionBox: { x1: number; y1: number; x2: number; y2: number } | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    this.ctx = canvas.getContext('2d')!;
  }

  get width() { return CANVAS_W; }
  get height() { return CANVAS_H; }

  // Convert tile coords to pixel
  tileToPixel(tx: number, ty: number): [number, number] {
    return [tx * TILE_SIZE, ty * TILE_SIZE];
  }

  // Convert pixel to tile coords
  pixelToTile(px: number, py: number): [number, number] {
    return [px / TILE_SIZE, py / TILE_SIZE];
  }

  render(game: GameState): void {
    const ctx = this.ctx;

    // Background
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Subtle grid
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= MAP_W; x++) {
      ctx.beginPath();
      ctx.moveTo(x * TILE_SIZE, 0);
      ctx.lineTo(x * TILE_SIZE, CANVAS_H);
      ctx.stroke();
    }
    for (let y = 0; y <= MAP_H; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * TILE_SIZE);
      ctx.lineTo(CANVAS_W, y * TILE_SIZE);
      ctx.stroke();
    }

    // Castles
    this.drawCastle(ctx, 'left', game.players.left?.castle ?? CASTLE_HP);
    this.drawCastle(ctx, 'right', game.players.right?.castle ?? CASTLE_HP);

    // Units
    for (const unit of game.units) {
      this.drawUnit(ctx, unit, game);
    }

    // Selection box
    if (this.selectionBox) {
      const { x1, y1, x2, y2 } = this.selectionBox;
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(
        Math.min(x1, x2), Math.min(y1, y2),
        Math.abs(x2 - x1), Math.abs(y2 - y1),
      );
      ctx.setLineDash([]);
    }

    // Game phase overlay
    if (game.phase === 'lobby') {
      this.drawOverlay(ctx, 'Waiting for opponent...');
    } else if (game.phase === 'finished') {
      const msg = game.winner === 'draw' ? 'DRAW!' : `${game.winner} WINS!`;
      this.drawOverlay(ctx, msg, 'Press SPACE or R to rematch');
    }
  }

  private drawCastle(ctx: CanvasRenderingContext2D, side: Side, hp: number): void {
    const hpFrac = hp / CASTLE_HP;
    const x = side === 'left' ? 0 : (MAP_W - CASTLE_WIDTH) * TILE_SIZE;
    const w = CASTLE_WIDTH * TILE_SIZE;

    // Castle body
    const baseColor = side === 'left' ? CASTLE_LEFT_COLOR : CASTLE_RIGHT_COLOR;
    const dmgColor = side === 'left' ? CASTLE_LEFT_DMG : CASTLE_RIGHT_DMG;
    ctx.fillStyle = hpFrac > 0.5 ? baseColor : dmgColor;
    ctx.fillRect(x, 0, w, CANVAS_H);

    // Castle border
    ctx.strokeStyle = baseColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, 1, w - 2, CANVAS_H - 2);

    // Battlements (crenellations along the inner edge)
    const innerX = side === 'left' ? x + w - TILE_SIZE / 2 : x;
    ctx.fillStyle = baseColor;
    for (let y = 0; y < MAP_H; y += 2) {
      ctx.fillRect(innerX, y * TILE_SIZE, TILE_SIZE / 2, TILE_SIZE);
    }

    // HP bar
    const barX = x + 4;
    const barY = 4;
    const barW = w - 8;
    const barH = 8;
    ctx.fillStyle = '#000';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = hpFrac > 0.3 ? '#44cc44' : '#cc4444';
    ctx.fillRect(barX, barY, barW * hpFrac, barH);
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barW, barH);

    // HP text
    ctx.fillStyle = '#fff';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.ceil(hp)}`, x + w / 2, barY + barH + 12);
  }

  private drawUnit(ctx: CanvasRenderingContext2D, unit: Unit, game: GameState): void {
    const [px, py] = this.tileToPixel(unit.x, unit.y);
    const r = UNIT_RADIUS[unit.type] ?? 5;
    const color = UNIT_COLORS[unit.owner]?.[unit.type] ?? '#fff';
    const selected = this.selectedUnitIds.has(unit.id);

    // Selection ring
    if (selected) {
      ctx.beginPath();
      ctx.arc(px, py, r + 3, 0, Math.PI * 2);
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Unit body
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // Confusion indicator
    if (unit.confused) {
      ctx.beginPath();
      ctx.arc(px, py, r + 2, 0, Math.PI * 2);
      ctx.strokeStyle = '#ff00ff';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([2, 2]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Unit type icon (simple shape overlay)
    ctx.fillStyle = '#fff';
    ctx.font = `${r}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const icons: Record<string, string> = {
      peasant: 'P',
      knight: 'K',
      archer: 'A',
      catapult: 'C',
      jester: 'J',
    };
    ctx.fillText(icons[unit.type] ?? '?', px, py + 1);

    // HP bar (only if damaged)
    if (unit.hp < unit.maxHp) {
      const barW = r * 2 + 2;
      const barH = 2;
      const barX = px - barW / 2;
      const barY = py - r - 5;
      const frac = unit.hp / unit.maxHp;
      ctx.fillStyle = '#000';
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = frac > 0.3 ? '#44cc44' : '#cc4444';
      ctx.fillRect(barX, barY, barW * frac, barH);
    }

    // Attack range indicator for selected ranged units
    if (selected && UNIT_STATS[unit.type].range > 1) {
      ctx.beginPath();
      ctx.arc(px, py, UNIT_STATS[unit.type].range * TILE_SIZE, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,100,0.2)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  private drawOverlay(ctx: CanvasRenderingContext2D, text: string, subtitle?: string): void {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, CANVAS_H / 2 - 40, CANVAS_W, 80);
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, CANVAS_W / 2, CANVAS_H / 2 - 8);
    if (subtitle) {
      ctx.fillStyle = '#aaa';
      ctx.font = '12px monospace';
      ctx.fillText(subtitle, CANVAS_W / 2, CANVAS_H / 2 + 18);
    }
  }

  // Hit-test: find unit at pixel coords
  unitAtPixel(game: GameState, px: number, py: number): Unit | null {
    for (let i = game.units.length - 1; i >= 0; i--) {
      const u = game.units[i];
      const [ux, uy] = this.tileToPixel(u.x, u.y);
      const r = (UNIT_RADIUS[u.type] ?? 5) + 2;
      if (Math.abs(px - ux) <= r && Math.abs(py - uy) <= r) {
        return u;
      }
    }
    return null;
  }

  // Box-select: find all units in pixel rect
  unitsInRect(game: GameState, x1: number, y1: number, x2: number, y2: number, side: Side): Unit[] {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    return game.units.filter(u => {
      if (u.owner !== side) return false;
      const [px, py] = this.tileToPixel(u.x, u.y);
      return px >= minX && px <= maxX && py >= minY && py <= maxY;
    });
  }
}

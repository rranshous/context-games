// renderer.ts — Top-down canvas rendering with terrain, fog, mines, abilities

import {
  type GameState, type Unit, type Side, type GoldMine, type Terrain,
  MAP_W, MAP_H, TILE_SIZE, CASTLE_WIDTH, CASTLE_HP,
  UNIT_STATS, TERRAIN_PROPS,
} from '../shared/types.js';

const CANVAS_W = MAP_W * TILE_SIZE;
const CANVAS_H = MAP_H * TILE_SIZE;

// Terrain colors
const TERRAIN_COLORS: Record<Terrain, string> = {
  open:   '#1a2a1a',
  forest: '#0d3d0d',
  hill:   '#3a3a1a',
  wall:   '#444444',
  water:  '#1a2a4a',
};

const TERRAIN_DETAIL: Record<Terrain, string> = {
  open:   '',
  forest: '♣',
  hill:   '▲',
  wall:   '█',
  water:  '~',
};

// Unit colors
const UNIT_COLORS: Record<string, Record<string, string>> = {
  left: {
    peasant: '#6699ff', knight: '#3355cc', archer: '#55bbff',
    catapult: '#2244aa', jester: '#aa77ff',
  },
  right: {
    peasant: '#ff6666', knight: '#cc3333', archer: '#ff8855',
    catapult: '#aa2222', jester: '#ff77aa',
  },
  neutral: {
    peasant: '#cccc44', knight: '#cccc44', archer: '#cccc44',
    catapult: '#cccc44', jester: '#cccc44',
  },
};

const UNIT_RADIUS: Record<string, number> = {
  peasant: 4, knight: 7, archer: 5, catapult: 8, jester: 5,
};

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  selectedUnitIds: Set<number> = new Set();
  selectionBox: { x1: number; y1: number; x2: number; y2: number } | null = null;
  playerSide: Side = 'left';

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    this.ctx = canvas.getContext('2d')!;
  }

  get width() { return CANVAS_W; }
  get height() { return CANVAS_H; }

  tileToPixel(tx: number, ty: number): [number, number] {
    return [tx * TILE_SIZE, ty * TILE_SIZE];
  }

  pixelToTile(px: number, py: number): [number, number] {
    return [px / TILE_SIZE, py / TILE_SIZE];
  }

  render(game: GameState): void {
    const ctx = this.ctx;

    // Draw terrain
    this.drawTerrain(ctx, game);

    // Draw mines
    this.drawMines(ctx, game);

    // Draw castles
    this.drawCastle(ctx, 'left', game.players.left?.castle ?? CASTLE_HP, game);
    this.drawCastle(ctx, 'right', game.players.right?.castle ?? CASTLE_HP, game);

    // Draw units
    for (const unit of game.units) {
      this.drawUnit(ctx, unit, game);
    }

    // Selection box
    if (this.selectionBox) {
      const { x1, y1, x2, y2 } = this.selectionBox;
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
      ctx.setLineDash([]);
    }

    // Active event banner
    if (game.activeEvent) {
      this.drawEventBanner(ctx, game.activeEvent.name);
    }

    // Game phase overlay
    if (game.phase === 'lobby') {
      this.drawOverlay(ctx, 'Waiting for opponent...');
    } else if (game.phase === 'finished') {
      const msg = game.winner === 'draw' ? 'DRAW!' : `${game.winner} WINS!`;
      this.drawOverlay(ctx, msg, 'Press SPACE or R to return to lobby');
    }
  }

  private drawTerrain(ctx: CanvasRenderingContext2D, game: GameState): void {
    if (!game.terrain || game.terrain.length === 0) {
      // Fallback: solid background
      ctx.fillStyle = '#1a2a1a';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      return;
    }

    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const terrain = game.terrain[y]?.[x] ?? 'open';
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;

        ctx.fillStyle = TERRAIN_COLORS[terrain];
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

        // Detail character
        const detail = TERRAIN_DETAIL[terrain];
        if (detail) {
          ctx.fillStyle = terrain === 'water' ? '#2a4a6a' :
                          terrain === 'forest' ? '#1a5a1a' :
                          terrain === 'hill' ? '#5a5a2a' :
                          '#666666';
          ctx.font = `${TILE_SIZE - 6}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(detail, px + TILE_SIZE / 2, py + TILE_SIZE / 2);
        }

        // Subtle grid
        ctx.strokeStyle = '#1a3a1a';
        ctx.lineWidth = 0.3;
        ctx.strokeRect(px, py, TILE_SIZE, TILE_SIZE);
      }
    }
  }

  private drawMines(ctx: CanvasRenderingContext2D, game: GameState): void {
    if (!game.mines) return;
    for (const mine of game.mines) {
      if (mine.remaining <= 0) continue;
      if (mine.remaining === -1) continue; // hidden by fog

      const [px, py] = this.tileToPixel(mine.x, mine.y);
      const r = 10;

      // Gold glow
      ctx.beginPath();
      ctx.arc(px, py, r + 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 215, 0, 0.15)';
      ctx.fill();

      // Mine body
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = mine.claimedBy === 'left' ? '#4466cc' :
                       mine.claimedBy === 'right' ? '#cc4444' : '#aa8800';
      ctx.fill();
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Gold icon
      ctx.fillStyle = '#ffd700';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', px, py);

      // Remaining text
      ctx.fillStyle = '#fff';
      ctx.font = '7px monospace';
      ctx.fillText(`${Math.floor(mine.remaining)}`, px, py + r + 6);

      // Worker count
      if (mine.workerIds.length > 0) {
        ctx.fillStyle = '#aaffaa';
        ctx.fillText(`⛏${mine.workerIds.length}`, px, py - r - 4);
      }
    }
  }

  private drawCastle(ctx: CanvasRenderingContext2D, side: Side, hp: number, game: GameState): void {
    const hpFrac = hp / CASTLE_HP;
    const x = side === 'left' ? 0 : (MAP_W - CASTLE_WIDTH) * TILE_SIZE;
    const w = CASTLE_WIDTH * TILE_SIZE;

    const baseColor = side === 'left' ? '#4466cc' : '#cc4444';
    const dmgColor = side === 'left' ? '#223366' : '#662222';
    ctx.fillStyle = hpFrac > 0.5 ? baseColor : dmgColor;
    ctx.fillRect(x, 0, w, CANVAS_H);

    ctx.strokeStyle = baseColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, 1, w - 2, CANVAS_H - 2);

    // Battlements
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

    ctx.fillStyle = '#fff';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.ceil(hp)}`, x + w / 2, barY + barH + 12);

    // Show upgrades as small icons
    const player = game.players[side];
    if (player && player.upgrades.length > 0) {
      ctx.fillStyle = '#ffd700';
      ctx.font = '7px monospace';
      ctx.fillText(`★${player.upgrades.length}`, x + w / 2, barY + barH + 22);
    }

    // Research in progress
    if (player?.researching) {
      const remaining = Math.max(0, (player.researching.completeTick - game.tick) / 20);
      ctx.fillStyle = '#ffaa00';
      ctx.font = '7px monospace';
      ctx.fillText(`⚙${Math.ceil(remaining)}s`, x + w / 2, barY + barH + 32);
    }
  }

  private drawUnit(ctx: CanvasRenderingContext2D, unit: Unit, game: GameState): void {
    const [px, py] = this.tileToPixel(unit.x, unit.y);
    const r = UNIT_RADIUS[unit.type] ?? 5;
    const color = UNIT_COLORS[unit.owner]?.[unit.type] ?? '#fff';
    const selected = this.selectedUnitIds.has(unit.id);

    // Decoy: ghostly appearance
    if (unit.isDecoy) {
      ctx.globalAlpha = 0.5;
    }

    // Ability active glow
    if (unit.abilityActive) {
      ctx.beginPath();
      ctx.arc(px, py, r + 5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 100, 0.2)';
      ctx.fill();
    }

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

    // Mining indicator
    if (unit.state === 'mining') {
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Fortified indicator
    if (unit.state === 'fortified') {
      ctx.beginPath();
      ctx.arc(px, py, r + 2, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

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

    // Slow indicator
    if (unit.slowed) {
      ctx.beginPath();
      ctx.arc(px, py, r + 2, 0, Math.PI * 2);
      ctx.strokeStyle = '#00aaff';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([2, 2]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Type letter
    ctx.fillStyle = '#fff';
    ctx.font = `${r}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const icons: Record<string, string> = {
      peasant: 'P', knight: 'K', archer: 'A', catapult: 'C', jester: 'J',
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

    // Ability cooldown indicator (small dot)
    if (unit.abilityCooldown <= 0 && unit.owner === this.playerSide) {
      ctx.beginPath();
      ctx.arc(px + r + 2, py - r, 2, 0, Math.PI * 2);
      ctx.fillStyle = '#00ff88';
      ctx.fill();
    }

    // Range indicator for selected ranged units
    if (selected && UNIT_STATS[unit.type].range > 1) {
      ctx.beginPath();
      ctx.arc(px, py, UNIT_STATS[unit.type].range * TILE_SIZE, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,100,0.15)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.globalAlpha = 1.0;
  }

  private drawEventBanner(ctx: CanvasRenderingContext2D, name: string): void {
    ctx.fillStyle = 'rgba(255, 215, 0, 0.15)';
    ctx.fillRect(0, 0, CANVAS_W, 20);
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`⚡ ${name} ⚡`, CANVAS_W / 2, 10);
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

  unitAtPixel(game: GameState, px: number, py: number): Unit | null {
    for (let i = game.units.length - 1; i >= 0; i--) {
      const u = game.units[i];
      const [ux, uy] = this.tileToPixel(u.x, u.y);
      const r = (UNIT_RADIUS[u.type] ?? 5) + 2;
      if (Math.abs(px - ux) <= r && Math.abs(py - uy) <= r) return u;
    }
    return null;
  }

  mineAtPixel(game: GameState, px: number, py: number): GoldMine | null {
    if (!game.mines) return null;
    for (const mine of game.mines) {
      if (mine.remaining <= 0) continue;
      const [mx, my] = this.tileToPixel(mine.x, mine.y);
      if (Math.abs(px - mx) <= 12 && Math.abs(py - my) <= 12) return mine;
    }
    return null;
  }

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

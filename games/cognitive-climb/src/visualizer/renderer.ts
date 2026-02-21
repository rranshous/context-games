import type { WorldState, CreatureState, CellState, TerrainType, SimStats } from '../interface/state.js';

// ── Terrain colors ───────────────────────────────────────

const TERRAIN_COLORS: Record<TerrainType, string> = {
  grass: '#4a7c3f',
  forest: '#2d5a27',
  water: '#2a5c8f',
  rock: '#6b6b6b',
  sand: '#c4a954',
};

const FOOD_COLOR = '#e8d44d';

// ── Renderer ─────────────────────────────────────────────

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private state: WorldState | null = null;
  private stats: SimStats | null = null;
  private cellSize: number = 10;
  private animFrame: number = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.startRenderLoop();
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);

    // Recalculate cell size to fit world
    if (this.state) {
      const maxW = rect.width / this.state.width;
      const maxH = (rect.height - 70) / this.state.height; // reserve space for stats
      this.cellSize = Math.max(2, Math.floor(Math.min(maxW, maxH)));
    }
  }

  updateState(state: WorldState): void {
    this.state = state;
    this.stats = state.stats;

    // Recalculate cell size on first state
    const rect = this.canvas.getBoundingClientRect();
    const maxW = rect.width / state.width;
    const maxH = (rect.height - 70) / state.height;
    this.cellSize = Math.max(2, Math.floor(Math.min(maxW, maxH)));
  }

  updateStats(stats: SimStats): void {
    this.stats = stats;
  }

  private startRenderLoop(): void {
    const render = () => {
      this.draw();
      this.animFrame = requestAnimationFrame(render);
    };
    this.animFrame = requestAnimationFrame(render);
  }

  private draw(): void {
    const { ctx } = this;
    const rect = this.canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);

    if (!this.state) {
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, rect.width, rect.height);
      ctx.fillStyle = '#aaa';
      ctx.font = '16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Starting simulation...', rect.width / 2, rect.height / 2);
      return;
    }

    const s = this.cellSize;
    const offsetX = Math.floor((rect.width - s * this.state.width) / 2);
    const offsetY = 10;

    // Draw terrain
    for (let y = 0; y < this.state.height; y++) {
      for (let x = 0; x < this.state.width; x++) {
        const cell = this.state.cells[y * this.state.width + x];
        ctx.fillStyle = TERRAIN_COLORS[cell.terrain];
        ctx.fillRect(offsetX + x * s, offsetY + y * s, s, s);

        // Hazard overlay — red tint
        if (cell.danger > 0) {
          const alpha = Math.min(0.5, cell.danger * 0.12);
          ctx.fillStyle = `rgba(200, 30, 30, ${alpha})`;
          ctx.fillRect(offsetX + x * s, offsetY + y * s, s, s);
        }

        // Food indicators
        if (cell.food > 0) {
          ctx.fillStyle = FOOD_COLOR;
          const foodSize = Math.min(s * 0.6, 2 + cell.food);
          const pad = (s - foodSize) / 2;
          ctx.fillRect(
            offsetX + x * s + pad,
            offsetY + y * s + pad,
            foodSize,
            foodSize,
          );
        }
      }
    }

    // Draw grid lines (only if cells are big enough)
    if (s >= 6) {
      ctx.strokeStyle = 'rgba(0,0,0,0.1)';
      ctx.lineWidth = 0.5;
      for (let x = 0; x <= this.state.width; x++) {
        ctx.beginPath();
        ctx.moveTo(offsetX + x * s, offsetY);
        ctx.lineTo(offsetX + x * s, offsetY + this.state.height * s);
        ctx.stroke();
      }
      for (let y = 0; y <= this.state.height; y++) {
        ctx.beginPath();
        ctx.moveTo(offsetX, offsetY + y * s);
        ctx.lineTo(offsetX + this.state.width * s, offsetY + y * s);
        ctx.stroke();
      }
    }

    // Draw creatures
    for (const creature of this.state.creatures) {
      this.drawCreature(ctx, creature, offsetX, offsetY, s);
    }

    // Draw stats overlay
    this.drawStats(ctx, rect.width, offsetY + this.state.height * s + 10);
  }

  private drawCreature(
    ctx: CanvasRenderingContext2D,
    c: CreatureState,
    ox: number,
    oy: number,
    s: number,
  ): void {
    const cx = ox + c.x * s + s / 2;
    const cy = oy + c.y * s + s / 2;
    const radius = Math.max(2, (s * 0.35) * (0.5 + c.genome.size * 0.35));

    // Thinking glow — blue pulsing aura
    if (c.thinking) {
      const pulsePhase = (Date.now() % 1000) / 1000;
      const pulseAlpha = 0.3 + Math.sin(pulsePhase * Math.PI * 2) * 0.2;
      ctx.fillStyle = `rgba(100, 180, 255, ${pulseAlpha})`;
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Color based on diet: green = herbivore, red = carnivore
    const r = Math.floor(c.genome.diet * 220 + 30);
    const g = Math.floor((1 - c.genome.diet) * 180 + 40);
    const b = 60;

    // Brightness based on energy
    const brightness = 0.3 + c.energy / c.maxEnergy * 0.7;

    ctx.fillStyle = `rgb(${Math.floor(r * brightness)}, ${Math.floor(g * brightness)}, ${Math.floor(b * brightness)})`;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    // Energy ring
    ctx.strokeStyle = c.energy / c.maxEnergy > 0.3 ? 'rgba(255,255,255,0.4)' : 'rgba(255,60,60,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 1, 0, Math.PI * 2 * (c.energy / c.maxEnergy));
    ctx.stroke();
  }

  private drawStats(ctx: CanvasRenderingContext2D, width: number, y: number): void {
    if (!this.stats) return;

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, y - 5, width, 60);

    ctx.font = '12px monospace';
    ctx.textAlign = 'left';

    const s = this.stats;

    // Line 1: population
    ctx.fillStyle = '#ddd';
    const deaths = s.deathsByStarvation !== undefined
      ? `Died: ${s.totalDeaths} (${s.deathsByStarvation}☠ ${s.deathsByHazard}⚡)`
      : `Died: ${s.totalDeaths}`;
    ctx.fillText(`Tick: ${s.tick}  |  Alive: ${s.creatureCount}  |  Born: ${s.totalBirths}  |  ${deaths}  |  Energy: ${s.avgEnergy}  |  Gen: ${s.maxGeneration}`, 10, y + 12);

    // Line 2: trait averages (evolution tracking)
    if (s.avgTraits) {
      const t = s.avgTraits;
      ctx.fillStyle = '#999';
      ctx.fillText(`Traits — spd: ${t.speed}  sns: ${t.senseRange}  sz: ${t.size}  met: ${t.metabolism}  diet: ${t.diet}`, 10, y + 28);
    }
  }

  destroy(): void {
    cancelAnimationFrame(this.animFrame);
  }
}

import { CONFIG } from './config';
import { Position, TerrainEffect, Obstacle } from './types';
import { Camera } from './camera';
import { renderCactus, renderRock, renderTexturedSandTile, renderWaterTile, spritesLoaded } from './sprites';

interface RoadSegment {
  x1: number; y1: number;
  x2: number; y2: number;
  width: number;
}

interface CactusPoint {
  x: number;
  y: number;
}

const AVOIDANCE_CELL = 64;

export class DesertWorld {
  readonly width = CONFIG.WORLD.WIDTH;
  readonly height = CONFIG.WORLD.HEIGHT;

  private waterOases_: TerrainEffect[] = [];
  get oases(): ReadonlyArray<{ x: number; y: number; radius: number }> { return this.waterOases__; }
  private rocks: Obstacle[] = [];
  private cactusGroves: CactusPoint[][] = [];
  private texturedSand: TerrainEffect[] = [];
  private roads: RoadSegment[] = [];

  // Avoidance grid — stores combined push vectors per cell
  private avoidGridCols: number;
  private avoidGridRows: number;
  private avoidGrid: (Position | null)[];

  constructor() {
    this.avoidGridCols = Math.ceil(this.width / AVOIDANCE_CELL);
    this.avoidGridRows = Math.ceil(this.height / AVOIDANCE_CELL);
    this.avoidGrid = new Array(this.avoidGridCols * this.avoidGridRows).fill(null);

    this.generateWater();
    this.generateRocks();
    this.generateCactusGroves();
    this.generateTexturedSand();
    this.generateRoads();
    this.buildAvoidanceGrid();
  }

  // --- Generation ---

  private generateWater(): void {
    for (let i = 0; i < CONFIG.DESERT.WATER_COUNT; i++) {
      const radius = 50 + Math.random() * 70;
      const x = radius + Math.random() * (this.width - radius * 2);
      const y = radius + Math.random() * (this.height - radius * 2);
      this.waterOases_.push({
        type: 'water',
        x, y, radius,
        slowdown: 0.15,
      });
    }
  }

  private generateRocks(): void {
    for (let i = 0; i < CONFIG.DESERT.ROCK_COUNT; i++) {
      const radius = 16;
      const x = radius + Math.random() * (this.width - radius * 2);
      const y = radius + Math.random() * (this.height - radius * 2);
      // Don't place rocks inside water
      let inWater = false;
      for (const w of this.waterOases_) {
        const dx = x - w.x;
        const dy = y - w.y;
        if (Math.sqrt(dx * dx + dy * dy) < w.radius + radius) {
          inWater = true;
          break;
        }
      }
      if (!inWater) {
        this.rocks.push({ x, y, radius, type: 'rock' });
      }
    }
  }

  private generateCactusGroves(): void {
    for (let i = 0; i < CONFIG.DESERT.CACTUS_GROVE_COUNT; i++) {
      const cx = 100 + Math.random() * (this.width - 200);
      const cy = 100 + Math.random() * (this.height - 200);
      const count = 3 + Math.floor(Math.random() * 10);
      const grove: CactusPoint[] = [];
      for (let j = 0; j < count; j++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * 60;
        grove.push({
          x: cx + Math.cos(angle) * dist,
          y: cy + Math.sin(angle) * dist,
        });
      }
      this.cactusGroves.push(grove);
    }
  }

  private generateTexturedSand(): void {
    for (let i = 0; i < CONFIG.DESERT.TEXTURED_SAND_COUNT; i++) {
      const radius = 50 + Math.random() * 90;
      const x = radius + Math.random() * (this.width - radius * 2);
      const y = radius + Math.random() * (this.height - radius * 2);
      this.texturedSand.push({
        type: 'textured_sand',
        x, y, radius,
        slowdown: 0.4,
      });
    }
  }

  private generateRoads(): void {
    // Generate random waypoints and connect them
    const points: Position[] = [];
    const count = CONFIG.DESERT.ROAD_SEGMENTS + 2;
    for (let i = 0; i < count; i++) {
      points.push({
        x: 200 + Math.random() * (this.width - 400),
        y: 200 + Math.random() * (this.height - 400),
      });
    }
    // Connect consecutive points
    for (let i = 0; i < points.length - 1; i++) {
      this.roads.push({
        x1: points[i].x,
        y1: points[i].y,
        x2: points[i + 1].x,
        y2: points[i + 1].y,
        width: 40,
      });
    }
  }

  private buildAvoidanceGrid(): void {
    // For each obstacle, mark nearby cells with push-away vectors
    const allObstacles: Array<{ x: number; y: number; radius: number }> = [
      ...this.rocks,
      ...this.waterOases_.map(w => ({ x: w.x, y: w.y, radius: w.radius })),
    ];

    for (const obs of allObstacles) {
      const margin = obs.radius + 40; // push starts this far out
      const minCol = Math.max(0, Math.floor((obs.x - margin) / AVOIDANCE_CELL));
      const maxCol = Math.min(this.avoidGridCols - 1, Math.floor((obs.x + margin) / AVOIDANCE_CELL));
      const minRow = Math.max(0, Math.floor((obs.y - margin) / AVOIDANCE_CELL));
      const maxRow = Math.min(this.avoidGridRows - 1, Math.floor((obs.y + margin) / AVOIDANCE_CELL));

      for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
          const cellX = (c + 0.5) * AVOIDANCE_CELL;
          const cellY = (r + 0.5) * AVOIDANCE_CELL;
          const dx = cellX - obs.x;
          const dy = cellY - obs.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < margin && dist > 0.01) {
            const strength = 1 - dist / margin;
            const nx = (dx / dist) * strength;
            const ny = (dy / dist) * strength;
            const idx = r * this.avoidGridCols + c;
            const existing = this.avoidGrid[idx];
            if (existing) {
              existing.x += nx;
              existing.y += ny;
            } else {
              this.avoidGrid[idx] = { x: nx, y: ny };
            }
          }
        }
      }
    }
  }

  // --- Queries ---

  getTerrainEffect(x: number, y: number): number {
    // Check water first (strongest slowdown)
    for (const w of this.waterOases_) {
      const dx = x - w.x;
      const dy = y - w.y;
      if (dx * dx + dy * dy < w.radius * w.radius) {
        return w.slowdown;
      }
    }

    // Check roads (faster travel)
    for (const road of this.roads) {
      const dist = this.pointToSegmentDist(x, y, road.x1, road.y1, road.x2, road.y2);
      if (dist < road.width * 0.5) {
        return 0.9;
      }
    }

    // Check textured sand
    for (const ts of this.texturedSand) {
      const dx = x - ts.x;
      const dy = y - ts.y;
      if (dx * dx + dy * dy < ts.radius * ts.radius) {
        return ts.slowdown;
      }
    }

    // Default sand — full speed
    return 1.0;
  }

  getAvoidanceVector(pos: Position): Position | null {
    const col = Math.floor(pos.x / AVOIDANCE_CELL);
    const row = Math.floor(pos.y / AVOIDANCE_CELL);
    if (col < 0 || col >= this.avoidGridCols || row < 0 || row >= this.avoidGridRows) {
      return null;
    }
    return this.avoidGrid[row * this.avoidGridCols + col];
  }

  checkObstacleCollision(x: number, y: number, radius: number): Obstacle | null {
    for (const rock of this.rocks) {
      const dx = x - rock.x;
      const dy = y - rock.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < rock.radius + radius) {
        return rock;
      }
    }
    // Water edges act as soft obstacles at shore
    for (const w of this.waterOases_) {
      const dx = x - w.x;
      const dy = y - w.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // Only collide at the very center of deep water
      if (dist < w.radius * 0.3 + radius) {
        return { x: w.x, y: w.y, radius: w.radius * 0.3, type: 'water' };
      }
    }
    return null;
  }

  getObjectivePosition(): Position {
    // Pick a random location far from center
    const cx = this.width / 2;
    const cy = this.height / 2;
    const margin = 300;
    let bestPos: Position = { x: margin, y: margin };
    let bestDist = 0;

    for (let attempt = 0; attempt < 20; attempt++) {
      const x = margin + Math.random() * (this.width - margin * 2);
      const y = margin + Math.random() * (this.height - margin * 2);
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Must be far from center and not inside an obstacle
      if (dist > bestDist && !this.checkObstacleCollision(x, y, 30)) {
        bestDist = dist;
        bestPos = { x, y };
      }
    }

    return bestPos;
  }

  // --- Rendering ---

  render(ctx: CanvasRenderingContext2D, camera: Camera): void {
    const margin = 200;

    // 1. Sand base — matches sprite tile background (#efb681)
    ctx.fillStyle = '#efb681';
    ctx.fillRect(0, 0, CONFIG.CANVAS.WIDTH, CONFIG.CANVAS.HEIGHT);

    // 2. Textured sand patches — tile with sprite or fall back to solid circle
    const TILE_STEP = 32; // sprite tile is 32px on screen at 2× scale
    for (const ts of this.texturedSand) {
      if (!camera.isVisible(ts.x, ts.y, ts.radius + margin)) continue;
      if (spritesLoaded()) {
        // Fill the circular patch with textured sand tiles
        const r = ts.radius;
        for (let dy = -r; dy <= r; dy += TILE_STEP) {
          for (let dx = -r; dx <= r; dx += TILE_STEP) {
            if (dx * dx + dy * dy > r * r) continue;
            const wx = ts.x + dx;
            const wy = ts.y + dy;
            if (!camera.isVisible(wx, wy, TILE_STEP)) continue;
            const screen = camera.worldToScreen(wx, wy);
            renderTexturedSandTile(ctx, screen.x, screen.y);
          }
        }
      } else {
        const screen = camera.worldToScreen(ts.x, ts.y);
        ctx.fillStyle = '#d9a06a';
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, ts.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 3. Road segments — lighter, dusty road
    ctx.strokeStyle = '#f5cfa0';
    ctx.lineWidth = 40;
    ctx.lineCap = 'round';
    for (const road of this.roads) {
      // Check if either endpoint is visible
      if (!camera.isVisible(road.x1, road.y1, margin) &&
          !camera.isVisible(road.x2, road.y2, margin)) continue;
      const s1 = camera.worldToScreen(road.x1, road.y1);
      const s2 = camera.worldToScreen(road.x2, road.y2);
      ctx.beginPath();
      ctx.moveTo(s1.x, s1.y);
      ctx.lineTo(s2.x, s2.y);
      ctx.stroke();
    }

    // 4. Water oases — textured sand border + tiled water (like raceon)
    for (const w of this.waterOases_) {
      if (!camera.isVisible(w.x, w.y, w.radius + margin)) continue;

      if (spritesLoaded()) {
        // Textured sand border ring (muddy shoreline)
        const borderRadius = w.radius + 25;
        for (let dy = -borderRadius; dy <= borderRadius; dy += TILE_STEP) {
          for (let dx = -borderRadius; dx <= borderRadius; dx += TILE_STEP) {
            const d2 = dx * dx + dy * dy;
            // Only in the border ring, not inside the water
            if (d2 > borderRadius * borderRadius || d2 < w.radius * w.radius * 0.8) continue;
            const wx = w.x + dx;
            const wy = w.y + dy;
            if (!camera.isVisible(wx, wy, TILE_STEP)) continue;
            const screen = camera.worldToScreen(wx, wy);
            renderTexturedSandTile(ctx, screen.x, screen.y);
          }
        }
        // Water body — tiled with water sprite
        const r = w.radius;
        for (let dy = -r; dy <= r; dy += TILE_STEP) {
          for (let dx = -r; dx <= r; dx += TILE_STEP) {
            if (dx * dx + dy * dy > r * r) continue;
            const wx = w.x + dx;
            const wy = w.y + dy;
            if (!camera.isVisible(wx, wy, TILE_STEP)) continue;
            const screen = camera.worldToScreen(wx, wy);
            renderWaterTile(ctx, screen.x, screen.y);
          }
        }
      } else {
        // Fallback: solid circles
        const screen = camera.worldToScreen(w.x, w.y);
        ctx.fillStyle = '#c08a50';
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, w.radius + 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#4a90c4';
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, w.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 5. Rock formations — shadow + sprite
    for (const rock of this.rocks) {
      if (!camera.isVisible(rock.x, rock.y, rock.radius + margin)) continue;
      const screen = camera.worldToScreen(rock.x, rock.y);
      // Ground shadow
      ctx.fillStyle = 'rgba(80, 70, 50, 0.25)';
      ctx.beginPath();
      ctx.ellipse(screen.x + 2, screen.y + 3, rock.radius + 4, rock.radius + 2, 0, 0, Math.PI * 2);
      ctx.fill();
      if (spritesLoaded()) {
        const rockVariant = Math.abs(Math.floor(rock.x * 3 + rock.y * 7)) % 2;
        renderRock(ctx, screen.x, screen.y, rockVariant);
      } else {
        ctx.fillStyle = '#5a5a5a';
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, rock.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 6. Cactus groves — sprites blend naturally on matching sand bg
    for (const grove of this.cactusGroves) {
      for (const cactus of grove) {
        if (!camera.isVisible(cactus.x, cactus.y, margin)) continue;
        const screen = camera.worldToScreen(cactus.x, cactus.y);
        if (spritesLoaded()) {
          renderCactus(ctx, screen.x, screen.y);
        } else {
          ctx.fillStyle = '#3a7a3a';
          ctx.beginPath();
          ctx.arc(screen.x, screen.y, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  // --- Utility ---

  private pointToSegmentDist(
    px: number, py: number,
    x1: number, y1: number,
    x2: number, y2: number,
  ): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) {
      const ex = px - x1;
      const ey = py - y1;
      return Math.sqrt(ex * ex + ey * ey);
    }
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    const ex = px - projX;
    const ey = py - projY;
    return Math.sqrt(ex * ex + ey * ey);
  }
}

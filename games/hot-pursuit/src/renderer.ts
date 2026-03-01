// ── Canvas Renderer: Retro Top-Down ──

import { Position, TileType, GameConfig, DEFAULT_CONFIG, PoliceEntity } from './types';
import { TileMap } from './map';
import { StrategyBoardData } from './reflection';
import { Soma } from './soma';

// Color palette — early GTA / retro feel
const COLORS = {
  road: '#2a2a2a',
  roadLine: '#3a3a3a',
  building: '#1a1a2e',
  buildingEdge: '#16213e',
  alley: '#1e1e1e',
  extraction: '#0a3a0a',
  extractionGlow: '#33ff3344',
  sidewalk: '#333344',
  park: '#1a2e1a',
  parkDetail: '#224422',
  player: '#33ff33',
  playerGlow: '#33ff3366',
  police: '#ff3333',
  policeAlert: '#ff6633',
  policeSearching: '#ffaa33',
  policePatrol: '#6666aa',
  losCone: '#ff333318',
  fogOfWar: '#0a0a0aCC',
  background: '#0a0a0a',
  minimap: '#00000088',
  minimapPlayer: '#33ff33',
  minimapPolice: '#ff3333',
  minimapExtraction: '#33ff33',
  text: '#33ff33',
};

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private config: GameConfig;
  private viewWidth: number;
  private viewHeight: number;

  constructor(canvas: HTMLCanvasElement, config: GameConfig = DEFAULT_CONFIG) {
    this.canvas = canvas;
    this.config = config;
    this.viewWidth = config.viewportWidth;
    this.viewHeight = config.viewportHeight;
    this.canvas.width = this.viewWidth;
    this.canvas.height = this.viewHeight;
    this.ctx = canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
  }

  render(
    map: TileMap,
    playerPos: Position,
    police: PoliceEntity[],
    elapsedTime: number,
    runNumber: number,
  ): void {
    const ctx = this.ctx;
    const ts = this.config.tileSize;

    // Camera: center on player
    const camX = playerPos.x - this.viewWidth / 2;
    const camY = playerPos.y - this.viewHeight / 2;

    // Clear
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, this.viewWidth, this.viewHeight);

    // Determine visible tile range
    const startCol = Math.max(0, Math.floor(camX / ts) - 1);
    const endCol = Math.min(map.cols, Math.ceil((camX + this.viewWidth) / ts) + 1);
    const startRow = Math.max(0, Math.floor(camY / ts) - 1);
    const endRow = Math.min(map.rows, Math.ceil((camY + this.viewHeight) / ts) + 1);

    // Draw tiles
    for (let r = startRow; r < endRow; r++) {
      for (let c = startCol; c < endCol; c++) {
        const tile = map.getTile(c, r);
        const sx = c * ts - camX;
        const sy = r * ts - camY;

        switch (tile) {
          case TileType.ROAD:
            ctx.fillStyle = COLORS.road;
            ctx.fillRect(sx, sy, ts, ts);
            // Road markings
            if (c % 4 === 0 && r % 2 === 0) {
              ctx.fillStyle = COLORS.roadLine;
              ctx.fillRect(sx + ts / 2 - 1, sy + 2, 2, ts - 4);
            }
            break;

          case TileType.BUILDING:
            ctx.fillStyle = COLORS.building;
            ctx.fillRect(sx, sy, ts, ts);
            // Building edge detail
            ctx.fillStyle = COLORS.buildingEdge;
            ctx.fillRect(sx, sy, ts, 2);
            ctx.fillRect(sx, sy, 2, ts);
            // Window lights (random-ish based on position)
            if ((c * 7 + r * 13) % 5 === 0) {
              ctx.fillStyle = '#ffee8833';
              ctx.fillRect(sx + 6, sy + 6, 4, 4);
            }
            if ((c * 11 + r * 3) % 7 === 0) {
              ctx.fillStyle = '#88ccff22';
              ctx.fillRect(sx + ts - 10, sy + ts - 10, 4, 4);
            }
            break;

          case TileType.ALLEY:
            ctx.fillStyle = COLORS.alley;
            ctx.fillRect(sx, sy, ts, ts);
            // Grime detail
            if ((c + r) % 3 === 0) {
              ctx.fillStyle = '#151515';
              ctx.fillRect(sx + 4, sy + 8, 3, 2);
            }
            break;

          case TileType.EXTRACTION:
            ctx.fillStyle = COLORS.extraction;
            ctx.fillRect(sx, sy, ts, ts);
            // Pulsing glow
            const pulse = Math.sin(elapsedTime * 3) * 0.3 + 0.7;
            ctx.fillStyle = `rgba(51, 255, 51, ${0.15 * pulse})`;
            ctx.fillRect(sx - 2, sy - 2, ts + 4, ts + 4);
            // Arrow/marker
            ctx.fillStyle = '#33ff33';
            ctx.fillRect(sx + ts / 2 - 2, sy + 2, 4, 4);
            ctx.fillRect(sx + ts / 2 - 4, sy + 6, 8, 2);
            break;

          case TileType.SIDEWALK:
            ctx.fillStyle = COLORS.sidewalk;
            ctx.fillRect(sx, sy, ts, ts);
            // Subtle grid
            ctx.fillStyle = '#2a2a3a';
            ctx.fillRect(sx + ts - 1, sy, 1, ts);
            ctx.fillRect(sx, sy + ts - 1, ts, 1);
            break;

          case TileType.PARK:
            ctx.fillStyle = COLORS.park;
            ctx.fillRect(sx, sy, ts, ts);
            // Grass detail
            if ((c + r) % 2 === 0) {
              ctx.fillStyle = COLORS.parkDetail;
              ctx.fillRect(sx + 4, sy + 6, 2, 4);
              ctx.fillRect(sx + ts - 8, sy + 3, 2, 5);
            }
            break;
        }
      }
    }

    // Draw police LOS cones (behind entities)
    for (const p of police) {
      if (p.canSeePlayer) {
        this.drawLosCone(p.pos, p.facing, camX, camY);
      }
    }

    // Draw police entities
    for (const p of police) {
      const sx = p.pos.x - camX;
      const sy = p.pos.y - camY;

      // Color based on state
      let color: string;
      switch (p.state) {
        case 'pursuing': color = COLORS.police; break;
        case 'searching': color = COLORS.policeSearching; break;
        default: color = COLORS.policePatrol; break;
      }

      // Body
      ctx.fillStyle = color;
      ctx.fillRect(sx - 5, sy - 5, 10, 10);

      // Facing indicator
      ctx.fillStyle = '#ffffff88';
      ctx.fillRect(
        sx + p.facing.x * 5 - 1.5,
        sy + p.facing.y * 5 - 1.5,
        3, 3
      );

      // Alert indicator when pursuing
      if (p.state === 'pursuing') {
        const alertPulse = Math.sin(elapsedTime * 8) > 0;
        if (alertPulse) {
          ctx.fillStyle = '#ff000044';
          ctx.beginPath();
          ctx.arc(sx, sy, 10, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Draw player
    {
      const sx = playerPos.x - camX;
      const sy = playerPos.y - camY;

      // Glow
      ctx.fillStyle = COLORS.playerGlow;
      ctx.beginPath();
      ctx.arc(sx, sy, 8, 0, Math.PI * 2);
      ctx.fill();

      // Body
      ctx.fillStyle = COLORS.player;
      ctx.fillRect(sx - 4, sy - 4, 8, 8);

      // Facing dot
      ctx.fillStyle = '#ffffff';
      const fx = playerPos.x + (playerPos.x !== 0 ? 0 : 0); // we use a separate ref
      ctx.fillRect(sx - 1, sy - 1, 2, 2);
    }

    // Draw minimap
    this.drawMinimap(map, playerPos, police, camX, camY);

    // HUD updates
    this.updateHUD(runNumber, elapsedTime);
  }

  private drawLosCone(
    pos: Position,
    facing: Position,
    camX: number,
    camY: number,
  ): void {
    const ctx = this.ctx;
    const range = this.config.losRange * this.config.tileSize;
    const halfAngle = this.config.losAngle * Math.PI / 180;
    const baseAngle = Math.atan2(facing.y, facing.x);

    const sx = pos.x - camX;
    const sy = pos.y - camY;

    ctx.fillStyle = COLORS.losCone;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.arc(sx, sy, range, baseAngle - halfAngle, baseAngle + halfAngle);
    ctx.closePath();
    ctx.fill();
  }

  private drawMinimap(
    map: TileMap,
    playerPos: Position,
    police: PoliceEntity[],
    _camX: number,
    _camY: number,
  ): void {
    const ctx = this.ctx;
    const mmScale = 3; // pixels per tile on minimap
    const mmW = map.cols * mmScale;
    const mmH = map.rows * mmScale;
    const mmX = this.viewWidth - mmW - 8;
    const mmY = 8;

    // Background
    ctx.fillStyle = COLORS.minimap;
    ctx.fillRect(mmX - 2, mmY - 2, mmW + 4, mmH + 4);

    // Tiles (simplified)
    for (let r = 0; r < map.rows; r++) {
      for (let c = 0; c < map.cols; c++) {
        const tile = map.getTile(c, r);
        if (tile === TileType.BUILDING) {
          ctx.fillStyle = '#222233';
        } else if (tile === TileType.EXTRACTION) {
          ctx.fillStyle = COLORS.minimapExtraction;
        } else {
          ctx.fillStyle = '#111111';
        }
        ctx.fillRect(mmX + c * mmScale, mmY + r * mmScale, mmScale, mmScale);
      }
    }

    // Police dots
    for (const p of police) {
      const px = mmX + (p.pos.x / this.config.tileSize) * mmScale;
      const py = mmY + (p.pos.y / this.config.tileSize) * mmScale;
      ctx.fillStyle = COLORS.minimapPolice;
      ctx.fillRect(px - 1, py - 1, 3, 3);
    }

    // Player dot
    const ppx = mmX + (playerPos.x / this.config.tileSize) * mmScale;
    const ppy = mmY + (playerPos.y / this.config.tileSize) * mmScale;
    ctx.fillStyle = COLORS.minimapPlayer;
    ctx.fillRect(ppx - 1.5, ppy - 1.5, 3, 3);
  }

  private updateHUD(runNumber: number, elapsed: number): void {
    const statusEl = document.getElementById('hud-status');
    const timerEl = document.getElementById('hud-timer');
    if (statusEl) statusEl.textContent = `RUN: ${runNumber}`;
    if (timerEl) timerEl.textContent = `TIME: ${Math.floor(elapsed)}s`;
  }

  showGameOver(outcome: string, escaped: boolean): void {
    const overlay = document.getElementById('game-over-overlay');
    const resultText = document.getElementById('result-text');
    if (overlay && resultText) {
      resultText.textContent = escaped ? '>> ESCAPED <<' : '>> CAPTURED <<';
      resultText.className = `result ${escaped ? 'escaped' : 'captured'}`;
      overlay.classList.add('visible');
      // Update prompt to mention reflection
      const prompt = overlay.querySelector('.prompt');
      if (prompt) prompt.textContent = 'PRESS SPACE FOR DEBRIEF';
    }
  }

  hideGameOver(): void {
    const overlay = document.getElementById('game-over-overlay');
    if (overlay) overlay.classList.remove('visible');
  }

  // ── Reflection UI ──

  showReflection(_status: string): void {
    const overlay = document.getElementById('reflection-overlay');
    if (!overlay) return;
    overlay.classList.add('visible');

    const content = document.getElementById('reflection-content');
    if (content) {
      content.innerHTML = `
        <div class="reflection-title">ONE WEEK LATER...</div>
        <div class="reflection-subtitle">The officers review the chase footage.</div>
        <div id="reflection-progress"></div>
      `;
    }
  }

  updateReflectionProgress(actantId: string, status: string, somas: Soma[]): void {
    const container = document.getElementById('reflection-progress');
    if (!container) return;

    const soma = somas.find(s => s.id === actantId);
    const name = soma?.name ?? actantId;

    let row = document.getElementById(`reflect-${actantId}`);
    if (!row) {
      row = document.createElement('div');
      row.id = `reflect-${actantId}`;
      row.className = 'reflection-officer';
      container.appendChild(row);
    }

    const statusIcon = status === 'reflecting' ? '⟳' : status === 'complete' ? '✓' : '✗';
    const statusClass = status === 'reflecting' ? 'active' : status === 'complete' ? 'done' : 'error';
    row.innerHTML = `<span class="officer-name">${name}</span> <span class="officer-status ${statusClass}">${statusIcon} ${status}</span>`;
  }

  showStrategyBoard(data: StrategyBoardData): void {
    const content = document.getElementById('reflection-content');
    if (!content) return;

    const officerCards = data.officers.map(o => `
      <div class="strategy-officer">
        <div class="strategy-name">${o.name}</div>
        <div class="strategy-nature">${o.nature.slice(0, 120)}...</div>
        ${o.handlersUpdated
          ? `<div class="strategy-update">⚡ Updated tactics</div>`
          : `<div class="strategy-no-update">— No changes</div>`
        }
        ${o.reasoning
          ? `<div class="strategy-reasoning">"${o.reasoning.slice(0, 200)}${o.reasoning.length > 200 ? '...' : ''}"</div>`
          : ''
        }
        <div class="strategy-tools">Tools: ${o.toolCount}</div>
      </div>
    `).join('');

    content.innerHTML = `
      <div class="reflection-title">STRATEGY BOARD</div>
      <div class="reflection-subtitle">Run #${data.runId} — ${data.outcome.toUpperCase()}</div>
      <div class="strategy-officers">${officerCards}</div>
      <div class="reflection-prompt">PRESS SPACE TO BEGIN NEXT CHASE</div>
    `;
  }

  showReflectionError(error: string): void {
    const content = document.getElementById('reflection-content');
    if (!content) return;

    content.innerHTML = `
      <div class="reflection-title">DEBRIEF FAILED</div>
      <div class="reflection-error">${error.slice(0, 200)}</div>
      <div class="reflection-subtitle">Officers will use their current tactics.</div>
      <div class="reflection-prompt">PRESS SPACE TO CONTINUE</div>
    `;
  }

  hideReflection(): void {
    const overlay = document.getElementById('reflection-overlay');
    if (overlay) overlay.classList.remove('visible');
  }
}

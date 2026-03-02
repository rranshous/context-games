// ── Canvas Renderer: Retro Top-Down ──

import { Position, TileType, GameConfig, DEFAULT_CONFIG, PoliceEntity } from './types';
import { TileMap } from './map';
import { TurnUpdate } from './reflection';
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

  // ── Reflection UI (unified live view) ──

  showReflection(_status: string, somas: Soma[]): void {
    const overlay = document.getElementById('reflection-overlay');
    if (!overlay) return;
    overlay.classList.add('visible');

    const content = document.getElementById('reflection-content');
    if (content) {
      const cards = somas.map(s => `
        <div id="reflect-card-${s.id}" class="reflection-card">
          <div class="reflection-card-header">
            <span class="reflection-card-label">${escapeHtml(s.name)}</span>
            <span id="reflect-status-${s.id}" class="reflection-card-status active">thinking...</span>
          </div>
          <div id="reflect-map-${s.id}" class="reflection-card-map"></div>
          <div id="reflect-content-${s.id}" class="reflection-card-content"></div>
        </div>
      `).join('');

      content.innerHTML = `
        <div class="reflection-title">DEBRIEF</div>
        <div class="reflection-card-grid">${cards}</div>
        <div id="reflection-done-prompt" class="reflection-prompt" style="display:none;">PRESS SPACE TO BEGIN NEXT CHASE</div>
      `;
    }
  }

  updateReflectionProgress(actantId: string, status: string, _somas: Soma[], chaseMapBase64?: string): void {
    const statusEl = document.getElementById(`reflect-status-${actantId}`);
    if (statusEl) {
      if (status === 'reflecting') {
        statusEl.className = 'reflection-card-status active';
        statusEl.textContent = 'thinking...';
      } else if (status === 'sharing') {
        statusEl.className = 'reflection-card-status active';
        statusEl.textContent = 'sharing intel...';
      } else if (status === 'complete') {
        statusEl.className = 'reflection-card-status done';
        statusEl.textContent = 'done';
      } else {
        statusEl.className = 'reflection-card-status error';
        statusEl.textContent = 'failed';
      }
    }

    const card = document.getElementById(`reflect-card-${actantId}`);
    if (card) {
      card.classList.remove('done', 'error');
      if (status === 'complete') card.classList.add('done');
      if (status === 'failed') card.classList.add('error');
    }

    if (chaseMapBase64) {
      const mapEl = document.getElementById(`reflect-map-${actantId}`);
      if (mapEl) {
        mapEl.innerHTML = `<img src="data:image/png;base64,${chaseMapBase64}" alt="Chase map">`;
      }
    }
  }

  appendTurnContent(_update: TurnUpdate): void {
    // No-op — haiku summary replaces all live content after reflection completes.
    // Tool badges and reasoning text are both suppressed; summary is the only
    // player-facing output (set via setReflectionSummary).
  }

  setReflectionSummary(actantId: string, summary: string, fullReasoning: string): void {
    const contentEl = document.getElementById(`reflect-content-${actantId}`);
    if (!contentEl) return;

    // Insert summary at top of card (before tool badges)
    const summaryDiv = document.createElement('div');
    summaryDiv.className = 'reflection-summary';
    summaryDiv.innerHTML = renderMarkdown(summary);
    contentEl.insertBefore(summaryDiv, contentEl.firstChild);

    // Add collapsible full reasoning at bottom
    if (fullReasoning.trim()) {
      const details = document.createElement('details');
      details.className = 'reflection-full-reasoning';
      details.innerHTML = `<summary>full reasoning</summary><div class="reflection-reasoning-content">${renderMarkdown(fullReasoning)}</div>`;
      contentEl.appendChild(details);
    }

    // Scroll
    const overlay = document.getElementById('reflection-overlay');
    if (overlay) overlay.scrollTop = overlay.scrollHeight;
  }

  setDebriefSummary(actantId: string, summary: string, fullReasoning: string): void {
    const contentEl = document.getElementById(`reflect-content-${actantId}`);
    if (!contentEl) return;

    // Append debrief summary after existing content, visually distinct
    const debriefDiv = document.createElement('div');
    debriefDiv.className = 'reflection-debrief-summary';
    debriefDiv.innerHTML = `<div class="debrief-label">from allies:</div>${renderMarkdown(summary)}`;
    contentEl.appendChild(debriefDiv);

    // Add collapsible debrief reasoning
    if (fullReasoning.trim()) {
      const details = document.createElement('details');
      details.className = 'reflection-full-reasoning';
      details.innerHTML = `<summary>debrief reasoning</summary><div class="reflection-reasoning-content">${renderMarkdown(fullReasoning)}</div>`;
      contentEl.appendChild(details);
    }

    const overlay = document.getElementById('reflection-overlay');
    if (overlay) overlay.scrollTop = overlay.scrollHeight;
  }

  showReflectionComplete(): void {
    const prompt = document.getElementById('reflection-done-prompt');
    if (prompt) prompt.style.display = '';
    // Scroll to show the prompt
    const overlay = document.getElementById('reflection-overlay');
    if (overlay) overlay.scrollTop = overlay.scrollHeight;
  }

  showReflectionError(error: string): void {
    const content = document.getElementById('reflection-content');
    if (!content) return;

    content.innerHTML = `
      <div class="reflection-title">DEBRIEF FAILED</div>
      <div class="reflection-error">${escapeHtml(error.slice(0, 200))}</div>
      <div class="reflection-subtitle">Officers will use their current tactics.</div>
      <div class="reflection-prompt">PRESS SPACE TO CONTINUE</div>
    `;
  }

  hideReflection(): void {
    const overlay = document.getElementById('reflection-overlay');
    if (overlay) overlay.classList.remove('visible');
  }

  // ── Soma Inspector Panel ──

  /** Add "inspect" buttons to each debrief card. Called after reflection completes. */
  addInspectButtons(somas: Soma[], onInspect: (soma: Soma) => void): void {
    for (const soma of somas) {
      const header = document.getElementById(`reflect-card-${soma.id}`)?.querySelector('.reflection-card-header');
      if (!header) continue;
      // Don't double-add
      if (header.querySelector('.inspect-btn')) continue;

      const btn = document.createElement('button');
      btn.className = 'inspect-btn';
      btn.textContent = 'inspect';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Highlight active
        document.querySelectorAll('.inspect-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        onInspect(soma);
      });
      header.appendChild(btn);
    }
  }

  /** Show a single officer's soma in the side panel. */
  showSomaInspector(soma: Soma): void {
    const panel = document.getElementById('soma-panel');
    if (!panel) return;

    // Remove previous card content (preserve header with reset button)
    this.clearSomaPanel();

    const handlerLines = soma.signalHandlers.trim().split('\n').length;
    const wrapper = document.createElement('div');
    wrapper.className = 'soma-card';
    wrapper.innerHTML = `
      <div class="soma-card-header">
        <span class="soma-card-name">${escapeHtml(soma.name)}</span>
        <span class="soma-card-badge">${escapeHtml(soma.badgeNumber)}</span>
      </div>
      <div class="soma-card-nature">${escapeHtml(soma.nature)}</div>
      <div class="soma-card-section">
        <div class="soma-card-section-label">Behavior</div>
        <div id="soma-inspector-behavior" class="soma-card-generating">generating summary...</div>
      </div>
      <div class="soma-card-section">
        <div class="soma-card-section-label">Memory</div>
        <div class="soma-card-memory">${escapeHtml(soma.memory)}</div>
      </div>
      <div class="soma-card-section">
        <div class="soma-card-section-label">Chase History</div>
        <div class="soma-card-memory">${soma.chaseHistory.length === 0
          ? 'No chases yet.'
          : soma.chaseHistory.map(h =>
              `Run ${h.runId}: ${h.outcome} (${Math.round(h.durationSeconds)}s)${h.captured ? ' - CAPTURED' : ''}${h.spotted ? ' - spotted' : ''}`
            ).join('\n')
        }</div>
      </div>
      <details open>
        <summary>handler code (${handlerLines} lines)</summary>
        <div class="soma-card-code">${escapeHtml(soma.signalHandlers.trim())}</div>
      </details>`;
    panel.appendChild(wrapper);
  }

  /** Patch in the behavior summary after the haiku call returns. */
  updateSomaInspectorSummary(summary: string): void {
    const el = document.getElementById('soma-inspector-behavior');
    if (!el) return;
    el.className = 'soma-card-behavior';
    el.innerHTML = renderMarkdown(summary);
  }

  /** Remove card content from panel, preserving header with reset button. */
  clearSomaPanel(): void {
    const panel = document.getElementById('soma-panel');
    if (!panel) return;
    // Remove all children except the header
    const toRemove = Array.from(panel.children).filter(el => !el.classList.contains('soma-panel-header'));
    for (const el of toRemove) el.remove();
  }
}

// ── Markdown / HTML helpers ──

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toolBadgeClass(name: string): string {
  switch (name) {
    case 'update_signal_handlers': return 'badge-handlers';
    case 'update_memory': return 'badge-memory';
    case 'query_replay': return 'badge-replay';
    default: return '';
  }
}

function toolBadgeLabel(
  name: string,
  input: Record<string, unknown>,
  result: { success: boolean; data?: unknown; error?: string },
): string {
  if (!result.success) {
    return `<span class="badge-icon">&#x2717;</span> ${escapeHtml(name)}: ${escapeHtml(result.error || 'failed')}`;
  }
  switch (name) {
    case 'update_signal_handlers':
      return `<span class="badge-icon">&#x2714;</span> Updated signal handlers`;
    case 'update_memory':
      return `<span class="badge-icon">&#x2714;</span> Updated memory`;
    case 'query_replay': {
      const start = input.start_tick ?? '?';
      const end = input.end_tick ?? '?';
      return `<span class="badge-icon">&#x1F50D;</span> Reviewed ticks ${start}-${end}`;
    }
    default:
      return escapeHtml(name);
  }
}

/** Lightweight markdown → HTML for Claude's typical output subset. */
function renderMarkdown(md: string): string {
  const escaped = escapeHtml(md);

  // Code blocks (``` ... ```)
  let html = escaped.replace(/```(\w*)\n([\s\S]*?)```/g,
    (_m, _lang, code) => `<pre class="strategy-code">${code.trim()}</pre>`);

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headers (### → h4, ## → h3, # → h2)
  html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Unordered lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (block) => `<ul>${block}</ul>`);

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Paragraphs (double newline)
  html = html.replace(/\n\n+/g, '</p><p>');
  html = `<p>${html}</p>`;

  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '');

  return html;
}

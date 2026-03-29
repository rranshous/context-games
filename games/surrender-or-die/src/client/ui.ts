// ui.ts — Human input: click-drag select, right-click move/attack, keyboard shortcuts
// All commands go through the HTTP API.

import { type GameState, type Unit, type Side, type UnitType, UNIT_STATS } from '../shared/types.js';
import { Renderer } from './renderer.js';
import { SodAPI } from './api.js';

export class UI {
  private renderer: Renderer;
  private api: SodAPI;
  private canvas: HTMLCanvasElement;
  private gameId: string;
  private playerSide: Side;

  // Drag selection state
  private dragging = false;
  private dragStartX = 0;
  private dragStartY = 0;

  // Latest known game state (for hit-testing)
  latestState: GameState | null = null;

  constructor(
    renderer: Renderer,
    api: SodAPI,
    canvas: HTMLCanvasElement,
    gameId: string,
    playerSide: Side,
  ) {
    this.renderer = renderer;
    this.api = api;
    this.canvas = canvas;
    this.gameId = gameId;
    this.playerSide = playerSide;

    this.setupMouseHandlers();
    this.setupKeyboardHandlers();
    this.setupTrainButtons();
  }

  updateGame(gameId: string, side: Side): void {
    this.gameId = gameId;
    this.playerSide = side;
    this.renderer.selectedUnitIds.clear();
  }

  private getCanvasCoords(e: MouseEvent): [number, number] {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return [
      (e.clientX - rect.left) * scaleX,
      (e.clientY - rect.top) * scaleY,
    ];
  }

  private setupMouseHandlers(): void {
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());

    this.canvas.addEventListener('mousedown', (e) => {
      const [px, py] = this.getCanvasCoords(e);
      if (e.button === 0) {
        this.dragging = true;
        this.dragStartX = px;
        this.dragStartY = py;
        this.renderer.selectionBox = { x1: px, y1: py, x2: px, y2: py };
      } else if (e.button === 2) {
        this.handleRightClick(px, py);
      }
    });

    this.canvas.addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      const [px, py] = this.getCanvasCoords(e);
      this.renderer.selectionBox = {
        x1: this.dragStartX, y1: this.dragStartY,
        x2: px, y2: py,
      };
    });

    this.canvas.addEventListener('mouseup', (e) => {
      if (e.button !== 0 || !this.dragging) return;
      this.dragging = false;
      const [px, py] = this.getCanvasCoords(e);
      const game = this.latestState;
      if (!game) return;

      const dragDist = Math.abs(px - this.dragStartX) + Math.abs(py - this.dragStartY);

      if (dragDist < 5) {
        const unit = this.renderer.unitAtPixel(game, px, py);
        if (unit && unit.owner === this.playerSide) {
          if (e.shiftKey) {
            if (this.renderer.selectedUnitIds.has(unit.id)) {
              this.renderer.selectedUnitIds.delete(unit.id);
            } else {
              this.renderer.selectedUnitIds.add(unit.id);
            }
          } else {
            this.renderer.selectedUnitIds = new Set([unit.id]);
          }
        } else if (!e.shiftKey) {
          this.renderer.selectedUnitIds.clear();
        }
      } else {
        const units = this.renderer.unitsInRect(
          game, this.dragStartX, this.dragStartY, px, py, this.playerSide,
        );
        if (e.shiftKey) {
          for (const u of units) this.renderer.selectedUnitIds.add(u.id);
        } else {
          this.renderer.selectedUnitIds = new Set(units.map(u => u.id));
        }
      }
      this.renderer.selectionBox = null;
    });
  }

  private handleRightClick(px: number, py: number): void {
    const selected = Array.from(this.renderer.selectedUnitIds);
    if (selected.length === 0) return;
    const game = this.latestState;
    if (!game) return;

    const target = this.renderer.unitAtPixel(game, px, py);
    if (target && target.owner !== this.playerSide) {
      this.api.attackTarget(this.gameId, selected, target.id).catch(() => {});
    } else {
      const [tx, ty] = this.renderer.pixelToTile(px, py);
      this.api.attackMove(this.gameId, selected, tx, ty).catch(() => {});
    }
  }

  private setupKeyboardHandlers(): void {
    document.addEventListener('keydown', (e) => {
      const keyMap: Record<string, UnitType> = {
        '1': 'peasant', '2': 'knight', '3': 'archer', '4': 'catapult', '5': 'jester',
      };

      if (keyMap[e.key]) {
        this.api.train(this.gameId, keyMap[e.key]).catch(() => {});
        return;
      }

      if (e.key === 'a' && e.ctrlKey) {
        e.preventDefault();
        if (!this.latestState) return;
        this.renderer.selectedUnitIds = new Set(
          this.latestState.units.filter(u => u.owner === this.playerSide).map(u => u.id)
        );
        return;
      }

      if (e.key === 's' && e.ctrlKey && e.shiftKey) {
        e.preventDefault();
        this.api.surrender(this.gameId).catch(() => {});
      }
    });
  }

  private setupTrainButtons(): void {
    document.querySelectorAll('.train-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const unitType = (btn as HTMLElement).dataset.unit as UnitType;
        this.api.train(this.gameId, unitType).catch(() => {});
      });
    });
  }

  updateGoldDisplay(game: GameState): void {
    const player = game.players[this.playerSide];
    const goldEl = document.getElementById('gold-display');
    if (goldEl && player) {
      goldEl.textContent = `Gold: ${Math.floor(player.gold)}`;
    }
  }

  updateEventLog(game: GameState): void {
    const logEl = document.getElementById('event-log');
    if (!logEl) return;
    const recent = game.log.slice(-8);
    logEl.innerHTML = recent.map((entry, i) => {
      const fade = i < recent.length - 4 ? ' fade' : '';
      return `<div class="log-entry${fade}">${entry.message}</div>`;
    }).join('');
  }
}

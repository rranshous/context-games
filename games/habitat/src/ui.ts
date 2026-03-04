// ui.ts — DOM rendering (game list, board, actant cards). No framework.

import { type World } from './world';
import { type Game } from './game-server';
import { type Actant } from './actant';

export class HabitatUI {
  private world: World;
  private actants: Actant[];
  private selectedGameId: string | null = null;
  private renderTimer: ReturnType<typeof setInterval> | null = null;

  private gameListEl: HTMLElement;
  private boardAreaEl: HTMLElement;
  private actantCardsEl: HTMLElement;
  private handleInput: HTMLInputElement;

  constructor(world: World, actants: Actant[]) {
    this.world = world;
    this.actants = actants;

    this.gameListEl = document.getElementById('game-list')!;
    this.boardAreaEl = document.getElementById('board-area')!;
    this.actantCardsEl = document.getElementById('actant-cards')!;
    this.handleInput = document.getElementById('player-handle') as HTMLInputElement;

    // Wire create button
    document.getElementById('create-game-btn')!.addEventListener('click', () => {
      const handle = this.getHandle();
      if (!handle) return;
      try {
        const game = this.world.games.ticTacToe.createGame(handle);
        this.selectedGameId = game.id;
        this.render();
      } catch (err) {
        console.error('[UI] Create game error:', err);
      }
    });
  }

  private getHandle(): string {
    return this.handleInput.value.trim() || 'Player';
  }

  // ── Rendering ─────────────────────────────────────────────

  render(): void {
    this.renderGameList();
    this.renderBoard();
    this.renderActants();
  }

  private renderGameList(): void {
    const games = this.world.games.ticTacToe.listGames();

    if (games.length === 0) {
      this.gameListEl.innerHTML = '<div class="no-games">No games yet. Create one!</div>';
      return;
    }

    // Sort: active first, then waiting, then finished
    const order = { active: 0, waiting: 1, finished: 2 };
    games.sort((a, b) => order[a.status] - order[b.status]);

    this.gameListEl.innerHTML = games.map(g => {
      const selected = g.id === this.selectedGameId ? ' selected' : '';
      const players = g.players.O
        ? `${g.players.X} vs ${g.players.O}`
        : `${g.players.X} (waiting)`;
      const result = g.status === 'finished'
        ? (g.winner === 'draw' ? ' — Draw' : ` — ${g.winner} wins`)
        : '';

      return `<div class="game-item${selected}" data-game-id="${g.id}">
        <span>${g.id}: ${players}${result}</span>
        <span class="game-status ${g.status}">${g.status}</span>
      </div>`;
    }).join('');

    // Click to select/join
    this.gameListEl.querySelectorAll('.game-item').forEach(el => {
      el.addEventListener('click', () => {
        const gameId = (el as HTMLElement).dataset.gameId!;
        const game = this.world.games.ticTacToe.getGame(gameId);
        if (!game) return;

        // If waiting and not our game, join it
        if (game.status === 'waiting' && game.players.X !== this.getHandle()) {
          try {
            this.world.games.ticTacToe.joinGame(gameId, this.getHandle());
          } catch (err) {
            console.error('[UI] Join game error:', err);
          }
        }

        this.selectedGameId = gameId;
        this.render();
      });
    });
  }

  private renderBoard(): void {
    if (!this.selectedGameId) {
      this.boardAreaEl.innerHTML = '';
      return;
    }

    const game = this.world.games.ticTacToe.getGame(this.selectedGameId);
    if (!game) {
      this.boardAreaEl.innerHTML = '';
      this.selectedGameId = null;
      return;
    }

    const handle = this.getHandle();
    const isMyTurn = game.status === 'active' && (
      (game.turn === 'X' && game.players.X === handle) ||
      (game.turn === 'O' && game.players.O === handle)
    );

    let info = '';
    if (game.status === 'waiting') {
      info = 'Waiting for opponent...';
    } else if (game.status === 'finished') {
      info = game.winner === 'draw' ? 'Draw!' : `${game.winner} wins!`;
    } else {
      const current = game.turn === 'X' ? game.players.X : game.players.O;
      info = isMyTurn ? 'Your turn' : `${current}'s turn`;
    }

    const cells = game.board.map((cell, i) => {
      const mark = cell ? (cell === game.players.X ? 'X' : 'O') : '';
      const cls = mark ? mark.toLowerCase() : '';
      const disabled = !isMyTurn || cell !== null ? ' disabled' : '';
      return `<div class="cell ${cls}${disabled}" data-pos="${i}">${mark}</div>`;
    }).join('');

    this.boardAreaEl.innerHTML = `
      <div class="board-container">
        <div class="board-info">${info}</div>
        <div class="board">${cells}</div>
      </div>`;

    // Click to make move
    if (isMyTurn) {
      this.boardAreaEl.querySelectorAll('.cell:not(.disabled)').forEach(el => {
        el.addEventListener('click', () => {
          const pos = parseInt((el as HTMLElement).dataset.pos!, 10);
          try {
            this.world.games.ticTacToe.makeMove(game.id, handle, pos);
            this.render();
          } catch (err) {
            console.error('[UI] Move error:', err);
          }
        });
      });
    }
  }

  private renderActants(): void {
    this.actantCardsEl.innerHTML = this.actants.map(a => {
      const statusCls = a.status === 'thinking' ? 'thinking' : 'idle';
      const memory = a.soma.memory || '(empty)';
      const memoryPreview = memory.length > 120 ? memory.substring(0, 120) + '...' : memory;

      return `<div class="actant-card">
        <div class="actant-header">
          <span class="actant-name">${a.soma.gamer_handle}</span>
          <span class="actant-status ${statusCls}">${a.status} · tick #${a.tickCount}</span>
        </div>
        <div class="actant-section">
          <div class="actant-section-label">Identity</div>
          <div class="actant-section-content">${escapeHtml(a.soma.identity)}</div>
        </div>
        <div class="actant-section">
          <div class="actant-section-label">Memory</div>
          <div class="actant-section-content">${escapeHtml(memoryPreview)}</div>
        </div>
        <div class="actant-section">
          <div class="actant-section-label">Last think</div>
          <div class="actant-section-content">${escapeHtml(a.lastThinkPrompt || '(none)')}</div>
        </div>
      </div>`;
    }).join('');
  }

  // ── Render loop ───────────────────────────────────────────

  startRendering(interval: number = 500): void {
    this.render();
    this.renderTimer = setInterval(() => this.render(), interval);
  }

  stopRendering(): void {
    if (this.renderTimer) {
      clearInterval(this.renderTimer);
      this.renderTimer = null;
    }
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

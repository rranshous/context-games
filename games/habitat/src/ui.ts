// ui.ts — DOM rendering (game list, board, chat, canvas, actant cards). No framework.

import { type World } from './world';
import { type Actant } from './actant';

export class HabitatUI {
  private world: World;
  private actants: Actant[];
  private onWorldChange: () => void;
  private selectedGameId: string | null = null;
  private renderTimer: ReturnType<typeof setInterval> | null = null;

  private gameListEl: HTMLElement;
  private boardAreaEl: HTMLElement;
  private chatEl: HTMLElement;
  private canvasEl: HTMLElement;
  private panelEls: HTMLElement[];
  private handleInput: HTMLInputElement;
  private chatInput: HTMLInputElement;

  constructor(world: World, actants: Actant[], onWorldChange: () => void = () => {}) {
    this.world = world;
    this.actants = actants;
    this.onWorldChange = onWorldChange;

    this.gameListEl = document.getElementById('game-list')!;
    this.boardAreaEl = document.getElementById('board-area')!;
    this.chatEl = document.getElementById('chat-messages')!;
    this.canvasEl = document.getElementById('shared-canvas')!;
    this.panelEls = [
      document.getElementById('alpha-panel')!,
      document.getElementById('beta-panel')!,
    ];
    this.handleInput = document.getElementById('player-handle') as HTMLInputElement;
    this.chatInput = document.getElementById('chat-input') as HTMLInputElement;

    // Wire create button
    document.getElementById('create-game-btn')!.addEventListener('click', () => {
      const handle = this.getHandle();
      if (!handle) return;
      try {
        const game = this.world.games.ticTacToe.createGame(handle);
        this.selectedGameId = game.id;
        this.onWorldChange();
        this.render();
      } catch (err) {
        console.error('[UI] Create game error:', err);
      }
    });

    // Board click — event delegation so clicks survive innerHTML re-renders
    this.boardAreaEl.addEventListener('click', (e) => {
      const cell = (e.target as HTMLElement).closest('.cell:not(.disabled)') as HTMLElement | null;
      if (!cell) return;
      const pos = parseInt(cell.dataset.pos!, 10);
      const handle = this.getHandle();
      if (!this.selectedGameId) return;
      try {
        this.world.games.ticTacToe.makeMove(this.selectedGameId, handle, pos);
        this.onWorldChange();
        this.render();
      } catch (err) {
        console.error('[UI] Move error:', err);
      }
    });

    // Wire chat send
    document.getElementById('chat-send-btn')!.addEventListener('click', () => this.sendChat());
    this.chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.sendChat();
    });
  }

  private sendChat(): void {
    const text = this.chatInput.value.trim();
    if (!text) return;
    const handle = this.getHandle();
    this.world.social.chat.post(handle, text);
    this.chatInput.value = '';
    this.onWorldChange();
    this.render();
  }

  private getHandle(): string {
    return this.handleInput.value.trim() || 'Player';
  }

  // ── Rendering ─────────────────────────────────────────────

  render(): void {
    this.renderGameList();
    this.renderBoard();
    this.renderChat();
    this.renderCanvas();
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
            this.onWorldChange();
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

    // Click handling is done via event delegation on boardAreaEl (see constructor).
    // The .disabled class on cells prevents clicks from registering.
  }

  private renderChat(): void {
    const messages = this.world.social.chat.all();
    if (messages.length === 0) {
      this.chatEl.innerHTML = '<div class="chat-empty">No messages yet.</div>';
      return;
    }
    this.chatEl.innerHTML = messages.map(m => {
      const time = new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `<div class="chat-msg"><span class="chat-time">${time}</span> <span class="chat-handle">${escapeHtml(m.handle)}</span>: ${escapeHtml(m.text)}</div>`;
    }).join('');
    // Auto-scroll to bottom
    this.chatEl.scrollTop = this.chatEl.scrollHeight;
  }

  private renderCanvas(): void {
    this.canvasEl.textContent = this.world.art.sharedCanvas.read();
  }

  private renderActants(): void {
    this.actants.forEach((a, i) => {
      const el = this.panelEls[i];
      if (!el) return;

      const statusCls = a.status === 'thinking' ? 'thinking' : 'idle';

      const toolsHtml = a.soma.custom_tools.map(t =>
        `<div class="soma-tool-item">
          <div class="soma-tool-name">${escapeHtml(t.name)}</div>
          <div class="soma-tool-desc">${escapeHtml(t.description)}</div>
        </div>`
      ).join('');

      el.innerHTML = `
        <div class="soma-header">
          <span class="soma-handle">${escapeHtml(a.soma.gamer_handle)}</span>
          <span class="soma-status ${statusCls}">${a.status} · tick #${a.tickCount}</span>
        </div>
        ${somaSection('last think', a.lastThinkPrompt || '(none)')}
        ${somaSection('identity', a.soma.identity)}
        ${somaSection('on_tick', a.soma.on_tick, true)}
        ${somaSection('memory', a.soma.memory)}
        <div class="soma-section">
          <div class="soma-section-label">custom_tools (${a.soma.custom_tools.length})</div>
          ${toolsHtml}
        </div>`;
    });
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

function somaSection(label: string, content: string, isCode: boolean = false): string {
  const empty = !content || content === '(none)';
  const cls = isCode ? 'soma-section-content code' : empty ? 'soma-section-content empty' : 'soma-section-content';
  const display = empty ? '(empty)' : escapeHtml(content);
  return `<div class="soma-section">
    <div class="soma-section-label">${label}</div>
    <div class="${cls}">${display}</div>
  </div>`;
}

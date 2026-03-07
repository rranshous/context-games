// ui.ts — DOM rendering (game list, board, chat, canvas, actant cards). No framework.

import { type World } from './world';
import { type Actant } from './actant';

const UI_STATE_KEY = 'habitat-ui';

interface UIState {
  inspectorTab: number;
  dynamicNotepad: string | null;
}

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
  private handleInput: HTMLInputElement;
  private chatInput: HTMLInputElement;
  private boardPostsEl: HTMLElement;
  private notepadListEl: HTMLElement;
  private notepadViewerEl: HTMLElement;
  private selectedNotepad: string | null = null;

  // Inspector tabs
  private inspectorTabsEl: HTMLElement;
  private inspectorBodyEl: HTMLElement;
  private selectedActantIdx: number = 0;

  // Dynamic panel
  private dynamicSelectEl: HTMLSelectElement;
  private dynamicContainerEl: HTMLElement;
  private dynamicErrorEl: HTMLElement;
  private selectedDynamicNotepad: string | null = null;
  private dynamicCachedSource: string | null = null;
  private dynamicCompiledFn: ((el: HTMLElement, getWorld: <T>(cb: (w: World) => T) => T) => void) | null = null;

  constructor(world: World, actants: Actant[], onWorldChange: () => void = () => {}) {
    this.world = world;
    this.actants = actants;
    this.onWorldChange = onWorldChange;

    this.gameListEl = document.getElementById('game-list')!;
    this.boardAreaEl = document.getElementById('board-area')!;
    this.chatEl = document.getElementById('chat-messages')!;
    this.canvasEl = document.getElementById('shared-canvas')!;
    this.handleInput = document.getElementById('player-handle') as HTMLInputElement;
    this.chatInput = document.getElementById('chat-input') as HTMLInputElement;
    this.boardPostsEl = document.getElementById('board-posts')!;
    this.notepadListEl = document.getElementById('notepad-list')!;
    this.notepadViewerEl = document.getElementById('notepad-viewer')!;

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

    // Wire board post
    document.getElementById('board-post-btn')!.addEventListener('click', () => this.postToBoard());
    (document.getElementById('board-title-input') as HTMLInputElement).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.postToBoard();
    });

    // Collapsible sections
    document.querySelectorAll('.collapsible').forEach(el => {
      el.addEventListener('click', () => el.classList.toggle('collapsed'));
    });

    // Notepad list — event delegation
    this.notepadListEl.addEventListener('click', (e) => {
      const item = (e.target as HTMLElement).closest('.notepad-item') as HTMLElement | null;
      if (!item) return;
      const name = item.dataset.name!;
      this.selectedNotepad = this.selectedNotepad === name ? null : name;
      this.renderNotepads();
    });

    // Inspector tabs
    this.inspectorTabsEl = document.getElementById('inspector-tabs')!;
    this.inspectorBodyEl = document.getElementById('inspector-body')!;
    this.inspectorTabsEl.addEventListener('click', (e) => {
      const tab = (e.target as HTMLElement).closest('.inspector-tab') as HTMLElement | null;
      if (!tab) return;
      const idx = parseInt(tab.dataset.idx!, 10);
      if (!isNaN(idx)) {
        this.selectedActantIdx = idx;
        this.saveUIState();
        this.renderActants();
      }
    });

    // Dynamic panel
    this.dynamicSelectEl = document.getElementById('dynamic-notepad-select') as HTMLSelectElement;
    this.dynamicContainerEl = document.getElementById('dynamic-panel-container')!;
    this.dynamicErrorEl = document.getElementById('dynamic-panel-error')!;
    this.dynamicSelectEl.addEventListener('change', () => {
      this.selectedDynamicNotepad = this.dynamicSelectEl.value || null;
      this.dynamicCachedSource = null;
      this.dynamicCompiledFn = null;
      this.dynamicContainerEl.innerHTML = '';
      delete (this.dynamicContainerEl as any).__initialized;
      this.dynamicErrorEl.classList.remove('visible');
      this.saveUIState();
    });

    // Load persisted UI state
    try {
      const raw = localStorage.getItem(UI_STATE_KEY);
      if (raw) {
        const state: UIState = JSON.parse(raw);
        this.selectedActantIdx = state.inspectorTab ?? 0;
        this.selectedDynamicNotepad = state.dynamicNotepad ?? null;
      }
    } catch {}
  }

  private postToBoard(): void {
    const titleInput = document.getElementById('board-title-input') as HTMLInputElement;
    const bodyInput = document.getElementById('board-body-input') as HTMLTextAreaElement;
    const title = titleInput.value.trim();
    const body = bodyInput.value.trim();
    if (!title) return;
    const handle = this.getHandle();
    this.world.commons.board.post(handle, title, body);
    titleInput.value = '';
    bodyInput.value = '';
    this.onWorldChange();
    this.render();
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
    this.renderBulletinBoard();
    this.renderNotepads();
    this.renderChat();
    this.renderCanvas();
    this.renderActants();
    this.renderDynamicPanel();
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

  private renderBulletinBoard(): void {
    const posts = this.world.commons.board.read();
    if (posts.length === 0) {
      this.boardPostsEl.innerHTML = '<div class="board-empty">No posts yet.</div>';
      return;
    }
    this.boardPostsEl.innerHTML = posts.map(p => {
      const time = new Date(p.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const date = new Date(p.ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
      return `<div class="board-post">
        <div class="board-post-header">
          <span class="board-post-title">${escapeHtml(p.title)}</span>
          <span class="board-post-meta">${escapeHtml(p.handle)} · ${date} ${time}</span>
        </div>
        ${p.body ? `<div class="board-post-body">${escapeHtml(p.body)}</div>` : ''}
      </div>`;
    }).join('');
  }

  private renderNotepads(): void {
    const names = this.world.commons.notepads.list();
    if (names.length === 0) {
      this.notepadListEl.innerHTML = '<div class="notepad-empty">No notepads yet.</div>';
      this.notepadViewerEl.innerHTML = '';
      return;
    }
    this.notepadListEl.innerHTML = names.map(name => {
      const selected = name === this.selectedNotepad ? ' selected' : '';
      return `<div class="notepad-item${selected}" data-name="${escapeHtml(name)}">${escapeHtml(name)}</div>`;
    }).join('');

    if (this.selectedNotepad) {
      const content = this.world.commons.notepads.read(this.selectedNotepad);
      if (content !== null) {
        this.notepadViewerEl.innerHTML =
          `<div class="notepad-viewer-label">${escapeHtml(this.selectedNotepad)}</div>${escapeHtml(content)}`;
      } else {
        this.selectedNotepad = null;
        this.notepadViewerEl.innerHTML = '';
      }
    } else {
      this.notepadViewerEl.innerHTML = '';
    }
  }

  private renderActants(): void {
    // Tabs
    this.inspectorTabsEl.innerHTML = this.actants.map((a, i) => {
      const active = i === this.selectedActantIdx ? ' active' : '';
      const dotCls = a.status === 'thinking' ? 'thinking' : 'idle';
      return `<div class="inspector-tab${active}" data-idx="${i}">
        ${escapeHtml(a.soma.gamer_handle)}
        <span class="status-dot ${dotCls}"></span>
      </div>`;
    }).join('');

    // Body — selected actant only
    const a = this.actants[this.selectedActantIdx];
    if (!a) { this.inspectorBodyEl.innerHTML = ''; return; }

    const statusCls = a.status === 'thinking' ? 'thinking' : 'idle';

    const toolsHtml = a.soma.custom_tools.map(t =>
      `<div class="soma-tool-item">
        <div class="soma-tool-name">${escapeHtml(t.name)}</div>
        <div class="soma-tool-desc">${escapeHtml(t.description)}</div>
      </div>`
    ).join('');

    this.inspectorBodyEl.innerHTML = `
      <div class="soma-header">
        <span class="soma-handle">${escapeHtml(a.soma.gamer_handle)}</span>
        <span class="soma-status ${statusCls}">${a.status} · tick #${a.tickCount}</span>
      </div>
      ${somaSection('last think', a.lastThinkPrompt || '(none)')}
      ${somaSection('identity', a.soma.identity)}
      ${somaSection('memory', a.soma.memory)}
      ${somaSection('on_tick', a.soma.on_tick, true)}
      <div class="soma-section">
        <div class="soma-section-label">custom_tools (${a.soma.custom_tools.length})</div>
        ${toolsHtml}
      </div>`;
  }

  private renderDynamicPanel(): void {
    // Update dropdown options from notepad list
    const names = this.world.commons.notepads.list();
    const currentOptions = Array.from(this.dynamicSelectEl.options).map(o => o.value);
    const desiredOptions = ['', ...names];

    if (JSON.stringify(currentOptions) !== JSON.stringify(desiredOptions)) {
      const selected = this.selectedDynamicNotepad;
      this.dynamicSelectEl.innerHTML =
        '<option value="">(none)</option>' +
        names.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
      if (selected && names.includes(selected)) {
        this.dynamicSelectEl.value = selected;
      } else if (selected && !names.includes(selected)) {
        this.selectedDynamicNotepad = null;
        this.dynamicCachedSource = null;
        this.dynamicCompiledFn = null;
        this.dynamicContainerEl.innerHTML = '';
        delete (this.dynamicContainerEl as any).__initialized;
      }
    }

    if (!this.selectedDynamicNotepad) {
      if (this.dynamicContainerEl.innerHTML) this.dynamicContainerEl.innerHTML = '';
      this.dynamicErrorEl.classList.remove('visible');
      return;
    }

    const source = this.world.commons.notepads.read(this.selectedDynamicNotepad);
    if (source === null) {
      this.dynamicContainerEl.innerHTML = '';
      this.dynamicErrorEl.classList.remove('visible');
      return;
    }

    // Detect content change — recompile if source changed
    if (source !== this.dynamicCachedSource) {
      this.dynamicCachedSource = source;
      this.dynamicCompiledFn = null;
      this.dynamicContainerEl.innerHTML = '';
      delete (this.dynamicContainerEl as any).__initialized;
      this.dynamicErrorEl.classList.remove('visible');

      try {
        const fn = new Function('return ' + source)();
        if (typeof fn !== 'function') {
          throw new Error('Notepad content must be a function(el, getWorld) { ... }');
        }
        this.dynamicCompiledFn = fn;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.dynamicErrorEl.textContent = `Compile error: ${msg}`;
        this.dynamicErrorEl.classList.add('visible');
        console.error('[DYNAMIC PANEL] Compile error:', err);
        return;
      }
    }

    // Skip render when user is interacting with the panel (typing in inputs, etc.)
    if (this.dynamicContainerEl.contains(document.activeElement)) return;

    // Execute the panel function
    if (this.dynamicCompiledFn) {
      const getWorld = <T>(cb: (w: World) => T): T => {
        const result = cb(this.world);
        this.onWorldChange();
        return result;
      };
      try {
        this.dynamicCompiledFn(this.dynamicContainerEl, getWorld);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.dynamicErrorEl.textContent = `Runtime error: ${msg}`;
        this.dynamicErrorEl.classList.add('visible');
        console.error('[DYNAMIC PANEL] Runtime error:', err);
      }
    }
  }

  private saveUIState(): void {
    localStorage.setItem(UI_STATE_KEY, JSON.stringify({
      inspectorTab: this.selectedActantIdx,
      dynamicNotepad: this.selectedDynamicNotepad,
    }));
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

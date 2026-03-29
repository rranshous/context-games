// main.ts — Client bootstrap: login → lobby → game (poll + render)

import { SodAPI } from './api.js';
import { Renderer } from './renderer.js';
import { UI } from './ui.js';
import type { GameState, Side } from '../shared/types.js';

const api = new SodAPI();
let renderer: Renderer | null = null;
let ui: UI | null = null;
let currentGameId: string | null = null;
let playerHandle: string = '';
let playerSide: Side = 'left';
let latestState: GameState | null = null;
let lastTick = -1;
let pollInterval: number | null = null;

// --- Screens ---
const loginScreen = document.getElementById('login-screen')!;
const lobbyScreen = document.getElementById('lobby-screen')!;
const gameScreen = document.getElementById('game-screen')!;

function showScreen(screen: HTMLElement): void {
  loginScreen.style.display = 'none';
  lobbyScreen.style.display = 'none';
  gameScreen.style.display = 'none';
  // Each screen just needs to be visible; body handles centering via flexbox
  screen.style.display = screen === gameScreen ? 'block' : 'block';
}

// --- Login ---
const loginForm = document.getElementById('login-form') as HTMLFormElement;
const handleInput = document.getElementById('handle-input') as HTMLInputElement;

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const handle = handleInput.value.trim();
  if (!handle) return;
  try {
    const result = await api.login(handle);
    playerHandle = result.handle;
    // Store token for reconnect
    sessionStorage.setItem('sod-token', result.token);
    sessionStorage.setItem('sod-handle', result.handle);
    showLobby();
  } catch (err: any) {
    alert('Login failed: ' + err.message);
  }
});

// --- Lobby element refs (must be hoisted before auto-login) ---
const gamesListEl = document.getElementById('games-list')!;
const createGameBtn = document.getElementById('create-game-btn')!;
const lobbyHandleEl = document.getElementById('lobby-handle')!;

// Auto-login from session storage
const savedToken = sessionStorage.getItem('sod-token');
const savedHandle = sessionStorage.getItem('sod-handle');
if (savedToken && savedHandle) {
  // Re-login to validate (server may have restarted)
  api.login(savedHandle).then(() => {
    playerHandle = savedHandle;
    showLobby();
  }).catch(() => {
    sessionStorage.clear();
    showScreen(loginScreen);
  });
} else {
  showScreen(loginScreen);
}

async function showLobby(): Promise<void> {
  showScreen(lobbyScreen);
  lobbyHandleEl.textContent = playerHandle;
  await refreshGamesList();
  startLobbyRefresh();
}

async function refreshGamesList(): Promise<void> {
  try {
    const games = await api.listGames();
    gamesListEl.innerHTML = '';

    if (games.length === 0) {
      gamesListEl.innerHTML = '<div class="no-games">No games yet. Create one!</div>';
      return;
    }

    for (const g of games) {
      const div = document.createElement('div');
      div.className = 'game-entry';
      const leftH = g.players.left?.handle ?? '???';
      const rightH = g.players.right?.handle ?? '???';
      const status = g.phase === 'lobby' ? 'WAITING' :
        g.phase === 'playing' ? `PLAYING (${Math.floor(g.elapsed)}s)` :
          `FINISHED — ${g.winner} wins`;

      div.innerHTML = `<span class="game-id">${g.id}</span>
        <span class="game-players">${leftH} vs ${rightH}</span>
        <span class="game-status">${status}</span>`;

      // Can join if lobby and not already in
      if (g.phase === 'lobby') {
        const isCreator = (g.players.left?.handle === playerHandle) ||
          (g.players.right?.handle === playerHandle);
        if (!isCreator) {
          const joinBtn = document.createElement('button');
          joinBtn.textContent = 'Join';
          joinBtn.className = 'join-btn';
          joinBtn.addEventListener('click', () => joinGame(g.id));
          div.appendChild(joinBtn);
        } else {
          const waitSpan = document.createElement('span');
          waitSpan.textContent = ' (waiting...)';
          waitSpan.style.color = '#aaa';
          div.appendChild(waitSpan);
        }
      }

      // Can spectate/rejoin if playing and you're a player
      if (g.phase === 'playing') {
        const isPlayer = (g.players.left?.handle === playerHandle) ||
          (g.players.right?.handle === playerHandle);
        if (isPlayer) {
          const playBtn = document.createElement('button');
          playBtn.textContent = 'Play';
          playBtn.className = 'join-btn';
          playBtn.addEventListener('click', () => {
            const side = g.players.left?.handle === playerHandle ? 'left' : 'right';
            enterGame(g.id, side as Side);
          });
          div.appendChild(playBtn);
        }
      }

      gamesListEl.appendChild(div);
    }
  } catch (err) {
    console.error('Failed to list games:', err);
  }
}

createGameBtn.addEventListener('click', async () => {
  try {
    const game = await api.createGame('left');
    await refreshGamesList();
  } catch (err: any) {
    alert('Failed to create game: ' + err.message);
  }
});

// Refresh lobby every 2s
let lobbyRefresh: number | null = null;
function startLobbyRefresh(): void {
  stopLobbyRefresh();
  lobbyRefresh = window.setInterval(refreshGamesList, 2000);
}
function stopLobbyRefresh(): void {
  if (lobbyRefresh !== null) {
    clearInterval(lobbyRefresh);
    lobbyRefresh = null;
  }
}

async function joinGame(gameId: string): Promise<void> {
  try {
    const game = await api.joinGame(gameId);
    const side = game.players.left?.handle === playerHandle ? 'left' : 'right';
    enterGame(gameId, side as Side);
  } catch (err: any) {
    alert('Failed to join: ' + err.message);
  }
}

// --- Game ---
function enterGame(gameId: string, side: Side): void {
  stopLobbyRefresh();
  currentGameId = gameId;
  playerSide = side;
  lastTick = -1;
  latestState = null;

  showScreen(gameScreen);

  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  if (!renderer) {
    renderer = new Renderer(canvas);
    renderer.playerSide = side;
    // Scale canvas
    const container = document.getElementById('game-container')!;
    const scale = Math.min(
      (window.innerWidth - 40) / renderer.width,
      (window.innerHeight - 140) / renderer.height,
    );
    canvas.style.width = `${renderer.width * scale}px`;
    canvas.style.height = `${renderer.height * scale}px`;
    container.style.width = `${renderer.width * scale}px`;
  }

  if (!ui) {
    ui = new UI(renderer, api, canvas, gameId, side);
  } else {
    ui.updateGame(gameId, side);
  }

  startPolling();
  startRenderLoop();
}

// Poll server for state
function startPolling(): void {
  if (pollInterval !== null) clearInterval(pollInterval);
  pollInterval = window.setInterval(async () => {
    if (!currentGameId) return;
    try {
      const state = await api.getState(currentGameId, lastTick);
      if (state) {
        latestState = state;
        lastTick = state.tick;
        if (ui) ui.latestState = state;
      }
    } catch (err) {
      // Ignore transient errors
    }
  }, 100);
}

// Render loop
let renderRunning = false;
function startRenderLoop(): void {
  if (renderRunning) return;
  renderRunning = true;

  function render() {
    if (latestState && renderer) {
      renderer.render(latestState);
      if (ui) {
        ui.updateGoldDisplay(latestState);
        ui.updateEventLog(latestState);
      }
    }
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
}

// Back to lobby on game end
document.addEventListener('keydown', (e) => {
  if ((e.key === ' ' || e.key === 'r') && latestState?.phase === 'finished') {
    if (pollInterval !== null) clearInterval(pollInterval);
    pollInterval = null;
    currentGameId = null;
    latestState = null;
    lastTick = -1;
    showLobby();
    startLobbyRefresh();
  }
});

// Surrender button in HUD
document.getElementById('surrender-btn')?.addEventListener('click', async () => {
  if (!currentGameId) return;
  try {
    await api.surrender(currentGameId);
  } catch (err: any) {
    alert(err.message);
  }
});

// Back button in HUD
document.getElementById('back-btn')?.addEventListener('click', () => {
  if (pollInterval !== null) clearInterval(pollInterval);
  pollInterval = null;
  currentGameId = null;
  latestState = null;
  lastTick = -1;
  showLobby();
  startLobbyRefresh();
});

// Start lobby refresh if we're on lobby screen
if (lobbyScreen.style.display !== 'none') {
  startLobbyRefresh();
}

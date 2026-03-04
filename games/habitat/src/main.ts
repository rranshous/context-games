// main.ts — Bootstrap, wire everything together

import { TicTacToeServer } from './game-server';
import { ChatServer } from './chat-server';
import { CanvasServer } from './canvas-server';
import { NotepadServer } from './notepad-server';
import { BoardServer } from './board-server';
import { createDefaultSoma } from './soma';
import { buildWorld } from './world';
import { Actant } from './actant';
import { HabitatUI } from './ui';

// ── Persistence ─────────────────────────────────────────────

const SOMAS_KEY = 'habitat-somas';
const GAMES_KEY = 'habitat-games';
const CHAT_KEY = 'habitat-chat';
const CANVAS_KEY = 'habitat-canvas';
const NOTEPADS_KEY = 'habitat-notepads';
const BOARD_KEY = 'habitat-board';
const ALL_KEYS = [SOMAS_KEY, GAMES_KEY, CHAT_KEY, CANVAS_KEY, NOTEPADS_KEY, BOARD_KEY];

function saveSomas(actants: Actant[]): void {
  localStorage.setItem(SOMAS_KEY, JSON.stringify(actants.map(a => a.soma)));
}

function loadSomas(): Array<import('./soma').Soma> | null {
  try {
    const raw = localStorage.getItem(SOMAS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function saveWorld(): void {
  localStorage.setItem(GAMES_KEY, JSON.stringify(tttServer.toJSON()));
  localStorage.setItem(CHAT_KEY, JSON.stringify(chatServer.toJSON()));
  localStorage.setItem(CANVAS_KEY, JSON.stringify(canvasServer.toJSON()));
  localStorage.setItem(NOTEPADS_KEY, JSON.stringify(notepadServer.toJSON()));
  localStorage.setItem(BOARD_KEY, JSON.stringify(boardServer.toJSON()));
}

function saveAll(): void {
  saveSomas(actants);
  saveWorld();
}

// ── Bootstrap ───────────────────────────────────────────────

// Load or create servers
let tttServer: TicTacToeServer;
let chatServer: ChatServer;
let canvasServer: CanvasServer;

try {
  const gamesRaw = localStorage.getItem(GAMES_KEY);
  tttServer = gamesRaw ? TicTacToeServer.fromJSON(JSON.parse(gamesRaw)) : new TicTacToeServer();
} catch { tttServer = new TicTacToeServer(); }

try {
  const chatRaw = localStorage.getItem(CHAT_KEY);
  chatServer = chatRaw ? ChatServer.fromJSON(JSON.parse(chatRaw)) : new ChatServer();
} catch { chatServer = new ChatServer(); }

try {
  const canvasRaw = localStorage.getItem(CANVAS_KEY);
  canvasServer = canvasRaw ? CanvasServer.fromJSON(JSON.parse(canvasRaw)) : new CanvasServer();
} catch { canvasServer = new CanvasServer(); }

let notepadServer: NotepadServer;
try {
  const notepadsRaw = localStorage.getItem(NOTEPADS_KEY);
  notepadServer = notepadsRaw ? NotepadServer.fromJSON(JSON.parse(notepadsRaw)) : new NotepadServer();
} catch { notepadServer = new NotepadServer(); }

let boardServer: BoardServer;
try {
  const boardRaw = localStorage.getItem(BOARD_KEY);
  boardServer = boardRaw ? BoardServer.fromJSON(JSON.parse(boardRaw)) : new BoardServer();
} catch { boardServer = new BoardServer(); }

const world = buildWorld(tttServer, chatServer, canvasServer, notepadServer, boardServer);

// Load or create somas
const saved = loadSomas();
const alphaSoma = saved?.[0] ?? createDefaultSoma('alpha');
const betaSoma = saved?.[1] ?? createDefaultSoma('beta');

const alpha = new Actant(alphaSoma, world);
const beta = new Actant(betaSoma, world);
const actants = [alpha, beta];

// Wire persistence: save after each tick
const origAlphaTick = alpha.tick.bind(alpha);
const origBetaTick = beta.tick.bind(beta);
alpha.tick = async function () {
  await origAlphaTick();
  if (!resetting) saveAll();
};
beta.tick = async function () {
  await origBetaTick();
  if (!resetting) saveAll();
};

// UI — pass saveWorld so human actions persist too
const ui = new HabitatUI(world, actants, saveWorld);

// Start — alpha fires immediately, beta staggers by half an interval
alpha.startTicking(0);
beta.startTicking(15000);
ui.startRendering();

// Reset button — stop everything, clear all storage, reload
let resetting = false;
document.getElementById('reset-btn')!.addEventListener('click', () => {
  resetting = true;
  alpha.stopTicking();
  beta.stopTicking();
  ui.stopRendering();
  ALL_KEYS.forEach(k => localStorage.removeItem(k));
  location.reload();
});

console.log('[HABITAT] Initialized — 2 actants, world state restored');

// Expose for console access
(window as any).__habitat = {
  world, alpha, beta, ui,
  saveAll,
  resetAll: () => { resetting = true; alpha.stopTicking(); beta.stopTicking(); ui.stopRendering(); ALL_KEYS.forEach(k => localStorage.removeItem(k)); location.reload(); },
};

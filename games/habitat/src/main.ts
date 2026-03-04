// main.ts — Bootstrap, wire everything together

import { TicTacToeServer } from './game-server';
import { createDefaultSoma } from './soma';
import { buildWorld } from './world';
import { Actant } from './actant';
import { HabitatUI } from './ui';

// ── Persistence ─────────────────────────────────────────────

const STORAGE_KEY = 'habitat-somas';

function saveSomas(actants: Actant[]): void {
  const data = actants.map(a => a.soma);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function loadSomas(): Array<import('./soma').Soma> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ── Bootstrap ───────────────────────────────────────────────

const tttServer = new TicTacToeServer();
const world = buildWorld(tttServer);

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
  saveSomas(actants);
};
beta.tick = async function () {
  await origBetaTick();
  saveSomas(actants);
};

// UI
const ui = new HabitatUI(world, actants);

// Start
alpha.startTicking();
beta.startTicking();
ui.startRendering();

console.log('[HABITAT] Initialized — 2 actants, tic-tac-toe server ready');

// Expose for console access
(window as any).__habitat = { world, alpha, beta, ui, saveSomas: () => saveSomas(actants), resetSomas: () => { localStorage.removeItem(STORAGE_KEY); location.reload(); } };

import { step, isThinking, ActantTurn } from './actant.js';
import { appendEcho, appendOutput, updateStatusBar } from '../ui/renderer.js';
import { gameState } from '../engine/state.js';
import { setStatus } from './inspector.js';

let running = false;
let intervalId: number | null = null;

const STEP_DELAY = 4000; // ms between actant turns

export function initAutoplay(): void {
  const autoplayBtn = document.getElementById('btn-autoplay')!;
  const stepBtn = document.getElementById('btn-step')!;

  autoplayBtn.addEventListener('click', () => {
    if (running) {
      stopAutoplay();
      autoplayBtn.classList.remove('active');
      autoplayBtn.textContent = 'Autoplay';
    } else {
      startAutoplay();
      autoplayBtn.classList.add('active');
      autoplayBtn.textContent = 'Pause';
    }
  });

  stepBtn.addEventListener('click', () => {
    if (running) return; // don't step while autoplay is running
    doStep();
  });
}

function startAutoplay(): void {
  if (running) return;
  running = true;
  console.log('[AUTOPLAY] Started');
  doStep(); // immediate first step
  intervalId = window.setInterval(() => {
    if (!isThinking()) doStep();
  }, STEP_DELAY);
}

function stopAutoplay(): void {
  running = false;
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
  setStatus('Paused');
  console.log('[AUTOPLAY] Stopped');
}

async function doStep(): Promise<void> {
  if (isThinking()) return;

  setStatus('Thinking...', 'thinking');

  try {
    const turn = await step();

    // Render the actant's command + output in the game UI (same formatting as human play)
    appendEcho(turn.command);
    appendOutput(turn.gameOutputs);
    updateStatusBar(
      `TURN ${gameState.turnCount} | ROOMS ${gameState.visitedRooms.size} | ITEMS ${gameState.inventory.length}`
    );

    setStatus(`Last: "${turn.command}" (T${turn.turn})`);
  } catch (err: any) {
    console.error('[AUTOPLAY] Error:', err);
    setStatus(`Error: ${err.message}`);
    if (running) {
      stopAutoplay();
      const btn = document.getElementById('btn-autoplay')!;
      btn.classList.remove('active');
      btn.textContent = 'Autoplay';
    }
  }
}

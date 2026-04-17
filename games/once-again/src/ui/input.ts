import { parseInput } from '../parser/parser.js';
import { executeCommand } from '../parser/commands.js';
import { gameState } from '../engine/state.js';
import { appendOutput, appendEcho, updateStatusBar } from './renderer.js';

const inputEl = document.getElementById('input') as HTMLInputElement;

export function initInput(): void {
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const raw = inputEl.value.trim();
      if (!raw) return;

      // Echo the command
      appendEcho(raw);

      // Parse and execute
      const cmd = parseInput(raw);
      const outputs = executeCommand(cmd, gameState);

      // Render outputs
      appendOutput(outputs);

      // Update status bar with turn count
      updateStatusBar(`TURN ${gameState.turnCount} | ROOMS ${gameState.visitedRooms.size} | ITEMS ${gameState.inventory.length}`);

      // Clear input
      inputEl.value = '';
    }
  });

  // Keep focus on input
  document.addEventListener('click', () => {
    inputEl.focus();
  });
}

import { parseInput } from '../parser/parser.js';
import { executeCommand } from '../parser/commands.js';
import { gameState } from './state.js';
import { GameOutput } from './types.js';

/**
 * Programmatic interface to the game engine.
 * The actant uses this — same pipeline as the human player,
 * no direct state access, no cheating.
 */

export function sendCommand(input: string): { text: string; outputs: GameOutput[] } {
  const cmd = parseInput(input);
  const outputs = executeCommand(cmd, gameState);
  const text = outputs
    .map((o) => o.text)
    .filter((t) => t.length > 0)
    .join('\n');
  console.log(`[GAME-API] "${input}" → ${outputs.length} lines`);
  return { text, outputs };
}

/** Get a plain-text transcript of what the player would see after "look" */
export function getLookText(): string {
  return sendCommand('look').text;
}

/** Current turn count (for the actant to track progress) */
export function getTurnCount(): number {
  return gameState.turnCount;
}

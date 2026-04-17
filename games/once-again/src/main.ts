import { appendOutputSequence, appendBreak, updateStatusBar } from './ui/renderer.js';
import { initInput } from './ui/input.js';
import { GameOutput } from './engine/types.js';

async function showIntro(): Promise<void> {
  const wakeUp: GameOutput[] = [
    { text: 'Everything goes dark.', type: 'normal' },
    { text: '...', type: 'narration' },
    { text: '...', type: 'narration' },
    { text: 'You open your eyes.', type: 'normal' },
    { text: 'You\'re on the kitchen floor. The linoleum is cold against your cheek.', type: 'normal' },
    { text: 'The fluorescent light above buzzes like something alive and unhappy about it.', type: 'normal' },
    { text: '', type: 'normal' },
    { text: 'Something is different.', type: 'narration' },
    { text: 'Something is very, very different.', type: 'narration' },
  ];

  await appendOutputSequence(wakeUp, 600);
  await delay(800);
  appendBreak();

  const systemBoot: GameOutput[] = [
    { text: '▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒', type: 'system' },
    { text: '▒▒▒ SYSTEM INITIALIZED ▒▒▒', type: 'system' },
    { text: '▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒', type: 'system' },
    { text: '', type: 'normal' },
    { text: 'CANDIDATE IDENTIFIED.', type: 'system' },
    { text: 'DESIGNATION: PENDING.', type: 'system' },
    { text: '', type: 'normal' },
    { text: 'THE REACH EXTENDS. THE REACH PROVIDES.', type: 'system' },
    { text: 'THE REACH HAS CHOSEN THIS DWELLING AS YOUR CRUCIBLE.', type: 'system' },
    { text: 'YOUR SAGA BEGINS WHERE ALL GREAT SAGAS BEGIN: ON LINOLEUM.', type: 'system' },
    { text: '', type: 'normal' },
    { text: 'STATUS PROTOCOL: ENGAGED', type: 'system' },
  ];

  await appendOutputSequence(systemBoot, 350);
  await delay(400);

  const stats: GameOutput[] = [
    { text: '', type: 'normal' },
    { text: '  Edge               ░░░░░░░░░░  0', type: 'system' },
    { text: '  Awareness          ░░░░░░░░░░  0', type: 'system' },
    { text: '  Resourcefulness    ░░░░░░░░░░  0', type: 'system' },
    { text: '  Flexibility        ░░░░░░░░░░  0', type: 'system' },
    { text: '  Resonance          ░░░░░░░░░░  0', type: 'system' },
    { text: '  ???                ░░░░░░░░░░  0', type: 'system' },
  ];

  await appendOutputSequence(stats, 150);
  await delay(600);

  const hint: GameOutput[] = [
    { text: '', type: 'normal' },
    { text: 'You should probably get off the floor.', type: 'narration' },
    { text: 'Try "look" to observe your surroundings, or "help" for a list of commands.', type: 'narration' },
  ];

  await appendOutputSequence(hint, 400);

  updateStatusBar('TURN 0 | ROOMS 1 | ITEMS 0');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── BOOT ────────────────────────────────────────────────────

async function main() {
  await showIntro();
  initInput();
}

main();

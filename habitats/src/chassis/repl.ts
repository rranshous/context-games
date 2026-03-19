/**
 * REPL — thin shell for the habitat actant's collaborative frame.
 *
 * Admin types → habitat thinks → habitat responds.
 * Only `watch` and `exit` are handled directly.
 * Everything else goes through habitatSoma.onHumanInput().
 */

import * as readline from 'node:readline';
import { HabitatSoma } from '../soma/habitat-soma.js';
import { enableGate, print, toggleWatch } from './logger.js';

interface ReplContext {
  habitatSoma: HabitatSoma;
}

export function startRepl(ctx: ReplContext): void {
  enableGate();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\nhabitat> ',
  });

  print('\n  Welcome to the habitat. Type anything to talk to me.');
  print('  "watch" toggles live tick output. Ctrl+C to exit.\n');
  rl.prompt();

  let processing = false;

  rl.on('line', async (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) {
      rl.prompt();
      return;
    }

    // Direct commands — no inference
    if (trimmed === 'watch') {
      const on = toggleWatch();
      print(`  watch mode: ${on ? 'ON — live output' : 'OFF — quiet'}`);
      rl.prompt();
      return;
    }

    if (trimmed === 'exit' || trimmed === 'quit') {
      process.emit('SIGINT' as NodeJS.Signals);
      return;
    }

    // Everything else goes to the habitat actant
    if (processing) {
      print('  (still thinking...)');
      return;
    }

    processing = true;
    print('  thinking...');

    try {
      const response = await ctx.habitatSoma.onHumanInput(trimmed);
      print(`\n${response}`);
    } catch (err) {
      print(`  error: ${(err as Error).message}`);
    } finally {
      processing = false;
      rl.prompt();
    }
  });

  rl.on('close', () => {
    process.emit('SIGINT' as NodeJS.Signals);
  });
}

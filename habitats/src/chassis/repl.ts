/**
 * REPL — thin shell for the habitat actant's collaborative frame.
 *
 * Admin types → habitat thinks → habitat responds.
 * Only `watch` and `exit` are handled directly.
 * Everything else goes through habitatSoma.onHumanInput().
 * Messages queued while thinking are drained in order.
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
  const inputQueue: string[] = [];

  async function processInput(input: string): Promise<void> {
    processing = true;
    print('  thinking...');

    try {
      const response = await ctx.habitatSoma.onHumanInput(input);
      print(`\n${response}`);
    } catch (err) {
      print(`  error: ${(err as Error).message}`);
    } finally {
      processing = false;
      drainQueue();
    }
  }

  function drainQueue(): void {
    if (processing || inputQueue.length === 0) {
      rl.prompt();
      return;
    }
    const next = inputQueue.shift()!;
    print(`\n  (queued) "${next}"`);
    processInput(next);
  }

  rl.on('line', (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) {
      rl.prompt();
      return;
    }

    // Direct commands — no inference, no queue
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

    // Queue if busy, process immediately if not
    if (processing) {
      inputQueue.push(trimmed);
      print(`  (queued — ${inputQueue.length} waiting)`);
      return;
    }

    processInput(trimmed);
  });

  rl.on('close', () => {
    process.emit('SIGINT' as NodeJS.Signals);
  });
}

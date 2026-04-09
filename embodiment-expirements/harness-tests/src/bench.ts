#!/usr/bin/env npx tsx
/**
 * CLI for running AgentBench harness tests.
 *
 * Usage:
 *   npx tsx src/bench.ts run --agent bare-haiku --start 0 --count 10
 *   npx tsx src/bench.ts run --agent bare-haiku,bare-sonnet --start 0 --count 5
 *   npx tsx src/bench.ts list-agents
 *   npx tsx src/bench.ts list-tasks
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { AGENTS } from './agents/index.js';
import { Controller } from './controller.js';
import { runBench } from './runner.js';
import type { BenchRun } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Load .env
const envPath = join(ROOT, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [key, ...rest] = trimmed.split('=');
      process.env[key] ??= rest.join('=');
    }
  }
}

function usage() {
  console.log(`
Usage: npx tsx src/bench.ts <command> [options]

Commands:
  run           Run benchmark
  list-agents   List available agents
  list-tasks    Check controller for available tasks

Run options:
  --agent NAME[,NAME]   Agent(s) to run (required)
  --start N             Starting sample index (default: 0)
  --count N             Number of samples (default: 10)
  --verbose             Show per-round details
  --task NAME           Task name (default: os-std)
  --attempts N          Multi-run: retry each task N times with persistent soma (default: 1)
  `.trim());
}

function parseArgs(args: string[]) {
  const opts: Record<string, string> = {};
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        opts[key] = next;
        i++;
      } else {
        opts[key] = 'true';
      }
    } else {
      positional.push(arg);
    }
  }

  return { opts, positional };
}

async function main() {
  const { opts, positional } = parseArgs(process.argv.slice(2));
  const command = positional[0];

  if (!command || command === 'help') {
    usage();
    process.exit(0);
  }

  if (command === 'list-agents') {
    console.log('Available agents:');
    for (const name of Object.keys(AGENTS)) {
      console.log(`  ${name}`);
    }
    return;
  }

  if (command === 'list-tasks') {
    const controller = new Controller();
    const workers = await controller.listWorkers();
    console.log('Registered tasks:');
    for (const [name, info] of Object.entries(workers)) {
      const w = info as any;
      const workerCount = Object.keys(w.workers ?? {}).length;
      console.log(`  ${name} (${workerCount} worker(s), ${w.indices?.length ?? '?'} samples)`);
    }
    return;
  }

  if (command === 'run') {
    const agentNames = (opts.agent ?? '').split(',').filter(Boolean);
    if (agentNames.length === 0) {
      console.error('Error: --agent required. Use list-agents to see options.');
      process.exit(1);
    }

    const start = parseInt(opts.start ?? '0', 10);
    const count = parseInt(opts.count ?? '10', 10);
    const verbose = opts.verbose === 'true';
    const task = opts.task ?? 'os-std';
    const maxAttempts = parseInt(opts.attempts ?? '1', 10);
    const indices = Array.from({ length: count }, (_, i) => start + i);

    const allRuns: BenchRun[] = [];

    for (const name of agentNames) {
      const agent = AGENTS[name];
      if (!agent) {
        console.error(`Unknown agent: ${name}. Available: ${Object.keys(AGENTS).join(', ')}`);
        process.exit(1);
      }

      const run = await runBench({ agent, task, indices, maxAttempts, verbose });
      allRuns.push(run);
    }

    // Save results
    const resultsDir = join(ROOT, 'results');
    mkdirSync(resultsDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${agentNames.join('_')}_${timestamp}.json`;
    const outPath = join(resultsDir, filename);
    writeFileSync(outPath, JSON.stringify(allRuns, null, 2));
    console.log(`\nResults saved to ${outPath}`);

    // Comparison table if multiple agents
    if (allRuns.length > 1) {
      console.log('\n' + '='.repeat(60));
      console.log('Comparison:');
      console.log(`${'Agent'.padEnd(20)} ${'Pass'.padEnd(8)} ${'Rate'.padEnd(8)} ${'Avg Rnd'.padEnd(8)} ${'Avg Time'.padEnd(10)}`);
      console.log('-'.repeat(60));
      for (const run of allRuns) {
        const s = run.summary;
        console.log(
          `${run.agent.padEnd(20)} ${`${s.passed}/${s.total}`.padEnd(8)} ${`${(s.passRate * 100).toFixed(0)}%`.padEnd(8)} ${s.avgRounds.toFixed(1).padEnd(8)} ${`${(s.avgDurationMs / 1000).toFixed(1)}s`.padEnd(10)}`
        );
      }
    }

    return;
  }

  console.error(`Unknown command: ${command}`);
  usage();
  process.exit(1);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});

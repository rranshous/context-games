#!/usr/bin/env npx tsx
/**
 * CLI for running TALES text adventure benchmarks.
 *
 * Usage:
 *   npx tsx src/bench.ts run --agent bare-haiku --env JerichoEnvZork1 --steps 50
 *   npx tsx src/bench.ts run --agent bare-haiku --env TWCookingLevel3 --episodes 3
 *   npx tsx src/bench.ts list-agents
 *   npx tsx src/bench.ts list-envs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { AGENTS } from './agents/index.js';
import { TalesBridge } from './controller.js';
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
  list-envs     List available TALES environments

Run options:
  --agent NAME          Agent to run (required)
  --env NAME            TALES environment (required)
  --episodes N          Number of episodes (default: 1)
  --steps N             Max steps per episode (default: 50)
  --verbose             Show per-step details
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

  if (command === 'list-envs') {
    const bridge = new TalesBridge();
    try {
      const envs = await bridge.listEnvs();
      console.log(`Available environments (${envs.length}):`);
      for (const name of envs) {
        console.log(`  ${name}`);
      }
    } catch (e: any) {
      console.error('Could not connect to TALES bridge. Is tales-bridge.py running?');
      console.error(`  Error: ${e.message}`);
      process.exit(1);
    }
    return;
  }

  if (command === 'run') {
    const agentName = opts.agent;
    const envName = opts.env;

    if (!agentName) {
      console.error('Error: --agent required. Use list-agents to see options.');
      process.exit(1);
    }
    if (!envName) {
      console.error('Error: --env required. Use list-envs to see options.');
      process.exit(1);
    }

    const agent = AGENTS[agentName];
    if (!agent) {
      console.error(`Unknown agent: ${agentName}. Available: ${Object.keys(AGENTS).join(', ')}`);
      process.exit(1);
    }

    const episodes = parseInt(opts.episodes ?? '1', 10);
    const maxSteps = parseInt(opts.steps ?? '50', 10);
    const verbose = opts.verbose === 'true';

    const run = await runBench({ agent, env: envName, episodes, maxSteps, verbose });

    // Save results
    const resultsDir = join(ROOT, 'results');
    mkdirSync(resultsDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${agentName}_${envName}_${timestamp}.json`;
    const outPath = join(resultsDir, filename);
    writeFileSync(outPath, JSON.stringify(run, null, 2));
    console.log(`\nResults saved to ${outPath}`);

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

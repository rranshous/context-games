#!/usr/bin/env npx tsx
/**
 * CLI for zork-search — systematic actant design experiment.
 *
 * Usage:
 *   npx tsx src/main.ts tournament --env JerichoEnvZork1 --verbose
 *   npx tsx src/main.ts single --config mounted_rolling_tool_event_driven_memory_tools --model anthropic/claude-sonnet-4.6 --env JerichoEnvZork1
 *   npx tsx src/main.ts list-configs
 *   npx tsx src/main.ts list-envs
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { TalesBridge } from './bridge.js';
import { generateScreeningConfigs, generateAblationConfigs } from './configs.js';
import { runTournament, runSingleConfig } from './tournament.js';
import type { ExperimentConfig } from './types.js';

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
Usage: npx tsx src/main.ts <command> [options]

Commands:
  tournament       Run full tournament (Phase 1→2→3)
  single           Run a single config
  list-configs     List screening configs
  list-envs        List TALES environments
  estimate         Estimate token cost for tournament

Tournament options:
  --env NAME              TALES environment (default: JerichoEnvZork1)
  --verbose               Show per-step details
  --skip-phase1           Skip free model screening, go straight to sonnet
  --phase1-model MODEL    Override Phase 1 model
  --phase2-model MODEL    Override Phase 2 model
  --phase1-episodes N     Episodes per config in Phase 1 (default: 1)
  --phase2-episodes N     Episodes per config in Phase 2 (default: 1)
  --phase3-episodes N     Episodes per config in Phase 3 (default: 2)
  --top-n N               How many configs to promote per phase (default: 5)

Single options:
  --config ID             Config ID (from list-configs)
  --model MODEL           Model to use
  --env NAME              TALES environment
  --episodes N            Number of episodes (default: 1)
  --steps N               Max steps per episode (default: 50)
  --wakeups N             Max wakeups per episode (default: 50)
  --verbose               Show per-step details

  Or specify dimensions directly:
  --memory blob|structured|auto_curated|mounted
  --history rolling|summarized|full|none
  --action free_text|tool|structured
  --reflection every_step|periodic|event_driven|actant_controlled
  --self-mod none|memory_only|memory_tools|full_soma
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

function buildConfigFromArgs(opts: Record<string, string>): ExperimentConfig {
  const model = opts.model ?? 'anthropic/claude-sonnet-4.6';
  const memory = (opts.memory ?? 'mounted') as any;
  const history = (opts.history ?? 'rolling') as any;
  const action = (opts.action ?? 'tool') as any;
  const reflection = (opts.reflection ?? 'event_driven') as any;
  const selfMod = (opts['self-mod'] ?? 'memory_tools') as any;
  const maxSteps = parseInt(opts.steps ?? '50', 10);
  const maxWakeups = parseInt(opts.wakeups ?? '50', 10);

  const modelShort = model.split('/').pop()?.replace(/[^a-z0-9]/gi, '') ?? 'unknown';
  const id = opts.config ?? `${memory}_${history}_${action}_${reflection}_${selfMod}_${modelShort}`;

  return {
    id,
    memory, history, action, reflection, selfMod, model,
    maxSteps, maxWakeups,
    historyWindow: 20,
    periodicInterval: 5,
    thinkingBudget: parseInt(opts['thinking'] ?? '2048', 10),
  };
}

async function main() {
  const { opts, positional } = parseArgs(process.argv.slice(2));
  const command = positional[0];

  if (!command || command === 'help') {
    usage();
    process.exit(0);
  }

  if (command === 'list-envs') {
    const bridge = new TalesBridge();
    try {
      const envs = await bridge.listEnvs();
      console.log(`Available environments (${envs.length}):`);
      for (const name of envs) console.log(`  ${name}`);
    } catch (e: any) {
      console.error('Could not connect to TALES bridge. Is tales-bridge.py running?');
      console.error(`  Error: ${e.message}`);
      process.exit(1);
    }
    return;
  }

  if (command === 'list-configs') {
    const model = opts.model ?? 'anthropic/claude-sonnet-4.6';
    const configs = generateScreeningConfigs(model);
    console.log(`Screening configs for ${model} (${configs.length}):\n`);
    for (const c of configs) {
      console.log(`  ${c.id}`);
      console.log(`    mem=${c.memory} hist=${c.history} act=${c.action} ref=${c.reflection} mod=${c.selfMod}`);
    }
    return;
  }

  if (command === 'estimate') {
    const model = opts.model ?? 'anthropic/claude-sonnet-4.6';
    const configs = generateScreeningConfigs(model);

    // Rough estimates
    const tokensPerStep = 4000; // ~3K input + ~1K output
    const p1Steps = configs.length * 30 * 1; // configs × steps × episodes
    const p2Steps = 20 * 40 * 1;
    const p3Steps = 3 * 60 * 2;

    const p1Cost = model.includes('free') ? 0 : p1Steps * tokensPerStep * (3 + 15) / 2 / 1_000_000;
    const p2Cost = p2Steps * tokensPerStep * (3 + 15) / 2 / 1_000_000;
    const p3Cost = p3Steps * tokensPerStep * (3 + 15) / 2 / 1_000_000;

    console.log('Tournament cost estimate:');
    console.log(`  Phase 1: ${configs.length} configs × 30 steps × 1 ep = ${p1Steps} steps → ~$${p1Cost.toFixed(2)}`);
    console.log(`  Phase 2: ~20 configs × 40 steps × 1 ep = ${p2Steps} steps → ~$${p2Cost.toFixed(2)}`);
    console.log(`  Phase 3: 3 configs × 60 steps × 2 ep = ${p3Steps} steps → ~$${p3Cost.toFixed(2)}`);
    console.log(`  Total: ~$${(p1Cost + p2Cost + p3Cost).toFixed(2)}`);
    return;
  }

  if (command === 'tournament') {
    const env = opts.env ?? 'JerichoEnvZork1';
    await runTournament({
      env,
      verbose: opts.verbose === 'true',
      skipPhase1: opts['skip-phase1'] === 'true',
      phase1Model: opts['phase1-model'],
      phase2Model: opts['phase2-model'],
      phase3Model: opts['phase3-model'],
      phase1Episodes: opts['phase1-episodes'] ? parseInt(opts['phase1-episodes'], 10) : undefined,
      phase2Episodes: opts['phase2-episodes'] ? parseInt(opts['phase2-episodes'], 10) : undefined,
      phase3Episodes: opts['phase3-episodes'] ? parseInt(opts['phase3-episodes'], 10) : undefined,
      topN: opts['top-n'] ? parseInt(opts['top-n'], 10) : undefined,
    });
    return;
  }

  if (command === 'single') {
    const env = opts.env ?? 'JerichoEnvZork1';
    const config = buildConfigFromArgs(opts);
    const episodes = parseInt(opts.episodes ?? '1', 10);
    const verbose = opts.verbose === 'true';

    console.log(`Running single config: ${config.id}`);
    await runSingleConfig(config, env, episodes, verbose);
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

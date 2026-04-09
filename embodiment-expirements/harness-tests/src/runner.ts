/**
 * Runs agent(s) against AgentBench tasks and collects results.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Controller } from './controller.js';
import type { Agent, SampleResult, BenchRun, FCMessage } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = join(__dirname, '..', 'results', 'logs');

const MAX_ROUNDS = 8;
const TASK = 'os-std';

export interface RunOptions {
  agent: Agent;
  task?: string;
  indices: number[];
  maxRounds?: number;
  maxAttempts?: number; // multi-run: retry same task N times with persistent soma
  verbose?: boolean;
}

/** Run a single sample: start → loop → score. */
async function runSample(
  controller: Controller,
  agent: Agent,
  task: string,
  index: number,
  maxRounds: number,
  verbose: boolean,
): Promise<SampleResult> {
  const start = Date.now();

  try {
    const { sessionId, data } = await controller.startSample(task, index);

    // Some tasks fail to initialize (container setup error). Skip gracefully.
    if (data.messages.length === 0) {
      return {
        index,
        agent: agent.name,
        score: 0,
        rounds: 0,
        status: 'task_setup_failed',
        durationMs: Date.now() - start,
        error: 'No initial messages — task worker failed to set up environment',
      };
    }

    // Build up conversation history
    const history: FCMessage[] = [...data.messages];

    if (verbose) {
      const userMsg = data.messages.find(m => m.role === 'user');
      const preview = (userMsg?.content ?? '').slice(0, 120).replace(/\n/g, ' ');
      console.log(`  [${index}] ${preview}...`);
    }

    let rounds = 0;
    let lastResult = { finish: false, status: 'running', reward: 0, metrics: { score: 0 } } as any;

    for (rounds = 1; rounds <= maxRounds; rounds++) {
      // Agent decides
      const agentMessages = await agent.act(history, data.tools);

      // Send to controller
      lastResult = await controller.interact(sessionId, agentMessages);

      // Append to history
      history.push(...agentMessages);
      history.push(...(lastResult.messages ?? []));

      if (verbose) {
        for (const msg of agentMessages) {
          for (const tc of msg.tool_calls ?? []) {
            const args = tc.function.arguments.slice(0, 80);
            console.log(`    r${rounds}: ${tc.function.name}(${args})`);
          }
        }
      }

      if (lastResult.finish || lastResult.status !== 'running') break;
    }

    // Write full conversation log
    try {
      mkdirSync(LOGS_DIR, { recursive: true });
      const logFile = join(LOGS_DIR, `${agent.name}_${task}_${index}.json`);
      writeFileSync(logFile, JSON.stringify({ index, agent: agent.name, task, history, result: lastResult }, null, 2));
    } catch { /* logging is best-effort */ }

    return {
      index,
      agent: agent.name,
      score: lastResult.metrics?.score ?? 0,
      rounds,
      status: lastResult.status,
      durationMs: Date.now() - start,
    };
  } catch (err: any) {
    return {
      index,
      agent: agent.name,
      score: 0,
      rounds: 0,
      status: 'error',
      durationMs: Date.now() - start,
      error: err.message,
    };
  }
}

/** Run a batch of samples and produce a BenchRun summary. */
export async function runBench(opts: RunOptions): Promise<BenchRun> {
  const controller = new Controller();
  const task = opts.task ?? TASK;
  const maxRounds = opts.maxRounds ?? MAX_ROUNDS;
  const maxAttempts = opts.maxAttempts ?? 1;
  const verbose = opts.verbose ?? false;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Agent: ${opts.agent.name} | Task: ${task} | Samples: ${opts.indices.length}${maxAttempts > 1 ? ` | Max attempts: ${maxAttempts}` : ''}`);
  console.log('='.repeat(60));

  const samples: SampleResult[] = [];

  for (const index of opts.indices) {
    let bestResult: SampleResult | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const result = await runSample(controller, opts.agent, task, index, maxRounds, verbose);

      const icon = result.score > 0 ? '✓' : '✗';
      const attemptLabel = maxAttempts > 1 ? ` a${attempt}` : '';
      console.log(`  ${icon} [${index}]${attemptLabel} score=${result.score} rounds=${result.rounds} ${result.durationMs}ms${result.error ? ' ERR: ' + result.error : ''}`);

      // Notify agent of attempt completion (for soma persistence)
      if (opts.agent.onAttemptComplete) {
        opts.agent.onAttemptComplete(result.score, attempt);
      }

      bestResult = result;

      // Stop retrying if we scored
      if (result.score > 0) break;
    }

    samples.push(bestResult!);
  }

  const passed = samples.filter(s => s.score > 0).length;
  const run: BenchRun = {
    agent: opts.agent.name,
    task,
    timestamp: new Date().toISOString(),
    samples,
    summary: {
      total: samples.length,
      passed,
      passRate: samples.length > 0 ? passed / samples.length : 0,
      avgRounds: samples.length > 0 ? samples.reduce((s, r) => s + r.rounds, 0) / samples.length : 0,
      avgDurationMs: samples.length > 0 ? samples.reduce((s, r) => s + r.durationMs, 0) / samples.length : 0,
    },
  };

  console.log(`\nSummary: ${passed}/${run.summary.total} passed (${(run.summary.passRate * 100).toFixed(0)}%) | avg ${run.summary.avgRounds.toFixed(1)} rounds | avg ${(run.summary.avgDurationMs / 1000).toFixed(1)}s`);

  return run;
}

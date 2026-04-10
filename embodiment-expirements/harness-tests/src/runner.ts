/**
 * Runs agent(s) against TALES text adventure games and collects results.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { TalesBridge } from './controller.js';
import type { Agent, EpisodeResult, BenchRun, TalesState, Playthrough } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = join(__dirname, '..', 'results', 'logs');

export interface RunOptions {
  agent: Agent;
  env: string;
  episodes?: number;
  maxSteps?: number;
  verbose?: boolean;
  maxReflections?: number;
}

/** Run a single episode: reset → loop actions → score. */
async function runEpisode(
  bridge: TalesBridge,
  agent: Agent,
  env: string,
  maxSteps: number,
  verbose: boolean,
  episode: number,
): Promise<EpisodeResult> {
  const start = Date.now();

  try {
    let state = await bridge.reset(env);
    agent.reset(state.observation, state);

    if (verbose) {
      const preview = state.observation.slice(0, 120).replace(/\n/g, ' ');
      console.log(`  [ep${episode}] ${preview}...`);
    }

    if (agent.runEpisode) {
      // v4+: agent owns the loop. We give it the bridge step function.
      // Use a wrapper that prints verbose output as actions are taken.
      let stepCounter = 0;
      const wrappedBridge = {
        step: async (action: string) => {
          stepCounter++;
          const newState = await bridge.step(action);
          if (verbose) {
            console.log(`    s${stepCounter}: "${action}" → score=${newState.score}${newState.won ? ' WON' : ''}`);
          }
          return newState;
        },
      };
      state = await agent.runEpisode(wrappedBridge, state, maxSteps);
    } else if (agent.act) {
      // Classic v0-v3: runner owns the loop, calls agent.act for each step
      for (let step = 1; step <= maxSteps; step++) {
        const action = await agent.act(state.observation, state);

        state = await bridge.step(action);

        if (verbose) {
          console.log(`    s${step}: "${action}" → score=${state.score}${state.won ? ' WON' : ''}`);
        }

        if (state.done) break;
      }
    } else {
      throw new Error('Agent must implement either act() or runEpisode()');
    }

    // Notify agent episode is done
    if (agent.onEpisodeComplete) {
      agent.onEpisodeComplete(state, episode);
    }

    // Save playthrough log if agent supports it
    try {
      mkdirSync(LOGS_DIR, { recursive: true });
      const steps = agent.getPlaythrough?.() ?? [];
      const playthrough: Playthrough = {
        agent: agent.name,
        env,
        episode,
        timestamp: new Date().toISOString(),
        steps,
        finalScore: state.score,
        maxScore: state.max_score,
        won: state.won,
        totalSteps: state.steps,
      };
      const logFile = join(LOGS_DIR, `${agent.name}_${env}_ep${episode}.json`);
      writeFileSync(logFile, JSON.stringify(playthrough, null, 2));
    } catch { /* best-effort */ }

    return {
      env,
      agent: agent.name,
      score: state.score,
      maxScore: state.max_score,
      steps: state.steps,
      won: state.won,
      durationMs: Date.now() - start,
    };
  } catch (err: any) {
    return {
      env,
      agent: agent.name,
      score: 0,
      maxScore: 0,
      steps: 0,
      won: false,
      durationMs: Date.now() - start,
      error: err.message,
    };
  }
}

/** Run multiple episodes and produce a BenchRun summary. */
export async function runBench(opts: RunOptions): Promise<BenchRun> {
  const bridge = new TalesBridge();
  const episodes = opts.episodes ?? 1;
  const maxSteps = opts.maxSteps ?? 50;
  const verbose = opts.verbose ?? false;

  if (opts.maxReflections !== undefined && opts.agent.setMaxReflections) {
    opts.agent.setMaxReflections(opts.maxReflections);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Agent: ${opts.agent.name} | Env: ${opts.env} | Episodes: ${episodes} | Max steps: ${maxSteps}${opts.maxReflections !== undefined ? ` | Max reflections: ${opts.maxReflections}` : ''}`);
  console.log('='.repeat(60));

  const results: EpisodeResult[] = [];

  for (let ep = 1; ep <= episodes; ep++) {
    const result = await runEpisode(bridge, opts.agent, opts.env, maxSteps, verbose, ep);
    results.push(result);

    const icon = result.won ? '✓' : '✗';
    const norm = result.maxScore > 0 ? (result.score / result.maxScore * 100).toFixed(0) : '?';
    console.log(`  ${icon} ep${ep}: ${result.score}/${result.maxScore} (${norm}%) ${result.steps} steps ${result.durationMs}ms${result.error ? ' ERR: ' + result.error : ''}`);
  }

  const wins = results.filter(r => r.won).length;
  const avgScore = results.reduce((s, r) => s + r.score, 0) / results.length;
  const avgNorm = results.reduce((s, r) => s + (r.maxScore > 0 ? r.score / r.maxScore : 0), 0) / results.length;

  const run: BenchRun = {
    agent: opts.agent.name,
    env: opts.env,
    timestamp: new Date().toISOString(),
    episodes: results,
    summary: {
      total: results.length,
      wins,
      winRate: results.length > 0 ? wins / results.length : 0,
      avgScore,
      avgNormScore: avgNorm,
      avgSteps: results.reduce((s, r) => s + r.steps, 0) / results.length,
      avgDurationMs: results.reduce((s, r) => s + r.durationMs, 0) / results.length,
    },
  };

  console.log(`\nSummary: ${wins}/${run.summary.total} won | avg score: ${avgScore.toFixed(1)} (${(avgNorm * 100).toFixed(0)}%) | avg ${run.summary.avgSteps.toFixed(0)} steps`);

  return run;
}

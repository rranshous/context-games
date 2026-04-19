/**
 * Episode runner + result collection.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { TalesBridge } from './bridge.js';
import { runAgent, type AgentRunResult } from './agent.js';
import type { ExperimentConfig, EpisodeResult, TournamentResult } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = join(__dirname, '..', 'results', 'logs');
const RESULTS_DIR = join(__dirname, '..', 'results');

export interface RunOptions {
  config: ExperimentConfig;
  env: string;
  episodes: number;
  verbose: boolean;
}

/** Run a single config for N episodes and return aggregated results. */
export async function runConfig(opts: RunOptions): Promise<TournamentResult> {
  const bridge = new TalesBridge();
  const episodes: EpisodeResult[] = [];

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Config: ${opts.config.id}`);
  console.log(`  memory=${opts.config.memory} history=${opts.config.history} action=${opts.config.action}`);
  console.log(`  reflection=${opts.config.reflection} selfMod=${opts.config.selfMod} model=${opts.config.model}`);
  console.log(`  maxSteps=${opts.config.maxSteps} maxWakeups=${opts.config.maxWakeups}`);
  console.log('─'.repeat(60));

  for (let ep = 1; ep <= opts.episodes; ep++) {
    try {
      const initialState = await bridge.reset(opts.env);

      const result = await runAgent(
        opts.config,
        {
          step: (action: string) => bridge.step(action),
          reset: () => bridge.reset(opts.env),
        },
        initialState,
        opts.env,
        ep,
        opts.verbose,
      );

      episodes.push(result.episodeResult);

      // Save step log
      mkdirSync(LOGS_DIR, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const logFile = join(LOGS_DIR, `${opts.config.id}_ep${ep}_${ts}.json`);
      writeFileSync(logFile, JSON.stringify({
        config: opts.config,
        episode: ep,
        result: result.episodeResult,
        steps: result.stepLogs,
      }, null, 2));

      const icon = result.episodeResult.won ? '✓' : '✗';
      const norm = result.episodeResult.maxScore > 0
        ? (result.episodeResult.bestScore / result.episodeResult.maxScore * 100).toFixed(0)
        : '?';
      console.log(`  ${icon} ep${ep}: best=${result.episodeResult.bestScore}/${result.episodeResult.maxScore} (${norm}%) ${result.episodeResult.totalWakeups} wakes ${result.episodeResult.durationMs}ms ~${result.episodeResult.tokenEstimate.input + result.episodeResult.tokenEstimate.output} tok`);
    } catch (err: any) {
      console.log(`  ✗ ep${ep}: ERROR — ${err.message.slice(0, 200)}`);
      episodes.push({
        configId: opts.config.id,
        env: opts.env,
        episode: ep,
        score: 0,
        maxScore: 0,
        steps: 0,
        won: false,
        lives: 0,
        bestScore: 0,
        totalWakeups: 0,
        durationMs: 0,
        tokenEstimate: { input: 0, output: 0 },
        error: err.message,
      });
    }
  }

  const avgScore = episodes.reduce((s, e) => s + e.bestScore, 0) / episodes.length;
  const avgNorm = episodes.reduce((s, e) => s + (e.maxScore > 0 ? e.bestScore / e.maxScore : 0), 0) / episodes.length;
  const best = Math.max(...episodes.map(e => e.bestScore));
  const avgWakeups = episodes.reduce((s, e) => s + e.totalWakeups, 0) / episodes.length;
  const avgInput = episodes.reduce((s, e) => s + e.tokenEstimate.input, 0) / episodes.length;
  const avgOutput = episodes.reduce((s, e) => s + e.tokenEstimate.output, 0) / episodes.length;

  const tournament: TournamentResult = {
    phase: '',
    configId: opts.config.id,
    config: opts.config,
    episodes,
    avgScore,
    avgNormScore: avgNorm,
    bestScore: best,
    avgWakeups,
    avgTokens: { input: avgInput, output: avgOutput },
  };

  console.log(`  → avg=${avgScore.toFixed(1)} best=${best} norm=${(avgNorm * 100).toFixed(0)}% wakes=${avgWakeups.toFixed(0)}`);

  return tournament;
}

/** Save tournament results to disk. */
export function saveResults(phase: string, results: TournamentResult[]): string {
  mkdirSync(RESULTS_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${phase}_${timestamp}.json`;
  const outPath = join(RESULTS_DIR, filename);

  // Tag each result with its phase
  for (const r of results) r.phase = phase;

  writeFileSync(outPath, JSON.stringify({
    phase,
    timestamp: new Date().toISOString(),
    results: results.sort((a, b) => b.avgScore - a.avgScore),
    ranking: results
      .sort((a, b) => b.avgScore - a.avgScore)
      .map((r, i) => `${i + 1}. ${r.configId}: avg=${r.avgScore.toFixed(1)} best=${r.bestScore} norm=${(r.avgNormScore * 100).toFixed(0)}%`),
  }, null, 2));

  return outPath;
}

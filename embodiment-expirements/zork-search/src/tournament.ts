/**
 * Tournament runner — multi-phase experiment orchestration.
 *
 * Phase 1 (screening): Run ~20 configs on a free model, short episodes.
 *   → Identify which dimension levels are clearly bad.
 *   → Rank configs by average score.
 *
 * Phase 2 (ablation): Take top configs from Phase 1, run on sonnet.
 *   → Ablate each dimension from the winner to confirm what matters.
 *
 * Phase 3 (evaluation): Full-length runs on the best configs.
 *   → Final ranking.
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { generateScreeningConfigs, generateAblationConfigs } from './configs.js';
import { runConfig, saveResults } from './runner.js';
import type { ExperimentConfig, TournamentResult } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(__dirname, '..', 'results');

const FREE_MODEL = 'google/gemma-4-31b-it:free';
const SONNET_MODEL = 'anthropic/claude-sonnet-4.6';

export interface TournamentOptions {
  env: string;
  verbose: boolean;
  skipPhase1?: boolean;  // skip free model screening, go straight to sonnet
  phase1Model?: string;
  phase2Model?: string;
  phase3Model?: string;
  phase1Episodes?: number;
  phase2Episodes?: number;
  phase3Episodes?: number;
  topN?: number;         // how many configs to promote from each phase
}

export async function runTournament(opts: TournamentOptions): Promise<void> {
  const {
    env,
    verbose,
    phase1Model = FREE_MODEL,
    phase2Model = SONNET_MODEL,
    phase3Model = SONNET_MODEL,
    phase1Episodes = 1,
    phase2Episodes = 1,
    phase3Episodes = 2,
    topN = 5,
  } = opts;

  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║          ZORK SEARCH — TOURNAMENT MODE              ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  // ── Phase 1: Screening ──────────────────────────────────────

  let phase1Results: TournamentResult[] = [];

  if (!opts.skipPhase1) {
    console.log('\n═══ PHASE 1: SCREENING ═══');
    console.log(`Model: ${phase1Model}`);
    console.log(`Episodes per config: ${phase1Episodes}\n`);

    const configs = generateScreeningConfigs(phase1Model);
    console.log(`Generated ${configs.length} screening configs.\n`);

    for (const config of configs) {
      try {
        const result = await runConfig({
          config,
          env,
          episodes: phase1Episodes,
          verbose,
        });
        phase1Results.push(result);
      } catch (err: any) {
        console.log(`  SKIP ${config.id}: ${err.message.slice(0, 100)}`);
      }
    }

    const p1File = saveResults('phase1', phase1Results);
    console.log(`\nPhase 1 results saved to ${p1File}`);

    printRanking('PHASE 1 RANKING', phase1Results);
  }

  // ── Phase 2: Ablation ───────────────────────────────────────

  console.log('\n═══ PHASE 2: SONNET ABLATION ═══');
  console.log(`Model: ${phase2Model}`);
  console.log(`Episodes per config: ${phase2Episodes}\n`);

  // Get top N configs from Phase 1 (or use defaults if Phase 1 skipped)
  let phase2Configs: ExperimentConfig[];

  if (phase1Results.length > 0) {
    const topConfigs = phase1Results
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, Math.min(topN, phase1Results.length));

    // Generate ablation configs around each winner
    const allAblations: ExperimentConfig[] = [];
    for (const winner of topConfigs) {
      const ablations = generateAblationConfigs(winner.config, phase2Model);
      for (const a of ablations) {
        if (!allAblations.some(x => x.id === a.id)) {
          allAblations.push(a);
        }
      }
    }
    phase2Configs = allAblations;
  } else {
    // No Phase 1 — generate screening configs directly with sonnet
    phase2Configs = generateScreeningConfigs(phase2Model);
  }

  console.log(`Generated ${phase2Configs.length} ablation configs.\n`);

  const phase2Results: TournamentResult[] = [];
  for (const config of phase2Configs) {
    try {
      const result = await runConfig({
        config,
        env,
        episodes: phase2Episodes,
        verbose,
      });
      phase2Results.push(result);
    } catch (err: any) {
      console.log(`  SKIP ${config.id}: ${err.message.slice(0, 100)}`);
    }
  }

  const p2File = saveResults('phase2', phase2Results);
  console.log(`\nPhase 2 results saved to ${p2File}`);

  printRanking('PHASE 2 RANKING', phase2Results);

  // ── Phase 3: Full evaluation ────────────────────────────────

  console.log('\n═══ PHASE 3: FULL EVALUATION ═══');
  console.log(`Model: ${phase3Model}`);
  console.log(`Episodes per config: ${phase3Episodes}\n`);

  const top3 = phase2Results
    .sort((a, b) => b.avgScore - a.avgScore)
    .slice(0, Math.min(3, phase2Results.length));

  const phase3Results: TournamentResult[] = [];
  for (const winner of top3) {
    // Use the stored config directly — no need to reconstruct from ID
    const fullConfig: ExperimentConfig = {
      ...winner.config,
      model: phase3Model,
      maxSteps: 60,
      maxWakeups: 60,
    };
    const modelShort = phase3Model.split('/').pop()?.replace(/[^a-z0-9]/gi, '') ?? '';
    fullConfig.id = `${fullConfig.memory}_${fullConfig.history}_${fullConfig.action}_${fullConfig.reflection}_${fullConfig.selfMod}_${modelShort}`;

    try {
      const result = await runConfig({
        config: fullConfig,
        env,
        episodes: phase3Episodes,
        verbose,
      });
      phase3Results.push(result);
    } catch (err: any) {
      console.log(`  SKIP ${fullConfig.id}: ${err.message.slice(0, 100)}`);
    }
  }

  const p3File = saveResults('phase3', phase3Results);
  console.log(`\nPhase 3 results saved to ${p3File}`);

  printRanking('FINAL RANKING', phase3Results);

  // ── Summary ─────────────────────────────────────────────────

  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║                TOURNAMENT COMPLETE                   ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  const allResults = [...phase1Results, ...phase2Results, ...phase3Results];
  const totalTokens = allResults.reduce((s, r) =>
    s + r.episodes.reduce((es, e) => es + e.tokenEstimate.input + e.tokenEstimate.output, 0), 0);
  const totalEpisodes = allResults.reduce((s, r) => s + r.episodes.length, 0);

  console.log(`Total episodes run: ${totalEpisodes}`);
  console.log(`Total tokens used: ~${totalTokens.toLocaleString()}`);

  const best = allResults.sort((a, b) => b.avgScore - a.avgScore)[0];
  if (best) {
    console.log(`\nBest config: ${best.configId}`);
    console.log(`  avg score: ${best.avgScore.toFixed(1)}`);
    console.log(`  best score: ${best.bestScore}`);
    console.log(`  norm: ${(best.avgNormScore * 100).toFixed(0)}%`);
  }
}

/** Run a single config (for manual testing). */
export async function runSingleConfig(
  config: ExperimentConfig,
  env: string,
  episodes: number,
  verbose: boolean,
): Promise<TournamentResult> {
  const result = await runConfig({ config, env, episodes, verbose });
  const file = saveResults('single', [result]);
  console.log(`\nResults saved to ${file}`);
  return result;
}

// ── Helpers ──────────────────────────────────────────────────

function printRanking(title: string, results: TournamentResult[]): void {
  if (results.length === 0) return;

  const sorted = [...results].sort((a, b) => b.avgScore - a.avgScore);
  console.log(`\n┌─── ${title} ${'─'.repeat(Math.max(0, 50 - title.length))}┐`);
  for (const [i, r] of sorted.entries()) {
    const tokens = r.episodes.reduce((s, e) => s + e.tokenEstimate.input + e.tokenEstimate.output, 0);
    console.log(`│ ${i + 1}. ${r.configId.slice(0, 40).padEnd(40)} avg=${r.avgScore.toFixed(1).padStart(5)} best=${String(r.bestScore).padStart(3)} ~${(tokens / 1000).toFixed(0)}k tok │`);
  }
  console.log(`└${'─'.repeat(75)}┘`);
}

/** Load previous phase results from disk. */
export function loadPhaseResults(phase: string): TournamentResult[] {
  if (!existsSync(RESULTS_DIR)) return [];
  const files = readdirSync(RESULTS_DIR).filter(f => f.startsWith(phase + '_') && f.endsWith('.json'));
  if (files.length === 0) return [];

  // Use the most recent file
  files.sort().reverse();
  const data = JSON.parse(readFileSync(join(RESULTS_DIR, files[0]), 'utf-8'));
  return data.results ?? [];
}

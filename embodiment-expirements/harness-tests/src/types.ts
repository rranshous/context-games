/**
 * Types for the TALES text adventure harness.
 */

// ── TALES bridge types ──────────────────────────────────────

/** Response from POST /reset and POST /step */
export interface TalesState {
  active: boolean;
  env_name: string;
  observation: string;
  done: boolean;
  steps: number;
  score: number;
  max_score: number;
  won: boolean;
  lost: boolean;
  admissible_commands: string[] | null;
}

// ── Agent interface ─────────────────────────────────────────

/**
 * The contract every agent implementation must satisfy.
 * Text in, text out — matches the TALES protocol.
 */
export interface Agent {
  name: string;

  /**
   * Called when a new game starts.
   * @param observation - initial game text
   * @param info - game state (score, commands, etc)
   */
  reset(observation: string, info: TalesState): void;

  /**
   * Decide the next action.
   * @param observation - current game text
   * @param info - game state (score, commands, etc)
   * @returns the action string to take
   */
  act(observation: string, info: TalesState): Promise<string>;

  /**
   * Called when a game episode ends.
   * Optional — for agents that learn across episodes.
   */
  onEpisodeComplete?(info: TalesState, episode: number): void;
}

// ── Run results ─────────────────────────────────────────────

export interface EpisodeResult {
  env: string;
  agent: string;
  score: number;
  maxScore: number;
  steps: number;
  won: boolean;
  durationMs: number;
  error?: string;
}

export interface BenchRun {
  agent: string;
  env: string;
  timestamp: string;
  episodes: EpisodeResult[];
  summary: {
    total: number;
    wins: number;
    winRate: number;
    avgScore: number;
    avgNormScore: number;
    avgSteps: number;
    avgDurationMs: number;
  };
}

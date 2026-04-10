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
   *
   * Used by classic act-based agents (v0-v3, bare). v4+ agents use runEpisode instead.
   */
  act?(observation: string, info: TalesState): Promise<string>;

  /**
   * Run a full episode. The agent owns the loop and calls bridge methods directly.
   * Optional — only used by agents (v4+) where the model's body interacts with
   * the world via me.takeAction() rather than returning actions to the runner.
   *
   * The agent should:
   *   - Run for up to maxSteps OR until the bridge reports done
   *   - Return the final TalesState
   *   - Capture playthrough steps internally for getPlaythrough()
   */
  runEpisode?(
    bridge: {
      step(action: string): Promise<TalesState>;
      reset(): Promise<TalesState>;
    },
    initialState: TalesState,
    maxSteps: number,
  ): Promise<TalesState>;

  /**
   * Called when a game episode ends.
   * Optional — for agents that learn across episodes.
   */
  onEpisodeComplete?(info: TalesState, episode: number): void;

  /**
   * Get the playthrough log for the current/last episode.
   * Optional — only embodied agents track this.
   */
  getPlaythrough?(): PlaythroughStep[];

  /**
   * Override the per-episode reflection/inference budget.
   * Optional — only agents that gate on a reflection budget (v3+) implement this.
   */
  setMaxReflections?(n: number): void;
}

// ── Playthrough capture ─────────────────────────────────────

/** A single tool call made by the agent (internal or external) */
export interface PlaythroughToolCall {
  name: string;
  args: Record<string, any>;
  result?: string;
}

/** Full snapshot of one step in a playthrough */
export interface PlaythroughStep {
  step: number;
  observation: string;       // what the game showed
  thinking: string[];        // model's text responses alongside tool calls
  toolCalls: PlaythroughToolCall[];  // all tool calls this step (edits + action)
  action: string;            // the take_action that was sent to TALES
  score: number;
  maxScore: number;
  // v3+ fields
  reflectionsTriggered?: string[];   // prompts passed to me.reflectOn() this step
  reflectionTurnsUsed?: number;      // total reflection turns consumed up to and including this step
  compositeScore?: number;            // game_score - (reflectionTurnsUsed * penalty)
  soma: {                    // soma state AFTER this step's edits
    identity: string;
    goal: string;
    memory: string;
    history: string[] | string; // v4 makes this a string
    things_noticed?: string;          // v3
    on_tick?: string;
    on_score?: string;
    notice?: string;                  // v3
    on_observation?: string;          // v1
    on_history?: string;              // v1
    recent_thoughts?: string;         // v4
  };
}

/** Complete playthrough log for one episode */
export interface Playthrough {
  agent: string;
  env: string;
  episode: number;
  timestamp: string;
  steps: PlaythroughStep[];
  finalScore: number;
  maxScore: number;
  won: boolean;
  totalSteps: number;
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

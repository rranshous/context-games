/**
 * Core types for zork-search: the systematic actant design experiment.
 */

// ── TALES bridge ──────────────────────────────────────────────

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

// ── Experiment dimensions ─────────────────────────────────────

export type MemoryArch =
  | 'blob'           // single text blob (v8 style)
  | 'structured'     // separate map_knowledge, puzzle_tracker, exploration_log, general_memory
  | 'auto_curated'   // chassis auto-populates world model + actant curates notes
  | 'mounted'        // mount/unmount pattern — actant pins/unpins named sections
  | 'hybrid';        // auto_curated world model + mounted custom sections

export type HistoryHandling =
  | 'rolling'        // last N lines of transcript
  | 'summarized'     // chassis compresses every N steps
  | 'full'           // complete transcript in soma
  | 'none';          // no transcript — rely on memory

export type ActionInterface =
  | 'free_text'      // model outputs game command as last line of text
  | 'tool'           // take_action(command) tool call
  | 'structured';    // named tools: go(dir), examine(thing), take(item), etc.

export type ReflectionPattern =
  | 'every_step'     // inference every step
  | 'periodic'       // every N steps (default 5)
  | 'event_driven'   // on score change + death + every 10 steps
  | 'actant_controlled'; // actant decides via budget

export type SelfModScope =
  | 'none'           // no self-modification tools
  | 'memory_only'    // can edit memory sections
  | 'memory_tools'   // memory + custom tools
  | 'full_soma';     // memory, identity, on_tick, custom tools

// ── Experiment config ─────────────────────────────────────────

export interface ExperimentConfig {
  id: string;
  memory: MemoryArch;
  history: HistoryHandling;
  action: ActionInterface;
  reflection: ReflectionPattern;
  selfMod: SelfModScope;
  model: string;
  maxSteps: number;
  maxWakeups: number;
  historyWindow: number;   // for rolling: how many lines; for summarized: summary interval
  periodicInterval: number; // for periodic reflection: every N steps
  thinkingBudget: number;  // extended thinking token budget (anthropic models)
}

// ── Results ───────────────────────────────────────────────────

export interface StepLog {
  step: number;
  observation: string;
  action: string;
  score: number;
  maxScore: number;
  wakeupUsed: boolean;
  thinking: string[];
  toolCalls: { name: string; args: any; result?: string }[];
  somaSnapshot: Record<string, string>;
}

export interface EpisodeResult {
  configId: string;
  env: string;
  episode: number;
  score: number;
  maxScore: number;
  steps: number;
  won: boolean;
  lives: number;
  bestScore: number;
  totalWakeups: number;
  durationMs: number;
  tokenEstimate: { input: number; output: number };
  error?: string;
}

export interface TournamentResult {
  phase: string;
  configId: string;
  config: ExperimentConfig;
  episodes: EpisodeResult[];
  avgScore: number;
  avgNormScore: number;
  bestScore: number;
  avgWakeups: number;
  avgTokens: { input: number; output: number };
}

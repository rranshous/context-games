/**
 * Types for the AgentBench FC harness.
 *
 * Two format families live here:
 * - FC (OpenAI function-calling) — what the AgentRL controller speaks
 * - Agent — our internal interface that agent implementations use
 */

// ── AgentBench FC controller types ──────────────────────────

/** OpenAI-style function-calling tool definition */
export interface FCTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/** OpenAI-style message (system, user, assistant, tool) */
export interface FCMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  tool_calls?: FCToolCall[];
  tool_call_id?: string;
}

export interface FCToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON-stringified
  };
}

/** Response from POST /api/start_sample */
export interface StartSampleResponse {
  messages: FCMessage[];
  tools: FCTool[];
}

/** Response from POST /api/interact */
export interface InteractResponse {
  finish: boolean;
  reward: number;
  status: 'running' | 'completed' | 'task limit reached' | 'task error' | 'cancelled';
  messages: FCMessage[];
  metrics: { score: number };
}

// ── Agent interface ─────────────────────────────────────────

/**
 * The contract every agent implementation must satisfy.
 * Given the conversation so far and available tools, return tool calls.
 */
export interface Agent {
  name: string;

  /**
   * Decide the next action.
   * @param messages - full conversation history (FC format)
   * @param tools - available tool definitions (FC format)
   * @returns assistant message(s) with tool_calls
   */
  act(messages: FCMessage[], tools: FCTool[]): Promise<FCMessage[]>;

  /**
   * Notify the agent that an attempt just finished.
   * Called between multi-run attempts. Soma persists, history resets.
   * Optional — bare agents don't need this.
   */
  onAttemptComplete?(score: number, attempt: number): void;
}

// ── Run results ─────────────────────────────────────────────

export interface SampleResult {
  index: number;
  agent: string;
  score: number;
  rounds: number;
  status: string;
  durationMs: number;
  error?: string;
}

export interface BenchRun {
  agent: string;
  task: string;
  model?: string;
  timestamp: string;
  samples: SampleResult[];
  summary: {
    total: number;
    passed: number;
    passRate: number;
    avgRounds: number;
    avgDurationMs: number;
  };
}

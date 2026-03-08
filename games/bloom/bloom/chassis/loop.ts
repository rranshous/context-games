import { readSoma, assembleSomaPrompt, readSection } from './soma-io.js';
import { buildToolSchemas, executeTool, compileCustomTools } from './tools.js';
import { callAnthropic } from './inference.js';
import { buildThingsNoticed, recordHistory, pollChatSignals } from './memory-manager.js';
import type { Signal, ActionRecord } from './memory-manager.js';
import type Anthropic from '@anthropic-ai/sdk';

const MAX_TURNS = 15;
const TICK_INTERVAL_MS = parseInt(process.env.TICK_INTERVAL || '60000');
const FRAME_URL = process.env.FRAME_URL || 'http://localhost:4444';

// Rough char-to-token ratio. Sonnet 4.6 context is 200K tokens ≈ 800K chars.
const MAX_CONTEXT_CHARS = 800_000;

function postActivity(type: string, detail: string): void {
  fetch(`${FRAME_URL}/api/activity`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, detail }),
  }).catch(() => {});
}

let lastTickTime = 0;

// --- Signal polling ---

export async function pollSignals(): Promise<Signal[]> {
  const signals: Signal[] = [];

  // Chat signals
  const chatSignals = await pollChatSignals();
  signals.push(...chatSignals);

  // Tick signal (timer)
  const now = Date.now();
  if (now - lastTickTime >= TICK_INTERVAL_MS) {
    lastTickTime = now;
    const identity = readSection('identity.md');
    const stage = detectStage(identity);
    const impulse = getStageImpulse(stage);
    console.log(`[bloom] tick signal — stage ${stage}, impulse: "${impulse}"`);
    signals.push({
      type: 'tick',
      data: { stage, stageImpulse: impulse },
    });
  }

  return signals;
}

// --- Signal dispatch ---

export async function dispatch(signal: Signal): Promise<void> {
  // Build world context
  await buildThingsNoticed(signal);

  // Compile signal handler from soma
  const soma = readSoma();
  const impulse = runSignalHandler(soma.signal_handler, signal);
  if (!impulse) {
    console.log(`[bloom] signal ${signal.type} — handler returned null, skipping`);
    return;
  }

  console.log(`[bloom] signal ${signal.type} → impulse: "${impulse.slice(0, 80)}"`);
  postActivity('signal', `${signal.type} → "${impulse.slice(0, 80)}"`);

  // Stateless loop: each turn re-reads soma (mounted files, memory, etc. may have changed)
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const freshSoma = readSoma();
    const system = assembleSomaPrompt(freshSoma);
    const chassisTools = buildToolSchemas();
    const customTools = compileCustomTools(freshSoma.custom_tools);
    const allTools = [...chassisTools, ...customTools];

    const pct = ((system.length / MAX_CONTEXT_CHARS) * 100).toFixed(1);
    if (turn === 0) {
      console.log(`[bloom] soma assembled: ${system.length} chars (${pct}% of context), ${allTools.length} tools`);
    }

    postActivity('inference', `turn ${turn + 1}/${MAX_TURNS} — soma ${pct}%`);
    let streamChars = 0;
    const response = await callAnthropic(system, [{ role: 'user', content: impulse }], allTools, (text) => {
      streamChars += text.length;
      if (streamChars % 500 < text.length) {
        postActivity('thinking', `streaming... ${streamChars} chars`);
      }
    });

    for (const block of response.content) {
      if (block.type === 'text' && block.text) {
        console.log(`[bloom] ${block.text.slice(0, 300)}`);
        postActivity('thinking', block.text.slice(0, 200));
      }
    }

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );

    if (toolUses.length === 0 || response.stop_reason === 'end_turn') {
      break;
    }

    // Execute tools and record to history immediately
    const actions: ActionRecord[] = [];
    for (const use of toolUses) {
      const inputPreview = JSON.stringify(use.input).slice(0, 120);
      console.log(`[bloom]   → ${use.name}(${inputPreview})`);
      postActivity('tool', `→ ${use.name}`);
      try {
        const result = await executeTool(use.name, use.input as Record<string, unknown>);
        console.log(`[bloom]     ✓ ${result.slice(0, 120)}`);
        postActivity('tool_ok', `✓ ${use.name}: ${result.slice(0, 100)}`);
        actions.push({ tool: use.name, input: use.input as Record<string, unknown>, result });
      } catch (err: unknown) {
        const msg = (err as Error).message;
        console.error(`[bloom]   ✗ ${use.name}: ${msg}`);
        postActivity('tool_err', `✗ ${use.name}: ${msg}`);
        actions.push({ tool: use.name, input: use.input as Record<string, unknown>, result: `Error: ${msg}` });
      }
    }

    // Record immediately — next turn's soma will include updated history
    recordHistory(actions);
  }
  postActivity('done', 'dispatch complete');
  console.log('[bloom] dispatch complete\n');
}

// --- Signal handler compilation ---

function runSignalHandler(handlerCode: string, signal: Signal): string | null {
  if (!handlerCode.trim()) {
    // No handler — use stage impulse for ticks, skip otherwise
    if (signal.type === 'tick') return signal.data.stageImpulse as string;
    return null;
  }

  try {
    const fn = new Function('return ' + handlerCode)() as (signal: Signal) => string | null;
    return fn(signal);
  } catch (err: unknown) {
    console.error(`[bloom] signal handler compile error: ${(err as Error).message}`);
    // Fallback: stage impulse for ticks
    if (signal.type === 'tick') return signal.data.stageImpulse as string;
    return null;
  }
}

// --- Stage detection ---

function detectStage(identity: string): number {
  const match = identity.match(/current_stage:\s*(\d+)/);
  return match ? parseInt(match[1]) : 0;
}

function getStageImpulse(stage: number): string {
  // [STAGE:0:begin]
  if (stage === 0) return 'become';
  // [STAGE:0:end]

  // [STAGE:1:begin]
  if (stage === 1) return 'orient';
  // [STAGE:1:end]

  // [STAGE:2:begin]
  if (stage === 2) return 'build';
  // [STAGE:2:end]

  // [STAGE:3:begin]
  if (stage === 3) return 'inhabit';
  // [STAGE:3:end]

  return 'thrive';
}

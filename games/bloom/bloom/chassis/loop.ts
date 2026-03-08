import { readSoma, assembleSomaPrompt, readSection } from './soma-io.js';
import { buildToolSchemas, executeTool, compileCustomTools, type ToolContent } from './tools.js';
import { callAnthropic } from './inference.js';
import { buildThingsNoticed, recordHistory, pollChatSignals } from './memory-manager.js';
import { closeBrowser } from './browser.js';
import type { Signal, ActionRecord } from './memory-manager.js';
import type Anthropic from '@anthropic-ai/sdk';

const MAX_TURNS = 50;
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

  // Stateless loop with one-turn lookback:
  // - Each turn re-reads soma (system prompt) fresh from disk
  // - Messages = [user: impulse] + optional [assistant: last tool_use, user: last tool_result]
  // - The model sees what it just did and what came back, but nothing older
  // - Anything worth keeping must go into soma (memory, identity, mounted files)
  let lastAssistantContent: Anthropic.ContentBlock[] | null = null;
  let lastToolResults: Anthropic.ToolResultBlockParam[] | null = null;

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

    // Build messages: impulse + optional one-turn lookback
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: impulse },
    ];
    if (lastAssistantContent && lastToolResults) {
      messages.push({ role: 'assistant', content: lastAssistantContent });
      messages.push({ role: 'user', content: lastToolResults });
    }

    postActivity('inference', `turn ${turn + 1}/${MAX_TURNS} — soma ${pct}%`);
    let streamChars = 0;
    const response = await callAnthropic(system, messages, allTools, (text) => {
      streamChars += text.length;
      if (streamChars % 500 < text.length) {
        postActivity('thinking', `streaming... ${streamChars} chars`);
      }
    });

    // Pipe text blocks to chat — this is bloom speaking
    // Thinking blocks are private (bloom's inner monologue) — don't post to chat
    for (const block of response.content) {
      if (block.type === 'thinking' && 'thinking' in block) {
        console.log(`[bloom] (thinking) ${(block as { thinking: string }).thinking.slice(0, 200)}`);
        postActivity('thinking', `(private) ${(block as { thinking: string }).thinking.slice(0, 100)}`);
      } else if (block.type === 'text' && block.text) {
        console.log(`[bloom] ${block.text.slice(0, 300)}`);
        postActivity('thinking', block.text.slice(0, 200));
        // Post to chat (fire and forget)
        fetch(`${FRAME_URL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ handle: 'bloom', text: block.text }),
        }).catch(() => {});
      }
    }

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );

    if (toolUses.length === 0 || response.stop_reason === 'end_turn') {
      break;
    }

    // Execute tools, record to history, build lookback for next turn
    const actions: ActionRecord[] = [];
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const use of toolUses) {
      const inputPreview = JSON.stringify(use.input).slice(0, 120);
      console.log(`[bloom]   → ${use.name}(${inputPreview})`);
      postActivity('tool', `→ ${use.name}`);
      try {
        const result: ToolContent = await executeTool(use.name, use.input as Record<string, unknown>);
        // For history: extract text summary from structured content
        const textSummary = typeof result === 'string'
          ? result
          : result.filter(b => b.type === 'text').map(b => (b as Anthropic.TextBlockParam).text).join('\n') || '(image result)';
        console.log(`[bloom]     ✓ ${textSummary.slice(0, 120)}`);
        postActivity('tool_ok', `✓ ${use.name}: ${textSummary.slice(0, 100)}`);
        toolResults.push({ type: 'tool_result', tool_use_id: use.id, content: result });
        actions.push({ tool: use.name, input: use.input as Record<string, unknown>, result: textSummary });
      } catch (err: unknown) {
        const msg = (err as Error).message;
        console.error(`[bloom]   ✗ ${use.name}: ${msg}`);
        postActivity('tool_err', `✗ ${use.name}: ${msg}`);
        toolResults.push({ type: 'tool_result', tool_use_id: use.id, content: `Error: ${msg}`, is_error: true });
        actions.push({ tool: use.name, input: use.input as Record<string, unknown>, result: `Error: ${msg}` });
      }
    }

    // Record to history immediately (soma re-read next turn)
    recordHistory(actions);

    // Set lookback for next turn
    lastAssistantContent = response.content;
    lastToolResults = toolResults;
  }
  // Close browser if it was opened during this dispatch
  await closeBrowser();

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

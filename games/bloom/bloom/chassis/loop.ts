import { readSoma, assembleSomaPrompt } from './soma-io.js';
import { buildToolSchemas, executeTool } from './tools.js';
import { callAnthropic } from './inference.js';
import type Anthropic from '@anthropic-ai/sdk';

const MAX_TURNS = 10;

export async function tick(): Promise<void> {
  const soma = readSoma();
  const system = assembleSomaPrompt(soma);
  const stage = detectStage(soma.identity);
  const impulse = getImpulse(stage, soma);

  console.log(`[bloom] tick — stage ${stage}, impulse: "${impulse}"`);

  const tools = buildToolSchemas();
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: impulse },
  ];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await callAnthropic(system, messages, tools);
    messages.push({ role: 'assistant', content: response.content });

    // Log any text output
    for (const block of response.content) {
      if (block.type === 'text' && block.text) {
        console.log(`[bloom] ${block.text.slice(0, 300)}`);
      }
    }

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );

    if (toolUses.length === 0 || response.stop_reason === 'end_turn') {
      break;
    }

    // Execute tools
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const use of toolUses) {
      console.log(`[bloom]   → ${use.name}`);
      try {
        const result = await executeTool(use.name, use.input as Record<string, unknown>);
        toolResults.push({ type: 'tool_result', tool_use_id: use.id, content: result });
      } catch (err: unknown) {
        const msg = (err as Error).message;
        console.error(`[bloom]   ✗ ${use.name}: ${msg}`);
        toolResults.push({ type: 'tool_result', tool_use_id: use.id, content: `Error: ${msg}`, is_error: true });
      }
    }

    messages.push({ role: 'user', content: toolResults });
  }

  console.log('[bloom] tick complete\n');
}

function detectStage(identity: string): number {
  const match = identity.match(/current_stage:\s*(\d+)/);
  return match ? parseInt(match[1]) : 0;
}

function getImpulse(stage: number, soma: { memory: string }): string {
  // First-run: empty memory means bloom has never existed
  if (!soma.memory.trim()) {
    console.log('[bloom] first run — memory is empty');
  }

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

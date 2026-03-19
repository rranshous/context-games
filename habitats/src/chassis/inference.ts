/**
 * Inference — the bridge to the outside world.
 *
 * Agentic loop: soma as system prompt, impulse as user prompt,
 * tools from active modules. Loops until the model stops calling tools
 * or hits the turn limit.
 */

import Anthropic from '@anthropic-ai/sdk';

// Defaults — inhabitants use these, habitat overrides
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_MAX_TURNS = 5;

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

export interface ThinkAboutOptions {
  soma: Record<string, string | null>;
  impulse: string;
  tools?: Anthropic.Tool[];
  executeTool: (name: string, input: Record<string, unknown>) => unknown;
  model?: string;
  maxTokens?: number;
  maxTurns?: number;
}

export interface ThinkAboutResult {
  text: string;
  toolsUsed: Array<{ name: string; input: Record<string, unknown>; result: unknown }>;
  usage: { input: number; output: number };
}

/**
 * Agentic thinkAbout — loops up to maxTurns, feeding tool results back.
 */
export async function thinkAbout(options: ThinkAboutOptions): Promise<ThinkAboutResult> {
  const {
    soma,
    impulse,
    tools,
    executeTool,
    model = DEFAULT_MODEL,
    maxTokens = DEFAULT_MAX_TOKENS,
    maxTurns = DEFAULT_MAX_TURNS,
  } = options;

  // Build system prompt from soma sections
  const systemParts: string[] = [];
  for (const [section, content] of Object.entries(soma)) {
    if (content === null || content === undefined) continue;
    systemParts.push(`<${section}>\n${content}\n</${section}>`);
  }
  const system = systemParts.join('\n\n');

  const apiClient = getClient();
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: impulse }];
  const toolsUsed: ThinkAboutResult['toolsUsed'] = [];
  let totalInput = 0;
  let totalOutput = 0;
  let finalText = '';

  for (let turn = 0; turn < maxTurns; turn++) {
    const params: Anthropic.MessageCreateParams = {
      model,
      max_tokens: maxTokens,
      system,
      messages,
    };

    if (tools && tools.length > 0) {
      params.tools = tools;
    }

    const response = await apiClient.messages.create(params);

    totalInput += response.usage.input_tokens;
    totalOutput += response.usage.output_tokens;

    // Extract text and tool calls from this turn
    let turnText = '';
    const turnToolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        turnText += block.text;
      } else if (block.type === 'tool_use') {
        turnToolCalls.push({
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        });
      }
    }

    finalText = turnText;

    // If no tool calls, we're done
    if (turnToolCalls.length === 0) {
      break;
    }

    // Add assistant response to conversation
    messages.push({ role: 'assistant', content: response.content });

    // Execute tools and build tool results
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const call of turnToolCalls) {
      const result = executeTool(call.name, call.input);
      toolsUsed.push({ name: call.name, input: call.input, result });
      toolResults.push({
        type: 'tool_result',
        tool_use_id: call.id,
        content: JSON.stringify(result),
      });
    }

    // Add tool results to conversation
    messages.push({ role: 'user', content: toolResults });

    // If the model signaled end_turn (not tool_use), stop
    if (response.stop_reason === 'end_turn') {
      break;
    }
  }

  return {
    text: finalText,
    toolsUsed,
    usage: { input: totalInput, output: totalOutput },
  };
}

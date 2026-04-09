/**
 * Format conversion between OpenAI FC (what AgentBench speaks)
 * and Anthropic API (what our agents use internally).
 *
 * These are pure functions — no side effects.
 */

import type { FCMessage, FCTool, FCToolCall } from './types.js';
import type Anthropic from '@anthropic-ai/sdk';

// ── FC → Anthropic ──────────────────────────────────────────

/** Convert FC tool definitions to Anthropic tool format. */
export function fcToolsToAnthropic(tools: FCTool[]): Anthropic.Tool[] {
  return tools.map(t => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters as Anthropic.Tool['input_schema'],
  }));
}

/**
 * Convert FC message history to Anthropic messages + system prompt.
 * FC uses OpenAI roles; Anthropic needs system separate and tool_result
 * blocks nested inside user messages.
 */
export function fcMessagesToAnthropic(messages: FCMessage[]): {
  system: string;
  messages: Anthropic.MessageParam[];
} {
  let system = '';
  const out: Anthropic.MessageParam[] = [];

  // Collect all tool_call_ids that have a corresponding tool result,
  // so we can strip orphaned tool_use blocks from assistant messages.
  // (AgentBench only executes the first tool call; extras have no result.)
  const answeredToolIds = new Set(
    messages.filter(m => m.role === 'tool' && m.tool_call_id).map(m => m.tool_call_id!)
  );

  for (const msg of messages) {
    switch (msg.role) {
      case 'system':
        system = msg.content ?? '';
        break;

      case 'user':
        out.push({ role: 'user', content: msg.content ?? '' });
        break;

      case 'assistant': {
        const content: Anthropic.ContentBlockParam[] = [];
        if (msg.content) {
          content.push({ type: 'text', text: msg.content });
        }
        if (msg.tool_calls) {
          for (const tc of msg.tool_calls) {
            // Only include tool_use blocks that have a matching tool_result
            if (!answeredToolIds.has(tc.id)) continue;
            content.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.function.name,
              input: JSON.parse(tc.function.arguments),
            });
          }
        }
        if (content.length > 0) {
          out.push({ role: 'assistant', content });
        }
        break;
      }

      case 'tool':
        out.push({
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: msg.tool_call_id!,
            content: msg.content ?? '',
          }],
        });
        break;
    }
  }

  return { system, messages: out };
}

// ── Anthropic → FC ──────────────────────────────────────────

/** Convert an Anthropic API response to FC assistant message(s). */
export function anthropicResponseToFC(response: Anthropic.Message): FCMessage[] {
  let contentText = '';
  const toolCalls: FCToolCall[] = [];

  for (const block of response.content) {
    if (block.type === 'text') {
      contentText = block.text;
    } else if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id,
        type: 'function',
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input),
        },
      });
    }
  }

  const msg: FCMessage = { role: 'assistant' };
  if (contentText) msg.content = contentText;
  if (toolCalls.length > 0) msg.tool_calls = toolCalls;

  return [msg];
}

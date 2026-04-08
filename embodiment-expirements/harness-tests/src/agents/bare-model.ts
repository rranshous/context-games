/**
 * Bare model agent — no embodiment, no soma, just raw Claude + tools.
 *
 * This is the baseline: Claude receives the conversation history and tools
 * directly from AgentBench and responds. No wrapping, no mount system,
 * no extra context management.
 *
 * Three instances exported: bareHaiku, bareSonnet, bareOpus.
 */

import Anthropic from '@anthropic-ai/sdk';
import { fcToolsToAnthropic, fcMessagesToAnthropic, anthropicResponseToFC } from '../format.js';
import type { Agent, FCMessage, FCTool } from '../types.js';

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

function createBareAgent(model: string, label: string): Agent {
  return {
    name: label,

    async act(messages: FCMessage[], tools: FCTool[]): Promise<FCMessage[]> {
      const anthropicTools = fcToolsToAnthropic(tools);
      const { system, messages: anthropicMessages } = fcMessagesToAnthropic(messages);

      const response = await getClient().messages.create({
        model,
        max_tokens: 1024,
        system,
        messages: anthropicMessages,
        tools: anthropicTools,
      });

      return anthropicResponseToFC(response);
    },
  };
}

export const bareHaiku = createBareAgent('claude-haiku-4-5-20251001', 'bare-haiku');
export const bareSonnet = createBareAgent('claude-sonnet-4-5-20250929', 'bare-sonnet');
export const bareOpus = createBareAgent('claude-opus-4-5-20250514', 'bare-opus');

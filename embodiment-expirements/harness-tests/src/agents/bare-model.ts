/**
 * Bare model agent for TALES text adventures.
 *
 * No embodiment — just Claude receiving observations and choosing actions.
 * Maintains a sliding window of conversation history.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Agent, TalesState } from '../types.js';

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

const MAX_HISTORY = 40; // 20 turns (user + assistant pairs)

function createBareAgent(model: string, label: string): Agent {
  let messages: Anthropic.MessageParam[] = [];
  let systemPrompt = '';

  return {
    name: label,

    reset(observation: string, info: TalesState) {
      messages = [];
      systemPrompt = `You are playing a text adventure game (${info.env_name}).

Each turn you receive a text observation and a list of available actions.
Respond with ONLY the action you want to take — nothing else. No explanation, no quotes, just the action text exactly as listed.`;
    },

    async act(observation: string, info: TalesState): Promise<string> {
      // Build user message
      const cmds = info.admissible_commands;
      const cmdsText = cmds && cmds.length > 0
        ? cmds.map(c => `  - ${c}`).join('\n')
        : '(no commands listed — type a valid game command)';

      messages.push({
        role: 'user',
        content: `${observation}\n\nAvailable actions:\n${cmdsText}`,
      });

      // Sliding window
      if (messages.length > MAX_HISTORY) {
        messages = messages.slice(-MAX_HISTORY);
      }

      const response = await getClient().messages.create({
        model,
        max_tokens: 64,
        system: systemPrompt,
        messages,
      });

      const action = response.content[0].type === 'text'
        ? response.content[0].text.trim().replace(/^["']|["']$/g, '')
        : 'look';

      messages.push({ role: 'assistant', content: action });

      return action;
    },
  };
}

export const bareHaiku = createBareAgent('claude-haiku-4-5-20251001', 'bare-haiku');
export const bareSonnet = createBareAgent('claude-sonnet-4-6', 'bare-sonnet');
export const bareOpus = createBareAgent('claude-opus-4-6', 'bare-opus');

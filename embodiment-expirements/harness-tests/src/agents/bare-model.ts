/**
 * Bare model agent for TALES text adventures.
 *
 * No embodiment — just Claude receiving observations and choosing actions.
 * Maintains a sliding window of conversation history.
 * Uses OpenRouter for inference.
 */

import type { Agent, TalesState } from '../types.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_HISTORY = 40; // 20 turns (user + assistant pairs)

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

async function callOpenRouter(model: string, system: string, messages: Message[]): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');

  const resp = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 64,
      messages: [
        { role: 'system', content: system },
        ...messages,
      ],
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`OpenRouter ${resp.status}: ${body}`);
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content?.trim() ?? 'look';
}

function createBareAgent(model: string, label: string): Agent {
  let messages: Message[] = [];
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

      const raw = await callOpenRouter(model, systemPrompt, messages);
      const action = raw.replace(/^["']|["']$/g, '');

      messages.push({ role: 'assistant', content: action });

      return action;
    },
  };
}

export const bareHaiku = createBareAgent('anthropic/claude-haiku-4.5', 'bare-haiku');
export const bareSonnet = createBareAgent('anthropic/claude-sonnet-4.6', 'bare-sonnet');
export const bareOpus = createBareAgent('anthropic/claude-opus-4.6', 'bare-opus');

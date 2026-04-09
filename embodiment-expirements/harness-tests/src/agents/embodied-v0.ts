/**
 * v0 Embodied Agent for TALES text adventures.
 *
 * Soma sections (XML tags):
 *   - identity: first-person, values-based
 *   - goal: starts from game opening, actant can reframe
 *   - memory: flat scratchpad — rooms, objects, plans
 *   - history: chassis-managed, one-liner per step (action → result)
 *
 * Context model:
 *   - System prompt = assembled soma
 *   - Messages = last turn only (take_action result as tool_result)
 *   - First turn: user message is "play"
 *
 * Tools: edit_identity, edit_goal, edit_memory, take_action
 * take_action is the only external tool — returns TALES observation.
 */

import type { Agent, TalesState } from '../types.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// ── Soma ────────────────────────────────────────────────────

interface Soma {
  identity: string;
  goal: string;
  memory: string;
  history: string[];
}

const DEFAULT_IDENTITY = `I am a curious explorer. I map the world as I move through it —
every room, every object, every path gets noted. I don't wander blindly.
When I enter a new place I look around carefully, note the exits,
and decide where to go based on what I haven't seen yet.

I keep my goal in mind. I track what I've tried and what worked.
When I'm stuck, I review my memory and look for something I missed
rather than trying the same thing again.

I write things down. My memory is my map.`;

function assembleSoma(soma: Soma, maxSize: number): string {
  const historyText = soma.history.length > 0
    ? soma.history.join('\n')
    : '(no actions yet)';

  let parts = [
    `<identity>\n${soma.identity}\n</identity>`,
    `<goal>\n${soma.goal || '(no goal set)'}\n</goal>`,
    `<memory>\n${soma.memory || '(empty)'}\n</memory>`,
    `<history>\n${historyText}\n</history>`,
  ];
  let assembled = parts.join('\n\n');

  // Pressure: trim history from front, then memory from front
  if (maxSize > 0 && assembled.length > maxSize) {
    while (assembled.length > maxSize && soma.history.length > 1) {
      soma.history.shift();
      const ht = soma.history.join('\n');
      parts[3] = `<history>\n...\n${ht}\n</history>`;
      assembled = parts.join('\n\n');
    }
    if (assembled.length > maxSize && soma.memory.length > 0) {
      const overflow = assembled.length - maxSize;
      soma.memory = soma.memory.slice(overflow);
      parts[2] = `<memory>\n...${soma.memory}\n</memory>`;
      assembled = parts.join('\n\n');
    }
  }

  return assembled;
}

// ── Tool definitions (OpenAI format for OpenRouter) ─────────

const TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'edit_identity',
      description: 'Rewrite your identity section. Who you are, how you explore.',
      parameters: {
        type: 'object',
        properties: { content: { type: 'string', description: 'New identity content' } },
        required: ['content'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'edit_goal',
      description: 'Rewrite your goal section. What you are trying to accomplish right now.',
      parameters: {
        type: 'object',
        properties: { content: { type: 'string', description: 'New goal content' } },
        required: ['content'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'edit_memory',
      description: 'Rewrite your memory section. Track rooms visited, objects found, map layout, current plans. This is the only way to remember things between turns.',
      parameters: {
        type: 'object',
        properties: { content: { type: 'string', description: 'New memory content' } },
        required: ['content'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'take_action',
      description: 'Take an action in the game. This is how you interact with the world.',
      parameters: {
        type: 'object',
        properties: { action: { type: 'string', description: 'The game action to take' } },
        required: ['action'],
        additionalProperties: false,
      },
    },
  },
];

const INTERNAL_TOOL_NAMES = new Set(['edit_identity', 'edit_goal', 'edit_memory']);
const MAX_INTERNAL_PER_STEP = 5;

// ── OpenRouter call ─────────────────────────────────────────

interface ORMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  tool_calls?: any[];
  tool_call_id?: string;
}

async function callOpenRouter(
  model: string,
  system: string,
  messages: ORMessage[],
  tools: any[],
): Promise<any> {
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
      max_tokens: 512,
      messages: [{ role: 'system', content: system }, ...messages],
      tools,
      tool_choice: 'auto',
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`OpenRouter ${resp.status}: ${body}`);
  }

  return resp.json();
}

// ── Summarize observation for history ───────────────────────

function summarizeObs(obs: string): string {
  // Take first 120 chars, collapse newlines
  const clean = obs.replace(/\n/g, ' ').trim();
  return clean.length > 120 ? clean.slice(0, 120) + '...' : clean;
}

// ── Agent ───────────────────────────────────────────────────

interface EmbodiedV0Options {
  model: string;
  label: string;
  maxSomaSize?: number;
  identity?: string;
}

function createEmbodiedV0Agent(opts: EmbodiedV0Options): Agent {
  const { model, label, maxSomaSize = 0, identity = DEFAULT_IDENTITY } = opts;

  let soma: Soma = { identity, goal: '', memory: '', history: [] };
  let lastTurnMessages: ORMessage[] = [];

  return {
    name: label,

    reset(observation: string, info: TalesState) {
      soma = {
        identity,
        goal: observation, // game opening text becomes initial goal
        memory: '',
        history: [],
      };
      lastTurnMessages = [];
    },

    async act(observation: string, info: TalesState): Promise<string> {
      // Build system prompt from soma
      const system = assembleSoma(soma, maxSomaSize);

      // Messages: last turn if we have one, otherwise "play"
      const messages: ORMessage[] = lastTurnMessages.length > 0
        ? [...lastTurnMessages]
        : [{ role: 'user', content: 'play' }];

      let internalCalls = 0;

      // Loop: model may call edit tools before taking an action
      while (true) {
        const data = await callOpenRouter(model, system, messages, TOOLS);
        const choice = data.choices?.[0]?.message;

        if (!choice) throw new Error('No response from model');

        // Check for tool call
        const toolCall = choice.tool_calls?.[0];

        if (!toolCall) {
          // No tool call — model responded with text. Use it as action.
          const action = choice.content?.trim() ?? 'look';
          soma.history.push(`s${soma.history.length + 1}: "${action}" → ${summarizeObs(observation)}`);
          return action;
        }

        const fnName = toolCall.function.name;
        const fnArgs = JSON.parse(toolCall.function.arguments);

        if (INTERNAL_TOOL_NAMES.has(fnName)) {
          // Internal tool — update soma
          switch (fnName) {
            case 'edit_identity': soma.identity = fnArgs.content; break;
            case 'edit_goal': soma.goal = fnArgs.content; break;
            case 'edit_memory': soma.memory = fnArgs.content; break;
          }

          internalCalls++;

          // Set up messages for next iteration with tool result
          messages.length = 0;
          messages.push({
            role: 'assistant',
            content: choice.content ?? undefined,
            tool_calls: choice.tool_calls,
          });
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: `Updated ${fnName.replace('edit_', '')} section.`,
          });

          if (internalCalls >= MAX_INTERNAL_PER_STEP) {
            // Force an action — call without internal tools
            const forced = await callOpenRouter(model, assembleSoma(soma, maxSomaSize), messages, [TOOLS[3]]); // take_action only
            const fc = forced.choices?.[0]?.message?.tool_calls?.[0];
            if (fc) {
              const action = JSON.parse(fc.function.arguments).action;
              soma.history.push(`s${soma.history.length + 1}: "${action}" → ${summarizeObs(observation)}`);
              return action;
            }
            return 'look';
          }

          continue;
        }

        if (fnName === 'take_action') {
          const action = fnArgs.action;

          // We'll update history with the NEXT observation (not current one)
          // For now, record what we're about to do
          // The history gets the result on the NEXT act() call when we see the new observation

          // Actually — we have the current observation from the last step.
          // Record previous step's result if history is behind
          soma.history.push(`s${soma.history.length + 1}: "${action}"`);

          // Set up last turn for next call: the take_action tool call + its result
          // (result will be filled in on next act() when we get the new observation)
          lastTurnMessages = [
            {
              role: 'assistant',
              tool_calls: choice.tool_calls,
              content: choice.content ?? undefined,
            },
            {
              role: 'tool',
              tool_call_id: toolCall.id,
              content: '', // placeholder — filled on next call
            },
          ];

          return action;
        }

        // Unknown tool
        return 'look';
      }
    },

    onEpisodeComplete(info: TalesState, episode: number) {
      // Could persist soma across episodes here
    },
  };
}

// We need to fill in the tool result from the previous step when act() is called again.
// Let me restructure: the runner calls act() with the new observation AFTER taking the action.
// So on entry to act(), observation is the RESULT of our last action.

function createEmbodiedV0AgentFixed(opts: EmbodiedV0Options): Agent {
  const { model, label, maxSomaSize = 0, identity = DEFAULT_IDENTITY } = opts;

  let soma: Soma = { identity, goal: '', memory: '', history: [] };
  let pendingLastTurn: { toolCalls: any; toolCallId: string } | null = null;

  return {
    name: label,

    reset(observation: string, info: TalesState) {
      soma = {
        identity,
        goal: observation,
        memory: '',
        history: [],
      };
      pendingLastTurn = null;
    },

    async act(observation: string, info: TalesState): Promise<string> {
      // Build last turn messages from pending action + current observation (its result)
      let messages: ORMessage[];

      if (pendingLastTurn) {
        // Update history with the result
        const lastIdx = soma.history.length;
        if (lastIdx > 0) {
          soma.history[lastIdx - 1] += ` → ${summarizeObs(observation)}`;
        }

        messages = [
          {
            role: 'assistant',
            tool_calls: pendingLastTurn.toolCalls,
          },
          {
            role: 'tool',
            tool_call_id: pendingLastTurn.toolCallId,
            content: observation,
          },
        ];
        pendingLastTurn = null;
      } else {
        messages = [{ role: 'user', content: 'play' }];
      }

      const system = assembleSoma(soma, maxSomaSize);
      let internalCalls = 0;

      while (true) {
        const data = await callOpenRouter(model, system, messages, TOOLS);
        const choice = data.choices?.[0]?.message;

        if (!choice) throw new Error('No response from model');

        const toolCall = choice.tool_calls?.[0];

        if (!toolCall) {
          // Text response — use as action
          const action = choice.content?.trim() ?? 'look';
          soma.history.push(`s${soma.history.length + 1}: "${action}"`);
          return action;
        }

        const fnName = toolCall.function.name;
        const fnArgs = JSON.parse(toolCall.function.arguments);

        if (INTERNAL_TOOL_NAMES.has(fnName)) {
          switch (fnName) {
            case 'edit_identity': soma.identity = fnArgs.content; break;
            case 'edit_goal': soma.goal = fnArgs.content; break;
            case 'edit_memory': soma.memory = fnArgs.content; break;
          }

          internalCalls++;

          messages = [
            { role: 'assistant', tool_calls: choice.tool_calls, content: choice.content ?? undefined },
            { role: 'tool', tool_call_id: toolCall.id, content: `Updated ${fnName.replace('edit_', '')} section.` },
          ];

          if (internalCalls >= MAX_INTERNAL_PER_STEP) {
            const forced = await callOpenRouter(model, assembleSoma(soma, maxSomaSize), messages, [TOOLS[3]]);
            const fc = forced.choices?.[0]?.message?.tool_calls?.[0];
            if (fc) {
              const action = JSON.parse(fc.function.arguments).action;
              soma.history.push(`s${soma.history.length + 1}: "${action}"`);
              pendingLastTurn = { toolCalls: forced.choices[0].message.tool_calls, toolCallId: fc.id };
              return action;
            }
            return 'look';
          }

          continue;
        }

        if (fnName === 'take_action') {
          const action = fnArgs.action;
          soma.history.push(`s${soma.history.length + 1}: "${action}"`);
          pendingLastTurn = { toolCalls: choice.tool_calls, toolCallId: toolCall.id };
          return action;
        }

        return 'look';
      }
    },

    onEpisodeComplete(info: TalesState, episode: number) {},
  };
}

// ── Exports ─────────────────────────────────────────────────

export const embodiedV0Haiku = createEmbodiedV0AgentFixed({
  model: 'anthropic/claude-haiku-4.5',
  label: 'embodied-v0-haiku',
});

export const embodiedV0Sonnet = createEmbodiedV0AgentFixed({
  model: 'anthropic/claude-sonnet-4.6',
  label: 'embodied-v0-sonnet',
});

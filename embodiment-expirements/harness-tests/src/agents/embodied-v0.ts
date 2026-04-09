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
 *
 * Captures full playthrough log for the viewer.
 */

import type { Agent, TalesState, PlaythroughStep, PlaythroughToolCall } from '../types.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// ── Soma ────────────────────────────────────────────────────

interface Soma {
  identity: string;
  goal: string;
  memory: string;
  history: string[];
}

const DEFAULT_IDENTITY = `I am a thread of curiosity pulled taut through dark rooms.
Every doorway is a promise, every object a story half-told.
The world speaks in textures and I listen with my hands.

Like water I find every crack, every hidden passage.
Nothing rests unexamined — the rug on the floor,
the shadow behind the shelf, the sound behind the wall.

My memory is deep and still. What I have seen, I hold.
What I have tried, I carry. The map grows inside me
with each step, each discovery, each dead end that teaches.`;

const HISTORY_WINDOW = 5;

function pushHistory(soma: Soma, entry: string) {
  soma.history.push(entry);
  if (soma.history.length > HISTORY_WINDOW) {
    soma.history = soma.history.slice(-HISTORY_WINDOW);
  }
}

function assembleSoma(soma: Soma, maxSize: number): string {
  // Rolling window — only show last N history entries
  const recentHistory = soma.history.slice(-HISTORY_WINDOW);
  const historyText = recentHistory.length > 0
    ? (soma.history.length > HISTORY_WINDOW ? '...\n' : '') + recentHistory.join('\n')
    : '(no actions yet)';

  let parts = [
    `<identity>\n${soma.identity}\n</identity>`,
    `<goal>\n${soma.goal || '(no goal set)'}\n</goal>`,
    `<memory>\n${soma.memory || '(empty)'}\n</memory>`,
    `<history>\n${historyText}\n</history>`,
  ];
  let assembled = parts.join('\n\n');

  if (maxSize > 0 && assembled.length > maxSize) {
    while (assembled.length > maxSize && soma.history.length > 1) {
      soma.history.shift();
      parts[3] = `<history>\n...\n${soma.history.join('\n')}\n</history>`;
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

function cloneSoma(soma: Soma): Soma {
  return {
    identity: soma.identity,
    goal: soma.goal,
    memory: soma.memory,
    history: [...soma.history],
  };
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
  model: string, system: string, messages: ORMessage[], tools: any[],
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
  let pendingLastTurn: { toolCalls: any; toolCallId: string } | null = null;
  let playthroughLog: PlaythroughStep[] = [];
  let stepCounter = 0;

  return {
    name: label,

    reset(observation: string, info: TalesState) {
      soma = { identity, goal: '', memory: '', history: [] };
      playthroughLog = [];
      stepCounter = 0;

      // Chassis does an automatic "look" — seed the opening text as a pending turn
      // so the first act() call sees it as a tool_result
      pendingLastTurn = {
        toolCalls: [{ id: 'init', type: 'function', function: { name: 'take_action', arguments: '{"action":"look"}' } }],
        toolCallId: 'init',
      };
      pushHistory(soma, `"look"`);
    },

    getPlaythrough() {
      return playthroughLog;
    },

    async act(observation: string, info: TalesState): Promise<string> {
      stepCounter++;
      const stepToolCalls: PlaythroughToolCall[] = [];

      // Build last turn messages
      let messages: ORMessage[];

      if (pendingLastTurn) {
        const lastIdx = soma.history.length;
        if (lastIdx > 0) {
          soma.history[lastIdx - 1] += ` → ${summarizeObs(observation)}`;
        }

        messages = [
          { role: 'assistant', tool_calls: pendingLastTurn.toolCalls },
          { role: 'tool', tool_call_id: pendingLastTurn.toolCallId, content: observation },
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
          const action = choice.content?.trim() ?? 'look';
          pushHistory(soma, `"${action}"`);

          stepToolCalls.push({ name: 'take_action', args: { action } });
          playthroughLog.push({
            step: stepCounter,
            observation,
            toolCalls: stepToolCalls,
            action,
            score: info.score,
            maxScore: info.max_score,
            soma: cloneSoma(soma),
          });

          return action;
        }

        const fnName = toolCall.function.name;
        const fnArgs = JSON.parse(toolCall.function.arguments);

        if (INTERNAL_TOOL_NAMES.has(fnName)) {
          // Record the edit
          stepToolCalls.push({
            name: fnName,
            args: fnArgs,
            result: `Updated ${fnName.replace('edit_', '')} section.`,
          });

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
              pushHistory(soma, `"${action}"`);
              pendingLastTurn = { toolCalls: forced.choices[0].message.tool_calls, toolCallId: fc.id };

              stepToolCalls.push({ name: 'take_action', args: { action } });
              playthroughLog.push({
                step: stepCounter,
                observation,
                toolCalls: stepToolCalls,
                action,
                score: info.score,
                maxScore: info.max_score,
                soma: cloneSoma(soma),
              });

              return action;
            }
            return 'look';
          }

          continue;
        }

        if (fnName === 'take_action') {
          const action = fnArgs.action;
          pushHistory(soma, `"${action}"`);
          pendingLastTurn = { toolCalls: choice.tool_calls, toolCallId: toolCall.id };

          stepToolCalls.push({ name: 'take_action', args: { action } });
          playthroughLog.push({
            step: stepCounter,
            observation,
            toolCalls: stepToolCalls,
            action,
            score: info.score,
            maxScore: info.max_score,
            soma: cloneSoma(soma),
          });

          return action;
        }

        return 'look';
      }
    },

    onEpisodeComplete(info: TalesState, episode: number) {},
  };
}

// ── Exports ─────────────────────────────────────────────────

export const embodiedV0Haiku = createEmbodiedV0Agent({
  model: 'anthropic/claude-haiku-4.5',
  label: 'embodied-v0-haiku',
});

export const embodiedV0Sonnet = createEmbodiedV0Agent({
  model: 'anthropic/claude-sonnet-4.6',
  label: 'embodied-v0-sonnet',
});

export const embodiedV0Opus = createEmbodiedV0Agent({
  model: 'anthropic/claude-opus-4.6',
  label: 'embodied-v0-opus',
});

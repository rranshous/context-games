/**
 * v1 Embodied Agent for TALES text adventures.
 *
 * More of the embodiment lives in the soma as executable code sections.
 * The chassis is thinner — it compiles and runs the soma's code.
 *
 * Soma sections:
 *   - identity: first-person, values-based (text)
 *   - goal: actant-defined (text)
 *   - memory: flat scratchpad (text)
 *   - history: chassis-managed via on_history code (text)
 *   - on_observation: code — processes raw game text before the actant sees it
 *   - on_history: code — formats the history section from recent entries
 *   - on_score: code — reacts to score changes, can update goal/memory
 *
 * Code sections are compiled fresh each call via new Function().
 * The actant can rewrite any section, and changes take effect immediately.
 *
 * All code sections receive a `me` object:
 *   me.identity.read() / me.identity.write(s)
 *   me.goal.read() / me.goal.write(s)
 *   me.memory.read() / me.memory.write(s)
 *   me.history (string[] — raw entries, read-only)
 *   me.step (current step number)
 */

import type { Agent, TalesState, PlaythroughStep, PlaythroughToolCall } from '../types.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// ── Soma ────────────────────────────────────────────────────

interface Soma {
  identity: string;
  goal: string;
  memory: string;
  history: string[];
  on_observation: string;
  on_history: string;
  on_score: string;
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

const DEFAULT_ON_OBSERVATION = `// on_observation(observation, info, me) → string
// Process raw game text. Return what the actant should see.
const obs = observation.trim();
const cmds = info.admissible_commands;
let result = obs;
if (cmds && cmds.length > 0) {
  result += "\\n\\nAvailable actions: " + cmds.join(", ");
}
return result;`;

const DEFAULT_ON_HISTORY = `// on_history(entries, me) → string
// Format the history section from recent action entries.
// entries is an array of strings like '"open mailbox" → You open...'
if (entries.length === 0) return "(no actions yet)";
const recent = entries.slice(-5);
const prefix = entries.length > 5 ? "...\\n" : "";
return prefix + recent.join("\\n");`;

const DEFAULT_ON_SCORE = `// on_score(prevScore, newScore, me) → void
// React to score changes. Can update goal, memory.
if (newScore > prevScore) {
  const gain = newScore - prevScore;
  const mem = me.memory.read();
  me.memory.write(mem + "\\n[+\" + gain + \" points! Score: " + newScore + "]");
} else if (newScore < prevScore) {
  const loss = prevScore - newScore;
  const mem = me.memory.read();
  me.memory.write(mem + "\\n[LOST " + loss + " points! Score: " + newScore + " — be more careful]");
}`;

const HISTORY_WINDOW = 10; // keep more raw entries for on_history to work with

// ── Section API (the `me` object) ───────────────────────────

function buildMeObject(soma: Soma, step: number) {
  return {
    identity: {
      read: () => soma.identity,
      write: (s: string) => { soma.identity = s; },
    },
    goal: {
      read: () => soma.goal,
      write: (s: string) => { soma.goal = s; },
    },
    memory: {
      read: () => soma.memory,
      write: (s: string) => { soma.memory = s; },
    },
    history: [...soma.history], // read-only copy
    step,
  };
}

// ── Code compilation + execution ────────────────────────────

function compileAndRun(code: string, name: string, args: Record<string, any>): any {
  try {
    const argNames = Object.keys(args);
    const argValues = Object.values(args);
    const fn = new Function(...argNames, code);
    return fn(...argValues);
  } catch (err: any) {
    console.error(`  [${name}] code error: ${err.message}`);
    return undefined;
  }
}

// ── Soma assembly ───────────────────────────────────────────

function assembleSoma(soma: Soma, historyText: string, maxSize: number): string {
  let parts = [
    `<identity>\n${soma.identity}\n</identity>`,
    `<goal>\n${soma.goal || '(no goal set)'}\n</goal>`,
    `<memory>\n${soma.memory || '(empty)'}\n</memory>`,
    `<history>\n${historyText}\n</history>`,
    `<on_observation>\n${soma.on_observation}\n</on_observation>`,
    `<on_history>\n${soma.on_history}\n</on_history>`,
    `<on_score>\n${soma.on_score}\n</on_score>`,
  ];
  let assembled = parts.join('\n\n');

  if (maxSize > 0 && assembled.length > maxSize) {
    // Trim memory from front
    const overflow = assembled.length - maxSize;
    if (soma.memory.length > overflow) {
      soma.memory = soma.memory.slice(overflow);
      parts[2] = `<memory>\n...${soma.memory}\n</memory>`;
      assembled = parts.join('\n\n');
    }
  }

  return assembled;
}

function cloneSoma(soma: Soma) {
  return {
    identity: soma.identity,
    goal: soma.goal,
    memory: soma.memory,
    history: [...soma.history],
    on_observation: soma.on_observation,
    on_history: soma.on_history,
    on_score: soma.on_score,
  };
}

function pushHistory(soma: Soma, entry: string) {
  soma.history.push(entry);
  if (soma.history.length > HISTORY_WINDOW) {
    soma.history = soma.history.slice(-HISTORY_WINDOW);
  }
}

// ── Tool definitions ────────────────────────────────────────

const TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'edit_identity',
      description: 'Rewrite your identity section.',
      parameters: { type: 'object', properties: { content: { type: 'string' } }, required: ['content'], additionalProperties: false },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'edit_goal',
      description: 'Rewrite your goal section.',
      parameters: { type: 'object', properties: { content: { type: 'string' } }, required: ['content'], additionalProperties: false },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'edit_memory',
      description: 'Rewrite your memory section.',
      parameters: { type: 'object', properties: { content: { type: 'string' } }, required: ['content'], additionalProperties: false },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'edit_on_observation',
      description: 'Rewrite the on_observation code. This JS function processes raw game text before you see it. Signature: (observation, info, me) → string.',
      parameters: { type: 'object', properties: { content: { type: 'string' } }, required: ['content'], additionalProperties: false },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'edit_on_history',
      description: 'Rewrite the on_history code. This JS function formats the history section. Signature: (entries, me) → string.',
      parameters: { type: 'object', properties: { content: { type: 'string' } }, required: ['content'], additionalProperties: false },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'edit_on_score',
      description: 'Rewrite the on_score code. This JS function runs when the score changes. Signature: (prevScore, newScore, me) → void.',
      parameters: { type: 'object', properties: { content: { type: 'string' } }, required: ['content'], additionalProperties: false },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'take_action',
      description: 'Take an action in the game.',
      parameters: { type: 'object', properties: { action: { type: 'string' } }, required: ['action'], additionalProperties: false },
    },
  },
];

const EDIT_TOOLS = new Set(['edit_identity', 'edit_goal', 'edit_memory', 'edit_on_observation', 'edit_on_history', 'edit_on_score']);
const MAX_INTERNAL_PER_STEP = 5;

// ── OpenRouter ──────────────────────────────────────────────

interface ORMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  tool_calls?: any[];
  tool_call_id?: string;
}

async function callOpenRouter(model: string, system: string, messages: ORMessage[], tools: any[]): Promise<any> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');

  const resp = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model, max_tokens: 1024, messages: [{ role: 'system', content: system }, ...messages], tools, tool_choice: 'auto' }),
  });

  if (!resp.ok) throw new Error(`OpenRouter ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

// ── Observation summarizer ──────────────────────────────────

function summarizeObs(obs: string): string {
  const clean = obs.replace(/\n/g, ' ').trim();
  return clean.length > 120 ? clean.slice(0, 120) + '...' : clean;
}

// ── Agent ───────────────────────────────────────────────────

interface V1Options {
  model: string;
  label: string;
  maxSomaSize?: number;
  identity?: string;
}

function createEmbodiedV1Agent(opts: V1Options): Agent {
  const { model, label, maxSomaSize = 0, identity = DEFAULT_IDENTITY } = opts;

  let soma: Soma;
  let pendingLastTurn: { toolCalls: any; toolCallId: string } | null = null;
  let playthroughLog: PlaythroughStep[] = [];
  let stepCounter = 0;
  let prevScore = 0;

  function resetSoma() {
    soma = {
      identity,
      goal: '',
      memory: '',
      history: [],
      on_observation: DEFAULT_ON_OBSERVATION,
      on_history: DEFAULT_ON_HISTORY,
      on_score: DEFAULT_ON_SCORE,
    };
  }

  resetSoma();

  return {
    name: label,

    reset(observation: string, info: TalesState) {
      resetSoma();
      pendingLastTurn = {
        toolCalls: [{ id: 'init', type: 'function', function: { name: 'take_action', arguments: '{"action":"look"}' } }],
        toolCallId: 'init',
      };
      pushHistory(soma, '"look"');
      playthroughLog = [];
      stepCounter = 0;
      prevScore = 0;
    },

    getPlaythrough() {
      return playthroughLog;
    },

    async act(observation: string, info: TalesState): Promise<string> {
      stepCounter++;
      const stepToolCalls: PlaythroughToolCall[] = [];
      const stepThinking: string[] = [];
      const me = buildMeObject(soma, stepCounter);

      // Run on_observation to process the raw game text
      const processedObs = compileAndRun(soma.on_observation, 'on_observation', { observation, info, me }) ?? observation;

      // Run on_score if score changed
      if (info.score !== prevScore) {
        compileAndRun(soma.on_score, 'on_score', { prevScore, newScore: info.score, me });
        prevScore = info.score;
      }

      // Run on_history to format history section
      const historyText = compileAndRun(soma.on_history, 'on_history', { entries: soma.history, me }) ?? soma.history.slice(-5).join('\n');

      // Build last turn messages
      let messages: ORMessage[];

      if (pendingLastTurn) {
        const lastIdx = soma.history.length;
        if (lastIdx > 0) {
          soma.history[lastIdx - 1] += ` → ${summarizeObs(observation)}`;
        }
        messages = [
          { role: 'assistant', tool_calls: pendingLastTurn.toolCalls },
          { role: 'tool', tool_call_id: pendingLastTurn.toolCallId, content: processedObs },
        ];
        pendingLastTurn = null;
      } else {
        messages = [{ role: 'user', content: 'play' }];
      }

      const system = assembleSoma(soma, historyText, maxSomaSize);
      let internalCalls = 0;

      while (true) {
        const data = await callOpenRouter(model, system, messages, TOOLS);
        const choice = data.choices?.[0]?.message;
        if (!choice) throw new Error('No response from model');

        if (choice.content?.trim()) stepThinking.push(choice.content.trim());

        const toolCall = choice.tool_calls?.[0];

        if (!toolCall) {
          const action = choice.content?.trim() ?? 'look';
          pushHistory(soma, `"${action}"`);
          stepToolCalls.push({ name: 'take_action', args: { action } });
          playthroughLog.push({ step: stepCounter, observation, thinking: [...stepThinking], toolCalls: stepToolCalls, action, score: info.score, maxScore: info.max_score, soma: cloneSoma(soma) });
          return action;
        }

        const fnName = toolCall.function.name;
        const fnArgs = JSON.parse(toolCall.function.arguments);

        if (EDIT_TOOLS.has(fnName)) {
          const section = fnName.replace('edit_', '');
          stepToolCalls.push({ name: fnName, args: fnArgs, result: `Updated ${section} section.` });

          // Apply edit
          switch (fnName) {
            case 'edit_identity': soma.identity = fnArgs.content; break;
            case 'edit_goal': soma.goal = fnArgs.content; break;
            case 'edit_memory': soma.memory = fnArgs.content; break;
            case 'edit_on_observation': soma.on_observation = fnArgs.content; break;
            case 'edit_on_history': soma.on_history = fnArgs.content; break;
            case 'edit_on_score': soma.on_score = fnArgs.content; break;
          }

          internalCalls++;
          messages = [
            { role: 'assistant', tool_calls: choice.tool_calls, content: choice.content ?? undefined },
            { role: 'tool', tool_call_id: toolCall.id, content: `Updated ${section} section.` },
          ];

          if (internalCalls >= MAX_INTERNAL_PER_STEP) {
            const forced = await callOpenRouter(model, assembleSoma(soma, historyText, maxSomaSize), messages, [TOOLS[6]]); // take_action only
            const fc = forced.choices?.[0]?.message;
            if (fc?.content?.trim()) stepThinking.push(fc.content.trim());
            const ftc = fc?.tool_calls?.[0];
            if (ftc) {
              const action = JSON.parse(ftc.function.arguments).action;
              pushHistory(soma, `"${action}"`);
              pendingLastTurn = { toolCalls: fc.tool_calls, toolCallId: ftc.id };
              stepToolCalls.push({ name: 'take_action', args: { action } });
              playthroughLog.push({ step: stepCounter, observation, thinking: [...stepThinking], toolCalls: stepToolCalls, action, score: info.score, maxScore: info.max_score, soma: cloneSoma(soma) });
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
          playthroughLog.push({ step: stepCounter, observation, thinking: [...stepThinking], toolCalls: stepToolCalls, action, score: info.score, maxScore: info.max_score, soma: cloneSoma(soma) });
          return action;
        }

        return 'look';
      }
    },

    onEpisodeComplete(info: TalesState, episode: number) {},
  };
}

// ── Exports ─────────────────────────────────────────────────

export const embodiedV1Sonnet = createEmbodiedV1Agent({
  model: 'anthropic/claude-sonnet-4.6',
  label: 'embodied-v1-sonnet',
});

export const embodiedV1Opus = createEmbodiedV1Agent({
  model: 'anthropic/claude-opus-4.6',
  label: 'embodied-v1-opus',
});

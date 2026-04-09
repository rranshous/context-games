/**
 * v2 Embodied Agent — Navigator Pattern
 *
 * The model CANNOT call take_action directly. Instead:
 *   1. on_tick code runs every step — decides the game action
 *   2. Model wakes up every N steps to reflect and edit its soma
 *   3. The model shapes behavior through code, not through direct action
 *
 * Soma sections:
 *   - identity (text)
 *   - goal (text)
 *   - memory (text)
 *   - history (chassis-managed, recent ticks)
 *   - on_tick: code — (observation, info, me) → action string
 *   - on_score: code — (prevScore, newScore, me) → void
 *
 * Reflection tools (NO take_action):
 *   edit_identity, edit_goal, edit_memory, edit_on_tick, edit_on_score
 *
 * The model's job: observe outcomes, refine code, shape strategy.
 * The code's job: play the game.
 */

import type { Agent, TalesState, PlaythroughStep, PlaythroughToolCall } from '../types.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const REFLECTION_INTERVAL = 5; // reflect every N steps
const HISTORY_WINDOW = 10;
const MAX_INTERNAL_PER_REFLECTION = 8;

// ── Soma ────────────────────────────────────────────────────

interface Soma {
  identity: string;
  goal: string;
  memory: string;
  history: string[];
  on_tick: string;
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

const DEFAULT_ON_TICK = `// on_tick(observation, info, me) → action string
// This is your body. It runs every step. Return the game action to take.
// You can read/write me.memory, me.goal, etc.
// info has: score, max_score, admissible_commands, won, lost

const obs = observation.toLowerCase();
const cmds = info.admissible_commands || [];
const mem = me.memory.read();

// Track visited: append current observation summary to memory
const roomLine = observation.split("\\n")[0].trim();
if (roomLine && !mem.includes(roomLine)) {
  me.memory.write(mem + "\\nVisited: " + roomLine);
}

// If there are admissible commands, pick intelligently
if (cmds.length > 0) {
  // Prefer unexplored directions
  const directions = cmds.filter(c =>
    ["north","south","east","west","up","down","northeast","northwest","southeast","southwest"]
    .some(d => c.toLowerCase().includes(d))
  );
  const takeActions = cmds.filter(c => c.startsWith("take"));
  const openActions = cmds.filter(c => c.startsWith("open"));

  // Priority: take items > open things > go unexplored direction > anything else
  if (takeActions.length > 0) return takeActions[0];
  if (openActions.length > 0) return openActions[0];
  if (directions.length > 0) {
    // Pick a direction we haven't been
    for (const dir of directions) {
      if (!mem.includes(dir)) return dir;
    }
    return directions[0];
  }
  return cmds[0];
}

// No admissible commands — try common actions
if (obs.includes("closed")) return "open";
return "look";`;

const DEFAULT_ON_SCORE = `// on_score(prevScore, newScore, me) → void
if (newScore > prevScore) {
  const mem = me.memory.read();
  me.memory.write(mem + "\\n[+" + (newScore - prevScore) + " pts → " + newScore + "]");
} else if (newScore < prevScore) {
  const mem = me.memory.read();
  me.memory.write(mem + "\\n[LOST " + (prevScore - newScore) + " pts → " + newScore + " ⚠]");
}`;

// ── Section API ─────────────────────────────────────────────

function buildMeObject(soma: Soma, step: number) {
  return {
    identity: { read: () => soma.identity, write: (s: string) => { soma.identity = s; } },
    goal: { read: () => soma.goal, write: (s: string) => { soma.goal = s; } },
    memory: { read: () => soma.memory, write: (s: string) => { soma.memory = s; } },
    on_tick: { read: () => soma.on_tick, write: (s: string) => { soma.on_tick = s; } },
    on_score: { read: () => soma.on_score, write: (s: string) => { soma.on_score = s; } },
    history: [...soma.history],
    step,
  };
}

// ── Code execution ──────────────────────────────────────────

function compileAndRun(code: string, name: string, args: Record<string, any>): any {
  try {
    const fn = new Function(...Object.keys(args), code);
    return fn(...Object.values(args));
  } catch (err: any) {
    console.error(`  [${name}] code error: ${err.message}`);
    return undefined;
  }
}

// ── Soma assembly ───────────────────────────────────────────

function assembleSoma(soma: Soma): string {
  const recentHistory = soma.history.slice(-HISTORY_WINDOW);
  const historyText = recentHistory.length > 0
    ? (soma.history.length > HISTORY_WINDOW ? '...\n' : '') + recentHistory.join('\n')
    : '(no ticks yet)';

  return [
    `<identity>\n${soma.identity}\n</identity>`,
    `<goal>\n${soma.goal || '(no goal set)'}\n</goal>`,
    `<memory>\n${soma.memory || '(empty)'}\n</memory>`,
    `<history>\n${historyText}\n</history>`,
    `<on_tick>\n${soma.on_tick}\n</on_tick>`,
    `<on_score>\n${soma.on_score}\n</on_score>`,
  ].join('\n\n');
}

function cloneSoma(soma: Soma) {
  return {
    identity: soma.identity,
    goal: soma.goal,
    memory: soma.memory,
    history: [...soma.history],
    on_tick: soma.on_tick,
    on_score: soma.on_score,
  };
}

function pushHistory(soma: Soma, entry: string) {
  soma.history.push(entry);
  if (soma.history.length > HISTORY_WINDOW * 2) {
    soma.history = soma.history.slice(-HISTORY_WINDOW * 2);
  }
}

function summarizeObs(obs: string): string {
  const clean = obs.replace(/\n/g, ' ').trim();
  return clean.length > 100 ? clean.slice(0, 100) + '...' : clean;
}

// ── Reflection tools (NO take_action) ───────────────────────

const REFLECTION_TOOLS = [
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
      name: 'edit_on_tick',
      description: 'Rewrite the on_tick code. This JS function runs every step and decides the game action. Signature: (observation, info, me) → action string. This is your body — if you want to play differently, rewrite this code.',
      parameters: { type: 'object', properties: { content: { type: 'string' } }, required: ['content'], additionalProperties: false },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'edit_on_score',
      description: 'Rewrite the on_score code. Runs when score changes. Signature: (prevScore, newScore, me) → void.',
      parameters: { type: 'object', properties: { content: { type: 'string' } }, required: ['content'], additionalProperties: false },
    },
  },
];

const EDIT_NAMES = new Set(REFLECTION_TOOLS.map(t => t.function.name));

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
    body: JSON.stringify({ model, max_tokens: 2048, messages: [{ role: 'system', content: system }, ...messages], tools, tool_choice: 'auto' }),
  });

  if (!resp.ok) throw new Error(`OpenRouter ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

// ── Agent ───────────────────────────────────────────────────

interface V2Options {
  model: string;
  label: string;
  reflectionInterval?: number;
  identity?: string;
}

function createNavigatorAgent(opts: V2Options): Agent {
  const { model, label, reflectionInterval = REFLECTION_INTERVAL, identity = DEFAULT_IDENTITY } = opts;

  let soma: Soma;
  let playthroughLog: PlaythroughStep[] = [];
  let stepCounter = 0;
  let prevScore = 0;

  function resetSoma() {
    soma = {
      identity,
      goal: '',
      memory: '',
      history: [],
      on_tick: DEFAULT_ON_TICK,
      on_score: DEFAULT_ON_SCORE,
    };
  }

  resetSoma();

  async function reflect(): Promise<PlaythroughToolCall[]> {
    const toolCalls: PlaythroughToolCall[] = [];
    const system = assembleSoma(soma);

    let messages: ORMessage[] = [{ role: 'user', content: 'reflect' }];
    let edits = 0;

    while (edits < MAX_INTERNAL_PER_REFLECTION) {
      const data = await callOpenRouter(model, system, messages, REFLECTION_TOOLS);
      const choice = data.choices?.[0]?.message;
      if (!choice) break;

      const toolCall = choice.tool_calls?.[0];
      if (!toolCall) break; // model chose not to edit anything — done reflecting

      const fnName = toolCall.function.name;
      if (!EDIT_NAMES.has(fnName)) break;

      const fnArgs = JSON.parse(toolCall.function.arguments);
      const section = fnName.replace('edit_', '');

      // Apply edit
      switch (fnName) {
        case 'edit_identity': soma.identity = fnArgs.content; break;
        case 'edit_goal': soma.goal = fnArgs.content; break;
        case 'edit_memory': soma.memory = fnArgs.content; break;
        case 'edit_on_tick': soma.on_tick = fnArgs.content; break;
        case 'edit_on_score': soma.on_score = fnArgs.content; break;
      }

      toolCalls.push({ name: fnName, args: fnArgs, result: `Updated ${section}.` });
      edits++;

      // Set up for next iteration
      messages = [
        { role: 'assistant', tool_calls: choice.tool_calls, content: choice.content ?? undefined },
        { role: 'tool', tool_call_id: toolCall.id, content: `Updated ${section} section.` },
      ];
    }

    return toolCalls;
  }

  return {
    name: label,

    reset(observation: string, info: TalesState) {
      resetSoma();
      playthroughLog = [];
      stepCounter = 0;
      prevScore = 0;
      // Seed history with the opening observation
      pushHistory(soma, `[start] ${summarizeObs(observation)}`);
    },

    getPlaythrough() {
      return playthroughLog;
    },

    async act(observation: string, info: TalesState): Promise<string> {
      stepCounter++;
      const stepToolCalls: PlaythroughToolCall[] = [];
      const stepThinking: string[] = [];
      const me = buildMeObject(soma, stepCounter);

      // Run on_score if score changed
      if (info.score !== prevScore) {
        compileAndRun(soma.on_score, 'on_score', { prevScore, newScore: info.score, me });
        prevScore = info.score;
      }

      // Reflect every N steps (or on first step)
      if (stepCounter === 1 || stepCounter % reflectionInterval === 0) {
        const reflectionEdits = await reflect();
        stepToolCalls.push(...reflectionEdits);
        if (reflectionEdits.length > 0) {
          stepThinking.push(`[reflection: ${reflectionEdits.map(e => e.name).join(', ')}]`);
        }
      }

      // Run on_tick to get the action
      const action = compileAndRun(soma.on_tick, 'on_tick', {
        observation,
        info,
        me: buildMeObject(soma, stepCounter), // fresh me after reflection
      }) ?? 'look';

      // Record in history
      pushHistory(soma, `"${action}" → ${summarizeObs(observation)}`);

      // Log playthrough
      stepToolCalls.push({ name: 'on_tick', args: { action } });
      playthroughLog.push({
        step: stepCounter,
        observation,
        thinking: stepThinking,
        toolCalls: stepToolCalls,
        action: String(action),
        score: info.score,
        maxScore: info.max_score,
        soma: cloneSoma(soma),
      });

      return String(action);
    },

    onEpisodeComplete(info: TalesState, episode: number) {},
  };
}

// ── Exports ─────────────────────────────────────────────────

export const navigatorSonnet = createNavigatorAgent({
  model: 'anthropic/claude-sonnet-4.6',
  label: 'navigator-sonnet',
});

export const navigatorOpus = createNavigatorAgent({
  model: 'anthropic/claude-opus-4.6',
  label: 'navigator-opus',
});

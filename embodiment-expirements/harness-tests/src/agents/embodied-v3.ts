/**
 * v3 Embodied Agent — Navigator with self-triggered reflection + notice section.
 *
 * Key changes from v2:
 *   - notice(observation, info, me) → string runs every tick, output goes to <things_noticed>
 *   - Reflection is no longer chassis-triggered. Only happens when soma code calls me.reflectOn(prompt).
 *   - Composite score = game_score - (reflection_turns_used * REFLECTION_PENALTY)
 *   - notice typically computes/writes the composite score to things_noticed so the model feels the cost
 *
 * The default on_tick is intentionally naive — cycles admissible commands and calls
 * me.reflectOn('checkin') every 10 actions. The actant should rewrite this.
 *
 * The run is capped by total inference calls (wake-ups), not step count.
 *
 * Soma sections:
 *   - identity (text)
 *   - goal (text)
 *   - memory (text — also serves as orienting context, seeded with game info)
 *   - things_noticed (chassis-managed via notice handler)
 *   - on_tick: code — (observation, info, me) → action
 *   - on_score: code — (prevScore, newScore, me) → void
 *   - notice: code — (observation, info, me) → string
 */

import type { Agent, TalesState, PlaythroughStep, PlaythroughToolCall } from '../types.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const REFLECTION_PENALTY = 1; // composite score penalty per reflection wake-up
const MAX_REFLECTION_TURNS = 5; // max model edits per reflectOn() call
const MAX_TOTAL_REFLECTIONS = 50; // hard cap on total inference calls per run
const HISTORY_RAW_WINDOW = 20; // how many raw history entries the chassis keeps

// ── Soma ────────────────────────────────────────────────────

interface Soma {
  identity: string;
  goal: string;
  memory: string;
  things_noticed: string; // chassis-managed via notice handler
  history: string[];      // raw entries (chassis-managed)
  on_tick: string;
  on_score: string;
  notice: string;
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

const DEFAULT_MEMORY = `I am playing a text adventure game. The world is described to me in
text and I respond with actions like "go north", "take sword", "open door".
I gain points by exploring, finding treasures, and solving puzzles.

My body is the on_tick handler — code that decides each action. I shape it
through reflection. Reflecting is expensive: each thought turn deducts from
my composite score. I should think when stuck, not when comfortable.

I have these handlers I can edit:
- on_tick: chooses each action
- notice: computes what's worth my attention
- on_score: reacts to score changes

I can call me.reflectOn(prompt) from any handler to wake myself up.`;

const NAIVE_ON_TICK = `// on_tick(observation, info, me) → action string
// This is my body. It runs every tick to decide the next action.
//
// NAIVE DEFAULT: cycles admissible commands, reflects every 10 actions.
// This is intentionally dumb — I should rewrite it to play well.
//
// Reflection cost: every me.reflectOn() call wakes the model for up to
// 5 edit turns. Each turn deducts 1 from composite score. The hard cap
// is ${MAX_TOTAL_REFLECTIONS} reflection turns per run — if exceeded, the run ends.
//
// So: reflect rarely and purposefully. Cheap ticks (no reflection) are
// strictly better than expensive ticks when the current behavior is working.

const cmds = info.admissible_commands || [];

// Track action count via memory (hacky — using as a counter)
const counterMatch = me.memory.read().match(/\\[tick:(\\d+)\\]/);
const tick = counterMatch ? parseInt(counterMatch[1]) + 1 : 1;
const newMem = me.memory.read().replace(/\\[tick:\\d+\\]/, '') + '[tick:' + tick + ']';
me.memory.write(newMem);

// Reflect every 10 actions
if (tick % 10 === 0) {
  me.reflectOn("regular checkin: 10 actions taken. Score is " + info.score + ". Should I change my approach?");
}

// Naive cycling: pick the action at index (tick % cmds.length)
if (cmds.length > 0) {
  return cmds[tick % cmds.length];
}
return "look";`;

const DEFAULT_ON_SCORE = `// on_score(prevScore, newScore, me) → void
// Runs when the game score changes (up or down).
//
// Score gains are usually good — a treasure, a puzzle solved, progress.
// Score drops usually mean I did something wrong — dropped a treasure
// outside the case, took damage, died.
//
// This is a reasonable place to reflect on bad outcomes, but remember:
// reflecting costs composite score. A -10 score drop followed by 5
// reflection turns is a -15 swing. Reflect only when genuinely confused.

if (newScore > prevScore) {
  const mem = me.memory.read();
  me.memory.write(mem + "\\n[+" + (newScore - prevScore) + " pts → " + newScore + "]");
} else if (newScore < prevScore) {
  const mem = me.memory.read();
  me.memory.write(mem + "\\n[LOST " + (prevScore - newScore) + " pts → " + newScore + " ⚠]");
  me.reflectOn("Score dropped from " + prevScore + " to " + newScore + ". What happened?");
}`;

const DEFAULT_NOTICE = `// notice(observation, info, me) → string
// Runs every tick. Output becomes things_noticed (what I pay attention to).
//
// ═══ COMPOSITE SCORE — HOW I'M JUDGED ═══
// composite = game_score - (reflection_turns * 1)
//
// Game score: points earned in the text adventure (treasures, progress)
// Reflection turns: each me.reflectOn() wake-up costs 1 composite point
//                   per turn of editing during that wake-up. The model is
//                   allowed UP TO 5 edit turns per reflectOn() call.
// Budget: hard cap of ${MAX_TOTAL_REFLECTIONS} reflection turns per run.
//         Exceeding this ENDS THE RUN.
//
// Implications:
// - Cheap thinking is good. Expensive thinking is bad unless it unlocks real score.
// - Reflecting when not actually stuck is pure waste.
// - A score gain of +5 followed by 1 reflection turn = +4 composite. Worth it.
// - 5 reflection turns that produce no score gain = -5 composite. Bad trade.
// - If I'm panicking and reflecting every tick, I'll burn the budget without gaining.
//
// This handler is where I compute and surface that cost to myself.
// I can also call me.reflectOn(prompt) from here if I decide something urgent
// warrants thinking. But remember — reflecting is not free.

const score = info.score;
const reflections = me.reflectionsUsed;
const composite = score - (reflections * 1);

const lines = [];
lines.push("Game score: " + score + "/" + info.max_score);
lines.push("Reflection turns used: " + reflections + "/" + me.maxReflections);
lines.push("Composite score: " + composite + " (game - reflection cost)");

// Look at recent history for stagnation
const history = me.history;
if (history.length >= 5) {
  const recent = history.slice(-5);
  const uniqueActions = new Set(recent.map(h => h.split(' →')[0])).size;
  if (uniqueActions <= 2) {
    lines.push("⚠ Recent actions repeating: " + uniqueActions + " unique in last 5");
  }
}

return lines.join("\\n");`;

// ── Section API ─────────────────────────────────────────────

interface MeAPI {
  identity: { read: () => string; write: (s: string) => void };
  goal: { read: () => string; write: (s: string) => void };
  memory: { read: () => string; write: (s: string) => void };
  on_tick: { read: () => string; write: (s: string) => void };
  on_score: { read: () => string; write: (s: string) => void };
  notice: { read: () => string; write: (s: string) => void };
  history: string[];
  step: number;
  reflectionsUsed: number;
  maxReflections: number;
  reflectOn: (prompt: string) => void;
}

// We use a sync reflectOn that QUEUES the reflection for the chassis to execute
// after the handler returns. This avoids async-in-Function complications.
function buildMeObject(soma: Soma, step: number, reflectionsUsed: number, maxReflections: number, reflectionQueue: string[]): MeAPI {
  return {
    identity: { read: () => soma.identity, write: (s: string) => { soma.identity = s; } },
    goal: { read: () => soma.goal, write: (s: string) => { soma.goal = s; } },
    memory: { read: () => soma.memory, write: (s: string) => { soma.memory = s; } },
    on_tick: { read: () => soma.on_tick, write: (s: string) => { soma.on_tick = s; } },
    on_score: { read: () => soma.on_score, write: (s: string) => { soma.on_score = s; } },
    notice: { read: () => soma.notice, write: (s: string) => { soma.notice = s; } },
    history: [...soma.history],
    step,
    reflectionsUsed,
    maxReflections,
    reflectOn: (prompt: string) => { reflectionQueue.push(prompt); },
  };
}

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
  return [
    `<identity>\n${soma.identity}\n</identity>`,
    `<goal>\n${soma.goal || '(no goal set)'}\n</goal>`,
    `<memory>\n${soma.memory || '(empty)'}\n</memory>`,
    `<things_noticed>\n${soma.things_noticed || '(nothing yet)'}\n</things_noticed>`,
    `<on_tick>\n${soma.on_tick}\n</on_tick>`,
    `<on_score>\n${soma.on_score}\n</on_score>`,
    `<notice>\n${soma.notice}\n</notice>`,
  ].join('\n\n');
}

function cloneSoma(soma: Soma) {
  return {
    identity: soma.identity,
    goal: soma.goal,
    memory: soma.memory,
    things_noticed: soma.things_noticed,
    history: [...soma.history],
    on_tick: soma.on_tick,
    on_score: soma.on_score,
    notice: soma.notice,
  };
}

function pushHistory(soma: Soma, entry: string) {
  soma.history.push(entry);
  if (soma.history.length > HISTORY_RAW_WINDOW) {
    soma.history = soma.history.slice(-HISTORY_RAW_WINDOW);
  }
}

function summarizeObs(obs: string): string {
  const clean = obs.replace(/\n/g, ' ').trim();
  return clean.length > 100 ? clean.slice(0, 100) + '...' : clean;
}

// ── Reflection tools (NO take_action) ───────────────────────

const REFLECTION_TOOLS = [
  { type: 'function' as const, function: { name: 'edit_identity', description: 'Rewrite your identity section.', parameters: { type: 'object', properties: { content: { type: 'string' } }, required: ['content'], additionalProperties: false } } },
  { type: 'function' as const, function: { name: 'edit_goal', description: 'Rewrite your goal section.', parameters: { type: 'object', properties: { content: { type: 'string' } }, required: ['content'], additionalProperties: false } } },
  { type: 'function' as const, function: { name: 'edit_memory', description: 'Rewrite your memory section.', parameters: { type: 'object', properties: { content: { type: 'string' } }, required: ['content'], additionalProperties: false } } },
  { type: 'function' as const, function: { name: 'edit_on_tick', description: 'Rewrite the on_tick code. (observation, info, me) → action string. This is your body — runs every tick to decide actions.', parameters: { type: 'object', properties: { content: { type: 'string' } }, required: ['content'], additionalProperties: false } } },
  { type: 'function' as const, function: { name: 'edit_on_score', description: 'Rewrite the on_score code. (prevScore, newScore, me) → void. Runs when score changes.', parameters: { type: 'object', properties: { content: { type: 'string' } }, required: ['content'], additionalProperties: false } } },
  { type: 'function' as const, function: { name: 'edit_notice', description: 'Rewrite the notice code. (observation, info, me) → string. Runs every tick. Output becomes things_noticed.', parameters: { type: 'object', properties: { content: { type: 'string' } }, required: ['content'], additionalProperties: false } } },
];

const EDIT_NAMES = new Set(REFLECTION_TOOLS.map(t => t.function.name));

// ── OpenRouter ──────────────────────────────────────────────

interface ORMessage { role: 'system' | 'user' | 'assistant' | 'tool'; content?: string; tool_calls?: any[]; tool_call_id?: string; }

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

interface V3Options {
  model: string;
  label: string;
  identity?: string;
  maxReflections?: number;
}

function createV3Agent(opts: V3Options): Agent {
  const { model, label, identity = DEFAULT_IDENTITY, maxReflections = MAX_TOTAL_REFLECTIONS } = opts;

  let soma: Soma;
  let playthroughLog: PlaythroughStep[] = [];
  let stepCounter = 0;
  let prevScore = 0;
  let totalReflectionTurns = 0;
  let exhausted = false;

  function resetSoma() {
    soma = {
      identity,
      goal: '',
      memory: DEFAULT_MEMORY,
      things_noticed: '',
      history: [],
      on_tick: NAIVE_ON_TICK,
      on_score: DEFAULT_ON_SCORE,
      notice: DEFAULT_NOTICE,
    };
  }

  resetSoma();

  // Reflect: model wakes up, can do up to MAX_REFLECTION_TURNS edits.
  // Each turn counts toward totalReflectionTurns.
  async function performReflection(prompt: string): Promise<PlaythroughToolCall[]> {
    const toolCalls: PlaythroughToolCall[] = [];
    const system = assembleSoma(soma);
    let messages: ORMessage[] = [{ role: 'user', content: prompt }];
    let turns = 0;

    while (turns < MAX_REFLECTION_TURNS && totalReflectionTurns < maxReflections) {
      const data = await callOpenRouter(model, system, messages, REFLECTION_TOOLS);
      totalReflectionTurns++;
      turns++;

      const choice = data.choices?.[0]?.message;
      if (!choice) break;

      const toolCall = choice.tool_calls?.[0];
      if (!toolCall) break; // model is done editing

      const fnName = toolCall.function.name;
      if (!EDIT_NAMES.has(fnName)) break;

      const fnArgs = JSON.parse(toolCall.function.arguments);
      const section = fnName.replace('edit_', '');

      switch (fnName) {
        case 'edit_identity': soma.identity = fnArgs.content; break;
        case 'edit_goal': soma.goal = fnArgs.content; break;
        case 'edit_memory': soma.memory = fnArgs.content; break;
        case 'edit_on_tick': soma.on_tick = fnArgs.content; break;
        case 'edit_on_score': soma.on_score = fnArgs.content; break;
        case 'edit_notice': soma.notice = fnArgs.content; break;
      }

      toolCalls.push({ name: fnName, args: fnArgs, result: `Updated ${section} (turn ${turns})` });

      messages = [
        { role: 'assistant', tool_calls: choice.tool_calls, content: choice.content ?? undefined },
        { role: 'tool', tool_call_id: toolCall.id, content: `Updated ${section}.` },
      ];
    }

    if (totalReflectionTurns >= maxReflections) {
      exhausted = true;
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
      totalReflectionTurns = 0;
      exhausted = false;
      pushHistory(soma, `[start] ${summarizeObs(observation)}`);
    },

    getPlaythrough() {
      return playthroughLog;
    },

    async act(observation: string, info: TalesState): Promise<string> {
      stepCounter++;
      const stepToolCalls: PlaythroughToolCall[] = [];
      const stepThinking: string[] = [];

      // If we've exhausted our reflection budget, force a no-op
      if (exhausted) {
        playthroughLog.push({
          step: stepCounter,
          observation,
          thinking: ['[reflection budget exhausted — terminating]'],
          toolCalls: [{ name: 'on_tick', args: { action: 'wait' } }],
          action: 'wait',
          score: info.score,
          maxScore: info.max_score,
          reflectionsTriggered: [],
          reflectionTurnsUsed: totalReflectionTurns,
          compositeScore: info.score - (totalReflectionTurns * REFLECTION_PENALTY),
          soma: cloneSoma(soma),
        });
        return 'wait';
      }

      const reflectionQueue: string[] = [];
      const me = buildMeObject(soma, stepCounter, totalReflectionTurns, maxReflections, reflectionQueue);

      // Run on_score if score changed
      if (info.score !== prevScore) {
        compileAndRun(soma.on_score, 'on_score', { prevScore, newScore: info.score, me });
        prevScore = info.score;
      }

      // Run notice — output goes into things_noticed
      const noticeResult = compileAndRun(soma.notice, 'notice', { observation, info, me });
      if (typeof noticeResult === 'string') {
        soma.things_noticed = noticeResult;
      }

      // Run on_tick to get action
      const action = compileAndRun(soma.on_tick, 'on_tick', { observation, info, me }) ?? 'look';

      // Process queued reflections
      for (const prompt of reflectionQueue) {
        if (exhausted) break;
        stepThinking.push(`[reflectOn: ${prompt}]`);
        const reflectionEdits = await performReflection(prompt);
        stepToolCalls.push(...reflectionEdits);
      }

      pushHistory(soma, `"${action}" → ${summarizeObs(observation)}`);

      stepToolCalls.push({ name: 'on_tick', args: { action: String(action) } });
      playthroughLog.push({
        step: stepCounter,
        observation,
        thinking: stepThinking,
        toolCalls: stepToolCalls,
        action: String(action),
        score: info.score,
        maxScore: info.max_score,
        reflectionsTriggered: [...reflectionQueue],
        reflectionTurnsUsed: totalReflectionTurns,
        compositeScore: info.score - (totalReflectionTurns * REFLECTION_PENALTY),
        soma: cloneSoma(soma),
      });

      return String(action);
    },

    onEpisodeComplete(info: TalesState, episode: number) {},
  };
}

// ── Exports ─────────────────────────────────────────────────

export const v3Sonnet = createV3Agent({
  model: 'anthropic/claude-sonnet-4.6',
  label: 'v3-sonnet',
});

export const v3Opus = createV3Agent({
  model: 'anthropic/claude-opus-4.6',
  label: 'v3-opus',
});

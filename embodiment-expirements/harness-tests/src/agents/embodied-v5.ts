/**
 * v5 Embodied Agent — Direct driver wearing v4's clothes.
 *
 * v5 keeps the v4 architecture (me.takeAction, me.reflectOn, async on_tick, section caps)
 * but adds me.consider(prompt) — text in, text out, NO edit tools.
 *
 * The default on_tick uses me.consider to ask the model what to do, then passes
 * the response straight to me.takeAction. This is the direct-driver pattern in
 * embodiment clothing: the model is in the loop every tick, but only because the
 * actant's code chooses to consult it.
 *
 * The actant can still rewrite on_tick to do something else, edit goal/memory/etc,
 * or call reflectOn for full self-modification. But the default is "ask the model
 * what to do, then do it."
 *
 * Both me.consider and me.reflectOn count against the same 50-turn budget. With
 * a consider call every tick, the budget burns in ~50 ticks.
 */

import type { Agent, TalesState, PlaythroughStep, PlaythroughToolCall } from '../types.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_REFLECTION_TURNS = 5;
const MAX_TOTAL_REFLECTIONS = 50;

// ── Section caps ───────────────────────────────────────────

const SECTION_CAPS = {
  identity: 2000,
  goal: 1000,
  memory: 5000,
  history: 5000,
  recent_thoughts: 5000,
  on_tick: 8000,
  on_score: 4000,
} as const;

type SectionName = keyof typeof SECTION_CAPS;

// ── Soma ────────────────────────────────────────────────────

interface Soma {
  identity: string;
  goal: string;
  memory: string;
  history: string;
  recent_thoughts: string;
  on_tick: string;
  on_score: string;
}

const DEFAULT_IDENTITY = `Adam - Explorer of Forgotten Realms`;

const DEFAULT_GOAL = `get a high score in this game`;

const DEFAULT_MEMORY = `just woke up here, not sure how things work (yet)`;

const DEFAULT_ON_TICK = `// on_tick(me) — runs each tick. The default is direct-driver:
// ask the model what to do, then do it.

const histText = me.history.read();

// Track tick counter in memory
const memText = me.memory.read();
const counterMatch = memText.match(/\\[tick:(\\d+)\\]/);
const tick = counterMatch ? parseInt(counterMatch[1]) + 1 : 1;
const newMem = memText.replace(/\\[tick:\\d+\\]/, '').trim() + ' [tick:' + tick + ']';
me.memory.write(newMem);

// Consider what to do
const action = await me.consider("What should I do next? Reply with just the game action, nothing else.");

// Take the action and get the observation back
const observation = await me.takeAction(action);

// Append to history (rolling window — chassis enforces cap, default keeps last 20 lines)
const entry = action + " => " + observation.slice(0, 200).replace(/\\n/g, ' ');
const newHist = (histText ? histText + "\\n" : "") + entry;
const allLines = newHist.split("\\n");
const trimmed = allLines.length > 20 ? allLines.slice(-20).join("\\n") : newHist;
me.history.write(trimmed);
`;

const DEFAULT_ON_SCORE = `// on_score(prevScore, newScore, me) → void
// Runs when the game score changes.

if (newScore > prevScore) {
  const mem = me.memory.read();
  me.memory.write(mem + " [+" + (newScore - prevScore) + " → " + newScore + "]");
} else if (newScore < prevScore) {
  const mem = me.memory.read();
  me.memory.write(mem + " [LOST " + (prevScore - newScore) + " → " + newScore + "]");
}`;

// ── Section helpers ─────────────────────────────────────────

class SectionWriteError extends Error {
  constructor(public section: SectionName, public attemptedLength: number, public cap: number) {
    super(`Section "${section}" write rejected: length ${attemptedLength} exceeds cap ${cap}`);
  }
}

function readSection(soma: Soma, name: SectionName): string {
  return (soma as any)[name] ?? '';
}

function writeSection(soma: Soma, name: SectionName, value: string): void {
  if (typeof value !== 'string') value = String(value);
  const cap = SECTION_CAPS[name];
  if (value.length > cap) {
    throw new SectionWriteError(name, value.length, cap);
  }
  (soma as any)[name] = value;
}

function buildSectionAPI(soma: Soma, name: SectionName) {
  return {
    read: () => readSection(soma, name),
    write: (s: string) => writeSection(soma, name, s),
  };
}

// ── Soma assembly ───────────────────────────────────────────

function assembleSoma(soma: Soma): string {
  return [
    `<identity>\n${soma.identity}\n</identity>`,
    `<goal>\n${soma.goal || '(no goal set)'}\n</goal>`,
    `<memory>\n${soma.memory || '(empty)'}\n</memory>`,
    `<history>\n${soma.history || '(no actions yet)'}\n</history>`,
    `<recent_thoughts>\n${soma.recent_thoughts || '(none)'}\n</recent_thoughts>`,
    `<on_tick>\n${soma.on_tick}\n</on_tick>`,
    `<on_score>\n${soma.on_score}\n</on_score>`,
  ].join('\n\n');
}

function cloneSoma(soma: Soma) {
  return { ...soma };
}

// ── Reflection tools (only used by reflectOn) ───────────────

const REFLECTION_TOOLS = [
  { type: 'function' as const, function: { name: 'edit_identity', description: 'Rewrite your identity section.', parameters: { type: 'object', properties: { content: { type: 'string' } }, required: ['content'], additionalProperties: false } } },
  { type: 'function' as const, function: { name: 'edit_goal', description: 'Rewrite your goal section.', parameters: { type: 'object', properties: { content: { type: 'string' } }, required: ['content'], additionalProperties: false } } },
  { type: 'function' as const, function: { name: 'edit_memory', description: 'Rewrite your memory section.', parameters: { type: 'object', properties: { content: { type: 'string' } }, required: ['content'], additionalProperties: false } } },
  { type: 'function' as const, function: { name: 'edit_history', description: 'Rewrite your history section.', parameters: { type: 'object', properties: { content: { type: 'string' } }, required: ['content'], additionalProperties: false } } },
  { type: 'function' as const, function: { name: 'edit_recent_thoughts', description: 'Rewrite your recent_thoughts section.', parameters: { type: 'object', properties: { content: { type: 'string' } }, required: ['content'], additionalProperties: false } } },
  { type: 'function' as const, function: { name: 'edit_on_tick', description: 'Rewrite the on_tick code. Signature: (me) → void. This is your body.', parameters: { type: 'object', properties: { content: { type: 'string' } }, required: ['content'], additionalProperties: false } } },
  { type: 'function' as const, function: { name: 'edit_on_score', description: 'Rewrite the on_score code. Signature: (prevScore, newScore, me) → void.', parameters: { type: 'object', properties: { content: { type: 'string' } }, required: ['content'], additionalProperties: false } } },
];

const EDIT_NAMES = new Set(REFLECTION_TOOLS.map(t => t.function.name));
const EDIT_TO_SECTION: Record<string, SectionName> = {
  edit_identity: 'identity',
  edit_goal: 'goal',
  edit_memory: 'memory',
  edit_history: 'history',
  edit_recent_thoughts: 'recent_thoughts',
  edit_on_tick: 'on_tick',
  edit_on_score: 'on_score',
};

// ── OpenRouter ──────────────────────────────────────────────

interface ORMessage { role: 'system' | 'user' | 'assistant' | 'tool'; content?: string; tool_calls?: any[]; tool_call_id?: string; }

async function callOpenRouter(model: string, system: string, messages: ORMessage[], tools?: any[]): Promise<any> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');

  const body: any = { model, max_tokens: 4096, messages: [{ role: 'system', content: system }, ...messages] };
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  const resp = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });

  if (!resp.ok) throw new Error(`OpenRouter ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

// ── Async code execution ────────────────────────────────────

async function runAsyncCode(code: string, args: Record<string, any>): Promise<{ ok: true; value: any } | { ok: false; error: string }> {
  try {
    const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;
    const fn = new AsyncFn(...Object.keys(args), code);
    const value = await fn(...Object.values(args));
    return { ok: true, value };
  } catch (err: any) {
    return { ok: false, error: err.message ?? String(err) };
  }
}

function appendToMemorySafe(soma: Soma, line: string): void {
  const current = soma.memory ?? '';
  const cap = SECTION_CAPS.memory;
  const candidate = current + (current ? '\n' : '') + line;
  if (candidate.length <= cap) {
    soma.memory = candidate;
    return;
  }
  const lines = candidate.split('\n');
  while (lines.join('\n').length > cap && lines.length > 1) {
    lines.shift();
  }
  soma.memory = lines.join('\n').slice(-cap);
}

// ── Agent ───────────────────────────────────────────────────

interface V5Options {
  model: string;
  label: string;
  identity?: string;
  maxReflections?: number;
}

function createV5Agent(opts: V5Options): Agent {
  const { model, label, identity = DEFAULT_IDENTITY, maxReflections = MAX_TOTAL_REFLECTIONS } = opts;

  let soma: Soma;
  let playthroughLog: PlaythroughStep[] = [];
  let stepCounter = 0;
  let prevScore = 0;
  let totalReflectionTurns = 0;

  function resetSoma() {
    soma = {
      identity,
      goal: DEFAULT_GOAL,
      memory: DEFAULT_MEMORY,
      history: '',
      recent_thoughts: '',
      on_tick: DEFAULT_ON_TICK,
      on_score: DEFAULT_ON_SCORE,
    };
  }

  resetSoma();

  return {
    name: label,

    reset(observation: string, info: TalesState) {
      resetSoma();
      playthroughLog = [];
      stepCounter = 0;
      prevScore = 0;
      totalReflectionTurns = 0;
      try {
        writeSection(soma, 'history', `look => ${observation.replace(/\n/g, ' ').slice(0, 200)}`);
      } catch { /* ignore */ }
    },

    getPlaythrough() {
      return playthroughLog;
    },

    async runEpisode(bridge, initialState, maxSteps): Promise<TalesState> {
      let currentState = initialState;
      stepCounter = 0;

      // ── per-step capture buckets ──
      let stepReflectionToolCalls: PlaythroughToolCall[] = [];
      let stepReflectionPrompts: string[] = [];
      let stepThinking: string[] = [];
      let stepActionTaken = '(no action)';

      // ── reflectOn (full edit reflection) ──
      const reflect = async (prompt: string): Promise<string> => {
        if (totalReflectionTurns >= maxReflections) return '';
        const system = assembleSoma(soma);
        let messages: ORMessage[] = [{ role: 'user', content: prompt }];
        let turns = 0;
        const collectedThoughts: string[] = [];

        while (turns < MAX_REFLECTION_TURNS && totalReflectionTurns < maxReflections) {
          const data = await callOpenRouter(model, system, messages, REFLECTION_TOOLS);
          totalReflectionTurns++;
          turns++;

          const choice = data.choices?.[0]?.message;
          if (!choice) break;

          if (choice.content?.trim()) collectedThoughts.push(choice.content.trim());

          const toolCall = choice.tool_calls?.[0];
          if (!toolCall) break;

          const fnName = toolCall.function.name;
          if (!EDIT_NAMES.has(fnName)) break;

          const fnArgs = JSON.parse(toolCall.function.arguments);
          const sectionName = EDIT_TO_SECTION[fnName];
          const content = fnArgs.content;

          let resultText: string;
          try {
            const isCodeSection = sectionName === 'on_tick' || sectionName === 'on_score';
            if (isCodeSection && (!content || content.trim().length === 0)) {
              resultText = `Error: cannot set ${sectionName} to empty. Provide full code.`;
            } else {
              writeSection(soma, sectionName, content ?? '');
              resultText = `Updated ${sectionName}.`;
            }
          } catch (err: any) {
            if (err instanceof SectionWriteError) {
              resultText = `Error: ${sectionName} write rejected — length ${err.attemptedLength} exceeds cap ${err.cap}.`;
            } else {
              resultText = `Error: ${err.message}`;
            }
          }

          stepReflectionToolCalls.push({ name: fnName, args: fnArgs, result: resultText });

          messages = [
            { role: 'assistant', tool_calls: choice.tool_calls, content: choice.content ?? undefined },
            { role: 'tool', tool_call_id: toolCall.id, content: resultText },
          ];
        }

        return collectedThoughts.join('\n\n');
      };

      // ── consider (text-only, no edit tools) ──
      const consider = async (prompt: string): Promise<string> => {
        if (totalReflectionTurns >= maxReflections) return '';
        const system = assembleSoma(soma);
        const messages: ORMessage[] = [{ role: 'user', content: prompt }];
        const data = await callOpenRouter(model, system, messages); // no tools
        totalReflectionTurns++;

        const choice = data.choices?.[0]?.message;
        const text = (choice?.content ?? '').trim();
        return text;
      };

      // ── takeAction (calls bridge directly) ──
      const takeAction = async (action: string): Promise<string> => {
        const newState = await bridge.step(action);
        currentState = newState;
        stepActionTaken = action;
        return newState.observation;
      };

      // ── reflectOn helper that records prompts/thinking ──
      const reflectOnHelper = async (prompt: string): Promise<string> => {
        stepReflectionPrompts.push(`reflectOn: ${prompt}`);
        const thought = await reflect(prompt);
        if (thought) stepThinking.push(`[reflectOn: ${prompt.slice(0, 60)}] → ${thought.slice(0, 200)}`);
        return thought;
      };

      // ── consider helper that records prompts/thinking ──
      const considerHelper = async (prompt: string): Promise<string> => {
        stepReflectionPrompts.push(`consider: ${prompt}`);
        const text = await consider(prompt);
        if (text) stepThinking.push(`[consider: ${prompt.slice(0, 60)}] → ${text.slice(0, 200)}`);
        return text;
      };

      // ── Main loop ──
      for (let step = 1; step <= maxSteps; step++) {
        stepCounter = step;
        stepReflectionToolCalls = [];
        stepReflectionPrompts = [];
        stepThinking = [];
        stepActionTaken = '(no action)';

        const me: any = {
          identity: buildSectionAPI(soma, 'identity'),
          goal: buildSectionAPI(soma, 'goal'),
          memory: buildSectionAPI(soma, 'memory'),
          history: buildSectionAPI(soma, 'history'),
          recent_thoughts: buildSectionAPI(soma, 'recent_thoughts'),
          on_tick: buildSectionAPI(soma, 'on_tick'),
          on_score: buildSectionAPI(soma, 'on_score'),
          takeAction,
          consider: considerHelper,
          reflectOn: reflectOnHelper,
          step,
          reflectionsUsed: totalReflectionTurns,
          maxReflections,
        };

        // Run on_score if score changed since last tick
        if (currentState.score !== prevScore) {
          const scoreRes = await runAsyncCode(soma.on_score, { prevScore, newScore: currentState.score, me });
          if (!scoreRes.ok) {
            appendToMemorySafe(soma, `[on_score error step ${step}: ${scoreRes.error.slice(0, 200)}]`);
          }
          prevScore = currentState.score;
          me.reflectionsUsed = totalReflectionTurns;
        }

        // Run on_tick (async)
        const tickRes = await runAsyncCode(soma.on_tick, { me });
        if (!tickRes.ok) {
          appendToMemorySafe(soma, `[on_tick error step ${step}: ${tickRes.error.slice(0, 200)}]`);
        }

        // Capture playthrough step
        playthroughLog.push({
          step,
          observation: currentState.observation,
          thinking: [...stepThinking],
          toolCalls: [
            ...stepReflectionToolCalls,
            { name: 'on_tick', args: { action: stepActionTaken } },
          ],
          action: stepActionTaken,
          score: currentState.score,
          maxScore: currentState.max_score,
          reflectionsTriggered: [...stepReflectionPrompts],
          reflectionTurnsUsed: totalReflectionTurns,
          compositeScore: currentState.score - totalReflectionTurns,
          soma: cloneSoma(soma),
        });

        if (currentState.done) break;
        if (totalReflectionTurns >= maxReflections) {
          appendToMemorySafe(soma, `[reflection budget exhausted at step ${step}]`);
          break;
        }
      }

      return currentState;
    },
  };
}

// ── Exports ─────────────────────────────────────────────────

export const v5Sonnet = createV5Agent({ model: 'anthropic/claude-sonnet-4.6', label: 'v5-sonnet' });
export const v5Opus = createV5Agent({ model: 'anthropic/claude-opus-4.6', label: 'v5-opus' });

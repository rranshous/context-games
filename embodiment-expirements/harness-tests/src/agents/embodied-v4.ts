/**
 * v4 Embodied Agent — Navigator with takeAction/reflectOn returning text.
 *
 * Key v4 changes from v3:
 *   - on_tick(me) only — no observation/info args. World accessed via me.takeAction()
 *   - me.reflectOn(prompt) returns the model's text response
 *   - All sections are pure text (no array APIs). Actant manages format/window.
 *   - No notice handler, no things_noticed section
 *   - Section caps with hard reject on overflow
 *   - on_tick wrapped in try/catch — runtime errors written to memory
 *   - Agent owns the run loop (via runEpisode), bridge passed in
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

const DEFAULT_MEMORY = `I am playing a text adventure game. I act on the world via me.takeAction(action) which returns the observation. I can reflect via me.reflectOn(prompt) which returns my own text response. I manage my own history and memory through me.X.write(s).`;

const DEFAULT_ON_TICK = `// on_tick(me) — runs each tick. I pick an action, take it, store what mattered.

// Read my own history to see what I've done recently
const histText = me.history.read();
const histLines = histText ? histText.split("\\n").filter(Boolean) : [];
const recent = histLines.slice(-5);

// Track tick counter in memory
const memText = me.memory.read();
const counterMatch = memText.match(/\\[tick:(\\d+)\\]/);
const tick = counterMatch ? parseInt(counterMatch[1]) + 1 : 1;
const newMem = memText.replace(/\\[tick:\\d+\\]/, '').trim() + ' [tick:' + tick + ']';
me.memory.write(newMem);

// Look at the most recent observation in history (if any)
const lastEntry = recent.length > 0 ? recent[recent.length - 1] : '';
const lastObs = lastEntry.includes(' => ') ? lastEntry.split(' => ').slice(1).join(' => ') : '';
const obs = lastObs.toLowerCase();

// Pick an action based on the last observation
let action = "look";

// Every 4th tick, try to take a noun we see
if (tick % 4 === 0) {
  const nouns = ["leaflet","sword","lamp","lantern","sack","bottle","rope","knife","coin","key","egg","painting","bar","book","map","torch","treasure","gold","jewel"];
  for (const noun of nouns) {
    if (obs.includes(noun)) { action = "take " + noun; break; }
  }
}

// Otherwise, look for direction words and pick one we haven't tried lately
if (action === "look") {
  const dirs = ["north","south","east","west","northeast","northwest","southeast","southwest","up","down"];
  const present = dirs.filter(d => obs.includes(d));
  if (present.length > 0) {
    action = present[tick % present.length];
  }
}

// Reflect every 10 ticks
if (tick % 10 === 0) {
  const thought = await me.reflectOn("Tick " + tick + " checkin. What's working?");
  if (thought && thought.length > 0) {
    // Append the thought to recent_thoughts (with rolling window)
    const tCurrent = me.recent_thoughts.read();
    const tLines = tCurrent ? tCurrent.split("\\n").filter(Boolean) : [];
    tLines.push("[t" + tick + "] " + thought);
    while (tLines.length > 5) tLines.shift();
    me.recent_thoughts.write(tLines.join("\\n"));
  }
}

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
  // Reflect on the loss — but reflection costs composite score, so be deliberate
  const thought = await me.reflectOn("Score dropped from " + prevScore + " to " + newScore + ". What happened?");
  if (thought && thought.length > 0) {
    const t = me.recent_thoughts.read();
    me.recent_thoughts.write((t ? t + "\\n" : "") + "[score-drop] " + thought);
  }
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

// ── me API ──────────────────────────────────────────────────

interface MeAPI {
  identity: { read: () => string; write: (s: string) => void };
  goal: { read: () => string; write: (s: string) => void };
  memory: { read: () => string; write: (s: string) => void };
  history: { read: () => string; write: (s: string) => void };
  recent_thoughts: { read: () => string; write: (s: string) => void };
  on_tick: { read: () => string; write: (s: string) => void };
  on_score: { read: () => string; write: (s: string) => void };

  takeAction: (action: string) => string;     // synchronous-looking, actually pumps queue
  reflectOn: (prompt: string) => string;       // synchronous-looking, actually pumps queue

  step: number;
  reflectionsUsed: number;
  maxReflections: number;
}

// ── Code execution ──────────────────────────────────────────

function compileAndRun(code: string, args: Record<string, any>): { ok: true; value: any } | { ok: false; error: string } {
  try {
    const fn = new Function(...Object.keys(args), code);
    const value = fn(...Object.values(args));
    return { ok: true, value };
  } catch (err: any) {
    return { ok: false, error: err.message ?? String(err) };
  }
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

// ── Reflection tools ────────────────────────────────────────

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

async function callOpenRouter(model: string, system: string, messages: ORMessage[], tools: any[]): Promise<any> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');

  const resp = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model, max_tokens: 4096, messages: [{ role: 'system', content: system }, ...messages], tools, tool_choice: 'auto' }),
  });

  if (!resp.ok) throw new Error(`OpenRouter ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

// ── Agent ───────────────────────────────────────────────────

interface V4Options {
  model: string;
  label: string;
  identity?: string;
  maxReflections?: number;
}

function createV4Agent(opts: V4Options): Agent {
  const { model, label, identity = DEFAULT_IDENTITY, maxReflections = MAX_TOTAL_REFLECTIONS } = opts;

  let soma: Soma;
  let playthroughLog: PlaythroughStep[] = [];
  let stepCounter = 0;
  let prevScore = 0;
  let totalReflectionTurns = 0;

  function resetSoma() {
    soma = {
      identity,
      goal: '',
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
      // Seed history with the opening observation as if it came from a "look" action
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

      // ── reflection helper (declared inside runEpisode so it can access state) ──
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
          if (!toolCall) break; // model is done editing

          const fnName = toolCall.function.name;
          if (!EDIT_NAMES.has(fnName)) break;

          const fnArgs = JSON.parse(toolCall.function.arguments);
          const sectionName = EDIT_TO_SECTION[fnName];
          const content = fnArgs.content;

          // Try the edit
          let resultText: string;
          try {
            // Reject empty code edits (would break the actant's body)
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

          // Track tool call in playthrough (will be attached to current step)
          stepReflectionToolCalls.push({ name: fnName, args: fnArgs, result: resultText });

          messages = [
            { role: 'assistant', tool_calls: choice.tool_calls, content: choice.content ?? undefined },
            { role: 'tool', tool_call_id: toolCall.id, content: resultText },
          ];
        }

        return collectedThoughts.join('\n\n');
      };

      // on_tick and on_score are AsyncFunction-compiled (see runAsyncCode).
      // The model's code uses `await me.takeAction(...)` and `await me.reflectOn(...)`.

      // ── per-step capture buckets ──
      let stepReflectionToolCalls: PlaythroughToolCall[] = [];
      let stepReflectionPrompts: string[] = [];
      let stepThinking: string[] = [];

      // takeAction implementation: directly calls bridge, returns observation string
      let lastBridgeState: TalesState = currentState;
      const takeAction = async (action: string): Promise<string> => {
        lastBridgeState = await bridge.step(action);
        currentState = lastBridgeState;
        // Record action in playthrough
        stepActionTaken = action;
        return lastBridgeState.observation;
      };

      const reflectOnHelper = async (prompt: string): Promise<string> => {
        stepReflectionPrompts.push(prompt);
        const thought = await reflect(prompt);
        if (thought) stepThinking.push(`[reflectOn: ${prompt}] → ${thought.slice(0, 200)}`);
        return thought;
      };

      let stepActionTaken = '(no action)';

      // ── Main loop ──
      for (let step = 1; step <= maxSteps; step++) {
        stepCounter = step;
        stepReflectionToolCalls = [];
        stepReflectionPrompts = [];
        stepThinking = [];
        stepActionTaken = '(no action)';

        // Build me API for this tick
        const me: any = {
          identity: buildSectionAPI(soma, 'identity'),
          goal: buildSectionAPI(soma, 'goal'),
          memory: buildSectionAPI(soma, 'memory'),
          history: buildSectionAPI(soma, 'history'),
          recent_thoughts: buildSectionAPI(soma, 'recent_thoughts'),
          on_tick: buildSectionAPI(soma, 'on_tick'),
          on_score: buildSectionAPI(soma, 'on_score'),
          takeAction,
          reflectOn: reflectOnHelper,
          step,
          reflectionsUsed: totalReflectionTurns,
          maxReflections,
        };

        // Run on_score if score changed since last tick
        if (currentState.score !== prevScore) {
          const scoreRes = await runAsyncCode(soma.on_score, { prevScore, newScore: currentState.score, me });
          if (!scoreRes.ok) {
            // Append error to memory (subject to cap; if it overflows, drop oldest content)
            appendToMemorySafe(soma, `[on_score error step ${step}: ${scoreRes.error.slice(0, 200)}]`);
          }
          prevScore = currentState.score;
          // Refresh reflectionsUsed in me (it may have changed)
          me.reflectionsUsed = totalReflectionTurns;
        }

        // Run on_tick (async, may call takeAction and reflectOn)
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

        // Check termination
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

// ── Async code execution helper ─────────────────────────────

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

// ── Memory safety helper (writes runtime errors, trims to fit cap) ──
function appendToMemorySafe(soma: Soma, line: string): void {
  const current = soma.memory ?? '';
  const cap = SECTION_CAPS.memory;
  const candidate = current + (current ? '\n' : '') + line;
  if (candidate.length <= cap) {
    soma.memory = candidate;
    return;
  }
  // Trim from front
  const lines = candidate.split('\n');
  while (lines.join('\n').length > cap && lines.length > 1) {
    lines.shift();
  }
  soma.memory = lines.join('\n').slice(-cap);
}

// ── Exports ─────────────────────────────────────────────────

export const v4Sonnet = createV4Agent({ model: 'anthropic/claude-sonnet-4.6', label: 'v4-sonnet' });
export const v4Opus = createV4Agent({ model: 'anthropic/claude-opus-4.6', label: 'v4-opus' });

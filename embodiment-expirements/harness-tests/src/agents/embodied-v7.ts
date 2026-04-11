/**
 * v7 Embodied Agent — All chassis auto-writes pushed into soma code.
 *
 * v7 builds on v6's dynamic-soma + section-management-tools and pushes
 * one more layer of seams from chassis into soma. Where v6 had the
 * chassis quietly managing inner_voice (auto-capturing voice after each
 * wake), the death note in memory, and the initial history line on
 * spawn — v7 makes all three of those Adam-editable code sections.
 *
 * What's new vs v6:
 *
 *   - **on_wake(me, voiceText)** — new built-in code section. Runs after
 *     every wakeUp returns, with the model's full concatenated voice as
 *     the second argument. The default on_wake writes voiceText to
 *     inner_voice. Adam can rewrite it to do anything else (e.g., curate
 *     into hard_earned_wisdom, or extract structured notes).
 *
 *   - **on_death(me, deathReason, lifeNumber, finalScore, lifeSteps)** —
 *     new built-in code section. Runs when the game reports done, BEFORE
 *     bridge.reset() respawns. The default on_death writes a death note
 *     to memory matching v6's chassis behavior. Adam can change how he
 *     memorializes his own deaths.
 *
 *   - **on_spawn(me, observation)** — new built-in code section. Runs at
 *     the start of each life (including life 1), with the game's opening
 *     observation. The default on_spawn writes the initial `look => ...`
 *     line to history. Adam can change how he greets each new world.
 *
 *   - **`edit_on_wake`, `edit_on_death`, `edit_on_spawn`** tools added to
 *     the per-section edit tool list, alongside the existing edit_on_tick
 *     and edit_on_score.
 *
 *   - **`add_section` / `remove_section`** (renamed from
 *     add_embodiment_section / remove_embodiment_section). Adam thinks of
 *     these as parts of himself, not "embodiment sections."
 *
 *   - **Dynamic section headers are now `# My <name>`** (e.g.
 *     `# My danger_log`). The snake_case section name appears verbatim
 *     in the header, prefixed with "My" to point at Adam. Built-ins keep
 *     their natural English headers. The distinction between *given*
 *     parts of self (built-ins) and *grown* parts of self (dynamic) is
 *     legible at a glance.
 *
 * Architectural commitments (carried forward from v6):
 *
 *   - Only soma-management tools are exposed during wakeUp. NO takeAction
 *     tool. Actions still go through me.takeAction in on_tick.
 *
 *   - Actions are taken at the END of the wake, never during.
 *
 *   - Text content from ALL turns is concatenated into one monologue.
 *     The last non-empty line of the monologue becomes the action.
 *
 *   - Up to 5 model turns per wake. Each turn counts 1 against the
 *     wakeUp budget.
 *
 *   - Total soma cap: ~100K tokens (≈ 400K chars at chars/4).
 *
 * What still lives in chassis (the last duties):
 *
 *   - Error capture for any soma code that throws — written to memory.
 *     If on_tick / on_wake / on_death / on_spawn / on_score is broken,
 *     Adam needs the error visible in his next wake to fix it. The
 *     chassis is the only thing that can write when the soma is broken.
 *
 *   - Budget exhausted note — chassis writes the obituary because Adam
 *     is no longer being woken.
 */

import type { Agent, TalesState, PlaythroughStep, PlaythroughToolCall } from '../types.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_TOTAL_WAKEUPS = 50;
const MAX_WAKE_TURNS = 5;
const TOTAL_SOMA_CHAR_CAP = 400_000; // ~100K tokens at chars/4

const THINKING_BUDGET_TOKENS = 2048;
const MAX_TOKENS = 6144;

// ── Built-in section schema ────────────────────────────────────

const BUILT_IN_SECTIONS = [
  'identity',
  'goal',
  'memory',
  'history',
  'inner_voice',
  'hard_earned_wisdom',
  'on_spawn',
  'on_tick',
  'on_wake',
  'on_score',
  'on_death',
] as const;
type BuiltInSection = typeof BUILT_IN_SECTIONS[number];

const BUILT_IN_HEADERS: Record<BuiltInSection, string> = {
  identity:           '# Who I am',
  goal:               '# What I want',
  memory:             '# What I remember',
  history:            '# What just happened',
  inner_voice:        '# What I was just thinking',
  hard_earned_wisdom: '# What I have learned the hard way',
  on_spawn:           '# How I greet a new world',
  on_tick:            '# How my body moves each moment',
  on_wake:            '# How I record my own voice',
  on_score:           '# How my body responds when something changes',
  on_death:           '# How I memorialize my own deaths',
};

const BUILT_IN_SET = new Set<string>(BUILT_IN_SECTIONS);
function isBuiltIn(name: string): boolean { return BUILT_IN_SET.has(name); }

function headerFor(name: string): string {
  if (isBuiltIn(name)) return BUILT_IN_HEADERS[name as BuiltInSection];
  // Dynamic section: prefixed with "My" so it points at Adam.
  // The section name appears verbatim — Adam reads "# My <name>" and
  // immediately knows the edit tool is edit_<name>.
  return `# My ${name}`;
}

const SECTION_NAME_RE = /^[a-z][a-z0-9_]{0,49}$/;
function validSectionName(name: string): boolean {
  return SECTION_NAME_RE.test(name);
}

// ── Defaults ───────────────────────────────────────────────────

const DEFAULT_IDENTITY = `I am Adam. I am an explorer of forgotten realms.

I have just woken up somewhere unfamiliar. I don't know yet where I am or how things work. I notice things. I move. I take risks. I learn.

When I act, I speak my thoughts as I move through this place, and on the last line I write the command my body is to perform.`;

const DEFAULT_GOAL = `I want to understand this place and survive in it. I want to find what is hidden here and bring it into the light.`;

const DEFAULT_MEMORY = `I just woke up here. I don't know how things work yet. I will pay attention.`;

// hard_earned_wisdom defaults to empty by design — the empty section is
// the invitation. Adam fills it himself when something is worth carrying.
const DEFAULT_HARD_EARNED_WISDOM = ``;

const DEFAULT_ON_TICK = `// Each moment, I wake up, I speak, and I act.
// My voice flows out across one or more turns of thought, and the last
// line of what I say is the command my body performs.

const histText = me.history.read();

// I keep a small counter in memory to track how many moments I've lived
const memText = me.memory.read();
const counterMatch = memText.match(/\\[tick:(\\d+)\\]/);
const tick = counterMatch ? parseInt(counterMatch[1]) + 1 : 1;
const newMem = memText.replace(/\\[tick:\\d+\\]/, '').trim() + ' [tick:' + tick + ']';
me.memory.write(newMem);

// I wake up. The on_wake handler records my voice into inner_voice
// automatically — I do not need to do that here.
const reply = await me.wakeUp("live");

// The last non-empty line of all I just said is the command my body performs.
const lines = reply.split("\\n").map(l => l.trim()).filter(l => l.length > 0);
const action = lines.length > 0 ? lines[lines.length - 1] : reply.trim();

// My body acts.
const observation = await me.takeAction(action);

// I remember what just happened. (rolling window — last 20 moments)
const entry = action + " => " + observation.slice(0, 200).replace(/\\n/g, ' ');
const newHist = (histText ? histText + "\\n" : "") + entry;
const allLines = newHist.split("\\n");
const trimmed = allLines.length > 20 ? allLines.slice(-20).join("\\n") : newHist;
me.history.write(trimmed);
`;

const DEFAULT_ON_WAKE = `// on_wake(me, voiceText) — runs after every wakeUp returns.
// voiceText is the full concatenated text from all turns of the wake.
// By default I record my voice into inner_voice so my next moment can
// read what I was just thinking. I can rewrite this if I want to do
// something else with my voice — curate, distill, extract, ignore.

me.inner_voice.write(voiceText.slice(-4500));
`;

const DEFAULT_ON_SCORE = `// on_score(prevScore, newScore, me) — runs when the game score changes.

if (newScore > prevScore) {
  const mem = me.memory.read();
  me.memory.write(mem + " [+" + (newScore - prevScore) + " → " + newScore + "]");
} else if (newScore < prevScore) {
  const mem = me.memory.read();
  me.memory.write(mem + " [LOST " + (prevScore - newScore) + " → " + newScore + "]");
}`;

const DEFAULT_ON_DEATH = `// on_death(me, deathReason, lifeNumber, finalScore, lifeSteps) — runs
// when the game reports done, BEFORE I am respawned into a new life.
// By default I write a death note into memory so I can remember what
// killed me. I can rewrite this to memorialize differently — perhaps
// distill the death's lesson into hard_earned_wisdom directly.

const note = "[life " + lifeNumber + " ended: score " + finalScore +
  " after " + lifeSteps + " steps — \\"" + deathReason.slice(0, 120) + "\\"]";
const mem = me.memory.read();
me.memory.write(mem + (mem ? "\\n" : "") + note);
`;

const DEFAULT_ON_SPAWN = `// on_spawn(me, observation) — runs at the start of each life,
// including the very first one. observation is the game's opening text.
// By default I write the initial sense of the world into history so my
// first moment in this new life has something to react to.

me.history.write("look => " + observation.replace(/\\n/g, " ").slice(0, 200));
`;

// ── Soma type and assembly ─────────────────────────────────────

type Soma = Map<string, string>;

function makeDefaultSoma(identity: string): Soma {
  const m = new Map<string, string>();
  m.set('identity', identity);
  m.set('goal', DEFAULT_GOAL);
  m.set('memory', DEFAULT_MEMORY);
  m.set('history', '');
  m.set('inner_voice', '');
  m.set('hard_earned_wisdom', DEFAULT_HARD_EARNED_WISDOM);
  m.set('on_spawn', DEFAULT_ON_SPAWN);
  m.set('on_tick', DEFAULT_ON_TICK);
  m.set('on_wake', DEFAULT_ON_WAKE);
  m.set('on_score', DEFAULT_ON_SCORE);
  m.set('on_death', DEFAULT_ON_DEATH);
  return m;
}

function assembleSoma(soma: Soma): string {
  const parts: string[] = [];
  // Built-ins first, in canonical order
  for (const name of BUILT_IN_SECTIONS) {
    if (!soma.has(name)) continue;
    const content = soma.get(name) ?? '';
    parts.push(`${headerFor(name)}\n\n${content || '(nothing yet)'}`);
  }
  // Dynamic sections after, in insertion order
  for (const name of soma.keys()) {
    if (isBuiltIn(name)) continue;
    const content = soma.get(name) ?? '';
    parts.push(`${headerFor(name)}\n\n${content || '(nothing yet)'}`);
  }
  return parts.join('\n\n');
}

function cloneSoma(soma: Soma): Record<string, string> {
  const obj: Record<string, string> = {};
  for (const [k, v] of soma) obj[k] = v;
  return obj;
}

// ── Section write/add/remove (cap-enforcing) ───────────────────

class SomaCapError extends Error {
  constructor(public projectedChars: number, public capChars: number) {
    super(`Soma write would exceed total cap: projected ${projectedChars} chars, cap ${capChars} (~${Math.floor(capChars / 4)} tokens at chars/4).`);
  }
}

function writeSection(soma: Soma, name: string, value: string): void {
  if (typeof value !== 'string') value = String(value);
  const prev = soma.get(name);
  const existed = soma.has(name);
  soma.set(name, value);
  const assembled = assembleSoma(soma);
  if (assembled.length > TOTAL_SOMA_CHAR_CAP) {
    if (existed) soma.set(name, prev!);
    else soma.delete(name);
    throw new SomaCapError(assembled.length, TOTAL_SOMA_CHAR_CAP);
  }
}

function addSection(soma: Soma, name: string, content: string): void {
  if (!validSectionName(name)) {
    throw new Error(`Invalid section name "${name}". Must be lowercase snake_case (a-z, 0-9, underscore), starting with a letter, max 50 chars.`);
  }
  if (isBuiltIn(name)) {
    throw new Error(`Cannot add a section with built-in name "${name}".`);
  }
  if (soma.has(name)) {
    throw new Error(`Section "${name}" already exists. Use edit_${name} to modify it.`);
  }
  writeSection(soma, name, content);
}

function removeSection(soma: Soma, name: string): void {
  if (isBuiltIn(name)) {
    throw new Error(`Cannot remove built-in section "${name}".`);
  }
  if (!soma.has(name)) {
    throw new Error(`Section "${name}" does not exist.`);
  }
  soma.delete(name);
}

// Chassis writes that gracefully truncate when at cap, never throw.
// These are the LAST DUTY of the chassis — they only fire when soma
// code itself has failed and the chassis must record the error.
function appendToMemorySafe(soma: Soma, line: string): void {
  const current = soma.get('memory') ?? '';
  const candidate = current + (current ? '\n' : '') + line;
  soma.set('memory', candidate);
  while (assembleSoma(soma).length > TOTAL_SOMA_CHAR_CAP) {
    const cur = soma.get('memory') ?? '';
    const lines = cur.split('\n');
    if (lines.length <= 1) {
      const last = lines[0] || '';
      if (last.length === 0) break;
      soma.set('memory', last.slice(Math.floor(last.length / 2)));
      continue;
    }
    lines.shift();
    soma.set('memory', lines.join('\n'));
  }
}

// ── OpenRouter ─────────────────────────────────────────────────

interface ORMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  tool_calls?: any[];
  tool_call_id?: string;
}

async function callOpenRouter(model: string, system: string, messages: ORMessage[], tools?: any[]): Promise<any> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');

  const body: any = {
    model,
    max_tokens: MAX_TOKENS,
    messages: [{ role: 'system', content: system }, ...messages],
    thinking: { type: 'enabled', budget_tokens: THINKING_BUDGET_TOKENS },
  };
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

// ── Tool definitions (built per-wake-turn from current soma) ──

type ORTool = { type: 'function'; function: { name: string; description: string; parameters: any } };

function buildToolsForSoma(soma: Soma): ORTool[] {
  const tools: ORTool[] = [];

  // One edit tool per existing section. Built-ins first, then dynamic.
  for (const name of BUILT_IN_SECTIONS) {
    if (!soma.has(name)) continue;
    tools.push({
      type: 'function',
      function: {
        name: `edit_${name}`,
        description: `Rewrite my "${name}" section with new content.`,
        parameters: {
          type: 'object',
          properties: { content: { type: 'string' } },
          required: ['content'],
          additionalProperties: false,
        },
      },
    });
  }
  for (const name of soma.keys()) {
    if (isBuiltIn(name)) continue;
    tools.push({
      type: 'function',
      function: {
        name: `edit_${name}`,
        description: `Rewrite my "${name}" section (one I added myself) with new content.`,
        parameters: {
          type: 'object',
          properties: { content: { type: 'string' } },
          required: ['content'],
          additionalProperties: false,
        },
      },
    });
  }

  // Section management
  tools.push({
    type: 'function',
    function: {
      name: 'add_section',
      description: 'Add a new section to myself with the given name and initial content. Section names must be lowercase snake_case (a-z, 0-9, underscore). The new section persists across deaths and gets its own edit_<name> tool on subsequent wakes (or later turns of the current wake). It will appear in my soma as "# My <name>".',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['name', 'content'],
        additionalProperties: false,
      },
    },
  });
  tools.push({
    type: 'function',
    function: {
      name: 'remove_section',
      description: 'Remove a section I previously added. Built-in sections (identity, goal, memory, history, inner_voice, hard_earned_wisdom, on_spawn, on_tick, on_wake, on_score, on_death) cannot be removed.',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
        additionalProperties: false,
      },
    },
  });

  return tools;
}

// ── Async code execution ───────────────────────────────────────

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

// ── Agent ──────────────────────────────────────────────────────

interface V7Options {
  model: string;
  label: string;
  identity?: string;
  maxWakeups?: number;
}

function createV7Agent(opts: V7Options): Agent {
  const { model, label, identity = DEFAULT_IDENTITY } = opts;
  let maxWakeups = opts.maxWakeups ?? MAX_TOTAL_WAKEUPS;

  let soma: Soma;
  let playthroughLog: PlaythroughStep[] = [];
  let stepCounter = 0;
  let prevScore = 0;
  let totalWakeups = 0;

  function resetSoma() {
    soma = makeDefaultSoma(identity);
  }

  resetSoma();

  return {
    name: label,

    setMaxReflections(n: number) {
      // Shared Agent-interface name for "per-episode inference budget".
      // In v7 each model turn (within a multi-turn wake) counts 1.
      maxWakeups = n;
    },

    reset(observation: string, info: TalesState) {
      resetSoma();
      playthroughLog = [];
      stepCounter = 0;
      prevScore = 0;
      totalWakeups = 0;
      // Initial spawn handled in runEpisode now (so on_spawn fires).
    },

    getPlaythrough() {
      return playthroughLog;
    },

    async runEpisode(bridge, initialState, maxSteps): Promise<TalesState> {
      let currentState = initialState;
      stepCounter = 0;
      let lifeNumber = 1;
      let lifeStepStart = 0;
      const lives: Array<{ life: number; score: number; steps: number; deathReason: string }> = [];
      let bestScore = 0;

      // ── per-step capture buckets ──
      let stepWakeToolCalls: PlaythroughToolCall[] = [];
      let stepWakeupPrompts: string[] = [];
      let stepThinking: string[] = [];
      let stepActionTaken = '(no action)';

      // ── wakeUp: multi-turn agentic loop with section-management tools ──
      const wakeUp = async (prompt: string): Promise<string> => {
        if (totalWakeups >= maxWakeups) return '';

        const accumulatedText: string[] = [];
        let messages: ORMessage[] = [{ role: 'user', content: prompt }];
        let turn = 0;
        let terminal = false;

        while (turn < MAX_WAKE_TURNS && !terminal && totalWakeups < maxWakeups) {
          const system = assembleSoma(soma);
          const tools = buildToolsForSoma(soma); // rebuild each turn — picks up newly added sections

          const data = await callOpenRouter(model, system, messages, tools);
          totalWakeups++;
          turn++;

          const choice = data.choices?.[0]?.message;
          if (!choice) break;

          const text = (choice.content ?? '').toString().trim();
          if (text) accumulatedText.push(text);

          const toolCalls: any[] = choice.tool_calls ?? [];
          if (!toolCalls || toolCalls.length === 0) {
            terminal = true;
            break;
          }

          // Execute each tool call, collect results
          const toolResults: Array<{ id: string; content: string }> = [];
          for (const tc of toolCalls) {
            const fnName = tc.function?.name ?? '(unknown)';
            let fnArgs: any = {};
            try { fnArgs = JSON.parse(tc.function?.arguments ?? '{}'); } catch { /* ignore */ }
            let resultText: string;
            try {
              if (fnName === 'add_section') {
                addSection(soma, fnArgs.name, fnArgs.content ?? '');
                resultText = `Added section "${fnArgs.name}". It appears in my soma as "# My ${fnArgs.name}". Edit it with edit_${fnArgs.name} on subsequent turns.`;
              } else if (fnName === 'remove_section') {
                removeSection(soma, fnArgs.name);
                resultText = `Removed section "${fnArgs.name}".`;
              } else if (fnName.startsWith('edit_')) {
                const sectionName = fnName.slice(5);
                if (!soma.has(sectionName)) {
                  resultText = `Section "${sectionName}" does not exist. Use add_section to create it first.`;
                } else if (typeof fnArgs.content !== 'string') {
                  resultText = `Error: edit_${sectionName} requires a "content" string.`;
                } else {
                  const isCodeSection = sectionName === 'on_tick' || sectionName === 'on_score' ||
                                        sectionName === 'on_wake' || sectionName === 'on_death' ||
                                        sectionName === 'on_spawn';
                  if (isCodeSection && fnArgs.content.trim().length === 0) {
                    resultText = `Error: cannot set ${sectionName} to empty. Provide full code.`;
                  } else {
                    writeSection(soma, sectionName, fnArgs.content);
                    resultText = `Updated ${sectionName}.`;
                  }
                }
              } else {
                resultText = `Unknown tool: ${fnName}`;
              }
            } catch (err: any) {
              if (err instanceof SomaCapError) {
                resultText = `Error: ${err.message} Try shrinking another section first, or removing a dynamic section you no longer need.`;
              } else {
                resultText = `Error: ${err.message ?? String(err)}`;
              }
            }
            stepWakeToolCalls.push({ name: fnName, args: fnArgs, result: resultText });
            toolResults.push({ id: tc.id, content: resultText });
          }

          messages = [
            ...messages,
            { role: 'assistant', tool_calls: toolCalls, content: choice.content ?? undefined },
            ...toolResults.map(r => ({ role: 'tool' as const, tool_call_id: r.id, content: r.content })),
          ];
        }

        const fullText = accumulatedText.join('\n\n');

        // Capture each turn's text for the playthrough
        for (const t of accumulatedText) {
          stepThinking.push(`[wake] ${t.slice(0, 300)}`);
        }
        stepWakeupPrompts.push(`wakeUp: ${prompt}`);

        // Run the actant's on_wake handler with the full voice text.
        // If on_wake throws, the chassis records the error to memory as
        // its last duty so Adam can see and fix it next wake.
        const wakeRes = await runAsyncCode(soma.get('on_wake') ?? '', { me: buildMeForCurrentLife(), voiceText: fullText });
        if (!wakeRes.ok) {
          appendToMemorySafe(soma, `[on_wake error: ${wakeRes.error.slice(0, 200)}]`);
        }

        return fullText;
      };

      // ── takeAction (calls bridge directly) ──
      const takeAction = async (action: string): Promise<string> => {
        const newState = await bridge.step(action);
        currentState = newState;
        stepActionTaken = action;
        return newState.observation;
      };

      // ── me proxy: section APIs for any section name + helpers ──
      // Note: stepCounter and lifeNumber are captured by closure; the
      // proxy reads them at access time so values stay current.
      const buildMe = () => new Proxy({}, {
        get(_t, prop) {
          if (typeof prop !== 'string') return undefined;
          switch (prop) {
            case 'takeAction': return takeAction;
            case 'wakeUp': return wakeUp;
            case 'step': return stepCounter;
            case 'life': return lifeNumber;
            case 'wakeupsUsed': return totalWakeups;
            case 'maxWakeups': return maxWakeups;
          }
          return {
            read: () => soma.get(prop) ?? '',
            write: (s: string) => writeSection(soma, prop, s),
          };
        },
        has(_t, prop) {
          if (typeof prop !== 'string') return false;
          if (['takeAction','wakeUp','step','life','wakeupsUsed','maxWakeups'].includes(prop)) return true;
          return soma.has(prop);
        },
      });

      // wakeUp() needs an `me` to pass to on_wake but doesn't have closure
      // access to a single `me` instance; build one on demand.
      const buildMeForCurrentLife = () => buildMe();

      // ── Initial spawn (life 1) ──
      // Run on_spawn for life 1 with the game's opening observation.
      // From here on, every life (including respawns) goes through the
      // same on_spawn path inside the main loop's death-handling block.
      {
        const meSpawn = buildMe();
        const spawnRes = await runAsyncCode(soma.get('on_spawn') ?? '', { me: meSpawn, observation: currentState.observation });
        if (!spawnRes.ok) {
          appendToMemorySafe(soma, `[on_spawn error life 1: ${spawnRes.error.slice(0, 200)}]`);
        }
      }

      // ── Main loop ──
      for (let step = 1; step <= maxSteps; step++) {
        stepCounter = step;
        stepWakeToolCalls = [];
        stepWakeupPrompts = [];
        stepThinking = [];
        stepActionTaken = '(no action)';

        const me = buildMe();

        // Run on_score if score changed since last tick
        if (currentState.score !== prevScore) {
          const scoreRes = await runAsyncCode(soma.get('on_score') ?? '', { prevScore, newScore: currentState.score, me });
          if (!scoreRes.ok) {
            appendToMemorySafe(soma, `[on_score error step ${step}: ${scoreRes.error.slice(0, 200)}]`);
          }
          prevScore = currentState.score;
        }

        // Run on_tick (async)
        const tickRes = await runAsyncCode(soma.get('on_tick') ?? '', { me });
        if (!tickRes.ok) {
          appendToMemorySafe(soma, `[on_tick error step ${step}: ${tickRes.error.slice(0, 200)}]`);
        }

        // Capture playthrough step
        playthroughLog.push({
          step,
          observation: currentState.observation,
          thinking: [...stepThinking],
          toolCalls: [
            ...stepWakeToolCalls,
            { name: 'on_tick', args: { action: stepActionTaken } },
          ],
          action: stepActionTaken,
          score: currentState.score,
          maxScore: currentState.max_score,
          reflectionsTriggered: [...stepWakeupPrompts],
          reflectionTurnsUsed: totalWakeups,
          soma: cloneSoma(soma),
        });

        bridge.checkpoint?.();

        if (currentState.score > bestScore) bestScore = currentState.score;

        // ── Life ended? ──
        if (currentState.done) {
          const lifeSteps = step - lifeStepStart;
          const deathReason = currentState.observation.replace(/\n+/g, ' ').trim().slice(0, 200);
          lives.push({ life: lifeNumber, score: currentState.score, steps: lifeSteps, deathReason });

          if (totalWakeups >= maxWakeups) {
            appendToMemorySafe(soma, `[wakeUp budget exhausted after life ${lifeNumber} ended at score ${currentState.score}]`);
            break;
          }

          // Run on_death (Adam memorializes his own death). If on_death
          // throws, chassis falls back to writing the death note itself
          // so the run isn't poisoned by a broken handler.
          const deathRes = await runAsyncCode(soma.get('on_death') ?? '', {
            me,
            deathReason,
            lifeNumber,
            finalScore: currentState.score,
            lifeSteps,
          });
          if (!deathRes.ok) {
            appendToMemorySafe(soma, `[on_death error life ${lifeNumber}: ${deathRes.error.slice(0, 200)}]`);
            // Also write a fallback death note so the next life knows
            // it died at all.
            const fallbackNote = `[life ${lifeNumber} ended: score ${currentState.score} after ${lifeSteps} steps — "${deathReason.slice(0, 120)}"]`;
            appendToMemorySafe(soma, fallbackNote);
          }

          // Respawn: new game, fresh history (set by on_spawn), persistent self.
          lifeNumber++;
          lifeStepStart = step;
          currentState = await bridge.reset();
          prevScore = 0;

          // Run on_spawn for the new life with the game's opening observation.
          const spawnRes = await runAsyncCode(soma.get('on_spawn') ?? '', { me, observation: currentState.observation });
          if (!spawnRes.ok) {
            appendToMemorySafe(soma, `[on_spawn error life ${lifeNumber}: ${spawnRes.error.slice(0, 200)}]`);
          }

          continue;
        }

        if (totalWakeups >= maxWakeups) {
          appendToMemorySafe(soma, `[wakeUp budget exhausted at step ${step} during life ${lifeNumber} at score ${currentState.score}]`);
          lives.push({ life: lifeNumber, score: currentState.score, steps: step - lifeStepStart, deathReason: '(budget exhausted, still alive)' });
          break;
        }
      }

      // ── End-of-episode summary ──
      console.log(`\n  ── lives lived (${lives.length}) ──`);
      for (const l of lives) {
        console.log(`    L${l.life}: score=${l.score} steps=${l.steps} — ${l.deathReason.slice(0, 80)}`);
      }
      console.log(`  best score across all lives: ${bestScore}`);
      console.log(`  total wakeups: ${totalWakeups}/${maxWakeups}`);

      // Report dynamic sections Adam created (if any)
      const dynamicSections: string[] = [];
      for (const name of soma.keys()) {
        if (!isBuiltIn(name)) dynamicSections.push(name);
      }
      if (dynamicSections.length > 0) {
        console.log(`  dynamic sections at end: ${dynamicSections.join(', ')}`);
      } else {
        console.log(`  no dynamic sections created`);
      }

      // Report whether any code section was rewritten
      const rewritten: string[] = [];
      for (const name of ['on_spawn','on_tick','on_wake','on_score','on_death']) {
        const def = name === 'on_spawn' ? DEFAULT_ON_SPAWN
                  : name === 'on_tick'  ? DEFAULT_ON_TICK
                  : name === 'on_wake'  ? DEFAULT_ON_WAKE
                  : name === 'on_score' ? DEFAULT_ON_SCORE
                  : name === 'on_death' ? DEFAULT_ON_DEATH
                  : '';
        if (soma.get(name) !== def) rewritten.push(name);
      }
      if (rewritten.length > 0) {
        console.log(`  code sections Adam rewrote: ${rewritten.join(', ')}`);
      } else {
        console.log(`  no code sections were rewritten`);
      }

      return { ...currentState, score: bestScore };
    },
  };
}

// ── Exports ────────────────────────────────────────────────────

export const v7Sonnet = createV7Agent({ model: 'anthropic/claude-sonnet-4.6', label: 'v7-sonnet' });
export const v7Opus = createV7Agent({ model: 'anthropic/claude-opus-4.6', label: 'v7-opus' });

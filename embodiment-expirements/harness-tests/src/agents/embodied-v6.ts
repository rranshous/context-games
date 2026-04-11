/**
 * v6 Embodied Agent — Dynamic soma + section management tools.
 *
 * v6 builds on v5's multi-life embodiment but makes the soma extensible
 * and rethinks how the actant's voice is preserved across moments.
 *
 * What's new in v6 vs v5:
 *
 *   - **inner_voice** (renamed from recent_thoughts). The chassis now auto-
 *     writes ALL accumulated text from each wakeUp into inner_voice
 *     automatically (across all turns of a multi-turn wake). Adam still has
 *     read/write access; the chassis just guarantees voice capture so the
 *     model's voice cannot be lost if Adam's on_tick stops managing it.
 *
 *   - **hard_earned_wisdom** — a new built-in section, defaults empty,
 *     persists across deaths, NEVER auto-touched by chassis or default
 *     on_tick. Adam fills it himself when something feels worth carrying.
 *     This is the durable cross-life wisdom journal v5 was missing.
 *
 *   - **Dynamic soma sections.** Adam can call `add_embodiment_section` /
 *     `remove_embodiment_section` during wakeUp tool turns to grow his own
 *     self structure. New sections persist across deaths and get their own
 *     `edit_<name>` tool on subsequent wakes. Section names must be
 *     lowercase snake_case.
 *
 *   - **wakeUp is now multi-turn.** Up to 5 model turns per wake. The model
 *     can call section-edit and section-management tools, get results, and
 *     continue until it produces a terminal text-only turn (or exhausts the
 *     turn budget). Each turn counts 1 against the wakeUp budget.
 *
 *   - **Per-section edit tools** built dynamically per wake from the current
 *     soma. If Adam adds a `danger_log` section in turn 1, he can call
 *     `edit_danger_log` in turn 2 of the same wake (the tool list is
 *     rebuilt each turn).
 *
 * Architectural commitments (vs v5):
 *
 *   - Only soma-management tools are exposed during wakeUp. NO takeAction
 *     tool. Actions still go through me.takeAction in on_tick — wakeUp is
 *     ONLY for speaking and self-shaping.
 *
 *   - Actions are taken at the END of the wake, never during. The 5-turn
 *     budget is for self-shaping; the world is touched once per heartbeat.
 *
 *   - Text content from ALL turns is concatenated into one monologue. The
 *     last non-empty line of the monologue becomes the action (default
 *     on_tick does this; Adam can change it).
 *
 *   - Total soma cap: ~100K tokens (≈ 400K chars at chars/4). Per-section
 *     caps are removed. Section edits that would push the assembled soma
 *     over the cap hard-error. Chassis writes (memory append, inner_voice
 *     capture) truncate gracefully so they never break the run.
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
  'on_tick',
  'on_score',
] as const;
type BuiltInSection = typeof BUILT_IN_SECTIONS[number];

const BUILT_IN_HEADERS: Record<BuiltInSection, string> = {
  identity:           '# Who I am',
  goal:               '# What I want',
  memory:             '# What I remember',
  history:            '# What just happened',
  inner_voice:        '# What I was just thinking',
  hard_earned_wisdom: '# What I have learned the hard way',
  on_tick:            '# How my body moves each moment',
  on_score:           '# How my body responds when something changes',
};

const BUILT_IN_SET = new Set<string>(BUILT_IN_SECTIONS);
function isBuiltIn(name: string): boolean { return BUILT_IN_SET.has(name); }

function headerFor(name: string): string {
  if (isBuiltIn(name)) return BUILT_IN_HEADERS[name as BuiltInSection];
  return `# ${name}`;
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

// hard_earned_wisdom defaults to empty by design — the empty section is the
// invitation. Adam fills it himself when something is worth carrying.
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

// I wake up. The chassis records all my voice into inner_voice automatically,
// so I do not need to write it myself.
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

const DEFAULT_ON_SCORE = `// on_score(prevScore, newScore, me) → void
// Runs when the game score changes.

if (newScore > prevScore) {
  const mem = me.memory.read();
  me.memory.write(mem + " [+" + (newScore - prevScore) + " → " + newScore + "]");
} else if (newScore < prevScore) {
  const mem = me.memory.read();
  me.memory.write(mem + " [LOST " + (prevScore - newScore) + " → " + newScore + "]");
}`;

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
  m.set('on_tick', DEFAULT_ON_TICK);
  m.set('on_score', DEFAULT_ON_SCORE);
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

function chassisWriteInnerVoice(soma: Soma, text: string): void {
  let attempt = text;
  while (attempt.length > 0) {
    try {
      writeSection(soma, 'inner_voice', attempt);
      return;
    } catch (e) {
      if (!(e instanceof SomaCapError)) throw e;
      attempt = attempt.slice(Math.floor(attempt.length / 2));
    }
  }
  try { writeSection(soma, 'inner_voice', ''); } catch { /* give up */ }
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
      name: 'add_embodiment_section',
      description: 'Add a new section to my embodiment with the given name and initial content. Section names must be lowercase snake_case (a-z, 0-9, underscore). The new section persists across deaths and gets its own edit_<name> tool on subsequent wakes (or later turns of the current wake).',
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
      name: 'remove_embodiment_section',
      description: 'Remove a section I previously added. Built-in sections (identity, goal, memory, history, inner_voice, hard_earned_wisdom, on_tick, on_score) cannot be removed.',
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

interface V6Options {
  model: string;
  label: string;
  identity?: string;
  maxWakeups?: number;
}

function createV6Agent(opts: V6Options): Agent {
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
      // In v6 each model turn (within a multi-turn wake) counts 1.
      maxWakeups = n;
    },

    reset(observation: string, info: TalesState) {
      resetSoma();
      playthroughLog = [];
      stepCounter = 0;
      prevScore = 0;
      totalWakeups = 0;
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
              if (fnName === 'add_embodiment_section') {
                addSection(soma, fnArgs.name, fnArgs.content ?? '');
                resultText = `Added section "${fnArgs.name}". Edit it with edit_${fnArgs.name} on subsequent turns.`;
              } else if (fnName === 'remove_embodiment_section') {
                removeSection(soma, fnArgs.name);
                resultText = `Removed section "${fnArgs.name}".`;
              } else if (fnName.startsWith('edit_')) {
                const sectionName = fnName.slice(5);
                if (!soma.has(sectionName)) {
                  resultText = `Section "${sectionName}" does not exist. Use add_embodiment_section to create it first.`;
                } else if (typeof fnArgs.content !== 'string') {
                  resultText = `Error: edit_${sectionName} requires a "content" string.`;
                } else {
                  const isCodeSection = sectionName === 'on_tick' || sectionName === 'on_score';
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

        // Chassis auto-write to inner_voice — never lose Adam's voice
        chassisWriteInnerVoice(soma, fullText);

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
      const buildMe = (currentLife: number, currentStep: number) => new Proxy({}, {
        get(_t, prop) {
          if (typeof prop !== 'string') return undefined;
          switch (prop) {
            case 'takeAction': return takeAction;
            case 'wakeUp': return wakeUp;
            case 'step': return currentStep;
            case 'life': return currentLife;
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

      // ── Main loop ──
      for (let step = 1; step <= maxSteps; step++) {
        stepCounter = step;
        stepWakeToolCalls = [];
        stepWakeupPrompts = [];
        stepThinking = [];
        stepActionTaken = '(no action)';

        const me = buildMe(lifeNumber, step);

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

          const deathNote = `[life ${lifeNumber} ended: score ${currentState.score} after ${lifeSteps} steps — "${deathReason.slice(0, 120)}"]`;
          appendToMemorySafe(soma, deathNote);

          // Respawn: new game, fresh history, persistent self.
          // identity / goal / memory / inner_voice / hard_earned_wisdom /
          // on_tick / on_score / dynamic sections all persist.
          lifeNumber++;
          lifeStepStart = step;
          currentState = await bridge.reset();
          prevScore = 0;
          soma.set('history', `look => ${currentState.observation.replace(/\n/g, ' ').slice(0, 200)}`);
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

      return { ...currentState, score: bestScore };
    },
  };
}

// ── Exports ────────────────────────────────────────────────────

export const v6Sonnet = createV6Agent({ model: 'anthropic/claude-sonnet-4.6', label: 'v6-sonnet' });
export const v6Opus = createV6Agent({ model: 'anthropic/claude-opus-4.6', label: 'v6-opus' });

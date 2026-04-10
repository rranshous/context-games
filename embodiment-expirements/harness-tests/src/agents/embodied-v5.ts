/**
 * v5 Embodied Agent — Direct driver. No reflection, no edit tools.
 *
 * v5 keeps the v4 architecture (me.takeAction, async on_tick, section caps)
 * but the only inference primitive is me.wakeUp(prompt) — text in, text out,
 * NO tools. Self-modification still happens: on_tick is JS, the actant can
 * call me.on_tick.write(...) (or any other section's .write()) directly from
 * its own code.
 *
 * The default on_tick uses me.wakeUp to ask the model what to do, then passes
 * the response straight to me.takeAction. This is the direct-driver pattern
 * in embodiment clothing: the model is in the loop every tick, but only
 * because the actant's code chooses to wake it.
 *
 * me.wakeUp counts against a per-episode budget (default 50). With a wakeUp
 * call every tick, the budget burns in ~50 ticks unless on_tick gets smarter.
 */

import type { Agent, TalesState, PlaythroughStep } from '../types.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_TOTAL_WAKEUPS = 50;

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

const DEFAULT_IDENTITY = `I am Adam. I am an explorer of forgotten realms.

I have just woken up somewhere unfamiliar. I don't know yet where I am or how things work. I notice things. I move. I take risks. I learn.

When I act, I speak my thoughts as I move through this place, and on the last line I write the command my body is to perform.`;

const DEFAULT_GOAL = `I want to understand this place and survive in it. I want to find what is hidden here and bring it into the light.`;

const DEFAULT_MEMORY = `I just woke up here. I don't know how things work yet. I will pay attention.`;

const DEFAULT_ON_TICK = `// Each moment, I wake up, I speak, and I act.
// My voice flows out, and the last line of what I say is the command
// my body performs.

const histText = me.history.read();

// I wake up.
const reply = await me.wakeUp("live");

// I keep what I just thought, so I can remember it next moment.
me.recent_thoughts.write(reply.slice(-4500));

// The last non-empty line of my voice is the command my body performs.
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
    `# Who I am\n\n${soma.identity}`,
    `# What I want\n\n${soma.goal || '(nothing yet)'}`,
    `# What I remember\n\n${soma.memory || '(nothing yet)'}`,
    `# What just happened\n\n${soma.history || '(nothing yet — I have only just woken)'}`,
    `# What I was just thinking\n\n${soma.recent_thoughts || '(nothing yet)'}`,
    `# How my body moves each moment\n\n${soma.on_tick}`,
    `# How my body responds when something changes\n\n${soma.on_score}`,
  ].join('\n\n');
}

function cloneSoma(soma: Soma) {
  return { ...soma };
}

// ── OpenRouter ──────────────────────────────────────────────

interface ORMessage { role: 'system' | 'user' | 'assistant'; content?: string; }

// Extended thinking gives the model space to deliberate before its visible
// reply. The thinking content is NOT exposed to Adam in his soma — it's
// internal cognition that improves the quality of his voice without
// teaching him about his own scaffolding.
const THINKING_BUDGET_TOKENS = 2048;
const MAX_TOKENS = 6144; // must be > thinking budget

async function callOpenRouter(model: string, system: string, messages: ORMessage[]): Promise<any> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');

  const body: any = {
    model,
    max_tokens: MAX_TOKENS,
    messages: [{ role: 'system', content: system }, ...messages],
    thinking: { type: 'enabled', budget_tokens: THINKING_BUDGET_TOKENS },
  };

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
  maxWakeups?: number;
}

function createV5Agent(opts: V5Options): Agent {
  const { model, label, identity = DEFAULT_IDENTITY } = opts;
  let maxWakeups = opts.maxWakeups ?? MAX_TOTAL_WAKEUPS;

  let soma: Soma;
  let playthroughLog: PlaythroughStep[] = [];
  let stepCounter = 0;
  let prevScore = 0;
  let totalWakeups = 0;

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

    setMaxReflections(n: number) {
      // Shared Agent-interface name for "per-episode inference budget".
      // In v5 there's no reflection at all — this caps wakeUps.
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
      let stepWakeupPrompts: string[] = [];
      let stepThinking: string[] = [];
      let stepActionTaken = '(no action)';

      // ── wakeUp (text in, text out, no tools) ──
      const wakeUp = async (prompt: string): Promise<string> => {
        if (totalWakeups >= maxWakeups) return '';
        const system = assembleSoma(soma);
        const messages: ORMessage[] = [{ role: 'user', content: prompt }];
        const data = await callOpenRouter(model, system, messages);
        totalWakeups++;

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

      // ── wakeUp helper that records prompts/thinking ──
      const wakeUpHelper = async (prompt: string): Promise<string> => {
        stepWakeupPrompts.push(`wakeUp: ${prompt}`);
        const text = await wakeUp(prompt);
        if (text) stepThinking.push(`[wakeUp: ${prompt.slice(0, 60)}] → ${text.slice(0, 200)}`);
        return text;
      };

      // ── Main loop ──
      for (let step = 1; step <= maxSteps; step++) {
        stepCounter = step;
        stepWakeupPrompts = [];
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
          wakeUp: wakeUpHelper,
          step,
          life: lifeNumber,
          wakeupsUsed: totalWakeups,
          maxWakeups,
        };

        // Run on_score if score changed since last tick
        if (currentState.score !== prevScore) {
          const scoreRes = await runAsyncCode(soma.on_score, { prevScore, newScore: currentState.score, me });
          if (!scoreRes.ok) {
            appendToMemorySafe(soma, `[on_score error step ${step}: ${scoreRes.error.slice(0, 200)}]`);
          }
          prevScore = currentState.score;
          me.wakeupsUsed = totalWakeups;
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
            { name: 'on_tick', args: { action: stepActionTaken } },
          ],
          action: stepActionTaken,
          score: currentState.score,
          maxScore: currentState.max_score,
          reflectionsTriggered: [...stepWakeupPrompts],
          reflectionTurnsUsed: totalWakeups,
          soma: cloneSoma(soma),
        });

        if (currentState.score > bestScore) bestScore = currentState.score;

        // ── Life ended? ──
        if (currentState.done) {
          const lifeSteps = step - lifeStepStart;
          const deathReason = currentState.observation.replace(/\n+/g, ' ').trim().slice(0, 200);
          lives.push({ life: lifeNumber, score: currentState.score, steps: lifeSteps, deathReason });

          // Out of budget? Stop here, don't respawn into a life with no thoughts.
          if (totalWakeups >= maxWakeups) {
            appendToMemorySafe(soma, `[wakeUp budget exhausted after life ${lifeNumber} ended at score ${currentState.score}]`);
            break;
          }

          // Write a death note Adam will see in his memory next moment.
          const deathNote = `[life ${lifeNumber} ended: score ${currentState.score} after ${lifeSteps} steps — "${deathReason.slice(0, 120)}"]`;
          appendToMemorySafe(soma, deathNote);

          // Respawn: new game, fresh history, persistent self.
          // recent_thoughts persists too — Adam's last words carry forward.
          lifeNumber++;
          lifeStepStart = step;
          currentState = await bridge.reset();
          prevScore = 0;
          soma.history = `look => ${currentState.observation.replace(/\n/g, ' ').slice(0, 200)}`;
          continue;
        }

        if (totalWakeups >= maxWakeups) {
          appendToMemorySafe(soma, `[wakeUp budget exhausted at step ${step} during life ${lifeNumber} at score ${currentState.score}]`);
          // Record this life as it stands, no death reason.
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

      // Synthesize a "best life" return state so the bench summary shows
      // Adam's peak achievement, not whatever he was at when budget ran out.
      return { ...currentState, score: bestScore };
    },
  };
}

// ── Exports ─────────────────────────────────────────────────

export const v5Sonnet = createV5Agent({ model: 'anthropic/claude-sonnet-4.6', label: 'v5-sonnet' });
export const v5Opus = createV5Agent({ model: 'anthropic/claude-opus-4.6', label: 'v5-opus' });

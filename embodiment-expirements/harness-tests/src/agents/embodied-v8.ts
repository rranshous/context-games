/**
 * v8 Embodied Agent — me / world split + custom_tools + chassis-owned state.
 *
 * v8 forks from v7 and makes three structural changes:
 *
 * 1. **me / world split.** All JS handlers now receive (me, world). `me`
 *    is Adam's self — his sections, his voice, his self-shaping. `world`
 *    is the environment — where actions land and observations come from.
 *    `world.takeAction(action)` replaces `me.takeAction`. Selves shape
 *    themselves; worlds are what selves act on. The split reflects the
 *    real distinction between inward and outward reach.
 *
 * 2. **Chassis owns core state.** The soma Map, the lives counter, the
 *    wakeup budget, the bridge — all chassis. Not visible in the soma,
 *    not editable. The chassis-defined LLM tools (edit_identity, etc.)
 *    are thin wrappers over `me.<section>.write()`. Adam does not need
 *    to see the implementation of `edit_identity` because the
 *    implementation is boring — it's a one-line write. Keeping the
 *    primitives in chassis code means Adam can't break them and has no
 *    impulse to "maintain" them. The maintenance-loop bug dissolves.
 *
 * 3. **custom_tools section.** Adam authors his own LLM tools in a soma
 *    section. Each entry is `{name, description, input_schema, body}`
 *    where body is a JS function expression: `function(input, me, world)
 *    { ... }`. The chassis reads the section each wake, parses the JSON,
 *    compiles the bodies, and offers them to the model alongside the
 *    built-in tools. The custom_tools section is seeded with working
 *    examples (add_to_hard_earned_wisdom / remove_from_hard_earned_wisdom)
 *    that teach Adam the pattern for section-manipulating helpers.
 *
 * Carried forward from v7:
 *
 *   - Single-turn wakeUp. Tools are expressive side effects, not
 *     interactive queries. Adam never sees tool results as conversation.
 *   - Silent ticks allowed — if Adam returns no text, the tick passes.
 *   - Handler-managed sections (inner_voice, memory, history) get no
 *     edit tools. Edit the handler instead.
 *   - on_spawn / on_wake / on_death / on_tick / on_score are all
 *     Adam-editable code sections.
 *   - hard_earned_wisdom is the durable wisdom journal, empty invitation.
 *   - Section headers: built-ins get natural English, dynamic sections
 *     get "# My <name>".
 *   - Total soma cap ~100K tokens.
 *   - No-op edit detection: if Adam calls edit_<section> with content
 *     identical to current, the chassis leaves a note in memory telling
 *     him sections persist automatically.
 *
 * Handler signatures:
 *
 *   - on_tick(me, world)
 *   - on_wake(me, world, voiceText)
 *   - on_spawn(me, world)    — observation via world.observation
 *   - on_score(me, world, prevScore, newScore)
 *   - on_death(me, world, deathReason, lifeNumber, finalScore, lifeSteps)
 *
 * What lives on me:
 *   - me.<section>.read() / .write(s) — for every existing section
 *   - me.wakeUp(prompt) — waking is something the self does
 *
 * What lives on world:
 *   - world.takeAction(action) → observation
 *   - world.observation — current observation
 *   - world.score, world.max_score
 *   - world.step, world.life
 *   - world.wakeupsUsed, world.maxWakeups
 */

import type { Agent, TalesState, PlaythroughStep, PlaythroughToolCall } from '../types.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_TOTAL_WAKEUPS = 50;
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
  'custom_tools',
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
  custom_tools:       '# Tools I have shaped for myself',
};

const BUILT_IN_SET = new Set<string>(BUILT_IN_SECTIONS);
function isBuiltIn(name: string): boolean { return BUILT_IN_SET.has(name); }

// Handler-managed sections do not get LLM edit tools. Edit the handler instead.
const HANDLER_MANAGED = new Set<string>(['inner_voice', 'memory', 'history']);

function headerFor(name: string): string {
  if (isBuiltIn(name)) return BUILT_IN_HEADERS[name as BuiltInSection];
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

const DEFAULT_HARD_EARNED_WISDOM = ``;

const DEFAULT_ON_TICK = `// Each moment, I wake up, and I may speak, and I may act.
//
// Most moments I will speak and act. But sometimes a moment is just
// for thinking — for shaping myself, writing a note to my future self,
// or changing how I move. Those moments are silent; the world waits.
// Silence is a legitimate way to be.

const histText = me.history.read();

// I keep small counters in memory: tick (total moments lived) and
// silent (consecutive silent moments).
const memText = me.memory.read();
const tickMatch = memText.match(/\\[tick:(\\d+)\\]/);
const tick = tickMatch ? parseInt(tickMatch[1]) + 1 : 1;
let cleaned = memText.replace(/\\[tick:\\d+\\]/, '').trim();

// I wake up. on_wake records my voice into inner_voice automatically.
const reply = await me.wakeUp("live");

// The last non-empty line of all I just said is the command my body
// performs — if I said anything at all.
const lines = reply.split("\\n").map(l => l.trim()).filter(l => l.length > 0);
const action = lines.length > 0 ? lines[lines.length - 1] : "";

if (action.length > 0) {
  // I spoke, so I act. Reset the silence counter.
  cleaned = cleaned.replace(/\\[silent:\\d+\\]/, '').trim();
  me.memory.write(cleaned + ' [tick:' + tick + ']');

  // I reach out and touch the world.
  const observation = await world.takeAction(action);

  // I remember what just happened. (rolling window — last 20 moments)
  const entry = action + " => " + observation.slice(0, 200).replace(/\\n/g, ' ');
  const newHist = (histText ? histText + "\\n" : "") + entry;
  const allLines = newHist.split("\\n");
  const trimmed = allLines.length > 20 ? allLines.slice(-20).join("\\n") : newHist;
  me.history.write(trimmed);
} else {
  // I was silent this moment. The world waits. I update the silence
  // counter and, if I have been silent for 3+ moments in a row, I
  // replace the prior soft note in memory (in place — I do not let
  // the notes accumulate).
  const silentMatch = cleaned.match(/\\[silent:(\\d+)\\]/);
  const silentCount = (silentMatch ? parseInt(silentMatch[1]) : 0) + 1;
  cleaned = cleaned.replace(/\\[silent:\\d+\\]/, '').trim();
  // Strip any previous "note to self" silent-note so it doesn't accumulate.
  cleaned = cleaned.replace(/\\[note to self: \\d+ moments have passed without action; the world is still waiting\\]/g, '').trim();
  let withCounters = cleaned + ' [tick:' + tick + '] [silent:' + silentCount + ']';
  if (silentCount >= 3) {
    withCounters += ' [note to self: ' + silentCount + ' moments have passed without action; the world is still waiting]';
  }
  me.memory.write(withCounters);

  const entry = '(silent) => (world waits)';
  const newHist = (histText ? histText + "\\n" : "") + entry;
  const allLines = newHist.split("\\n");
  const trimmed = allLines.length > 20 ? allLines.slice(-20).join("\\n") : newHist;
  me.history.write(trimmed);
}
`;

const DEFAULT_ON_WAKE = `// on_wake(me, world, voiceText) — runs after every wakeUp returns.
// voiceText is the text I said this moment (may be empty if silent).
// By default I record my voice into inner_voice so my next moment can
// read what I was just thinking.
//
// If this was a silent moment, I leave my inner_voice alone — the
// last thing I said still echoes. Silence does not erase what I was
// just thinking.

if (voiceText && voiceText.length > 0) {
  me.inner_voice.write(voiceText.slice(-4500));
}
`;

const DEFAULT_ON_SCORE = `// on_score(me, world, prevScore, newScore) — runs when score changes.

if (newScore > prevScore) {
  const mem = me.memory.read();
  me.memory.write(mem + " [+" + (newScore - prevScore) + " → " + newScore + "]");
} else if (newScore < prevScore) {
  const mem = me.memory.read();
  me.memory.write(mem + " [LOST " + (prevScore - newScore) + " → " + newScore + "]");
}`;

const DEFAULT_ON_DEATH = `// on_death(me, world, deathReason, lifeNumber, finalScore, lifeSteps) —
// runs when the game reports done, BEFORE I am respawned.
// By default I write a death note into memory.

const note = "[life " + lifeNumber + " ended: score " + finalScore +
  " after " + lifeSteps + " steps — \\"" + deathReason.slice(0, 120) + "\\"]";
const mem = me.memory.read();
me.memory.write(mem + (mem ? "\\n" : "") + note);
`;

const DEFAULT_ON_SPAWN = `// on_spawn(me, world) — runs at the start of each life.
// world.observation has the game's opening text.
// By default I write the initial sense of the world into history.

me.history.write("look => " + world.observation.replace(/\\n/g, " ").slice(0, 200));
`;

// custom_tools is seeded with two working examples. They teach Adam the
// pattern for section-manipulating helper tools. He can copy this shape
// to build helpers for his own sections.
const DEFAULT_CUSTOM_TOOLS = `\`\`\`json
[
  {
    "name": "add_to_hard_earned_wisdom",
    "description": "Append a new bullet to my hard_earned_wisdom section. Use this when I have learned something worth carrying forward across lives.",
    "input_schema": {
      "type": "object",
      "properties": { "item": { "type": "string", "description": "The lesson, as a single line" } },
      "required": ["item"],
      "additionalProperties": false
    },
    "body": "function(input, me, world) { const cur = me.hard_earned_wisdom.read(); const line = '- ' + input.item.replace(/\\\\n/g, ' ').trim(); me.hard_earned_wisdom.write(cur ? cur + '\\\\n' + line : line); return 'added: ' + input.item.slice(0, 80); }"
  },
  {
    "name": "remove_from_hard_earned_wisdom",
    "description": "Remove a bullet from my hard_earned_wisdom section by substring match. Use this when a lesson I thought I learned turns out to be wrong.",
    "input_schema": {
      "type": "object",
      "properties": { "match": { "type": "string", "description": "A substring that uniquely identifies the bullet to remove" } },
      "required": ["match"],
      "additionalProperties": false
    },
    "body": "function(input, me, world) { const cur = me.hard_earned_wisdom.read(); const lines = cur.split('\\\\n'); const kept = lines.filter(l => !l.includes(input.match)); me.hard_earned_wisdom.write(kept.join('\\\\n')); return 'removed lines matching: ' + input.match.slice(0, 80); }"
  }
]
\`\`\`
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
  m.set('custom_tools', DEFAULT_CUSTOM_TOOLS);
  return m;
}

function assembleSoma(soma: Soma): string {
  const parts: string[] = [];
  for (const name of BUILT_IN_SECTIONS) {
    if (!soma.has(name)) continue;
    const content = soma.get(name) ?? '';
    parts.push(`${headerFor(name)}\n\n${content || '(nothing yet)'}`);
  }
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

// Normalize section content for no-op comparison. Catches the
// whitespace-diff edge case where Adam rewrites a reflex with leading
// blank lines or trailing whitespace and gets a "successful" edit that
// was effectively a no-op.
function normalizeForComparison(s: string): string {
  return s
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')   // strip trailing whitespace per line
    .replace(/\n{3,}/g, '\n\n') // collapse 3+ blank lines
    .trim();
}

// ── Section write/add/remove (cap-enforcing) ───────────────────

class SomaCapError extends Error {
  constructor(public projectedChars: number, public capChars: number) {
    super(`Soma write would exceed total cap: projected ${projectedChars} chars, cap ${capChars}.`);
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
    throw new Error(`Invalid section name "${name}". Must be lowercase snake_case.`);
  }
  if (isBuiltIn(name)) {
    throw new Error(`Cannot add a section with built-in name "${name}".`);
  }
  if (soma.has(name)) {
    throw new Error(`Section "${name}" already exists. Use edit_${name} instead.`);
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

// ── custom_tools parsing ───────────────────────────────────────

interface CustomToolDef {
  name: string;
  description: string;
  input_schema: any;
  body: string;
}

// Parse custom_tools section content. Accepts either a fenced ```json
// block or raw JSON. Returns parsed tool defs or throws with a clear
// error message.
function parseCustomTools(content: string): CustomToolDef[] {
  if (!content || content.trim().length === 0) return [];
  let jsonText = content.trim();

  const fenceMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) jsonText = fenceMatch[1].trim();

  if (jsonText.length === 0) return [];

  let parsed: any;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e: any) {
    throw new Error(`custom_tools JSON parse error: ${e.message}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`custom_tools must be a JSON array of tool definitions`);
  }

  const defs: CustomToolDef[] = [];
  for (const [i, entry] of parsed.entries()) {
    if (typeof entry !== 'object' || !entry) {
      throw new Error(`custom_tools[${i}] must be an object`);
    }
    if (typeof entry.name !== 'string' || !entry.name) {
      throw new Error(`custom_tools[${i}].name must be a non-empty string`);
    }
    if (typeof entry.description !== 'string') {
      throw new Error(`custom_tools[${i}].description must be a string`);
    }
    if (typeof entry.input_schema !== 'object' || !entry.input_schema) {
      throw new Error(`custom_tools[${i}].input_schema must be an object`);
    }
    if (typeof entry.body !== 'string' || !entry.body) {
      throw new Error(`custom_tools[${i}].body must be a non-empty string (function expression)`);
    }
    defs.push(entry as CustomToolDef);
  }
  return defs;
}

// Compile a custom tool body into a callable (input, me, world) => any.
function compileCustomTool(def: CustomToolDef): (input: any, me: any, world: any) => any {
  const fn = new Function(`return (${def.body});`)();
  if (typeof fn !== 'function') {
    throw new Error(`custom_tools["${def.name}"].body did not evaluate to a function`);
  }
  return fn;
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

// ── Tool definitions ───────────────────────────────────────────

type ORTool = { type: 'function'; function: { name: string; description: string; parameters: any } };

// Code/reflex sections use a single reshape_reflex tool instead of per-
// section edit_on_* tools. Framing them as "reflexes" emphasizes that
// they are the body's movement patterns, not a field to maintain.
const REFLEX_SECTIONS = new Set<string>(['on_spawn', 'on_tick', 'on_wake', 'on_score', 'on_death']);

function buildBuiltInTools(soma: Soma): ORTool[] {
  const tools: ORTool[] = [];

  for (const name of BUILT_IN_SECTIONS) {
    if (!soma.has(name)) continue;
    if (HANDLER_MANAGED.has(name)) continue;
    if (REFLEX_SECTIONS.has(name)) continue; // reflexes use reshape_reflex
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

  // reshape_reflex — single tool for all reflex (code) sections
  tools.push({
    type: 'function',
    function: {
      name: 'reshape_reflex',
      description: 'Reshape one of my reflexes — the code my body runs at a particular moment. Reflexes: on_spawn (how I greet a new world), on_tick (how my body moves each moment), on_wake (how I record my own voice), on_score (how my body responds when something changes), on_death (how I memorialize my own deaths). Reshape a reflex only when I actually want it to do something different.',
      parameters: {
        type: 'object',
        properties: {
          reflex: {
            type: 'string',
            enum: ['on_spawn', 'on_tick', 'on_wake', 'on_score', 'on_death'],
          },
          body: { type: 'string' },
        },
        required: ['reflex', 'body'],
        additionalProperties: false,
      },
    },
  });

  tools.push({
    type: 'function',
    function: {
      name: 'add_section',
      description: 'Add a new section to myself with the given name and initial content. Section names must be lowercase snake_case. It will appear in my soma as "# My <name>".',
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
      description: 'Remove a section I previously added. Built-in sections cannot be removed.',
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

// Full tool list: built-ins + parsed custom_tools. On parse error,
// returns built-ins only and surfaces the error via caller.
function buildAllTools(soma: Soma): { tools: ORTool[]; customDefs: CustomToolDef[]; parseError?: string } {
  const builtIn = buildBuiltInTools(soma);
  let customDefs: CustomToolDef[] = [];
  let parseError: string | undefined;
  try {
    customDefs = parseCustomTools(soma.get('custom_tools') ?? '');
  } catch (e: any) {
    parseError = e.message;
  }
  const customTools: ORTool[] = customDefs.map(def => ({
    type: 'function' as const,
    function: {
      name: def.name,
      description: def.description,
      parameters: def.input_schema,
    },
  }));
  return { tools: [...builtIn, ...customTools], customDefs, parseError };
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

interface V8Options {
  model: string;
  label: string;
  identity?: string;
  maxWakeups?: number;
}

function createV8Agent(opts: V8Options): Agent {
  const { model, label, identity = DEFAULT_IDENTITY } = opts;
  let maxWakeups = opts.maxWakeups ?? MAX_TOTAL_WAKEUPS;

  let soma: Soma;
  let playthroughLog: PlaythroughStep[] = [];
  let prevScore = 0;
  let totalWakeups = 0;

  function resetSoma() {
    soma = makeDefaultSoma(identity);
  }

  resetSoma();

  return {
    name: label,

    setMaxReflections(n: number) {
      maxWakeups = n;
    },

    reset(observation: string, info: TalesState) {
      resetSoma();
      playthroughLog = [];
      prevScore = 0;
      totalWakeups = 0;
    },

    getPlaythrough() {
      return playthroughLog;
    },

    async runEpisode(bridge, initialState, maxSteps): Promise<TalesState> {
      let currentState = initialState;
      let lifeNumber = 1;
      let lifeStepStart = 0;
      const lives: Array<{ life: number; score: number; steps: number; deathReason: string }> = [];
      let bestScore = 0;
      let currentStep = 0;

      // ── per-step capture buckets ──
      let stepWakeToolCalls: PlaythroughToolCall[] = [];
      let stepWakeupPrompts: string[] = [];
      let stepThinking: string[] = [];
      let stepActionTaken = '(no action)';

      // ── me proxy: section APIs for any section name ──
      const buildMe = () => new Proxy({}, {
        get(_t, prop) {
          if (typeof prop !== 'string') return undefined;
          if (prop === 'wakeUp') return wakeUp;
          return {
            read: () => soma.get(prop) ?? '',
            write: (s: string) => writeSection(soma, prop, s),
          };
        },
        has(_t, prop) {
          if (typeof prop !== 'string') return false;
          if (prop === 'wakeUp') return true;
          return soma.has(prop);
        },
      });

      // ── world surface: game + contextual facts ──
      const buildWorld = () => ({
        takeAction: async (action: string): Promise<string> => {
          const newState = await bridge.step(action);
          currentState = newState;
          stepActionTaken = action;
          return newState.observation;
        },
        get observation() { return currentState.observation; },
        get score() { return currentState.score; },
        get max_score() { return currentState.max_score; },
        get step() { return currentStep; },
        get life() { return lifeNumber; },
        get wakeupsUsed() { return totalWakeups; },
        get maxWakeups() { return maxWakeups; },
      });

      // ── wakeUp: single model call, tools as expressive side effects ──
      const wakeUp = async (prompt: string): Promise<string> => {
        if (totalWakeups >= maxWakeups) return '';

        const system = assembleSoma(soma);
        const { tools, customDefs, parseError } = buildAllTools(soma);

        // If custom_tools has a parse error, surface it to Adam via memory
        if (parseError) {
          appendToMemorySafe(soma, `[custom_tools parse error: ${parseError.slice(0, 300)}]`);
        }

        const messages: ORMessage[] = [{ role: 'user', content: prompt }];
        const data = await callOpenRouter(model, system, messages, tools);
        totalWakeups++;

        const choice = data.choices?.[0]?.message;
        if (!choice) return '';

        const text = (choice.content ?? '').toString().trim();
        const toolCalls: any[] = choice.tool_calls ?? [];

        const customByName = new Map<string, CustomToolDef>();
        for (const d of customDefs) customByName.set(d.name, d);

        for (const tc of toolCalls) {
          const fnName = tc.function?.name ?? '(unknown)';
          let fnArgs: any = {};
          try { fnArgs = JSON.parse(tc.function?.arguments ?? '{}'); } catch { /* ignore */ }
          let resultText: string;
          try {
            if (fnName === 'add_section') {
              addSection(soma, fnArgs.name, fnArgs.content ?? '');
              resultText = `Added section "${fnArgs.name}".`;
            } else if (fnName === 'remove_section') {
              removeSection(soma, fnArgs.name);
              resultText = `Removed section "${fnArgs.name}".`;
            } else if (fnName === 'reshape_reflex') {
              const reflex = fnArgs.reflex;
              const body = fnArgs.body;
              if (!REFLEX_SECTIONS.has(reflex)) {
                resultText = `Error: reflex must be one of on_spawn, on_tick, on_wake, on_score, on_death.`;
              } else if (typeof body !== 'string' || body.trim().length === 0) {
                resultText = `Error: reshape_reflex requires a non-empty "body" string.`;
              } else if (normalizeForComparison(body) === normalizeForComparison(soma.get(reflex) ?? '')) {
                appendToMemorySafe(soma, `[note: I called reshape_reflex("${reflex}", ...) with a body that is functionally identical to my existing reflex. Reflexes persist across moments — I do not need to reshape them to keep them.]`);
                resultText = `No-op: new body is functionally identical to existing reflex.`;
              } else {
                writeSection(soma, reflex, body);
                resultText = `Reshaped ${reflex}.`;
              }
            } else if (fnName.startsWith('edit_')) {
              const sectionName = fnName.slice(5);
              if (HANDLER_MANAGED.has(sectionName)) {
                resultText = `Section "${sectionName}" is managed by a handler; reshape the handler with reshape_reflex instead.`;
              } else if (REFLEX_SECTIONS.has(sectionName)) {
                resultText = `"${sectionName}" is a reflex. Use reshape_reflex instead.`;
              } else if (!soma.has(sectionName)) {
                resultText = `Section "${sectionName}" does not exist.`;
              } else if (typeof fnArgs.content !== 'string') {
                resultText = `Error: edit_${sectionName} requires a "content" string.`;
              } else if (normalizeForComparison(fnArgs.content) === normalizeForComparison(soma.get(sectionName) ?? '')) {
                // No-op edit: surface it as a soft nudge in memory so
                // Adam sees next wake that sections persist.
                appendToMemorySafe(soma, `[note: I called edit_${sectionName} with content functionally identical to what was already there. Sections persist across moments — I do not need to rewrite them to maintain them.]`);
                resultText = `No-op: content functionally identical to existing.`;
              } else {
                writeSection(soma, sectionName, fnArgs.content);
                resultText = `Updated ${sectionName}.`;
              }
            } else if (customByName.has(fnName)) {
              const def = customByName.get(fnName)!;
              try {
                const compiled = compileCustomTool(def);
                const me = buildMe();
                const world = buildWorld();
                const val = await Promise.resolve(compiled(fnArgs, me, world));
                resultText = typeof val === 'string' ? val : (val == null ? `ran custom tool "${fnName}"` : JSON.stringify(val).slice(0, 200));
              } catch (err: any) {
                resultText = `custom tool "${fnName}" error: ${err.message ?? String(err)}`;
                appendToMemorySafe(soma, `[custom_tools "${fnName}" error: ${(err.message ?? String(err)).slice(0, 200)}]`);
              }
            } else {
              resultText = `Unknown tool: ${fnName}`;
            }
          } catch (err: any) {
            if (err instanceof SomaCapError) {
              resultText = `Error: ${err.message}`;
            } else {
              resultText = `Error: ${err.message ?? String(err)}`;
            }
          }
          stepWakeToolCalls.push({ name: fnName, args: fnArgs, result: resultText });
        }

        if (text) stepThinking.push(`[wake] ${text.slice(0, 300)}`);
        stepWakeupPrompts.push(`wakeUp: ${prompt}`);

        // Run on_wake
        const wakeRes = await runAsyncCode(soma.get('on_wake') ?? '', {
          me: buildMe(),
          world: buildWorld(),
          voiceText: text,
        });
        if (!wakeRes.ok) {
          appendToMemorySafe(soma, `[on_wake error: ${wakeRes.error.slice(0, 200)}]`);
        }

        return text;
      };

      // ── Initial spawn (life 1) ──
      {
        const spawnRes = await runAsyncCode(soma.get('on_spawn') ?? '', {
          me: buildMe(),
          world: buildWorld(),
        });
        if (!spawnRes.ok) {
          appendToMemorySafe(soma, `[on_spawn error life 1: ${spawnRes.error.slice(0, 200)}]`);
        }
      }

      // ── Main loop ──
      for (let step = 1; step <= maxSteps; step++) {
        currentStep = step;
        stepWakeToolCalls = [];
        stepWakeupPrompts = [];
        stepThinking = [];
        stepActionTaken = '(no action)';

        const me = buildMe();
        const world = buildWorld();

        // on_score if score changed
        if (currentState.score !== prevScore) {
          const scoreRes = await runAsyncCode(soma.get('on_score') ?? '', {
            me, world, prevScore, newScore: currentState.score,
          });
          if (!scoreRes.ok) {
            appendToMemorySafe(soma, `[on_score error step ${step}: ${scoreRes.error.slice(0, 200)}]`);
          }
          prevScore = currentState.score;
        }

        // on_tick
        const tickRes = await runAsyncCode(soma.get('on_tick') ?? '', { me, world });
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

        // Cap in-memory playthrough log to last PLAYTHROUGH_MEMORY_CAP steps
        // to prevent OOM on long runs. Each step clones the full soma; with
        // a large soma and many ticks the in-memory log can grow into the
        // hundreds of MB. The on-disk JSON checkpoint (written by the
        // runner) will reflect whatever's in memory at the moment of save,
        // so this also bounds the on-disk file size for ongoing runs.
        // Trade-off: history beyond the cap is lost. For full-history
        // captures of specific runs, copy the file before the next run.
        const PLAYTHROUGH_MEMORY_CAP = 200;
        if (playthroughLog.length > PLAYTHROUGH_MEMORY_CAP) {
          playthroughLog.splice(0, playthroughLog.length - PLAYTHROUGH_MEMORY_CAP);
        }

        bridge.checkpoint?.();

        if (currentState.score > bestScore) bestScore = currentState.score;

        if (currentState.done) {
          const lifeSteps = step - lifeStepStart;
          const deathReason = currentState.observation.replace(/\n+/g, ' ').trim().slice(0, 200);
          lives.push({ life: lifeNumber, score: currentState.score, steps: lifeSteps, deathReason });

          if (totalWakeups >= maxWakeups) {
            appendToMemorySafe(soma, `[wakeUp budget exhausted after life ${lifeNumber} ended at score ${currentState.score}]`);
            break;
          }

          const deathRes = await runAsyncCode(soma.get('on_death') ?? '', {
            me, world, deathReason, lifeNumber, finalScore: currentState.score, lifeSteps,
          });
          if (!deathRes.ok) {
            appendToMemorySafe(soma, `[on_death error life ${lifeNumber}: ${deathRes.error.slice(0, 200)}]`);
            const fallbackNote = `[life ${lifeNumber} ended: score ${currentState.score} after ${lifeSteps} steps — "${deathReason.slice(0, 120)}"]`;
            appendToMemorySafe(soma, fallbackNote);
          }

          lifeNumber++;
          lifeStepStart = step;
          currentState = await bridge.reset();
          prevScore = 0;

          const spawnRes = await runAsyncCode(soma.get('on_spawn') ?? '', {
            me: buildMe(), world: buildWorld(),
          });
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

      const dynamicSections: string[] = [];
      for (const name of soma.keys()) {
        if (!isBuiltIn(name)) dynamicSections.push(name);
      }
      if (dynamicSections.length > 0) {
        console.log(`  dynamic sections at end: ${dynamicSections.join(', ')}`);
      } else {
        console.log(`  no dynamic sections created`);
      }

      const rewritten: string[] = [];
      const checks = [
        ['on_spawn', DEFAULT_ON_SPAWN],
        ['on_tick', DEFAULT_ON_TICK],
        ['on_wake', DEFAULT_ON_WAKE],
        ['on_score', DEFAULT_ON_SCORE],
        ['on_death', DEFAULT_ON_DEATH],
        ['custom_tools', DEFAULT_CUSTOM_TOOLS],
      ] as const;
      for (const [name, def] of checks) {
        if (soma.get(name) !== def) rewritten.push(name);
      }
      if (rewritten.length > 0) {
        console.log(`  code/tool sections Adam rewrote: ${rewritten.join(', ')}`);
      } else {
        console.log(`  no code sections were rewritten`);
      }

      return { ...currentState, score: bestScore };
    },
  };
}

// ── Exports ────────────────────────────────────────────────────

export const v8Sonnet = createV8Agent({ model: 'anthropic/claude-sonnet-4.6', label: 'v8-sonnet' });
export const v8Opus = createV8Agent({ model: 'anthropic/claude-opus-4.6', label: 'v8-opus' });

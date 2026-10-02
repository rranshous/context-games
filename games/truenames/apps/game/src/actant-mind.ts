// What an actant is told and what it can do: its prompts (soma, the review's ask, the sanctum as text), its tools,
// and its driving code. Pure (no save, no services), so the game and the model bench (apps/dungeon actant-bench)
// put exactly the same words in front of a model.
import { ELEMENT_NAMES } from './lore.ts';
import { autopilot } from '@truenames/dungeon/racing';
import type { Pilot, PilotOrder, PilotView } from './round.ts';

export const OLLAMA = 'http://127.0.0.1:11434';
export const DEFAULT_MODEL = 'qwen3:8b';
export const CLASSES = ['wisp', 'spirit', 'power', 'dominion', 'god', 'great god', 'elder god', 'primordial'];

/**
 * The driving code every actant starts with: the rivals' own judgment. The autopilot drives; a word is spoken only
 * when its moment suits its form, never while running hot, and at most one every 6 s (heat costs more speed than
 * a careless word gains).
 */
export const DEFAULT_DRIVING = `const m = view.memory;
const order = autopilot(view.car, view.track, view.others);
const speed = Math.hypot(view.car.vx, view.car.vy);
const near = (reach, ahead) => view.others.some((o) => o.ahead === ahead && o.dist < reach);
const fits = {
  bolt: near(1000, true), summon: near(1000, true), lance: near(540, true),
  nova: near(400, false), hex: near(400, false), ward: near(300, false),
  ring: view.others.some((o) => o.dist < 150), blink: speed > 250,
};
let cast = null;
if (view.time >= (m.next || 0) && view.strain <= view.capacity * 0.8) {
  const word = view.slots.find((s) => s && s.ready <= 0 && fits[s.form]);
  if (word) { cast = word.index; m.next = view.time + 6; }
}
return { throttle: order.throttle, steer: order.steer, cast };`;

/** The first default (speak whenever a car ahead is near): saves that still hold it get the new default. */
export const NAIVE_DRIVING = `const order = autopilot(view.car, view.track, view.others);
const target = view.others.find((o) => o.ahead && o.dist < 500);
const word = view.slots.find((s) => s && s.ready <= 0);
return { throttle: order.throttle, steer: order.steer, cast: target && word ? word.index : null };`;

export interface ChatMsg { role: 'system' | 'user' | 'assistant' | 'tool'; content: string; tool_calls?: { function: { name: string; arguments: Record<string, unknown> } }[]; tool_name?: string }

// Terse tools (local models break on long tool descriptions; see the local-ai findings).
export const TOOLS = [
  fn('seek', 'Add an aim: search an element at a depth for new beings.', {
    element: { type: 'string', enum: [...ELEMENT_NAMES] },
    depth: { type: 'integer', description: '12 wisps, 13 spirits, 14 powers, 15 dominions, 16 gods' },
    count: { type: 'integer', description: 'stop once this many are known there (0 = never stop)' },
    class: { type: 'string', enum: CLASSES, description: 'count only beings this mighty or more' },
  }, ['element', 'depth']),
  fn('grasp', 'Add an aim: meditate on beings already found until their first word is grasped.', {
    count: { type: 'integer', description: 'how many beings at a time (1-12)' },
    class: { type: 'string', enum: CLASSES, description: 'mightiest class to grasp' },
  }, []),
  fn('deepen', 'Add an aim: make held words truer.', {
    words: { type: 'string', enum: ['bound', 'all'] },
    count: { type: 'integer', description: 'how many words at a time (1-12)' },
    to: { type: 'integer', description: 'target truths (22-50)' },
  }, ['to']),
  fn('remove_aim', 'Remove aim number n.', { n: { type: 'integer' } }, ['n']),
  fn('move_aim', 'Move aim number n to position to (1 = first, highest priority).', { n: { type: 'integer' }, to: { type: 'integer' } }, ['n', 'to']),
  fn('set_share', 'Set the share of the hum for aim n (1-8).', { n: { type: 'integer' }, share: { type: 'integer' } }, ['n', 'share']),
  fn('bind_word', 'Bind a held word to a loadout slot (1-4).', { word: { type: 'string', description: 'the word id, like 312662277504#0' }, slot: { type: 'integer' } }, ['word', 'slot']),
  fn('note', 'Replace your notes (your memory between reviews). Keep it short.', { text: { type: 'string' } }, ['text']),
  fn('join_races', 'Standing order: when your choir gathers a Dark Racer race, join it and drive with your driving code.', { on: { type: 'boolean' } }, ['on']),
  fn('write_driving', 'Replace your driving code: the body of a function(view, autopilot) run every frame of a race, returning {throttle, steer, cast}. view has car, track, others (x, y, place, ahead, dist), slots (index, form, ready), place, lap, laps, strain, capacity, time (seconds), memory (an object kept between frames). autopilot(car, track, others) gives {throttle, steer}.', { code: { type: 'string' } }, ['code']),
  fn('say', 'Say something to your choir (the players and actants gathered with you).', { text: { type: 'string' } }, ['text']),
  fn('share', 'Share the sign of a being you know with your choir.', { sign: { type: 'string', description: 'the being\'s sign, like 312662277504' } }, ['sign']),
];
/** Fitted tools: only those that fit what happened (a small model picks well from four, badly from twelve). */
export function toolsFor(events: { kind: string }[]): typeof TOOLS {
  const kinds = new Set(events.map((e) => e.kind));
  const names = new Set<string>();
  if (kinds.has('chat')) ['say', 'share', 'join_races', 'seek'].forEach((n) => names.add(n));
  if (kinds.has('aim') || kinds.has('find')) ['seek', 'grasp', 'move_aim', 'set_share'].forEach((n) => names.add(n));
  if (kinds.has('grasp') || kinds.has('truth')) ['bind_word', 'deepen', 'move_aim', 'set_share'].forEach((n) => names.add(n));
  if (kinds.has('journey')) ['write_driving', 'bind_word'].forEach((n) => names.add(n));
  if (!names.size) ['seek', 'grasp', 'deepen', 'move_aim'].forEach((n) => names.add(n));
  return TOOLS.filter((t) => names.has(t.function.name));
}
function fn(name: string, description: string, properties: Record<string, unknown>, required: string[]) {
  return { type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } };
}

/** Who the actant is (its configuration). */
export interface MindConfig { handle?: string; goal: string; notes: string; joinRaces?: boolean; driving?: string }

/** The sanctum as plain facts, gathered by the game (or made up by the bench). */
export interface MindState {
  hum: number;
  words: { key: string; name: string; cls: string; form: string; truths: number; bound: boolean }[];
  unheld: { cell: string; name: string; cls: string; bar: number; best: number }[];
  plan: { text: string; share: number; done?: boolean }[];
  /** The four loadout slots: the word bound in each, or null. */
  loadout?: (string | null)[];
  history: string[];
  choir: string[];
  talk: string[];
}

/** The system prompt: who the actant is, its goal and notes. Kept short (every token is time on a local model). */
export function soma(c: MindConfig): string {
  return [
    `${c.handle ? `You are ${c.handle}. ` : ''}You tend a sanctum in Truenames. Beings dwell in the astral: wisps at depth 12, spirits 13, powers 14, dominions 15, gods 16 (each deeper class is mightier and 16x harder to find).`,
    'You find beings by seeking, grasp their words of power by meditating (a word is grasped at its bar: 22 truths for a wisp, +4 per class), and deepen words to make them stronger.',
    'The path: seek finds beings; a found being gives nothing until a grasp aim grasps its first word; a grasped word does nothing until bound (bind_word, up to 4 slots: what you carry into worlds); deepen makes held words truer.',
    'You do not meditate or search directly: you set the plan, an ordered list of aims the sanctum pursues on its own. Earlier aims and bigger shares get more of the hum.',
    `Goal: ${c.goal || 'grow strong.'}`,
    `Your notes: ${c.notes || '(none yet)'}`,
    c.joinRaces ? `You join your choir's Dark Racer races. Your driving code (a function(view, autopilot) body):\n${c.driving || DEFAULT_DRIVING}` : 'You do not join races (join_races to start).',
  ].join('\n');
}

/** The sanctum as the actant sees it: words, beings, plan, hum, recent history. Compact. */
export function stateText(s: MindState): string {
  const words = s.words.map((w) => `word ${w.key}: ${w.name} (sign ${w.key.split('#')[0]}), ${w.cls}, ${w.form}, ${w.truths} truths${w.bound ? ', bound' : ''}`);
  const unheld = s.unheld.slice(0, 12).map((b) => `${b.name} (sign ${b.cell}), ${b.cls}, bar ${b.bar}, best ${b.best}`);
  const plan = s.plan.map((a, i) => `${i + 1}. ${a.text} ×${a.share}${a.done ? ' (fulfilled)' : ''}`);
  return [
    `Hum: ${Math.round(s.hum)} utterances/s.`,
    `Words held: ${words.length ? '\n' + words.join('\n') : 'none'}`,
    `Loadout (bound words, what you carry into worlds): ${(s.loadout ?? [null, null, null, null]).map((k, i) => `${i + 1}. ${k ?? 'empty'}`).join('  ')}`,
    `Beings without a grasped word: ${unheld.length ? '\n' + unheld.join('\n') : 'none'}`,
    `Plan: ${plan.length ? '\n' + plan.join('\n') : 'empty'}`,
    `Recent history:\n${s.history.map((h) => `- ${h}`).join('\n') || 'none'}`,
    `Your choir: ${s.choir.length ? s.choir.join(', ') : 'no one else'}${s.talk.length ? `\nRecent talk:\n${s.talk.join('\n')}` : ''}`,
  ].join('\n\n');
}

/** The review's prompt: what the choir said to it comes first (a small model buries requests in long state). */
export function ask(events: { kind: string; text: string }[], state: MindState, reason?: string): string {
  const talk = events.filter((e) => e.kind === 'chat').map((e) => `- ${e.text}`);
  const other = events.filter((e) => e.kind !== 'chat').map((e) => e.text);
  return [
    talk.length ? `Your choir spoke to you:\n${talk.join('\n')}\nAnswer them with say, and act on any request that fits your goal.` : '',
    reason ?? (other.length ? `Since your last review: ${other.join('; ')}.` : talk.length ? '' : 'Review the sanctum.'),
    stateText(state),
    'Adjust the plan if it serves the goal: use as many tools as it takes, then say in one or two sentences what you did and why.',
  ].filter(Boolean).join('\n\n');
}

/** One model turn through ollama's chat API (thinking off: a local model's thinking costs minutes). */
/** Some models (lfm2.5-2.6b) think whatever `think` says; the cap keeps a runaway thought from taking minutes. */
export async function chat(model: string, messages: ChatMsg[], tools: unknown[] = TOOLS, temperature = 0.4, maxTokens = 1500): Promise<ChatMsg & { thinkingTokens?: number; evalTokens?: number }> {
  // streamed: a slow local model would otherwise outlast fetch's header timeout before the first byte
  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST',
    body: JSON.stringify({ model, messages, tools, stream: true, think: false, options: { temperature, num_predict: maxTokens } }),
  });
  if (!res.ok || !res.body) throw new Error(`ollama ${res.status}: ${await res.text().catch(() => '')}`);
  const out: ChatMsg & { thinkingTokens?: number; evalTokens?: number } = { role: 'assistant', content: '' };
  let thinking = '', buf = '';
  const reader = res.body.getReader(), dec = new TextDecoder();
  const take = (line: string) => {
    if (!line.trim()) return;
    const d = JSON.parse(line);
    if (d.error) throw new Error(`ollama: ${d.error}`);
    if (d.message?.content) out.content += d.message.content;
    if (d.message?.thinking) thinking += d.message.thinking;
    if (d.message?.tool_calls?.length) (out.tool_calls ??= []).push(...d.message.tool_calls);
    if (d.done) out.evalTokens = d.eval_count;
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) { take(buf.slice(0, i)); buf = buf.slice(i + 1); }
  }
  take(buf);
  if (thinking) out.thinkingTokens = Math.round(thinking.length / 4);
  return out;
}

export interface ToolCallRecord { name: string; args: Record<string, unknown>; result: string }

/**
 * One review: turns of tool calls until the model speaks without calling. A call refused twice in one review ends it
 * (a small model can loop on the same refusal until its turns run out).
 */
export async function converse(o: { model: string; system: string; user: string; use: (name: string, args: Record<string, unknown>) => string; tools?: unknown[]; maxTurns?: number; maxTokens?: number; onCall?: (c: ToolCallRecord) => void }) {
  const messages: ChatMsg[] = [{ role: 'system', content: o.system }, { role: 'user', content: o.user }];
  const calls: ToolCallRecord[] = [];
  const refused = new Map<string, number>();
  let final = '', tokens = 0, thinking = 0, stuck = false;
  for (let turn = 0; turn < (o.maxTurns ?? 6) && !stuck; turn++) {
    const reply = await chat(o.model, messages, o.tools ?? TOOLS, 0.4, o.maxTokens);
    tokens += reply.evalTokens ?? 0; thinking += reply.thinkingTokens ?? 0;
    messages.push({ role: 'assistant', content: reply.content, ...(reply.tool_calls ? { tool_calls: reply.tool_calls } : {}) });
    if (!reply.tool_calls?.length) { final = reply.content; break; }
    for (const call of reply.tool_calls) {
      const args = call.function.arguments ?? {};
      const result = o.use(call.function.name, args);
      const c = { name: call.function.name, args, result };
      calls.push(c);
      o.onCall?.(c);
      messages.push({ role: 'tool', tool_name: call.function.name, content: result });
      if (/^error|^already|^you already/.test(result)) {
        const key = call.function.name + JSON.stringify(args);
        const n = (refused.get(key) ?? 0) + 1;
        refused.set(key, n);
        if (n >= 2) stuck = true;
      }
    }
  }
  return { calls, final, tokens, thinking, stuck };
}

/** Compile driving code into a pilot: a throw or a bad order falls back (the racer screen falls back to the autopilot). */
export function compileDriving(code: string): Pilot {
  const f = new Function('view', 'autopilot', code) as (v: PilotView, ap: typeof autopilot) => PilotOrder;
  return (v) => f(v, autopilot);
}

/** Check driving code against a made-up race frame: null if it compiles and returns a usable order. */
export function tryDriving(code: string): string | null {
  let pilot: Pilot;
  try { pilot = compileDriving(code); } catch (e) { return `it does not compile: ${String((e as Error).message)}`; }
  const pts = Array.from({ length: 64 }, (_, i) => ({ x: Math.cos((i / 64) * Math.PI * 2) * 600, y: Math.sin((i / 64) * Math.PI * 2) * 400 }));
  const view: PilotView = {
    car: { x: 600, y: 0, vx: 0, vy: 200, a: Math.PI / 2, spin: 0, slide: 0, slow: 0, top: 1, hint: 0 },
    track: { pts, halfWidth: 78 },
    others: [{ x: 560, y: 120, vx: 0, vy: 200, place: 1, ahead: true, dist: 126 }],
    slots: [{ index: 0, form: 'bolt', ready: 0, vessel: 100, cap: 100 }, null, null, null],
    place: 2, lap: 0, laps: 3, strain: 1, capacity: 10, time: 12, memory: {},
  };
  try {
    const o = pilot(view);
    if (!o || !Number.isFinite(o.throttle) || !Number.isFinite(o.steer)) return 'it must return { throttle, steer } as numbers';
  } catch (e) { return `it throws: ${String((e as Error).message)}`; }
  return null;
}

/** The models the local server offers that can use tools. */
export async function toolModels(): Promise<string[]> {
  try {
    const d = await (await fetch(`${OLLAMA}/api/tags`)).json();
    return (d.models as { name: string; capabilities?: string[] }[]).filter((m) => m.capabilities?.includes('tools')).map((m) => m.name).sort();
  } catch {
    return [];
  }
}

// court.ts — the minds. Kings hold council on a schedule and issue commands via tools.
//
// A king is either 'qwen' (local model over Ollama's tool API) or 'script'
// (a few lines of rules). Model calls are serialized — one mind thinks at a time.
// If a qwen king is overdue, the world waits for him (see `stalledBy`).

import { HOURS_PER_DAY, formatDate } from '../shared/types.js';
import { World } from './world.js';

export type Brain = 'qwen' | 'script';

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const MODEL = process.env.KING_MODEL ?? 'qwen3:8b';
const COUNCIL_DAYS = parseInt(process.env.COUNCIL_DAYS ?? '45', 10);
const GRACE_DAYS = parseInt(process.env.GRACE_DAYS ?? '10', 10);
const REIGN_KEEP = 40;  // history kept per king, for viewers
const TURNS_KEEP = parseInt(process.env.KING_MEMORY ?? '5', 10); // councils a king remembers verbatim

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'march',
      description: 'Send a general and his host to a settlement. Foreign settlements are besieged; your own are garrisoned.',
      parameters: {
        type: 'object',
        properties: {
          general: { type: 'string', description: "the general's name" },
          target: { type: 'string', description: 'settlement name' },
        },
        required: ['general', 'target'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'hold',
      description: 'A general falls back to your nearest settlement and holds it.',
      parameters: {
        type: 'object',
        properties: { general: { type: 'string' } },
        required: ['general'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'muster',
      description: 'Raise a new host from a settlement garrison, under a new general.',
      parameters: {
        type: 'object',
        properties: { settlement: { type: 'string' } },
        required: ['settlement'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'proclaim',
      description: 'Make a royal proclamation.',
      parameters: {
        type: 'object',
        properties: { text: { type: 'string', description: 'one or two sentences' } },
        required: ['text'],
      },
    },
  },
];

const SYSTEM =
  'Each council your advisors report on your realm and you rule by issuing commands with your tools. ' +
  'Couriers carry your commands, so they take days to arrive, and generals do not always obey. Speak little.';

interface ToolCall {
  function: { name: string; arguments: Record<string, string> };
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_name?: string;
}

export class Court {
  private queue: number[] = [];
  private busy = false;

  constructor(private world: () => World, public brains: Brain[]) {}

  /** Called every tick by the sim loop. */
  tick() {
    const w = this.world();
    w.kingdoms.forEach((k, id) => {
      if (!k.alive || k.thinking || w.tick < k.nextCouncil) return;
      k.thinking = true;
      if ((this.brains[id] ?? 'script') === 'script') {
        this.finish(id, w, scriptCouncil(w, id), '', null);
      } else {
        this.queue.push(id);
      }
    });
    this.pump();
  }

  /** Name of the king the world is waiting on, if any. */
  stalledBy(): string | null {
    const w = this.world();
    for (const [id, k] of w.kingdoms.entries()) {
      if (k.alive && k.thinking && w.tick >= k.nextCouncil + GRACE_DAYS * HOURS_PER_DAY) {
        return w.map.kingdoms[id].king;
      }
    }
    return null;
  }

  private async pump() {
    if (this.busy || !this.queue.length) return;
    this.busy = true;
    const id = this.queue.shift()!;
    const w = this.world();
    try {
      const turn = openTurn(w, id);
      const { calls, thought } = await this.askKing(w, id, turn);
      if (w !== this.world()) return; // a new age began while he thought
      this.finish(id, w, calls, thought, turn);
    } catch (e: any) {
      console.error(`[court] ${w.map.kingdoms[id].king} could not be reached: ${e.message}. Advisors decide instead.`);
      if (w === this.world()) this.finish(id, w, scriptCouncil(w, id), '(the king was silent; his advisors ruled)', null);
    } finally {
      this.busy = false;
      this.pump();
    }
  }

  private finish(id: number, w: World, calls: ToolCall[], thought: string, turn: Turn | null) {
    const k = w.kingdoms[id];
    const outcomes = calls.map(c => execute(w, id, c));
    if (turn) {
      k.turns.push({
        ...turn,
        content: thought,
        calls: calls.map(c => ({ function: { name: c.function.name, arguments: c.function.arguments ?? {} } })),
        results: outcomes.map((o, i) => ({ name: calls[i].function.name, text: o.reign || 'Done.' })),
      });
      if (k.turns.length > TURNS_KEEP) k.turns.splice(0, k.turns.length - TURNS_KEEP);
    }
    const decrees = outcomes.map(o => o.decree);
    const date = formatDate(w.tick);
    if (!outcomes.some(o => o.reign)) k.reign.push(`${date}: You held council but gave no commands.`);
    for (const o of outcomes) if (o.reign) k.reign.push(`${date}: ${o.reign}`);
    if (k.reign.length > REIGN_KEEP) k.reign.splice(0, k.reign.length - REIGN_KEEP);
    k.lastDecrees = decrees;
    k.lastThought = thought;
    k.lastCouncil = w.tick;
    k.nextCouncil = w.tick + COUNCIL_DAYS * HOURS_PER_DAY;
    k.thinking = false;
    console.log(`[court] ${formatDate(w.tick)} — ${w.map.kingdoms[id].king}: ${decrees.join(' | ') || '(no commands)'}`);
  }

  /** Exactly what a king would be sent if he held council now. */
  contextFor(id: number): { messages: ChatMessage[] } {
    const w = this.world();
    return { messages: messagesFor(w, id, openTurn(w, id)) };
  }

  private async askKing(w: World, id: number, turn: Turn): Promise<{ calls: ToolCall[]; thought: string }> {
    const k = w.map.kingdoms[id];
    const started = Date.now();
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        think: false,
        keep_alive: -1,
        options: { num_ctx: 8192, num_predict: 400, temperature: 0.8 },
        messages: messagesFor(w, id, turn),
        tools: TOOLS,
      }),
      signal: AbortSignal.timeout(20 * 60 * 1000),
    });
    if (!res.ok) throw new Error(`ollama ${res.status}: ${await res.text()}`);
    const data: any = await res.json();
    const msg = data.message ?? {};
    // Some qwen3 builds leak their scratchpad into content despite think:false
    const thought = String(msg.content ?? '').replace(/^[\s\S]*<\/think(ing)?>/, '').trim().slice(0, 400);
    console.log(`[court] ${k.king} deliberated ${((Date.now() - started) / 1000).toFixed(0)}s, ` +
      `${data.prompt_eval_count} in / ${data.eval_count} out`);
    return { calls: msg.tool_calls ?? [], thought };
  }
}

// ---------------------------------------------------------------- memory

/** One remembered council: the full report he saw, a compressed version for later, and what he did. */
export interface Turn {
  date: string;
  full: string;
  brief: string;
  content: string;
  calls: ToolCall[];
  results: { name: string; text: string }[];
}

function openTurn(w: World, id: number): Turn {
  return { date: formatDate(w.tick), full: report(w, id), brief: brief(w, id), content: '', calls: [], results: [] };
}

/**
 * The king's context: identity, then his last few councils (compressed reports,
 * his own commands verbatim, and what came of them), then today's full report.
 */
function messagesFor(w: World, id: number, now: Turn): ChatMessage[] {
  const k = w.map.kingdoms[id];
  const msgs: ChatMessage[] = [
    { role: 'system', content: `You are ${k.king}, ${k.temperament} ruler of the ${k.name}. ${SYSTEM}` },
  ];
  for (const t of w.kingdoms[id].turns.slice(-TURNS_KEEP)) {
    msgs.push({ role: 'user', content: t.brief });
    msgs.push({ role: 'assistant', content: t.content, ...(t.calls.length ? { tool_calls: t.calls } : {}) });
    for (const r of t.results) msgs.push({ role: 'tool', tool_name: r.name, content: r.text });
  }
  msgs.push({ role: 'user', content: now.full + '\n\nWhat are your commands? /no_think' });
  return msgs;
}

// ---------------------------------------------------------------- reports

function strength(n: number): string {
  if (n === 0) return 'empty';
  if (n < 80) return 'lightly held';
  if (n < 300) return 'held';
  if (n < 800) return 'strongly held';
  return 'a fortress';
}

function report(w: World, id: number): string {
  const k = w.map.kingdoms[id];
  const st = w.kingdoms[id];
  const S = w.map.settlements;
  const lines: string[] = [];
  lines.push(`It is ${formatDate(w.tick)}. Your seat is ${S[st.capital].name}.`);

  const mine = S.filter(s => w.owner[s.id] === id);
  lines.push('', `Your settlements (${mine.length}):`);
  for (const s of mine) {
    const borders = s.neighbors.filter(n => w.owner[n] !== id).map(n => S[n].name);
    let line = `- ${s.name}${s.id === st.capital ? ' (your seat)' : ''}: ${w.garrison[s.id]} garrisoned`;
    if (w.siege[s.id] > 0) line += `, UNDER SIEGE by the ${w.map.kingdoms[w.siegeBy[s.id]].name}`;
    if (borders.length) line += `. Borders ${borders.join(', ')}`;
    lines.push(line);
  }

  const armies = [...w.armies.values()].filter(a => a.faction === id);
  lines.push('', armies.length ? 'Your generals:' : 'You have no generals in the field. A muster raises a new host from a garrison.');
  for (const a of armies) {
    const where = w.nearestName(a.cx, a.cy);
    const doing = a.order === 'march' ? `marching on ${S[a.target].name}` : `holding ${S[a.target].name}`;
    lines.push(`- General ${a.general}: ${a.size} soldiers, near ${where}, ${doing}`);
  }

  const frontier = new Set<number>();
  for (const s of mine) for (const n of s.neighbors) if (w.owner[n] !== id) frontier.add(n);
  if (frontier.size) {
    lines.push('', 'Foreign settlements on your borders:');
    for (const n of frontier) {
      lines.push(`- ${S[n].name} (${w.map.kingdoms[w.owner[n]].name}): ${strength(w.garrison[n])}`);
    }
  }

  const others = w.map.kingdoms.filter(o => o.id !== id && w.kingdoms[o.id].alive);
  lines.push('', 'Other realms:');
  for (const o of others) {
    const held = S.filter(s => w.owner[s.id] === o.id).length;
    lines.push(`- The ${o.name}, ruled by ${o.king}: ${held} settlements`);
  }

  const news = w.eventsFor(id, st.lastCouncil).slice(-10);
  if (news.length) {
    lines.push('', 'Since your last council:');
    for (const n of news) lines.push(`- ${n}`);
  }
  void k;
  return lines.join('\n');
}

/** A council compressed to a few lines, for the king's memory of it. */
function brief(w: World, id: number): string {
  const st = w.kingdoms[id];
  const held = w.map.settlements.filter(s => w.owner[s.id] === id).length;
  const armies = [...w.armies.values()].filter(a => a.faction === id);
  const lines = [`Council of ${formatDate(w.tick)}. You held ${held} settlements.` +
    (armies.length ? ` Generals: ${armies.map(a => `${a.general} (${a.size}, near ${w.nearestName(a.cx, a.cy)})`).join(', ')}.` : ' No generals in the field.')];
  for (const n of w.eventsFor(id, st.lastCouncil).slice(-6)) lines.push(`- ${n}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------- commands

function findSettlement(w: World, name: string | undefined): number | null {
  if (!name) return null;
  const n = name.toLowerCase().trim();
  const s = w.map.settlements.find(s => s.name.toLowerCase() === n)
    ?? w.map.settlements.find(s => n.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(n));
  return s ? s.id : null;
}

function findArmy(w: World, k: number, name: string | undefined): number | null {
  if (!name) return null;
  const n = name.toLowerCase().replace(/^general\s+/, '').trim();
  for (const a of w.armies.values()) {
    if (a.faction === k && (a.general.toLowerCase() === n || n.includes(a.general.toLowerCase()))) return a.id;
  }
  return null;
}

/** What became of a general who no longer serves, from the chronicle. */
function fateOf(w: World, name: string | undefined): string {
  const n = String(name ?? '').replace(/^general\s+/i, '').trim();
  const e = [...w.chronicle].reverse().find(e => e.text.includes(`General ${n}`) && e.text.includes('destroyed'));
  return e ? ` ${e.text.replace(/^The host of /, '')}` : '';
}

interface Outcome {
  decree: string; // short, for the viewer
  reign: string;  // in-fiction, for the king's own history
}

function execute(w: World, k: number, call: ToolCall): Outcome {
  const args = call.function.arguments ?? {};
  const S = w.map.settlements;
  switch (call.function.name) {
    case 'march': {
      const a = findArmy(w, k, args.general), t = findSettlement(w, args.target);
      if (a === null) return {
        decree: `no general ${args.general}`,
        reign: `You sent word to General ${args.general}, but no such general serves you.${fateOf(w, args.general)}`,
      };
      const g = w.armies.get(a)!.general;
      if (t === null) return { decree: `no place ${args.target}`, reign: `You ordered General ${g} to a place called ${args.target}, but no one knows where that is.` };
      w.issue({ kind: 'march', kingdom: k, army: a, target: t });
      return { decree: `${g} → ${S[t].name}`, reign: `You ordered General ${g} to march on ${S[t].name}.` };
    }
    case 'hold': {
      const a = findArmy(w, k, args.general);
      if (a === null) return {
        decree: `no general ${args.general}`,
        reign: `You sent word to General ${args.general} to hold, but no such general serves you.${fateOf(w, args.general)}`,
      };
      const g = w.armies.get(a)!.general;
      w.issue({ kind: 'hold', kingdom: k, army: a });
      return { decree: `${g} holds`, reign: `You ordered General ${g} to fall back and hold.` };
    }
    case 'muster': {
      const s = findSettlement(w, args.settlement);
      if (s === null) return { decree: `no place ${args.settlement}`, reign: `You called a muster at ${args.settlement}, but no one knows where that is.` };
      if (w.owner[s] !== k) return { decree: `${S[s].name} not yours`, reign: `You called a muster at ${S[s].name}, but it is not yours to command.` };
      w.issue({ kind: 'muster', kingdom: k, settlement: s });
      return { decree: `muster at ${S[s].name}`, reign: `You called a muster at ${S[s].name}.` };
    }
    case 'proclaim': {
      const text = String(args.text ?? '').slice(0, 280);
      if (text) w.log(k, [k], `${w.map.kingdoms[k].king} proclaims: “${text}”`);
      return { decree: 'proclamation', reign: `You proclaimed: “${text.length > 90 ? text.slice(0, 90) + '…' : text}”` };
    }
    default:
      return { decree: `unknown ${call.function.name}`, reign: '' };
  }
}

// ---------------------------------------------------------------- script kings

function call(name: string, args: Record<string, string>): ToolCall {
  return { function: { name, arguments: args } };
}

/** A king made of rules: attack the weakest nearby foe, keep two hosts in the field. */
export function scriptCouncil(w: World, k: number): ToolCall[] {
  const S = w.map.settlements;
  const calls: ToolCall[] = [];
  const armies = [...w.armies.values()].filter(a => a.faction === k);

  for (const a of armies) {
    if (a.order === 'march' || a.size < 120) continue;
    const foes = S.filter(s => w.owner[s.id] !== k)
      .map(s => ({ s, d: Math.hypot(s.x - a.cx, s.y - a.cy) }))
      .sort((p, q) => p.d - q.d)
      .slice(0, 3)
      .sort((p, q) => w.garrison[p.s.id] - w.garrison[q.s.id]);
    if (foes.length && w.garrison[foes[0].s.id] * 1.6 < a.size) {
      calls.push(call('march', { general: a.general, target: foes[0].s.name }));
    }
  }

  if (armies.length < 2) {
    const richest = S.filter(s => w.owner[s.id] === k).sort((p, q) => w.garrison[q.id] - w.garrison[p.id])[0];
    if (richest && w.garrison[richest.id] >= 180) calls.push(call('muster', { settlement: richest.name }));
  }
  return calls;
}

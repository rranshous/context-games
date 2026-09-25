// court.ts — the minds. Rulers hold council on a schedule and act through tools.
//
// A ruler's brain is either 'script' (a few lines of rules) or the name of an
// Ollama model with tool calling. Model calls are serialized — one mind thinks
// at a time. If a thinking ruler is overdue, the world slows for them (see `stalledBy`).

import http from 'http';
import { HOURS_PER_DAY, formatDate } from '../shared/types.js';
import { World, Realm } from './world.js';

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const COUNCIL_DAYS = parseInt(process.env.COUNCIL_DAYS ?? '45', 10);
const GRACE_DAYS = parseInt(process.env.GRACE_DAYS ?? '10', 10);
const REIGN_KEEP = 40;  // history kept per ruler, for viewers
const TURNS_KEEP = parseInt(process.env.KING_MEMORY ?? '5', 10); // councils a ruler remembers verbatim

/** 'qwen' and 'llama' are shorthands; anything else is taken as an Ollama model name. */
export function resolveBrain(b: string): string {
  const s = b.trim();
  if (s === 'qwen') return process.env.KING_MODEL ?? 'qwen3:8b';
  if (s === 'llama') return 'llama3.2:3b';
  return s || 'script';
}

const fn = (name: string, description: string, properties: Record<string, object>, required: string[]) => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required } },
});
const str = { type: 'string' };

const TOOLS = [
  fn('march', 'Send a general and their host to a settlement. Enemy settlements are besieged; your own are garrisoned.',
    { general: str, target: { type: 'string', description: 'settlement name' } }, ['general', 'target']),
  fn('hold', 'A general falls back to your nearest settlement and holds it.', { general: str }, ['general']),
  fn('muster', 'Raise a new host from a settlement garrison, under a new general.', { settlement: str }, ['settlement']),
  fn('hire_mercenaries', 'Spend crowns to hire a host of sellswords at one of your settlements.',
    { settlement: str, crowns: { type: 'number' } }, ['settlement', 'crowns']),
  fn('declare_war', 'Declare war on a realm.', { realm: str }, ['realm']),
  fn('send_envoy', 'Send an envoy with a message to another ruler. Set offer_peace to offer or accept peace.',
    { realm: str, message: str, offer_peace: { type: 'boolean' } }, ['realm', 'message']),
  fn('proclaim', 'Make a royal proclamation.', { text: str }, ['text']),
];

const SYSTEM =
  'Each council your advisors report on your realm and you rule by using your tools. ' +
  'Couriers carry your commands, so they take days to arrive, and generals do not always obey. ' +
  'Soldiers must be paid; an empty treasury makes them desert. Speak little.';

interface ToolCall {
  function: { name: string; arguments: Record<string, any> };
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_name?: string;
}

const quiet = !!process.env.QW_QUIET;
const say = (...a: unknown[]) => { if (!quiet) console.log(...a); };

export class Court {
  private queue: number[] = [];
  private busy = false;

  constructor(private world: () => World) {}

  /** Called every tick by the sim loop. */
  tick() {
    const w = this.world();
    for (const r of w.realms) {
      if (!r.alive || r.thinking || w.tick < r.nextCouncil) continue;
      r.thinking = true;
      if (r.brain === 'script') this.finish(r.id, w, scriptCouncil(w, r.id), '', null);
      else this.queue.push(r.id);
    }
    this.pump();
  }

  /** The ruler the world is waiting on, if any. */
  stalledBy(): string | null {
    const w = this.world();
    for (const r of w.realms) {
      if (r.alive && r.thinking && r.brain !== 'script' && w.tick >= r.nextCouncil + GRACE_DAYS * HOURS_PER_DAY) {
        return w.ruler(r.id);
      }
    }
    return null;
  }

  /** Exactly what a ruler would be sent if they held council now. */
  contextFor(id: number): { model: string; messages: ChatMessage[] } {
    const w = this.world();
    return { model: w.realms[id].brain, messages: messagesFor(w, id, openTurn(w, id)) };
  }

  private async pump() {
    if (this.busy || !this.queue.length) return;
    this.busy = true;
    const id = this.queue.shift()!;
    const w = this.world();
    try {
      if (!w.realms[id].alive) { w.realms[id].thinking = false; return; }
      const turn = openTurn(w, id);
      const { calls, thought } = await this.ask(w, id, turn);
      if (w !== this.world()) return; // a new age began while they thought
      this.finish(id, w, calls, thought, turn);
    } catch (e: any) {
      console.error(`[court] ${w.ruler(id)} could not be reached: ${e.message}. Advisors decide instead.`);
      if (w === this.world()) this.finish(id, w, scriptCouncil(w, id), '(the ruler was silent; the advisors ruled)', null);
    } finally {
      this.busy = false;
      this.pump();
    }
  }

  private finish(id: number, w: World, calls: ToolCall[], thought: string, turn: Turn | null) {
    const r = w.realms[id];
    if (!r.alive) { r.thinking = false; return; }
    const outcomes = calls.slice(0, 8).map(c => execute(w, id, c));
    if (turn) {
      r.turns.push({
        ...turn,
        content: thought,
        calls: calls.slice(0, 8).map(c => ({ function: { name: c.function.name, arguments: c.function.arguments ?? {} } })),
        results: outcomes.map((o, i) => ({ name: calls[i].function.name, text: o.reign || 'Done.' })),
      });
      if (r.turns.length > TURNS_KEEP) r.turns.splice(0, r.turns.length - TURNS_KEEP);
    }
    const decrees = outcomes.map(o => o.decree);
    const date = formatDate(w.tick);
    if (!outcomes.some(o => o.reign)) r.reign.push(`${date}: You held council but gave no commands.`);
    for (const o of outcomes) if (o.reign) r.reign.push(`${date}: ${o.reign}`);
    if (r.reign.length > REIGN_KEEP) r.reign.splice(0, r.reign.length - REIGN_KEEP);
    r.lastDecrees = decrees;
    r.lastThought = thought;
    r.lastCouncil = w.tick;
    r.nextCouncil = w.tick + COUNCIL_DAYS * HOURS_PER_DAY;
    r.inbox = [];
    r.thinking = false;
    say(`[court] ${date} — ${w.ruler(id)} (${r.brain}): ${decrees.join(' | ') || '(no commands)'}`);
  }

  private async ask(w: World, id: number, turn: Turn): Promise<{ calls: ToolCall[]; thought: string }> {
    const r = w.realms[id];
    const started = Date.now();
    const data: any = await postJson(`${OLLAMA_URL}/api/chat`, {
      model: r.brain,
      stream: false,
      think: false,
      keep_alive: -1,
      options: { num_ctx: 8192, num_predict: 400, temperature: 0.8 },
      messages: messagesFor(w, id, turn),
      tools: TOOLS,
    }, 30 * 60 * 1000);
    const msg = data.message ?? {};
    // Some qwen3 builds leak their scratchpad into content despite think:false
    const thought = String(msg.content ?? '').replace(/^[\s\S]*<\/think(ing)?>/, '').trim().slice(0, 400);
    say(`[court] ${w.ruler(id)} (${r.brain}) deliberated ${((Date.now() - started) / 1000).toFixed(0)}s, ` +
      `${data.prompt_eval_count} in / ${data.eval_count} out`);
    return { calls: msg.tool_calls ?? [], thought };
  }
}

/**
 * POST JSON with node:http. Not fetch: undici gives up if response headers take
 * longer than 5 minutes, and Ollama sends none until the whole prompt is read,
 * which on this CPU can exceed that.
 */
function postJson(url: string, body: unknown, timeoutMs: number): Promise<unknown> {
  const u = new URL(url);
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) },
    }, res => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', c => { text += c; });
      res.on('end', () => {
        if ((res.statusCode ?? 500) >= 400) return reject(new Error(`ollama ${res.statusCode}: ${text.slice(0, 200)}`));
        try { resolve(JSON.parse(text)); } catch (e) { reject(e); }
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`no answer after ${timeoutMs / 1000}s`)));
    req.on('error', reject);
    req.end(payload);
  });
}

// ---------------------------------------------------------------- memory

/** One remembered council: the full report they saw, a compressed version for later, and what they did. */
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
 * The ruler's context: identity, then their last few councils (compressed reports,
 * their own commands verbatim, and what came of them), then today's full report.
 */
function messagesFor(w: World, id: number, now: Turn): ChatMessage[] {
  const r = w.realms[id];
  const who = `You are ${w.ruler(id)}, aged ${w.rulerAge(id)}, ruler of the ${r.name}` +
    (r.founded > 0 ? `, a realm ${r.origin}.` : '.') + ` By temperament you are ${r.ruler.temperament}.`;
  const msgs: ChatMessage[] = [{ role: 'system', content: `${who} ${SYSTEM}` }];
  for (const t of r.turns.slice(-TURNS_KEEP)) {
    msgs.push({ role: 'user', content: t.brief });
    msgs.push({ role: 'assistant', content: t.content, ...(t.calls.length ? { tool_calls: t.calls } : {}) });
    for (const x of t.results) msgs.push({ role: 'tool', tool_name: x.name, content: x.text });
  }
  msgs.push({ role: 'user', content: now.full + '\n\nWhat do you do? /no_think' });
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

function spirits(m: number): string {
  if (m >= 0.8) return 'in high spirits';
  if (m >= 0.5) return 'steady';
  if (m >= 0.3) return 'grumbling';
  return 'near mutiny';
}

function roughly(n: number): string {
  if (n < 100) return 'a handful of';
  const mag = Math.pow(10, Math.floor(Math.log10(n)) - 1);
  return `some ${(Math.round(n / mag) * mag).toLocaleString('en-US')}`;
}

function treasuryLine(r: Realm): string {
  const net = r.income - r.upkeep;
  if (r.gold < 0) return `Your treasury is empty, ${Math.round(-r.gold)} crowns in debt. Unpaid soldiers desert and no new ones can be raised. ` +
    `Taxes bring ${Math.round(r.income)} a day; pay costs ${Math.round(r.upkeep)}.`;
  return `Treasury: ${Math.round(r.gold)} crowns. Taxes bring ${Math.round(r.income)} a day; soldiers' pay costs ${Math.round(r.upkeep)} ` +
    `(${Math.abs(net) < 1 ? 'balanced' : `${net >= 0 ? 'a surplus' : 'a deficit'} of ${Math.abs(Math.round(net))}`}). Hosts in enemy land forage and cost half. ` +
    `A muster costs a crown a soldier; sellswords cost three.`;
}

function report(w: World, id: number): string {
  const r = w.realms[id];
  const S = w.map.settlements;
  const L: string[] = [];
  L.push(`It is ${formatDate(w.tick)}. Your seat is ${S[r.capital].name}.`);
  L.push(treasuryLine(r));

  const mine = S.filter(s => w.owner[s.id] === id);
  L.push('', `Your settlements (${mine.length}), with garrisons: ` +
    mine.map(s => `${s.name}${s.id === r.capital ? ' (seat)' : ''} ${w.garrison[s.id]}`).join(', ') + '.');
  for (const s of mine) {
    if (w.siege[s.id] > 0 && w.siegeBy[s.id] >= 0) L.push(`${s.name} is UNDER SIEGE by the ${w.realms[w.siegeBy[s.id]].name}!`);
  }

  const armies = [...w.armies.values()].filter(a => a.faction === id);
  L.push('', armies.length ? 'Your generals:' : 'You have no generals in the field. A muster raises a new host from a garrison.');
  for (const a of armies) {
    const doing = a.order === 'march' ? `marching on ${S[a.target].name}` : `holding ${S[a.target].name}`;
    const fame = a.renown ? `, has taken ${a.renown} town${a.renown > 1 ? 's' : ''}` : '';
    const idle = a.idleDays > 60 ? `, idle ${Math.round(a.idleDays / 30)} months` : '';
    L.push(`- General ${a.general}: ${a.size} soldiers near ${w.nearestName(a.cx, a.cy)}, ${doing}. ${cap(spirits(a.morale))}${idle}${fame}.`);
  }

  const frontier = new Map<number, number>();
  for (const s of mine) for (const n of s.neighbors) if (w.owner[n] !== id) frontier.set(n, w.owner[n]);
  if (frontier.size) {
    L.push('', 'Foreign settlements on your borders: ' +
      [...frontier].map(([n, o]) => `${S[n].name} (${w.realms[o].name}, ${strength(w.garrison[n])})`).join('; ') + '.');
  }

  L.push('', 'The realms:');
  for (const o of w.realms) {
    if (o.id === id || !o.alive) continue;
    const years = w.warYears(id, o.id);
    const rel = years >= 0 ? `AT WAR with you${years >= 1 ? ` for ${Math.floor(years)} year${years >= 2 ? 's' : ''}` : ''}` : 'at peace with you';
    const theirWars = w.enemiesOf(o.id).filter(e => e !== id).map(e => w.realms[e].name);
    const repute = o.honor < 0.6 ? ' Known as an oathbreaker.' : '';
    L.push(`- The ${o.name}, ruled by ${w.ruler(o.id)} (${o.ruler.temperament}): ${w.held(o.id)} settlements, ${roughly(w.soldiersOf(o.id))} soldiers. ` +
      `${cap(rel)}${theirWars.length ? `; at war with ${theirWars.join(', ')}` : ''}.${repute}`);
  }

  if (r.inbox.length) {
    L.push('', 'Tidings for you:');
    for (const m of r.inbox) L.push(`- ${m}`);
  }
  const news = w.eventsFor(id, r.lastCouncil).slice(-10);
  if (news.length) {
    L.push('', 'Since your last council:');
    for (const n of news) L.push(`- ${n}`);
  }
  return L.join('\n');
}

/** A council compressed to a few lines, for the ruler's memory of it. */
function brief(w: World, id: number): string {
  const r = w.realms[id];
  const armies = [...w.armies.values()].filter(a => a.faction === id);
  const wars = w.enemiesOf(id).map(e => w.realms[e].name);
  const lines = [`Council of ${formatDate(w.tick)}. You held ${w.held(id)} settlements and ${Math.round(r.gold)} crowns. ` +
    (wars.length ? `At war with ${wars.join(', ')}. ` : 'At peace with all. ') +
    (armies.length ? `Generals: ${armies.map(a => `${a.general} (${a.size}, near ${w.nearestName(a.cx, a.cy)})`).join(', ')}.` : 'No generals in the field.')];
  for (const m of r.inbox) lines.push(`- ${m}`);
  for (const n of w.eventsFor(id, r.lastCouncil).slice(-6)) lines.push(`- ${n}`);
  return lines.join('\n');
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------------------------------------------------------------- commands

function findSettlement(w: World, name: unknown): number | null {
  if (typeof name !== 'string' || !name.trim()) return null;
  const n = name.toLowerCase().trim();
  const s = w.map.settlements.find(s => s.name.toLowerCase() === n)
    ?? w.map.settlements.find(s => n.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(n));
  return s ? s.id : null;
}

function findArmy(w: World, k: number, name: unknown): number | null {
  if (typeof name !== 'string' || !name.trim()) return null;
  const n = name.toLowerCase().replace(/^general\s+/, '').trim();
  for (const a of w.armies.values()) {
    const g = a.general.toLowerCase();
    if (a.faction === k && (g === n || n.includes(g) || g.startsWith(n))) return a.id;
  }
  return null;
}

function findRealm(w: World, k: number, name: unknown): number | null {
  if (typeof name !== 'string' || !name.trim()) return null;
  const n = name.toLowerCase().replace(/^the\s+/, '').trim();
  const living = w.realms.filter(r => r.alive && r.id !== k);
  const r = living.find(r => r.name.toLowerCase() === n)
    ?? living.find(r => r.name.toLowerCase().includes(n) || n.includes(r.name.toLowerCase()))
    ?? living.find(r => n.includes(r.ruler.name.toLowerCase()))
    ?? living.find(r => r.name.toLowerCase().split(/\s+/).some(word => word.length > 3 && n.includes(word) && !['kingdom', 'crown', 'realm', 'principality'].includes(word)));
  return r ? r.id : null;
}

/** What became of a general who no longer serves, from the chronicle. */
function fateOf(w: World, name: unknown): string {
  const n = String(name ?? '').replace(/^general\s+/i, '').trim();
  const e = [...w.chronicle].reverse().find(e => e.text.includes(`General ${n}`) && /destroyed|rebellion/.test(e.text));
  return e ? ` ${e.text.replace(/^The host of /, '')}` : '';
}

interface Outcome {
  decree: string; // short, for viewers
  reign: string;  // in-fiction, for the ruler's own memory
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
      const owner = w.owner[t];
      let prefix = '';
      if (owner !== k && !w.atWar(k, owner)) prefix = w.declareWar(k, owner) + ' ';
      w.issue({ kind: 'march', kingdom: k, army: a, target: t });
      return { decree: `${g} → ${S[t].name}`, reign: `${prefix}You ordered General ${g} to march on ${S[t].name}.` };
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
    case 'hire_mercenaries': {
      const s = findSettlement(w, args.settlement);
      if (s === null) return { decree: `no place ${args.settlement}`, reign: `You sought sellswords at ${args.settlement}, but no one knows where that is.` };
      if (w.owner[s] !== k) return { decree: `${S[s].name} not yours`, reign: `You sought sellswords at ${S[s].name}, but it is not yours.` };
      const crowns = Number(args.crowns) || 0;
      const text = w.hireMercenaries(k, s, crowns);
      return { decree: `hire ${Math.round(crowns)}c at ${S[s].name}`, reign: text };
    }
    case 'declare_war': {
      const o = findRealm(w, k, args.realm);
      if (o === null) return { decree: `no realm ${args.realm}`, reign: `You would declare war on ${args.realm}, but no such realm stands.` };
      return { decree: `war on ${w.realms[o].name}`, reign: w.declareWar(k, o) };
    }
    case 'send_envoy': {
      const o = findRealm(w, k, args.realm);
      if (o === null) return { decree: `no realm ${args.realm}`, reign: `You would send an envoy to ${args.realm}, but no such realm stands.` };
      const text = String(args.message ?? '').slice(0, 300).trim();
      const peace = args.offer_peace === true || args.offer_peace === 'true';
      const name = w.realms[o].name;
      if (peace && w.atWar(k, o) && w.hasPeaceOffer(o, k)) {
        w.sendEnvoy(k, o, text, false);
        w.makePeace(k, o);
        return { decree: `peace with ${name}`, reign: `You accepted the ${name}'s offer of peace. The war is over.` };
      }
      w.sendEnvoy(k, o, text, peace && w.atWar(k, o));
      return {
        decree: peace ? `peace offer to ${name}` : `envoy to ${name}`,
        reign: `You sent an envoy to the ${name}${peace && w.atWar(k, o) ? ' offering peace' : ''}: “${text.slice(0, 90)}${text.length > 90 ? '…' : ''}”`,
      };
    }
    case 'proclaim': {
      const text = String(args.text ?? '').slice(0, 280);
      if (text) w.log(k, [], `${w.ruler(k)} proclaims: “${text}”`);
      return { decree: 'proclamation', reign: `You proclaimed: “${text.length > 90 ? text.slice(0, 90) + '…' : text}”` };
    }
    default:
      return { decree: `unknown ${call.function.name}`, reign: '' };
  }
}

// ---------------------------------------------------------------- script rulers

function call(name: string, args: Record<string, any>): ToolCall {
  return { function: { name, arguments: args } };
}

/** A ruler made of rules: pick fights with weaker neighbors, sue for peace when losing. */
export function scriptCouncil(w: World, k: number): ToolCall[] {
  const S = w.map.settlements;
  const r = w.realms[k];
  const calls: ToolCall[] = [];
  const armies = [...w.armies.values()].filter(a => a.faction === k);
  const mySoldiers = w.soldiersOf(k);
  const foes = w.enemiesOf(k);

  // Diplomacy: accept or seek peace when outmatched or broke
  for (const f of foes) {
    const theirs = w.soldiersOf(f);
    const weary = w.warYears(k, f) > 1.5 && Math.random() < 0.5;
    if (w.hasPeaceOffer(f, k) && (theirs > mySoldiers * 0.8 || r.gold < 0 || foes.length > 1 || weary)) {
      calls.push(call('send_envoy', { realm: w.realms[f].name, message: 'We accept.', offer_peace: true }));
    } else if ((theirs > mySoldiers * 1.5 || (r.gold < 0 && foes.length > 1) || w.warYears(k, f) > 3) && Math.random() < 0.4) {
      calls.push(call('send_envoy', { realm: w.realms[f].name, message: 'Let there be peace between us.', offer_peace: true }));
    }
  }

  // Pick a war when strong, idle and solvent
  const idle = armies.filter(a => a.order === 'hold' && a.size >= 200);
  if (!foes.length && idle.length && r.gold > 0 && Math.random() < 0.6) {
    const neighbors = new Set<number>();
    for (const s of S) if (w.owner[s.id] === k) for (const n of s.neighbors) if (w.owner[n] !== k) neighbors.add(w.owner[n]);
    const prey = [...neighbors].filter(n => w.realms[n].alive && w.soldiersOf(n) * 1.1 < mySoldiers)
      .sort((a, b) => w.soldiersOf(a) - w.soldiersOf(b))[0];
    if (prey !== undefined) calls.push(call('declare_war', { realm: w.realms[prey].name }));
  }
  const atWarWith = new Set(foes);
  for (const c of calls) {
    if (c.function.name === 'declare_war') {
      const o = w.realms.find(x => x.name === c.function.arguments.realm);
      if (o) atWarWith.add(o.id);
    }
  }

  // Send idle hosts at the weakest of the nearest enemy towns
  for (const a of armies) {
    if (a.order === 'march' || a.size < 120) continue;
    const targets = S.filter(s => atWarWith.has(w.owner[s.id]))
      .map(s => ({ s, d: Math.hypot(s.x - a.cx, s.y - a.cy) }))
      .sort((p, q) => p.d - q.d)
      .slice(0, 3)
      .sort((p, q) => w.garrison[p.s.id] - w.garrison[q.s.id]);
    if (targets.length && w.garrison[targets[0].s.id] * 1.6 < a.size) {
      calls.push(call('march', { general: a.general, target: targets[0].s.name }));
    }
  }

  if (armies.length < 3 && r.gold > 2500 && (foes.length || calls.some(c => c.function.name === 'declare_war'))) {
    const seat = S[r.capital];
    calls.push(call('hire_mercenaries', { settlement: seat.name, crowns: Math.min(r.gold * 0.5, 6000) }));
  }

  if (armies.length < 2 && r.gold > 100) {
    const richest = S.filter(s => w.owner[s.id] === k).sort((p, q) => w.garrison[q.id] - w.garrison[p.id])[0];
    if (richest && w.garrison[richest.id] >= 180) calls.push(call('muster', { settlement: richest.name }));
  }
  return calls;
}

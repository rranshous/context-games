// court.ts — the minds. Rulers hold council on a schedule and act through tools.
//
// A ruler's brain is either 'script' (a few lines of rules) or the name of an
// Ollama model with tool calling. Model calls are serialized — one mind thinks
// at a time. If a thinking ruler is overdue, the world slows for them (see `stalledBy`).

import http from 'http';
import { HOURS_PER_DAY, formatDate, seasonOf, isHarvest, monthOf } from '../shared/types.js';
import { World, Realm, YEAR } from './world.js';

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const COUNCIL_DAYS = parseInt(process.env.COUNCIL_DAYS ?? '60', 10);
const GRACE_DAYS = parseInt(process.env.GRACE_DAYS ?? '10', 10);
const REIGN_KEEP = 40;  // history kept per ruler, for viewers
const TURNS_KEEP = parseInt(process.env.KING_MEMORY ?? '5', 10); // councils a ruler remembers verbatim
const COUNCIL_STEPS = parseInt(process.env.COUNCIL_STEPS ?? '3', 10); // rounds of act-and-see within one council

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
  fn('march', 'Send a general and their host to a settlement. Enemy settlements are besieged: stormed when empty, starved into surrender if you bring three times their garrison. Your own are garrisoned. To attack a realm at peace with you, declare war first.',
    { general: str, target: { type: 'string', description: 'settlement name' } }, ['general', 'target']),
  fn('hold', 'A general falls back to your nearest settlement and holds it.', { general: str }, ['general']),
  fn('muster', 'Raise a new host from a settlement garrison, under a new general.', { settlement: str }, ['settlement']),
  fn('hire_mercenaries', 'Hire a company of sellswords at one of your settlements, at 3 crowns a man.',
    { settlement: str, men: { type: 'number', description: 'how many sellswords, 100 to 3000' } }, ['settlement', 'men']),
  fn('declare_war', 'Declare war on a realm you are at peace with.', { realm: str }, ['realm']),
  fn('send_envoy', 'Send an envoy with a message to another ruler. Set offer_peace to offer or accept peace; offer_alliance to propose or accept an alliance (allies are called to arms when attacked).',
    { realm: str, message: str, offer_peace: { type: 'boolean' }, offer_alliance: { type: 'boolean' } }, ['realm', 'message']),
  fn('send_gold', 'Send crowns from your treasury to another ruler: tribute, a bribe, or a promise kept.',
    { realm: str, crowns: { type: 'number' } }, ['realm', 'crowns']),
  fn('proclaim', 'Make a royal proclamation.', { text: str }, ['text']),
];

const SYSTEM =
  'Each council your advisors report on your realm and you rule by using your tools. ' +
  'Couriers carry your commands, so they take days to arrive, and generals do not always obey. ' +
  'Soldiers must be paid; an empty treasury makes them desert. Speak little. You may give several commands at once.';

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

type Job = { kind: 'council'; id: number } | { kind: 'annal'; year: number };

const scribe = () => resolveBrain(process.env.SCRIBE_BRAIN ?? 'llama');

export class Court {
  private queue: Job[] = [];
  private busy = false;
  private annalsDue = 0; // highest year queued for the scribe, in annalWorld
  private annalWorld: World | null = null;

  constructor(private world: () => World) {}

  /** Called every tick by the sim loop. */
  tick() {
    const w = this.world();
    for (const r of w.realms) {
      if (!r.alive || r.thinking || w.tick < r.nextCouncil) continue;
      r.thinking = true;
      if (r.brain === 'script') {
        const calls = scriptCouncil(w, r.id);
        this.finish(r.id, w, calls, calls.map(c => execute(w, r.id, c)), '', null);
      }
      else this.queue.push({ kind: 'council', id: r.id });
    }
    // At each year's end the scribe writes it down (a new age starts counting afresh)
    if (this.annalWorld !== w) {
      this.annalWorld = w;
      this.annalsDue = w.annals.reduce((m, a) => Math.max(m, a.year), 0);
    }
    const year = Math.floor(w.tick / YEAR);
    if (scribe() !== 'script' && year >= 1 && year > this.annalsDue && !w.annals.some(a => a.year === year)) {
      this.annalsDue = year;
      this.queue.push({ kind: 'annal', year });
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
    const job = this.queue.shift()!;
    const w = this.world();
    if (job.kind === 'annal') {
      try {
        const text = await this.writeAnnal(w, job.year);
        if (text && w === this.world()) w.annals.push({ year: job.year, text, by: scribe() });
      } catch (e: any) {
        console.error(`[court] the scribe could not write Year ${job.year}: ${e.message}`);
      } finally {
        this.busy = false;
        this.pump();
      }
      return;
    }
    const id = job.id;
    try {
      if (!w.realms[id].alive) { w.realms[id].thinking = false; return; }
      const turn = openTurn(w, id);
      const { calls, outcomes, thought, seconds, tokensIn, tokensOut } = await this.council(w, id, turn);
      if (w !== this.world()) return; // a new age began while they thought
      const st = (w.realms[id].stats ??= { councils: 0, seconds: 0, tokensIn: 0, tokensOut: 0, tools: {}, misfires: 0, silent: 0 });
      st.councils++; st.seconds += seconds; st.tokensIn += tokensIn; st.tokensOut += tokensOut;
      if (!calls.length) st.silent++;
      for (const c of calls) st.tools[c.function.name] = (st.tools[c.function.name] ?? 0) + 1;
      this.finish(id, w, calls, outcomes, thought, turn);
    } catch (e: any) {
      console.error(`[court] ${w.ruler(id)} could not be reached: ${e.message}. Advisors decide instead.`);
      if (w === this.world()) {
        const calls = scriptCouncil(w, id);
        this.finish(id, w, calls, calls.map(c => execute(w, id, c)), '(the ruler was silent; the advisors ruled)', null);
      }
    } finally {
      this.busy = false;
      this.pump();
    }
  }

  private finish(id: number, w: World, calls: ToolCall[], outcomes: Outcome[], thought: string, turn: Turn | null) {
    const r = w.realms[id];
    if (!r.alive) { r.thinking = false; return; }
    if (turn && r.stats) r.stats.misfires += outcomes.filter(o => /^no (general|place|realm) /.test(o.decree)).length;
    if (turn) {
      r.turns.push({
        ...turn,
        content: thought,
        calls: calls.map(c => ({ function: { name: c.function.name, arguments: c.function.arguments ?? {} } })),
        results: outcomes.map((o, i) => ({ name: calls[i].function.name, text: o.reign || 'Done.' })),
      });
      // Slide the window in chunks, not one council at a time: between trims the older
      // councils form an unchanged prefix that Ollama can reuse instead of re-reading
      if (r.turns.length > TURNS_KEEP + 3) r.turns.splice(0, r.turns.length - TURNS_KEEP);
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

  private async writeAnnal(w: World, year: number): Promise<string> {
    // Only what history remembers: no housekeeping, and the bloodiest battles rather than every skirmish
    const all = w.yearEntries(year);
    const worthy = all.filter(t => !/join the garrison|join the host|scatter in hostile|raises a host/.test(t)).filter(t => /takes |falls to|declares war|swear peace|swear alliance|honors its alliance|betrays|takes the throne|rebellion|rise against|turn their coats|The .* is no more\. |proclaims|Oathbreaker|is destroyed near/.test(t));
    const battles = all.filter(t => /The Battle of/.test(t))
      .sort((p, q) => Number(q.match(/(\d+) fall/)?.[1] ?? 0) - Number(p.match(/(\d+) fall/)?.[1] ?? 0)).slice(0, 5);
    const entries = [...worthy, ...battles].slice(-45);
    if (!entries.length) return '';
    const rulers = w.realms.filter(r => r.alive).map(r => `${w.ruler(r.id)} of the ${r.name}`).join('; ');
    const started = Date.now();
    const data: any = await postJson(`${OLLAMA_URL}/api/chat`, {
      model: scribe(),
      stream: false,
      think: false,
      keep_alive: -1,
      options: { num_ctx: 8192, num_predict: 700, temperature: 0.7 },
      messages: [
        { role: 'system', content: 'You are the chronicler of the continent. You write the annals: each year, one paragraph of no more than eight sentences, in the plain, grave voice of a medieval chronicler. Name the rulers, realms and places. Say what mattered and why. No title, no preamble, no lists.' },
        { role: 'user', content: `The rulers now living: ${rulers}.\n\nThe records of Year ${year}:\n${entries.map(e => '- ' + e).join('\n')}\n\nWrite the annal for Year ${year}. /no_think` },
      ],
    }, 30 * 60 * 1000);
    const text = String(data.message?.content ?? '').replace(/^[\s\S]*<\/think(ing)?>/, '').replace(/^#+.*\n/, '').trim();
    say(`[court] the scribe (${scribe()}) wrote Year ${year} in ${((Date.now() - started) / 1000).toFixed(0)}s`);
    // If it still ran long, end on the last full sentence
    const clipped = text.slice(0, 2400);
    const end = clipped.search(/[.!?”"][^.!?”"]*$/);
    return end > 200 ? clipped.slice(0, end + 1) : clipped;
  }

  /**
   * One council: the mind acts, sees what came of it, and may act again — up to
   * COUNCIL_STEPS rounds. Later rounds are cheap: the prompt prefix is unchanged,
   * so Ollama reuses it and reads only the new lines.
   */
  private async council(w: World, id: number, turn: Turn): Promise<{
    calls: ToolCall[]; outcomes: Outcome[]; thought: string; seconds: number; tokensIn: number; tokensOut: number;
  }> {
    const r = w.realms[id];
    const started = Date.now();
    const msgs = messagesFor(w, id, turn);
    const calls: ToolCall[] = [], outcomes: Outcome[] = [];
    const seen = new Set<string>();
    let thought = '', tokensIn = 0, tokensOut = 0, steps = 0;
    for (; steps < COUNCIL_STEPS && calls.length < 6; steps++) {
      const data: any = await postJson(`${OLLAMA_URL}/api/chat`, {
        model: r.brain,
        stream: false,
        think: false,
        keep_alive: -1,
        options: { num_ctx: 8192, num_predict: 400, temperature: 0.8 },
        messages: msgs,
        tools: TOOLS,
      }, 30 * 60 * 1000);
      tokensIn += data.prompt_eval_count ?? 0;
      tokensOut += data.eval_count ?? 0;
      const msg = data.message ?? {};
      // Some qwen3 builds leak their scratchpad into content despite think:false
      const said = String(msg.content ?? '').replace(/^[\s\S]*<\/think(ing)?>/, '').trim();
      if (said && !thought) thought = said.slice(0, 400);
      const got: ToolCall[] = msg.tool_calls ?? [];
      if (!got.length || w !== this.world() || !r.alive) break;
      msgs.push({ role: 'assistant', content: said, tool_calls: got });
      for (const c of got) {
        const args = c.function.arguments ?? {};
        const key = c.function.name + JSON.stringify(Object.keys(args).sort().map(k => [k, String(args[k]).toLowerCase().trim()]));
        let o: Outcome;
        if (seen.has(key)) {
          o = { decree: '', reign: 'You have already given that command this council.' };
        } else {
          seen.add(key);
          o = execute(w, id, c);
          calls.push(c);
          outcomes.push(o);
        }
        msgs.push({ role: 'tool', tool_name: c.function.name, content: o.reign || 'Done.' });
      }
    }
    const seconds = (Date.now() - started) / 1000;
    say(`[court] ${w.ruler(id)} (${r.brain}) deliberated ${seconds.toFixed(0)}s over ${steps} step${steps === 1 ? '' : 's'}, ` +
      `${tokensIn} in / ${tokensOut} out`);
    return { calls, outcomes, thought, seconds, tokensIn, tokensOut };
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
/**
 * How a mind remembers. 'chat': past councils as real turns, their own tool calls verbatim.
 * 'narrative': the same history as prose inside today's report — no past tool calls to copy,
 * which small models tend to do.
 */
function memoryStyle(model: string): 'chat' | 'narrative' {
  const re = process.env.NARRATIVE_MEMORY ?? '.'; // every mind; set e.g. 'llama|1\.7b' to give larger models chat memory
  return re && new RegExp(re).test(model) ? 'narrative' : 'chat';
}

function messagesFor(w: World, id: number, now: Turn): ChatMessage[] {
  const r = w.realms[id];
  const who = `You are ${w.ruler(id)}, aged ${w.rulerAge(id)}, ruler of the ${r.name}` +
    (r.founded > 0 ? `, a realm ${r.origin}.` : '.') + ` By temperament you are ${r.ruler.temperament}.`;
  const msgs: ChatMessage[] = [{ role: 'system', content: `${who} ${SYSTEM}` }];
  if (memoryStyle(r.brain) === 'narrative') {
    const past = r.turns.flatMap(t => t.results.map(x => `- ${t.date}: ${x.text}`));
    const memory = past.length ? `\n\nYour recent decisions and what came of them:\n${past.join('\n')}` : '';
    msgs.push({ role: 'user', content: now.full + memory + '\n\nWhat do you do? /no_think' });
    return msgs;
  }
  for (const t of r.turns) {
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
  const trade = r.trade && r.partners?.length ? ` (${Math.round(r.trade)} of it from trade with ${r.partners.length} neighbor${r.partners.length > 1 ? 's' : ''} at peace)` : '';
  return `Treasury: ${Math.round(r.gold)} crowns. Taxes and trade bring ${Math.round(r.income)} a day${trade}; soldiers' pay costs ${Math.round(r.upkeep)} ` +
    `(${Math.abs(net) < 1 ? 'balanced' : `${net >= 0 ? 'a surplus' : 'a deficit'} of ${Math.abs(Math.round(net))}`}). Hosts in enemy land forage and cost half. ` +
    `A muster costs a crown a soldier; sellswords cost three crowns a man.`;
}

function report(w: World, id: number): string {
  const r = w.realms[id];
  const S = w.map.settlements;
  const L: string[] = [];
  const season = seasonOf(w.tick);
  const weather = season === 'winter' ? ' Winter: hosts march slowly, and those in foreign land freeze and starve.'
    : isHarvest(w.tick) ? ' It is the harvest; taxes run high.' : '';
  L.push(`It is ${formatDate(w.tick)}, ${season}.${weather} Your seat is ${S[r.capital].name}.`);
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
    const fame = (a.merc ? `, sellswords of the ${a.merc}` : '') + (a.renown ? `, has taken ${a.renown} town${a.renown > 1 ? 's' : ''}` : '');
    const idle = a.idleDays > 60 ? `, idle ${Math.round(a.idleDays / 30)} months` : '';
    const heart = a.merc ? '' : a.loyalty >= 0.7 ? ' Devoted to you.' : a.loyalty < 0.3 ? ' Ambitious, and loves you little.' : '';
    L.push(`- General ${a.general}: ${a.size} soldiers near ${w.nearestName(a.cx, a.cy)}, ${doing}. ${cap(spirits(a.morale))}${idle}${fame}.${heart}`);
  }

  // Names from their own remembered commands that no longer lead a host (memory outlives the men)
  const serving = new Set(armies.map(a => a.general.toLowerCase()));
  const gone = new Set<string>();
  for (const t of r.turns) for (const c of t.calls) {
    const g = String(c.function.arguments?.general ?? '').replace(/^general\s+/i, '').trim();
    if (g && !serving.has(g.toLowerCase())) gone.add(g);
  }
  if (gone.size) L.push(`No longer in your service: ${[...gone].slice(0, 8).join(', ')}.`);

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
    const rel = years >= 0 ? `AT WAR with you${years >= 1 ? ` for ${Math.floor(years)} year${years >= 2 ? 's' : ''}` : ''}`
      : w.isAllied(id, o.id) ? 'your ALLY' : 'at peace with you';
    const theirWars = w.enemiesOf(o.id).filter(e => e !== id).map(e => w.realms[e].name);
    const theirAllies = w.alliesOf(o.id).filter(e => e !== id).map(e => w.realms[e].name);
    const repute = o.honor < 0.6 ? ' Known as an oathbreaker.' : '';
    L.push(`- The ${o.name}, ruled by ${w.ruler(o.id)} (${o.ruler.temperament}): ${w.held(o.id)} settlements, ${roughly(w.soldiersOf(o.id))} soldiers. ` +
      `${cap(rel)}${theirWars.length ? `; at war with ${theirWars.join(', ')}` : ''}${theirAllies.length ? `; allied with ${theirAllies.join(', ')}` : ''}.${repute}`);
  }

  const advice = counsel(w, id);
  if (advice.length) {
    L.push('', 'Your advisors speak:');
    for (const c of advice) L.push(`- ${c}`);
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

/**
 * In-fiction counsel: advisors who speak up when something is off. Not orders — the ruler
 * decides — but it makes pressures salient that a long report buries.
 */
function counsel(w: World, id: number): string[] {
  const r = w.realms[id];
  const S = w.map.settlements;
  const out: string[] = [];
  const foes = w.enemiesOf(id);
  const armies = [...w.armies.values()].filter(a => a.faction === id);
  if (foes.length && r.gold > 3000) {
    out.push(`Your treasurer: "${Math.round(r.gold).toLocaleString('en-US')} crowns lie idle while we are at war. Coin could buy sellswords, or raise hosts."`);
  }
  if (r.gold < 0) {
    out.push(`Your treasurer: "We cannot pay the soldiers. Every day of debt, men desert. Fewer hosts in the field, or peace, would stop the bleeding."`);
  }
  const idle = armies.filter(a => a.idleDays > 60 && a.order === 'hold');
  if (foes.length && idle.length) {
    out.push(`Your marshal: "${idle.map(a => `General ${a.general}`).join(' and ')} ${idle.length > 1 ? 'have' : 'has'} sat idle for months while the war goes on. The men grumble and slip away."`);
  }
  if (foes.length && !armies.length) {
    out.push(`Your marshal: "We are at war and have no host in the field."`);
  }
  const weak = S.filter(s => foes.includes(w.owner[s.id]) && w.garrison[s.id] < 80 &&
    S.some(m => w.owner[m.id] === id && m.neighbors.includes(s.id)));
  if (weak.length) {
    out.push(`Your scouts: "${weak.slice(0, 3).map(s => s.name).join(', ')} ${weak.length > 1 ? 'are' : 'is'} poorly defended."`);
  }
  const threatened = S.filter(s => w.owner[s.id] === id && w.siege[s.id] > 0);
  if (threatened.length) {
    out.push(`Your castellan: "${threatened.map(s => s.name).join(', ')} cannot hold for long without relief."`);
  }
  const cutOff = foes.filter(f => w.map.settlements.some(s => w.owner[s.id] === id && s.neighbors.some(n => w.owner[n] === f)));
  if (cutOff.length) {
    out.push(`Your merchants: "The war with ${cutOff.map(f => `the ${w.realms[f].name}`).join(' and ')} has closed the border roads to trade."`);
  }
  const restless = armies.filter(a => !a.merc && a.loyalty < 0.4 && a.renown >= 1 && (r.gold < 0 || a.morale < 0.4));
  if (restless.length) {
    out.push(`Your spymaster: "${restless.map(a => `General ${a.general}`).join(' and ')} ${restless.length > 1 ? 'are' : 'is'} proud, ${restless.length > 1 ? 'their' : 'his'} men discontent. There is talk of rebellion."`);
  }
  const abroad = armies.filter(a => a.order === 'march');
  if (monthOf(w.tick) === 8 && abroad.length) {
    out.push(`Your marshal: "Winter comes next month. Hosts still on campaign will march slowly and lose men to the cold."`);
  }
  if (r.honor < 0.6) {
    out.push(`Your chancellor: "Your word is doubted abroad. Other rulers remember broken oaths."`);
  }
  return out;
}

/** A council compressed to a few lines, for the ruler's memory of it. */
function brief(w: World, id: number): string {
  const r = w.realms[id];
  const armies = [...w.armies.values()].filter(a => a.faction === id);
  const wars = w.enemiesOf(id).map(e => w.realms[e].name);
  const lines = [`Council of ${formatDate(w.tick)}. You held ${w.held(id)} settlements and ${Math.round(r.gold)} crowns. ` +
    (wars.length ? `At war with ${wars.join(', ')}. ` : 'At peace with all. ') +
    (w.alliesOf(id).length ? `Allied with ${w.alliesOf(id).map(e => w.realms[e].name).join(', ')}. ` : '') +
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
  const e = [...w.chronicle].reverse().find(e =>
    (e.text.includes(`General ${n}`) || e.text.includes(`General ${n}'s`)) && /destroyed|rebellion|join the host|garrison of|scatter/.test(e.text));
  return e ? ` ${e.text.replace(/^The host of /, '')}` : '';
}

interface Outcome {
  decree: string; // short, for viewers
  reign: string;  // in-fiction, for the ruler's own memory
}

function execute(w: World, k: number, call: ToolCall): Outcome {
  const args = call.function.arguments ?? {};
  // Small models sometimes leave an argument out; say so plainly rather than "a place called undefined"
  const need: Record<string, string[]> = {
    march: ['general', 'target'], hold: ['general'], muster: ['settlement'], hire_mercenaries: ['settlement'],
    declare_war: ['realm'], send_envoy: ['realm'], send_gold: ['realm', 'crowns'], proclaim: ['text'],
  };
  const missing = (need[call.function.name] ?? []).filter(p => args[p] === undefined || args[p] === null || String(args[p]).trim() === '');
  if (missing.length) {
    return { decree: `${call.function.name}: no ${missing.join(', ')}`, reign: `You gave a command to ${call.function.name.replace('_', ' ')} but did not name the ${missing.join(' or the ')}.` };
  }
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
      if (owner !== k && !w.atWar(k, owner)) {
        return {
          decree: `${S[t].name}: at peace`,
          reign: `You would send General ${g} against ${S[t].name}, but it belongs to the ${w.realms[owner].name}, with whom you are at peace. You must declare war first.`,
        };
      }
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
    case 'hire_mercenaries': {
      const s = findSettlement(w, args.settlement);
      if (s === null) return { decree: `no place ${args.settlement}`, reign: `You sought sellswords at ${args.settlement}, but no one knows where that is.` };
      if (w.owner[s] !== k) return { decree: `${S[s].name} not yours`, reign: `You sought sellswords at ${S[s].name}, but it is not yours.` };
      // 'men' is the tool's word; older memories (and some models) still say 'crowns'
      const men = Number(args.men) || Math.floor((Number(args.crowns) || 0) / 3);
      const text = w.hireMercenaries(k, s, men * 3);
      return { decree: `hire ${Math.round(men)} at ${S[s].name}`, reign: text };
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
      const alliance = !peace && (args.offer_alliance === true || args.offer_alliance === 'true');
      const name = w.realms[o].name;
      if (alliance) {
        if (w.atWar(k, o)) return { decree: `alliance? at war`, reign: `You proposed an alliance to the ${name}, but you are at war with them. Make peace first.` };
        if (w.isAllied(k, o)) return { decree: `already allied`, reign: `You are already allied with the ${name}.` };
        if (w.hasAllianceOffer(o, k)) {
          w.sendEnvoy(k, o, text, false);
          w.makeAlliance(k, o);
          return { decree: `alliance with ${name}`, reign: `You accepted the ${name}'s offer of alliance. Should either of you be attacked, the other will take up arms.` };
        }
        w.sendEnvoy(k, o, text, false, true);
        return { decree: `alliance offer to ${name}`, reign: `You sent an envoy to the ${name} proposing an alliance: “${text.slice(0, 90)}${text.length > 90 ? '…' : ''}”` };
      }
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
    case 'send_gold': {
      const o = findRealm(w, k, args.realm);
      if (o === null) return { decree: `no realm ${args.realm}`, reign: `You would send crowns to ${args.realm}, but no such realm stands.` };
      const crowns = Number(args.crowns) || 0;
      return { decree: `${Math.round(crowns)}c to ${w.realms[o].name}`, reign: w.sendGold(k, o, crowns) };
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

  // Alliances: accept from those who share an enemy (or on a whim); seek one against a shared foe
  for (const o of w.realms) {
    if (!o.alive || o.id === k || w.atWar(k, o.id) || w.isAllied(k, o.id)) continue;
    const shared = w.enemiesOf(o.id).some(e => foes.includes(e));
    if (w.hasAllianceOffer(o.id, k) && (shared || Math.random() < 0.4)) {
      calls.push(call('send_envoy', { realm: o.name, message: 'We stand with you.', offer_alliance: true }));
    } else if (shared && Math.random() < 0.25) {
      calls.push(call('send_envoy', { realm: o.name, message: 'Our enemies are the same. Let us stand together.', offer_alliance: true }));
    }
  }

  // Pick a war when strong (counting coin as sellswords to be), idle and solvent. Temperament matters.
  const idle = armies.filter(a => a.order === 'hold' && a.size >= 200);
  const warlike = /bloodthirsty|reckless|greedy|vengeful|ambitious|bitter/.test(r.ruler.temperament);
  const might = mySoldiers + Math.max(0, r.gold) / 3;
  if (!foes.length && idle.length && r.gold > 0 && Math.random() < (warlike ? 0.7 : 0.35)) {
    const neighbors = new Set<number>();
    for (const s of S) if (w.owner[s.id] === k) for (const n of s.neighbors) if (w.owner[n] !== k) neighbors.add(w.owner[n]);
    const prey = [...neighbors].filter(n => w.realms[n].alive && w.soldiersOf(n) * (warlike ? 0.95 : 1.2) < might)
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
    if (targets.length && (w.garrison[targets[0].s.id] * 1.2 < a.size || a.size >= 1500)) {
      calls.push(call('march', { general: a.general, target: targets[0].s.name }));
    }
  }

  if (armies.length < 5 && r.gold > 2000 && (foes.length || calls.some(c => c.function.name === 'declare_war'))) {
    const seat = S[r.capital];
    calls.push(call('hire_mercenaries', { settlement: seat.name, men: Math.floor(Math.min(r.gold * 0.5, 6000) / 3) }));
  }

  if (armies.length < 2 && r.gold > 100) {
    const richest = S.filter(s => w.owner[s.id] === k).sort((p, q) => w.garrison[q.id] - w.garrison[p.id])[0];
    if (richest && w.garrison[richest.id] >= 180) calls.push(call('muster', { settlement: richest.name }));
  }
  return calls;
}

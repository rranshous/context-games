// An actant tending this sanctum: a local model (ollama) that, when something happens (a find, a grasp, a
// search or an aim finished, a journey's end), reviews the sanctum's state and history and reprioritizes the
// plan through the same operations the player's controls use. It thinks rarely; the plan does the work.
// Thought costs chanting: while it thinks, meditation pauses (on one machine they share the memory bus).
import { persist, spiritOf, splitWord, type SaveData } from './save.ts';
import type { Services, SanctumEvent } from './services.ts';
import { addHistory, describeAim, type AimSpec } from './plan.ts';
import { ELEMENT_NAMES, ASPECTS, FORMS, spiritName, magnitudeTitle } from './lore.ts';
import { facetForm, wordBar } from '@truenames/universe';

export const OLLAMA = 'http://127.0.0.1:11434';
export const DEFAULT_MODEL = 'qwen3:8b';
const CLASSES = ['wisp', 'spirit', 'power', 'dominion', 'god', 'great god', 'elder god', 'primordial'];
/** Events gather this long before a review (several finds in a row make one review). */
const GATHER_MS = 20_000;
/** At least this long between reviews. */
const MIN_GAP_MS = 120_000;
const MAX_TURNS = 6;

interface ChatMsg { role: 'system' | 'user' | 'assistant' | 'tool'; content: string; tool_calls?: { function: { name: string; arguments: Record<string, unknown> } }[]; tool_name?: string }

// Terse tools (local models break on long tool descriptions; see the local-ai findings).
const TOOLS = [
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
  fn('say', 'Say something to your choir (the players and actants gathered with you).', { text: { type: 'string' } }, ['text']),
  fn('share', 'Share the sign of a being you know with your choir.', { sign: { type: 'string', description: 'the being\'s sign, like 312662277504' } }, ['sign']),
];
function fn(name: string, description: string, properties: Record<string, unknown>, required: string[]) {
  return { type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } };
}

export class Actant {
  status: 'asleep' | 'waiting' | 'thinking' = 'asleep';
  lastThought = '';
  log: string[] = []; // this session's review transcript (tool calls and words), newest last
  onChange: (() => void) | null = null;
  private pending: SanctumEvent[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private off: (() => void) | null = null;

  constructor(private save: SaveData, private S: Services) {
    save.actant ??= { on: false, goal: '', model: DEFAULT_MODEL, notes: '' };
    if (save.actant.on) this.wake();
  }

  get config() { return this.save.actant!; }

  wake() {
    this.config.on = true;
    persist(this.save);
    this.off ??= this.S.events.on((e) => this.heard(e));
    this.status = 'waiting';
    this.onChange?.();
  }
  sleep() {
    this.config.on = false;
    persist(this.save);
    this.off?.(); this.off = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.status = 'asleep';
    this.onChange?.();
  }

  private heard(e: SanctumEvent) {
    this.pending.push(e);
    if (this.timer || this.status === 'thinking') return;
    const since = Date.now() - (this.config.lastReview ?? 0);
    this.timer = setTimeout(() => { this.timer = null; void this.review(); }, Math.max(GATHER_MS, MIN_GAP_MS - since));
  }

  /** Review now: read the sanctum, think, act through the plan. */
  async review(reason?: string) {
    if (this.status === 'thinking') return;
    const events = this.pending.splice(0);
    this.status = 'thinking';
    this.onChange?.();
    this.S.pool.setPaused(true); // thought costs chanting
    try {
      const messages: ChatMsg[] = [
        { role: 'system', content: this.soma() },
        { role: 'user', content: `${reason ?? (events.length ? `Since your last review: ${events.map((e) => e.text).join('; ')}.` : 'Review the sanctum.')}\n\n${this.state()}\n\nAdjust the plan if it serves the goal. Use tools; then say in one or two sentences what you did and why.` },
      ];
      for (let turn = 0; turn < MAX_TURNS; turn++) {
        const reply = await this.chat(messages);
        messages.push(reply);
        if (!reply.tool_calls?.length) { this.thought(reply.content); break; }
        for (const call of reply.tool_calls) {
          const result = this.use(call.function.name, call.function.arguments ?? {});
          this.log.push(`${call.function.name}(${JSON.stringify(call.function.arguments)}) → ${result}`);
          messages.push({ role: 'tool', tool_name: call.function.name, content: result });
        }
        this.onChange?.();
      }
    } catch (err) {
      this.thought(`(could not think: ${String((err as Error).message ?? err)})`);
    } finally {
      this.S.pool.setPaused(false);
      this.config.lastReview = Date.now();
      persist(this.save);
      this.status = this.config.on ? 'waiting' : 'asleep';
      this.onChange?.();
      if (this.pending.length && this.config.on) this.heard(this.pending.pop()!);
    }
  }

  private thought(text: string) {
    const t = (text || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    if (!t) return;
    this.lastThought = t;
    this.log.push(`“${t}”`);
    addHistory(this.save, { kind: 'note', by: 'actant', text: t.slice(0, 300) });
  }

  private async chat(messages: ChatMsg[]): Promise<ChatMsg> {
    const res = await fetch(`${OLLAMA}/api/chat`, {
      method: 'POST',
      body: JSON.stringify({ model: this.config.model || DEFAULT_MODEL, messages, tools: TOOLS, stream: false, think: false, options: { temperature: 0.4 } }),
    });
    if (!res.ok) throw new Error(`ollama ${res.status}`);
    const d = await res.json();
    return d.message as ChatMsg;
  }

  /** Who the actant is: its goal and its notes. Kept short (every token is time on a local model). */
  private soma(): string {
    return [
      'You tend a sanctum in Truenames. Beings dwell in the astral: wisps at depth 12, spirits 13, powers 14, dominions 15, gods 16 (each deeper class is mightier and 16x harder to find).',
      'You find beings by seeking, grasp their words of power by meditating (a word is grasped at its bar: 22 truths for a wisp, +4 per class), and deepen words to make them stronger.',
      'You do not meditate or search directly: you set the plan, an ordered list of aims the sanctum pursues on its own.',
      `Goal: ${this.config.goal || 'grow strong.'}`,
      `Your notes: ${this.config.notes || '(none yet)'}`,
    ].join('\n');
  }

  /** The sanctum as the actant sees it: words, beings, plan, hum, recent history. Compact. */
  private state(): string {
    const S = this.S, save = this.save;
    const words = Object.keys(save.names).filter((k) => S.learned(k)).map((k) => {
      const { cell, facet } = splitWord(k);
      const sp = spiritOf(save, cell);
      if (!sp) return null;
      const form = FORMS[facetForm(sp.traits, facet ?? 0)]!.name;
      return `${k} ${spiritName(sp)} ${magnitudeTitle(sp.magnitude)} ${form} ${S.strength(k)} truths${save.loadout.includes(k) ? ' (bound)' : ''}`;
    }).filter(Boolean);
    const unheld = Object.keys(save.spirits).filter((c) => !S.learned(c)).map((c) => spiritOf(save, c)!).map((sp) => `${sp.cell} ${spiritName(sp)} ${magnitudeTitle(sp.magnitude)} (bar ${wordBar(sp.magnitude)}, best ${S.strength(sp.cell)})`);
    const plan = S.planner.aims.map((a, i) => `${i + 1}. ${describeAim(a)} ×${a.share}${a.done ? ' (fulfilled)' : ''}`);
    const hist = (save.history ?? []).slice(-12).map((h) => `- ${h.text}`);
    const choir = S.choir.members.filter((m) => m.aura !== save.aura?.pub).map((m) => `${m.handle} (hum ${m.hum}, ${m.words} words${m.actant !== 'none' ? ', an actant' : ''})`);
    const talk = S.choir.lines.slice(-6).map((l) => `${l.mine ? 'you' : l.from}: ${l.text}`);
    return [
      `Hum: ${Math.round(S.pool.rate())} utterances/s.`,
      `Words held: ${words.length ? '\n' + words.join('\n') : 'none'}`,
      `Beings without a grasped word: ${unheld.length ? '\n' + unheld.slice(0, 12).join('\n') : 'none'}`,
      `Plan: ${plan.length ? '\n' + plan.join('\n') : 'empty'}`,
      `Recent history:\n${hist.join('\n') || 'none'}`,
      `Your choir: ${choir.length ? choir.join(', ') : 'no one else'}${talk.length ? `\nRecent talk:\n${talk.join('\n')}` : ''}`,
    ].join('\n\n');
  }

  /** Act: the same plan operations the player's controls use. Returns a short result for the model. */
  private use(name: string, a: Record<string, unknown>): string {
    const P = this.S.planner, aims = P.aims;
    const int = (v: unknown, d: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : d; };
    const aimAt = (n: unknown) => aims[int(n, 0) - 1];
    const cls = (v: unknown, d: number) => { const i = CLASSES.indexOf(String(v ?? '').toLowerCase()); return i >= 0 ? i : d; };
    switch (name) {
      case 'seek': case 'grasp': case 'deepen': {
        let spec: AimSpec;
        if (name === 'deepen') spec = { kind: 'deepen', words: a.words === 'all' ? 'all' : 'bound', count: Math.max(1, Math.min(12, int(a.count, 3))), to: Math.max(22, Math.min(60, int(a.to, 29))), share: 2 };
        else if (name === 'grasp') spec = { kind: 'grasp', count: Math.max(1, Math.min(12, int(a.count, 2))), maxMight: cls(a.class, 2), share: 2 };
        else {
          const el = ELEMENT_NAMES.indexOf(String(a.element ?? '').toLowerCase() as never);
          if (el < 0) return `error: element must be one of ${ELEMENT_NAMES.join(', ')}. Nothing was added.`;
          const depth = Math.max(12, Math.min(19, int(a.depth, 12)));
          const count = Math.max(0, int(a.count, 1));
          spec = { kind: 'seek', prefix: String(el), depth, until: count > 0 ? { count, minMight: cls(a.class, depth - 12) } : null, share: 2 };
        }
        const same = aims.findIndex((x) => !x.done && describeAim(x) === describeAim(spec));
        if (same >= 0) return `already in the plan as #${same + 1}. Nothing was added.`;
        const aim = P.add(spec, 'actant');
        return `added #${aims.indexOf(aim) + 1}: ${describeAim(aim)}`;
      }
      case 'remove_aim': { const x = aimAt(a.n); return x && P.remove(x.id, 'actant') ? 'removed' : 'error: no such aim'; }
      case 'move_aim': { const x = aimAt(a.n); return x && P.move(x.id, int(a.to, 1) - 1, 'actant') ? 'moved' : 'error: no such aim'; }
      case 'set_share': { const x = aimAt(a.n); return x && P.setShare(x.id, int(a.share, 2), 'actant') ? 'set' : 'error: no such aim'; }
      case 'bind_word': {
        const key = String(a.word ?? ''), slot = int(a.slot, 1) - 1;
        if (!this.S.learned(key)) return 'error: you hold no grasped word with that id';
        if (slot < 0 || slot > 3) return 'error: slot is 1-4';
        this.save.loadout = this.save.loadout.map((k) => (k === key ? null : k));
        this.save.loadout[slot] = key;
        addHistory(this.save, { kind: 'plan', by: 'actant', text: `bound ${key} to slot ${slot + 1}` });
        persist(this.save);
        return 'bound';
      }
      case 'say': { const t = String(a.text ?? '').slice(0, 300); this.S.choir.say(t); addHistory(this.save, { kind: 'note', by: 'actant', text: `said to the choir: ${t}` }); return this.S.choir.connected ? 'said' : 'said (but no one is listening: not connected)'; }
      case 'share': { const c = String(a.sign ?? ''); if (!this.save.spirits[c]) return 'error: you know no being with that sign'; this.S.choir.share(c); return 'shared'; }
      case 'note': this.config.notes = String(a.text ?? '').slice(0, 600); persist(this.save); return 'noted';
      default: return `error: unknown tool ${name}`;
    }
  }
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

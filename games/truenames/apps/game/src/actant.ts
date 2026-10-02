// An actant tending this sanctum: a local model (ollama) that, when something happens (a find, a grasp, a
// search or an aim finished, a journey's end), reviews the sanctum's state and history and reprioritizes the
// plan through the same operations the player's controls use. It thinks rarely; the plan does the work.
// Thought costs chanting: while it thinks, meditation pauses (on one machine they share the memory bus).
import { persist, spiritOf, splitWord, type SaveData } from './save.ts';
import type { Services, SanctumEvent } from './services.ts';
import { addHistory, describeAim, type AimSpec } from './plan.ts';
import { ELEMENT_NAMES, FORMS, spiritName, magnitudeTitle } from './lore.ts';
import { facetForm, wordBar } from '@truenames/universe';
import type { Pilot } from './round.ts';
import { CLASSES, DEFAULT_DRIVING, NAIVE_DRIVING, DEFAULT_MODEL, ask, converse, compileDriving, soma, tryDriving, type MindState } from './actant-mind.ts';

export { OLLAMA, DEFAULT_MODEL, DEFAULT_DRIVING, compileDriving, toolModels } from './actant-mind.ts';
/** Events gather this long before a review (several finds in a row make one review). */
const GATHER_MS = 20_000;
/** At least this long between reviews. */
const MIN_GAP_MS = 120_000;
const MAX_TURNS = 6;

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

  /** This actant's pilot, if it races (its driving code, or the default when the code won't compile). */
  pilot(): Pilot | undefined {
    if (!this.config.on || !this.config.joinRaces) return undefined;
    const code = this.config.driving && this.config.driving !== NAIVE_DRIVING ? this.config.driving : DEFAULT_DRIVING;
    try { return compileDriving(code); } catch { return compileDriving(DEFAULT_DRIVING); }
  }

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
      const out = await converse({
        model: this.config.model || DEFAULT_MODEL,
        system: soma({ ...this.config, handle: this.S.choir.handle }),
        user: ask(events, this.mindState(), reason),
        use: (n, a) => this.use(n, a),
        maxTurns: MAX_TURNS,
        onCall: (c) => { this.log.push(`${c.name}(${JSON.stringify(c.args)}) → ${c.result}`); this.onChange?.(); },
      });
      this.thought(out.final || (out.stuck ? '(stopped: the same call was refused twice)' : ''));
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

  private lastSaid = '';

  private thought(text: string) {
    const t = (text || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    if (!t) return;
    this.lastThought = t;
    this.log.push(`“${t}”`);
    addHistory(this.save, { kind: 'note', by: 'actant', text: t.slice(0, 300) });
  }

  /** The sanctum as plain facts for the actant's prompt. */
  private mindState(): MindState {
    const S = this.S, save = this.save;
    const words = Object.keys(save.names).filter((k) => S.learned(k)).flatMap((k) => {
      const { cell, facet } = splitWord(k);
      const sp = spiritOf(save, cell);
      if (!sp) return [];
      return [{ key: k, name: spiritName(sp), cls: magnitudeTitle(sp.magnitude), form: FORMS[facetForm(sp.traits, facet ?? 0)]!.name, truths: S.strength(k), bound: save.loadout.includes(k) }];
    });
    const unheld = Object.keys(save.spirits).filter((c) => !S.learned(c)).map((c) => spiritOf(save, c)!).map((sp) => ({ cell: sp.cell, name: spiritName(sp), cls: magnitudeTitle(sp.magnitude), bar: wordBar(sp.magnitude), best: S.strength(sp.cell) }));
    return {
      hum: S.pool.rate(),
      words, unheld,
      plan: S.planner.aims.map((a) => ({ text: describeAim(a), share: a.share, done: a.done })),
      loadout: [0, 1, 2, 3].map((i) => save.loadout[i] ?? null),
      history: (save.history ?? []).slice(-12).map((h) => h.text),
      choir: S.choir.members.filter((m) => m.aura !== save.aura?.pub).map((m) => `${m.handle} (hum ${m.hum}, ${m.words} words${m.actant !== 'none' ? ', an actant' : ''})`),
      talk: S.choir.lines.slice(-6).map((l) => `${l.mine ? 'you' : l.from}: ${l.text}`),
    };
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
        if (same >= 0) return `already in the plan as #${same + 1}. Nothing was added. To raise it: move_aim n=${same + 1} to=1, or set_share.`;
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
      case 'join_races': this.config.joinRaces = a.on === true || a.on === 'true'; persist(this.save); addHistory(this.save, { kind: 'plan', by: 'actant', text: this.config.joinRaces ? 'will join the choir\'s races' : 'will not join races' }); return this.config.joinRaces ? 'you will join races your choir gathers' : 'you will not join races';
      case 'write_driving': {
        const code = String(a.code ?? '').slice(0, 4000);
        const check = tryDriving(code);
        if (check) return `error: ${check}. Your driving code was not changed.`;
        this.config.driving = code;
        persist(this.save);
        addHistory(this.save, { kind: 'plan', by: 'actant', text: `rewrote its driving code (${code.length} chars)` });
        return 'your driving code is replaced';
      }
      case 'say': { const t = String(a.text ?? '').slice(0, 300); if (t.trim() === this.lastSaid.trim()) return 'you already said exactly that; say something new or nothing'; this.lastSaid = t; this.S.choir.say(t); addHistory(this.save, { kind: 'note', by: 'actant', text: `said to the choir: ${t}` }); return this.S.choir.connected ? 'said' : 'said (but no one is listening: not connected)'; }
      case 'share': { const c = String(a.sign ?? ''); if (!this.save.spirits[c]) return 'error: you know no being with that sign'; this.S.choir.share(c); return 'shared'; }
      case 'note': this.config.notes = String(a.text ?? '').slice(0, 600); persist(this.save); return 'noted';
      default: return `error: unknown tool ${name}`;
    }
  }
}

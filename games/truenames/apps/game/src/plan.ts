// The sanctum plan: an ordered list of aims that runs unattended. One plan, two hands: the player sets it with
// the sanctum's controls, an actant sets it with tools. A small planner turns aims into meditation and search
// tasks every few seconds (no model in the loop) and records what it does in the sanctum history.
import { cellsBelow } from '@truenames/universe';
import { persist, splitWord, type SaveData } from './save.ts';
import { addressOf, magnitudeTitle } from './lore.ts';
import type { Services } from './services.ts';

/** Who set an aim (or wrote a history line). */
export type Hand = 'player' | 'actant' | 'sanctum';

export type Aim =
  /** Deepen words: up to `count` at a time (truest first) until each holds `to` truths, then the next ones. */
  | { id: string; kind: 'deepen'; words: 'bound' | 'all'; count: number; to: number; share: number; by: Hand; done?: boolean }
  /** Grasp a first word for beings you hold none of, easiest first, `count` at a time (`maxMight` caps how mighty). */
  | { id: string; kind: 'grasp'; count: number; maxMight: number; share: number; by: Hand; done?: boolean }
  /** Search a region at a depth, until `until.count` beings of at least `until.minMight` are known there (or forever). */
  | { id: string; kind: 'seek'; prefix: string; depth: number; until: { count: number; minMight: number } | null; share: number; by: Hand; done?: boolean };

type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type AimSpec = DistOmit<Aim, 'id' | 'by' | 'done'>;

export interface HistoryLine { at: number; kind: 'find' | 'grasp' | 'truth' | 'search' | 'aim' | 'plan' | 'journey' | 'note'; by: Hand; text: string }

const HISTORY_MAX = 400;

export function addHistory(save: SaveData, line: Omit<HistoryLine, 'at'>) {
  save.history ??= [];
  save.history.push({ at: Date.now(), ...line });
  if (save.history.length > HISTORY_MAX) save.history.splice(0, save.history.length - HISTORY_MAX);
}

/** Plain words for an aim (the panel, the history, and an actant's view of the plan all use these). */
export function describeAim(a: Aim | AimSpec): string {
  switch (a.kind) {
    case 'deepen': return `deepen ${a.words === 'bound' ? 'bound words' : 'words'}, ${a.count} at a time, to ${a.to} truths`;
    case 'grasp': return `grasp a first word of new beings, ${a.count} at a time${a.maxMight < 7 ? `, ${magnitudeTitle(a.maxMight)}s and lesser` : ''}`;
    case 'seek': return `seek beings in ${a.prefix ? addressOf(a.prefix) : 'all the astral'} at depth ${a.depth}${a.until ? `, until ${a.until.count} ${magnitudeTitle(a.until.minMight)}${a.until.count === 1 ? '' : 's'} or mightier are known there` : ', without end'}`;
  }
}

let nextId = 0;
const newId = () => `a${Date.now().toString(36)}${(nextId++).toString(36)}`;

/** The plan's operations: the same ones for the player's controls and an actant's tools. */
export class Planner {
  private timer: ReturnType<typeof setInterval> | null = null;
  /** Tasks the planner started (it never touches the player's own meditations or searches). */
  private owned = { names: new Set<string>(), scries: new Set<string>() };
  onChange: (() => void) | null = null;

  constructor(private save: SaveData, private S: Services) {
    save.plan ??= [];
    for (const c of save.planOwned?.names ?? []) this.owned.names.add(c);
    for (const k of save.planOwned?.scries ?? []) this.owned.scries.add(k);
  }

  get aims(): readonly Aim[] { return this.save.plan!; }

  start() {
    this.timer ??= setInterval(() => this.evaluate(), 4000);
    this.evaluate();
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  add(spec: AimSpec, by: Hand, at?: number): Aim {
    const aim = { ...spec, id: newId(), by } as Aim;
    const plan = this.save.plan!;
    plan.splice(at === undefined ? plan.length : Math.max(0, Math.min(plan.length, at)), 0, aim);
    addHistory(this.save, { kind: 'plan', by, text: `added aim: ${describeAim(aim)}` });
    this.changed();
    return aim;
  }
  remove(id: string, by: Hand) {
    const plan = this.save.plan!;
    const i = plan.findIndex((a) => a.id === id);
    if (i < 0) return false;
    addHistory(this.save, { kind: 'plan', by, text: `removed aim: ${describeAim(plan[i]!)}` });
    plan.splice(i, 1);
    this.changed();
    return true;
  }
  move(id: string, to: number, by: Hand) {
    const plan = this.save.plan!;
    const i = plan.findIndex((a) => a.id === id);
    if (i < 0) return false;
    const [a] = plan.splice(i, 1);
    plan.splice(Math.max(0, Math.min(plan.length, to)), 0, a!);
    addHistory(this.save, { kind: 'plan', by, text: `moved aim to #${Math.max(0, Math.min(plan.length - 1, to)) + 1}: ${describeAim(a!)}` });
    this.changed();
    return true;
  }
  setShare(id: string, share: number, by: Hand) {
    const a = this.save.plan!.find((x) => x.id === id);
    if (!a) return false;
    a.share = Math.max(1, Math.min(8, Math.round(share)));
    addHistory(this.save, { kind: 'plan', by, text: `share ${a.share} for: ${describeAim(a)}` });
    this.changed();
    return true;
  }

  private changed() {
    persist(this.save);
    this.evaluate();
  }

  /** Turn the aims into tasks: who to meditate on, where to search, and with what share of the hum. */
  evaluate() {
    const S = this.S, save = this.save;
    const wantNames = new Map<string, number>(); // cell -> weight
    const wantScries = new Map<string, { prefix: string; depth: number; w: number }>();
    // earlier aims weigh a little more: order is priority
    const plan = save.plan!;
    plan.forEach((a, rank) => {
      if (a.done) return;
      const boost = 1 + (plan.length - rank) * 0.25;
      if (a.kind === 'deepen') {
        const pool = (a.words === 'bound' ? save.loadout.filter((k): k is string => !!k) : S.graspedWords()).filter((k) => S.learned(k));
        const below = pool.filter((k) => S.strength(k) < a.to).sort((x, y) => S.strength(y) - S.strength(x));
        if (!below.length && pool.length) return this.finish(a, `every ${a.words === 'bound' ? 'bound ' : ''}word holds ${a.to} truths`);
        const cells = [...new Set(below.slice(0, a.count).map((k) => splitWord(k).cell))];
        for (const c of cells) wantNames.set(c, (wantNames.get(c) ?? 0) + (a.share * boost) / cells.length);
      } else if (a.kind === 'grasp') {
        const cells = Object.keys(save.spirits)
          .filter((c) => !S.learned(c) && (save.spirits[c]!.spirit.magnitude ?? 0) <= a.maxMight)
          .sort((x, y) => S.bar(x) - S.bar(y));
        for (const c of cells.slice(0, a.count)) wantNames.set(c, (wantNames.get(c) ?? 0) + (a.share * boost) / Math.min(a.count, cells.length));
      } else {
        if (a.until) {
          const have = Object.values(save.spirits).filter((k) => k.spirit.cell.length === a.depth && k.spirit.cell.startsWith(a.prefix) && k.spirit.magnitude >= a.until!.minMight).length;
          if (have >= a.until.count) return this.finish(a, `${have} beings of might ≥ ${a.until.minMight} known at depth ${a.depth}`);
        }
        if (S.scanned(a.prefix, a.depth) >= cellsBelow(a.depth - a.prefix.length)) return this.finish(a, 'the whole layer has been searched');
        const key = `${a.prefix}|${a.depth}`;
        wantScries.set(key, { prefix: a.prefix, depth: a.depth, w: (wantScries.get(key)?.w ?? 0) + a.share * boost });
      }
    });
    // reconcile meditations
    for (const c of [...this.owned.names]) if (!wantNames.has(c)) { S.meditate(c, false); this.owned.names.delete(c); }
    for (const [c, w] of wantNames) {
      if (!S.isMeditating(c)) { S.meditate(c, true); this.owned.names.add(c); }
      if (this.owned.names.has(c)) S.pool.setWeight('name:' + c, w);
    }
    // reconcile searches
    for (const k of [...this.owned.scries]) if (!wantScries.has(k)) { const [p, d] = k.split('|'); S.stopScry(p!, Number(d)); this.owned.scries.delete(k); }
    for (const [k, s] of wantScries) {
      if (!S.scryTask(s.prefix, s.depth)) { if (S.startScry(s.prefix, s.depth, 'scry')) this.owned.scries.add(k); }
      if (this.owned.scries.has(k)) S.pool.setWeight(k, s.w);
    }
    save.planOwned = { names: [...this.owned.names], scries: [...this.owned.scries] };
    this.onChange?.();
  }

  private finish(a: Aim, why: string) {
    a.done = true;
    addHistory(this.save, { kind: 'aim', by: 'sanctum', text: `aim fulfilled (${why}): ${describeAim(a)}` });
    persist(this.save);
    this.S.events.emit({ kind: 'aim', text: describeAim(a) });
  }
}

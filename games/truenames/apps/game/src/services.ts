// Long-lived client services: the save, the meditation pool, and the name authority.
// Screens come and go; these persist for the whole session.
import { MeditationPool, type ScryTask, type NameTask } from '@truenames/meditation';
import { LocalAuthority, type Authority } from '@truenames/authority';
import { cellsBelow, facetCount, spiritAt, target, wordBar, type Spirit } from '@truenames/universe';
import { persist, rememberSpirit, signClaim, spiritOf, splitWord, wordKey, type SaveData, type KnownSpirit } from './save.ts';
import { addHistory, Planner } from './plan.ts';
import { Actant } from './actant.ts';
import { Choir } from './choir.ts';
import { spiritName, magnitudeTitle, truths } from './lore.ts';
import MeditationWorker from './meditation.worker.ts?worker';

type Listener<T> = (v: T) => void;

class Emitter<T> {
  private ls = new Set<Listener<T>>();
  on(l: Listener<T>) {
    this.ls.add(l);
    return () => this.ls.delete(l);
  }
  emit(v: T) {
    for (const l of this.ls) l(v);
  }
}

export interface FindEvent {
  spirit: Spirit;
  source: KnownSpirit['source'];
  isNew: boolean;
  taskId: string;
}

export interface NameEvent {
  cell: string;
  facet: number;
  key: string; // the word: cell#facet
  strength: number;
  learned: boolean; // crossed the being's bar just now (the word is grasped)
}

export const scanKey = (prefix: string, depth: number) => `${prefix}|${depth}`;

/** Something worth an actant's review: a find, a grasp, a search or an aim finished, a journey's end. */
export interface SanctumEvent { kind: 'find' | 'grasp' | 'search' | 'aim' | 'journey' | 'chat'; text: string }

export class Services {
  pool: MeditationPool;
  /** The name authority for this session. Runs build their own for pools/strain. */
  authority: Authority;
  finds = new Emitter<FindEvent>();
  names = new Emitter<NameEvent>();
  scry = new Emitter<ScryTask>();
  hum = new Emitter<number>();
  events = new Emitter<SanctumEvent>();
  /** The sanctum plan's planner (created with the services, started on resume). */
  planner!: Planner;
  /** An actant tending this sanctum (asleep unless woken). */
  actant!: Actant;
  /** This sanctum's choir link (to whoever gathers at the worlds host). */
  choir!: Choir;
  private sourceFor = new Map<string, KnownSpirit['source']>();

  constructor(public save: SaveData) {
    const hw = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
    const size = Math.max(1, hw - 1);
    this.pool = new MeditationPool(() => new MeditationWorker(), size, {
      onSpirit: (s, task) => this.onSpirit(s, task),
      onScryProgress: (t) => {
        this.save.scans[scanKey(t.prefix, t.depth)] = t.doneUpTo.toString();
        persist(this.save);
        this.scry.emit(t);
      },
      onScryDone: (t) => {
        this.save.scrying = this.save.scrying.filter((p) => scanKey(p.prefix, p.depth) !== t.id);
        const text = `finished searching depth ${t.depth} under "${t.prefix || 'everywhere'}" (${t.hits} found)`;
        addHistory(this.save, { kind: 'search', by: 'sanctum', text });
        persist(this.save);
        this.scry.emit(t);
        this.events.emit({ kind: 'search', text });
      },
      onName: (t, nonce, strength, facet) => this.onName(t, nonce, strength, facet),
      onRate: (r) => this.hum.emit(r),
    });
    if (save.workers != null) this.pool.setActive(Math.max(1, save.workers));
    this.planner = new Planner(save, this);
    this.actant = new Actant(save, this);
    this.choir = new Choir(save, this);
    this.authority = new LocalAuthority();
    if (save.aura) this.authority.registerAura(save.aura.pub);
    // re-establish names with the authority (claims are self-verifying)
    for (const rec of Object.values(save.names)) this.authority.submitName(rec.claim);
  }

  /** Resume whatever the player left running, then let the plan take the reins of what it owns. */
  resume() {
    for (const cell of this.save.meditating) this.meditate(cell, true);
    for (const p of this.save.scrying) if (p.running) this.startScry(p.prefix, p.depth, 'scry');
    this.planner.start();
    this.choir.connect();
  }

  /** A being's might, from the save or the universe. */
  private might(cell: string): number {
    return (this.save.spirits[cell]?.spirit.magnitude ?? spiritAt(cell)?.magnitude ?? 0);
  }

  /** The bar a word for this being must reach to be grasped. */
  bar(cellOrWord: string): number {
    return wordBar(this.might(splitWord(cellOrWord).cell));
  }

  /** Truths of a word (`cell#facet`), or of the truest word held for a being (`cell`). */
  strength(cellOrWord: string): number {
    const { cell, facet } = splitWord(cellOrWord);
    if (facet !== null) return this.save.names[cellOrWord]?.strength ?? 0;
    let best = 0;
    for (let f = 0; f < facetCount(this.might(cell)); f++) best = Math.max(best, this.save.names[wordKey(cell, f)]?.strength ?? 0);
    return best;
  }

  /** A word is grasped at its being's bar; a being is "learned" once any of its words is. */
  learned(cellOrWord: string): boolean {
    return this.strength(cellOrWord) >= this.bar(cellOrWord);
  }

  /** The words held for a being, one per facet (strength 0 where none has come yet). */
  words(cell: string): { key: string; facet: number; strength: number; grasped: boolean }[] {
    const bar = this.bar(cell);
    return Array.from({ length: facetCount(this.might(cell)) }, (_, f) => {
      const key = wordKey(cell, f), strength = this.save.names[key]?.strength ?? 0;
      return { key, facet: f, strength, grasped: strength >= bar };
    });
  }

  /** Every grasped word, as keys. */
  graspedWords(): string[] {
    return Object.keys(this.save.names).filter((k) => this.learned(k));
  }

  // ---------- meditation ----------

  isMeditating(cell: string) {
    return this.pool.get('name:' + cell) !== undefined;
  }

  static FOCUS_WEIGHT = 4;

  isFocused(cell: string) {
    return this.save.focus.includes(cell);
  }

  setFocus(cell: string, on: boolean) {
    this.save.focus = this.save.focus.filter((c) => c !== cell);
    if (on) this.save.focus.push(cell);
    this.pool.setWeight('name:' + cell, on ? Services.FOCUS_WEIGHT : 1);
    persist(this.save);
  }

  meditate(cell: string, on: boolean) {
    const id = 'name:' + cell;
    this.pool.setWeight(id, this.isFocused(cell) ? Services.FOCUS_WEIGHT : 1);
    if (on && this.save.aura) {
      if (!this.pool.get(id)) this.pool.addName({ id, cell, aura: this.save.aura.pub, facets: facetCount(this.might(cell)), bests: this.words(cell).map((w) => w.strength) });
      if (!this.save.meditating.includes(cell)) this.save.meditating.push(cell);
    } else {
      this.pool.remove(id);
      this.save.meditating = this.save.meditating.filter((c) => c !== cell);
    }
    persist(this.save);
  }

  nameTask(cell: string): NameTask | undefined {
    const t = this.pool.get('name:' + cell);
    return t?.kind === 'name' ? t : undefined;
  }

  private onName(t: NameTask, nonce: bigint, strength: number, facet: number) {
    if (!this.save.aura) return;
    const key = wordKey(t.cell, facet);
    const before = this.save.names[key]?.strength ?? 0;
    if (strength <= before) return;
    const claim = signClaim(this.save, t.cell, nonce);
    const bar = this.bar(t.cell);
    // only grasped words are claims the authority accepts; below the bar the word is still forming (kept locally)
    if (strength >= bar && !this.authority.submitName(claim).accepted) return;
    this.save.names[key] = { claim, strength, facet };
    const being = spiritOf(this.save, t.cell);
    const sp = being ? spiritName(being) : t.cell;
    if (before < bar && strength >= bar) {
      const text = `grasped a word of ${sp} (facet ${facet + 1}) at ${truths(strength)}`;
      addHistory(this.save, { kind: 'grasp', by: 'sanctum', text });
      this.events.emit({ kind: 'grasp', text });
    } else if (strength >= bar) addHistory(this.save, { kind: 'truth', by: 'sanctum', text: `${sp} (facet ${facet + 1}): ${truths(strength)}` });
    persist(this.save);
    this.names.emit({ cell: t.cell, facet, key, strength, learned: before < bar && strength >= bar });
  }

  // ---------- scrying ----------

  scanned(prefix: string, depth: number): bigint {
    return BigInt(this.save.scans[scanKey(prefix, depth)] ?? '0');
  }

  scryTask(prefix: string, depth: number): ScryTask | undefined {
    const t = this.pool.get(scanKey(prefix, depth));
    return t?.kind === 'scry' ? t : undefined;
  }

  startScry(prefix: string, depth: number, source: KnownSpirit['source'], budget?: bigint): ScryTask | null {
    const id = scanKey(prefix, depth);
    const done = this.scanned(prefix, depth);
    const total = cellsBelow(depth - prefix.length);
    if (done >= total) return null;
    const existing = this.scryTask(prefix, depth);
    let t: ScryTask | undefined;
    if (existing) {
      // widen in place: never rebuild a task with chunks in flight
      t = this.pool.extendScry(id, budget !== undefined ? existing.stopAt + budget : total);
      if (source === 'scry') this.sourceFor.set(id, source);
    } else {
      this.sourceFor.set(id, source);
      t = this.pool.addScry({ id, prefix, depth, doneUpTo: done, stopAt: budget !== undefined ? done + budget : undefined });
    }
    if (!t) return null;
    if (source === 'scry' && !this.save.scrying.some((p) => scanKey(p.prefix, p.depth) === id)) {
      this.save.scrying.push({ prefix, depth, running: true });
      persist(this.save);
    }
    return t;
  }

  stopScry(prefix: string, depth: number) {
    const id = scanKey(prefix, depth);
    this.pool.remove(id);
    this.save.scrying = this.save.scrying.filter((p) => scanKey(p.prefix, p.depth) !== id);
    persist(this.save);
  }

  private onSpirit(s: Spirit, task: ScryTask) {
    const source = this.sourceFor.get(task.id) ?? 'scry';
    const isNew = rememberSpirit(this.save, s, source);
    if (isNew) {
      const text = `found ${spiritName(s)}, ${magnitudeTitle(s.magnitude)} (might ${s.magnitude}) at depth ${s.depth}, sign ${s.cell}`;
      addHistory(this.save, { kind: 'find', by: 'sanctum', text });
      this.events.emit({ kind: 'find', text });
    }
    persist(this.save);
    this.finds.emit({ spirit: s, source, isNew, taskId: task.id });
  }
}

/** Expected spirits in a whole layer under a prefix. */
export function expectedSpirits(prefix: string, depth: number): number {
  return Number(cellsBelow(depth - prefix.length)) / 2 ** target(depth);
}

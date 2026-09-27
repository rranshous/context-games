// Long-lived client services: the save, the meditation pool, and the name authority.
// Screens come and go; these persist for the whole session.
import { MeditationPool, type ScryTask, type NameTask } from '@truenames/meditation';
import { LocalAuthority, type Authority } from '@truenames/authority';
import { MIN_NAME_BITS, cellsBelow, target, type Spirit } from '@truenames/universe';
import { persist, rememberSpirit, signClaim, type SaveData, type KnownSpirit } from './save.ts';
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
}

export interface NameEvent {
  cell: string;
  strength: number;
  learned: boolean; // crossed MIN_NAME_BITS just now
}

export const scanKey = (prefix: string, depth: number) => `${prefix}|${depth}`;

export class Services {
  pool: MeditationPool;
  /** The name authority for this session. Runs build their own for pools/strain. */
  authority: Authority;
  finds = new Emitter<FindEvent>();
  names = new Emitter<NameEvent>();
  scry = new Emitter<ScryTask>();
  hum = new Emitter<number>();
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
        persist(this.save);
        this.scry.emit(t);
      },
      onName: (t, nonce, strength) => this.onName(t, nonce, strength),
      onRate: (r) => this.hum.emit(r),
    });
    if (save.workers) this.pool.setActive(save.workers);
    this.authority = new LocalAuthority();
    if (save.aura) this.authority.registerAura(save.aura.pub);
    // re-establish names with the authority (claims are self-verifying)
    for (const rec of Object.values(save.names)) this.authority.submitName(rec.claim);
  }

  /** Resume whatever the player left running. */
  resume() {
    for (const cell of this.save.meditating) this.meditate(cell, true);
    for (const p of this.save.scrying) if (p.running) this.startScry(p.prefix, p.depth, 'scry');
  }

  strength(cell: string): number {
    return this.save.names[cell]?.strength ?? 0;
  }

  learned(cell: string): boolean {
    return this.strength(cell) >= MIN_NAME_BITS;
  }

  // ---------- meditation ----------

  isMeditating(cell: string) {
    return this.pool.get('name:' + cell) !== undefined;
  }

  meditate(cell: string, on: boolean) {
    const id = 'name:' + cell;
    if (on && this.save.aura) {
      if (!this.pool.get(id)) this.pool.addName({ id, cell, aura: this.save.aura.pub, best: this.strength(cell) });
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

  private onName(t: NameTask, nonce: bigint, strength: number) {
    if (!this.save.aura) return;
    const claim = signClaim(this.save, t.cell, nonce);
    const r = this.authority.submitName(claim);
    if (!r.accepted) return;
    const before = this.strength(t.cell);
    this.save.names[t.cell] = { claim, strength };
    persist(this.save);
    this.names.emit({ cell: t.cell, strength, learned: before < MIN_NAME_BITS && strength >= MIN_NAME_BITS });
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
    persist(this.save);
    this.finds.emit({ spirit: s, source, isNew });
  }
}

/** Expected spirits in a whole layer under a prefix. */
export function expectedSpirits(prefix: string, depth: number): number {
  return Number(cellsBelow(depth - prefix.length)) / 2 ** target(depth);
}

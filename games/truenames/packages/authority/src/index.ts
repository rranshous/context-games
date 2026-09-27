// The authority: pools, strain, capacity, tick resolution.
// Driven only by tick(); no timers, no DOM. Deterministic given inputs and seed.
import { spiritAt, verifyNameClaim, type NameClaim, type Spirit } from '@truenames/universe';
import type {
  AuraState,
  CastIntent,
  CastResult,
  NameSubmitResult,
  PoolInfo,
  TickResult,
} from '@truenames/protocol';
import { TUNABLES, type Tunables } from './tunables.ts';

export { TUNABLES, type Tunables } from './tunables.ts';
export { allocate, type AllocRequest } from './allocate.ts';
import { allocate } from './allocate.ts';

// ---------- interfaces ----------

export interface NameVerifier {
  verify(claim: NameClaim): { ok: true; strength: number } | { ok: false; reason: string };
}

export class ClearTextVerifier implements NameVerifier {
  verify(claim: NameClaim) {
    return verifyNameClaim(claim);
  }
}

export interface Authority {
  registerAura(pubkey: string): void;
  submitName(claim: NameClaim): NameSubmitResult;
  submitCast(intent: CastIntent): void;
  tick(): TickResult;
  auraState(aura: string): AuraState;
  nameBook(aura: string): Record<string, number>;
  poolInfo(cell: string): PoolInfo | null;
  currentTick(): number;
}

/**
 * Seam for non-player casters (v0 enemy shamans). They hold fixed synthetic
 * strengths instead of grinding. A server would own these the same way.
 */
export interface NpcAuthority extends Authority {
  grantSyntheticName(aura: string, cell: string, strength: number): void;
  forgetAura(aura: string): void;
}

// ---------- derived spirit numbers ----------

export interface SpiritStats {
  spirit: Spirit;
  poolCap: number;
  refill: number;
  weight: number;
  generosity: number;
  formWeight: number;
  formEfficiency: number;
}

export function spiritStats(spirit: Spirit, t: Tunables = TUNABLES): SpiritStats {
  const scale = 2 ** (t.poolExp * spirit.magnitude);
  return {
    spirit,
    poolCap: t.poolBase * scale,
    refill: t.refillBase * scale,
    weight: t.weightMin + spirit.traits.weightIdx / t.weightDiv,
    generosity: t.generosityMin * 2 ** ((spirit.traits.generosityIdx * t.generositySpan) / 15),
    formWeight: t.formWeight[spirit.traits.form]!,
    formEfficiency: t.formEfficiency[spirit.traits.form]!,
  };
}

export function familiarity(strength: number, t: Tunables = TUNABLES): number {
  return Math.max(t.minFamiliarity, 1 - t.familiarityRate * (strength - t.capRef));
}

export function castStrain(stats: SpiritStats, strength: number, t: Tunables = TUNABLES): number {
  return t.strainScale * stats.weight * stats.formWeight * familiarity(strength, t);
}

export function castCap(effective: number, generosity: number, t: Tunables = TUNABLES): number {
  return t.castCapBase * 2 ** (t.capExp * (effective - t.capRef)) * generosity;
}

export function capacityOf(strengths: Iterable<number>, t: Tunables = TUNABLES): number {
  let sum = 0;
  for (const s of strengths) sum += Math.max(0, s - t.capThreshold);
  return t.capBase + t.capPerBit * sum;
}

// ---------- seeded PRNG (mulberry32) ----------

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- LocalAuthority ----------

interface NameEntry {
  strength: number;
  nonce: bigint | null; // null for synthetic
}

interface AuraEntry {
  strain: number;
  capacity: number | null; // cached, invalidated on name change
}

export class LocalAuthority implements NpcAuthority {
  private tickNo = 0;
  private auras = new Map<string, AuraEntry>();
  private names = new Map<string, Map<string, NameEntry>>();
  private pools = new Map<string, { level: number; lastTick: number }>();
  private stats = new Map<string, SpiritStats | null>();
  private queue: CastIntent[] = [];
  private rng: () => number;

  constructor(
    private verifier: NameVerifier = new ClearTextVerifier(),
    seed = 1,
    private t: Tunables = TUNABLES,
  ) {
    this.rng = mulberry32(seed);
  }

  currentTick() {
    return this.tickNo;
  }

  registerAura(pubkey: string) {
    if (!this.auras.has(pubkey)) this.auras.set(pubkey, { strain: 0, capacity: null });
    if (!this.names.has(pubkey)) this.names.set(pubkey, new Map());
  }

  forgetAura(aura: string) {
    this.auras.delete(aura);
    this.names.delete(aura);
  }

  submitName(claim: NameClaim): NameSubmitResult {
    const v = this.verifier.verify(claim);
    if (!v.ok) return { accepted: false, reason: v.reason };
    this.registerAura(claim.aura);
    const book = this.names.get(claim.aura)!;
    const prev = book.get(claim.cell);
    if (prev && prev.strength >= v.strength) return { accepted: false, strength: prev.strength, reason: 'not truer' };
    book.set(claim.cell, { strength: v.strength, nonce: BigInt(claim.nonce) });
    this.auras.get(claim.aura)!.capacity = null;
    return { accepted: true, strength: v.strength };
  }

  grantSyntheticName(aura: string, cell: string, strength: number) {
    this.registerAura(aura);
    this.names.get(aura)!.set(cell, { strength, nonce: null });
    this.auras.get(aura)!.capacity = null;
  }

  submitCast(intent: CastIntent) {
    this.queue.push(intent);
  }

  auraState(aura: string): AuraState {
    const a = this.auras.get(aura);
    if (!a) return { strain: 0, capacity: this.t.capBase };
    return { strain: a.strain, capacity: this.capacity(aura) };
  }

  nameBook(aura: string): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [cell, e] of this.names.get(aura) ?? []) out[cell] = e.strength;
    return out;
  }

  poolInfo(cell: string): PoolInfo | null {
    const st = this.statsFor(cell);
    if (!st) return null;
    return { level: this.pool(cell, st).level, cap: st.poolCap };
  }

  tick(): TickResult {
    const t = this.t;
    // 1. decay strain
    for (const a of this.auras.values()) {
      a.strain *= t.strainDecay;
      if (a.strain < 1e-6) a.strain = 0;
    }
    // 2. group casts by cell (one cast per aura per cell per tick)
    const byCell = new Map<string, CastIntent[]>();
    const results: CastResult[] = [];
    const seen = new Set<string>();
    for (const c of this.queue) {
      const key = c.aura + '|' + c.cell;
      if (seen.has(key)) {
        results.push(this.refuse(c, 'duplicate'));
        continue;
      }
      seen.add(key);
      let list = byCell.get(c.cell);
      if (!list) byCell.set(c.cell, (list = []));
      list.push(c);
    }
    this.queue = [];
    const pools: Record<string, PoolInfo> = {};
    // deterministic order
    const cells = [...byCell.keys()].sort();
    for (const cell of cells) {
      const casts = byCell.get(cell)!;
      const st = this.statsFor(cell);
      if (!st) {
        for (const c of casts) results.push(this.refuse(c, 'no-spirit'));
        continue;
      }
      // 3. refill, effective per caster, allocate
      const pool = this.pool(cell, st);
      const valid: { c: CastIntent; strength: number; effective: number }[] = [];
      for (const c of casts) {
        const name = this.names.get(c.aura)?.get(cell);
        if (!name) {
          results.push(this.refuse(c, 'unknown-name'));
          continue;
        }
        this.registerAura(c.aura);
        const strain = this.auras.get(c.aura)!.strain;
        const bonus = this.bonus(st.spirit);
        valid.push({ c, strength: name.strength, effective: name.strength + bonus - strain });
      }
      const grants = allocate(
        pool.level,
        valid.map((v) => ({
          request: Math.max(0, v.c.request),
          effective: v.effective,
          cap: castCap(v.effective, st.generosity, t),
        })),
      );
      let spent = 0;
      // 4. strain, backlash, results
      valid.forEach((v, i) => {
        const grant = grants[i]!;
        spent += grant;
        const a = this.auras.get(v.c.aura)!;
        a.strain += castStrain(st, v.strength, t);
        const capacity = this.capacity(v.c.aura);
        const r: CastResult = {
          aura: v.c.aura,
          cell,
          target: v.c.target,
          strength: v.strength,
          effective: v.effective,
          grant,
          strainAfter: a.strain,
          capacity,
        };
        if (v.c.tag !== undefined) r.tag = v.c.tag;
        if (a.strain > capacity) {
          const chance = Math.min(1, Math.max(t.backlashMin, (a.strain - capacity) * t.backlashSlope));
          if (this.rng() < chance) {
            r.backlash = 'recoil';
            r.recoil = grant * t.recoilFactor;
          }
        }
        results.push(r);
      });
      pool.level = Math.max(0, pool.level - spent);
      pools[cell] = { level: pool.level, cap: st.poolCap };
    }
    // 5. advance
    const out: TickResult = { tick: this.tickNo, casts: results, pools };
    this.tickNo++;
    return out;
  }

  // ---------- internals ----------

  private refuse(c: CastIntent, why: NonNullable<CastResult['refused']>): CastResult {
    const r: CastResult = {
      aura: c.aura,
      cell: c.cell,
      target: c.target,
      strength: 0,
      effective: 0,
      grant: 0,
      strainAfter: this.auras.get(c.aura)?.strain ?? 0,
      capacity: this.auras.has(c.aura) ? this.capacity(c.aura) : this.t.capBase,
      refused: why,
    };
    if (c.tag !== undefined) r.tag = c.tag;
    return r;
  }

  private bonus(_s: Spirit): number {
    return this.t.attunementBonus; // optional rules off in v0
  }

  private capacity(aura: string): number {
    const a = this.auras.get(aura);
    if (!a) return this.t.capBase;
    if (a.capacity === null) {
      const strengths = [...(this.names.get(aura)?.values() ?? [])].map((e) => e.strength);
      a.capacity = capacityOf(strengths, this.t);
    }
    return a.capacity;
  }

  private statsFor(cell: string): SpiritStats | null {
    let st = this.stats.get(cell);
    if (st === undefined) {
      const sp = spiritAt(cell);
      st = sp ? spiritStats(sp, this.t) : null;
      this.stats.set(cell, st);
    }
    return st;
  }

  /** Lazy token bucket: created full, refilled on read. */
  private pool(cell: string, st: SpiritStats) {
    let p = this.pools.get(cell);
    if (!p) {
      p = { level: st.poolCap, lastTick: this.tickNo };
      this.pools.set(cell, p);
    }
    if (p.lastTick < this.tickNo) {
      p.level = Math.min(st.poolCap, p.level + st.refill * (this.tickNo - p.lastTick));
      p.lastTick = this.tickNo;
    }
    return p;
  }
}

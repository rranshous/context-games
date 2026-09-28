// The authority: vessels, strain, capacity, tick resolution.
// Driven only by tick(); no timers, no DOM. Deterministic given inputs and seed.
// Power is per caster: each (aura, spirit) draws from its own vessel. Nothing is shared.
import { spiritAt, verifyNameClaim, type NameClaim, type Traits } from '@truenames/universe';
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

// ---------- interfaces ----------

/** What the rules need to know about a spirit: never its address. */
export interface SpiritInfo {
  magnitude: number;
  traits: Traits;
}

export interface NameVerifier {
  verify(claim: NameClaim): { ok: true; strength: number } | { ok: false; reason: string };
}

export class ClearTextVerifier implements NameVerifier {
  verify(claim: NameClaim) {
    return verifyNameClaim(claim);
  }
}

/** A name proven in zero knowledge: the verifier learns the spirit's identity and traits, not where it is. */
export interface ProvenName {
  aura: string;
  spirit: string; // opaque spirit id (e.g. "t:<traitHash>")
  magnitude: number;
  strength: number;
  traits: Traits;
}

/** Verifies proven-name claims for one round (context). Injected so the rules never depend on a proof system. */
export interface ProofVerifier {
  verify(claim: unknown, context: bigint): Promise<{ ok: true; name: ProvenName } | { ok: false; reason: string }>;
}

export interface Authority {
  registerAura(pubkey: string): void;
  /** Clear-text claim: reveals the spirit's address. The sanctum's own authority uses these. */
  submitName(claim: NameClaim): NameSubmitResult;
  /** Zero-knowledge claim bound to this round's context. A game round uses only these. */
  submitProvenName(claim: unknown): Promise<NameSubmitResult & { spirit?: string }>;
  submitCast(intent: CastIntent): void;
  tick(): TickResult;
  auraState(aura: string): AuraState;
  nameBook(aura: string): Record<string, number>;
  /** The caster's own vessel for a spirit. */
  poolInfo(aura: string, spirit: string): PoolInfo | null;
  currentTick(): number;
}

/**
 * Seam for non-player casters (enemy shamans, Wardens). They hold fixed synthetic
 * strengths on public spirits (addresses) instead of grinding. A server would own these the same way.
 */
export interface NpcAuthority extends Authority {
  grantSyntheticName(aura: string, spirit: string, strength: number): void;
  forgetAura(aura: string): void;
}

// ---------- derived spirit numbers ----------

export interface SpiritStats {
  spirit: SpiritInfo;
  poolCap: number;
  refill: number;
  weight: number;
  generosity: number;
  formWeight: number;
  formEfficiency: number;
}

export function spiritStats(spirit: SpiritInfo, t: Tunables = TUNABLES): SpiritStats {
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

export interface LocalAuthorityOptions {
  verifier?: NameVerifier;
  proofs?: ProofVerifier;
  /** The round's context: proven names must be bound to it. */
  context?: bigint;
  seed?: number;
  tunables?: Tunables;
}

export class LocalAuthority implements NpcAuthority {
  private tickNo = 0;
  private auras = new Map<string, AuraEntry>();
  private names = new Map<string, Map<string, NameEntry>>();
  /** Vessels, keyed by aura|spirit. */
  private pools = new Map<string, { level: number; lastTick: number }>();
  private stats = new Map<string, SpiritStats | null>();
  /** Spirits known by proof (id -> info). Address ids fall back to the universe. */
  private registry = new Map<string, SpiritInfo>();
  private queue: CastIntent[] = [];
  private rng: () => number;
  private verifier: NameVerifier;
  private proofs: ProofVerifier | null;
  private context: bigint | null;
  private t: Tunables;

  constructor(opts: LocalAuthorityOptions = {}) {
    this.verifier = opts.verifier ?? new ClearTextVerifier();
    this.proofs = opts.proofs ?? null;
    this.context = opts.context ?? null;
    this.t = opts.tunables ?? TUNABLES;
    this.rng = mulberry32(opts.seed ?? 1);
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
    for (const k of [...this.pools.keys()]) if (k.startsWith(aura + '|')) this.pools.delete(k);
  }

  submitName(claim: NameClaim): NameSubmitResult {
    const v = this.verifier.verify(claim);
    if (!v.ok) return { accepted: false, reason: v.reason };
    return this.setName(claim.aura, claim.cell, v.strength, BigInt(claim.nonce));
  }

  async submitProvenName(claim: unknown): Promise<NameSubmitResult & { spirit?: string }> {
    if (!this.proofs || this.context === null) return { accepted: false, reason: 'this authority does not accept proofs' };
    const v = await this.proofs.verify(claim, this.context);
    if (!v.ok) return { accepted: false, reason: v.reason };
    const n = v.name;
    this.registry.set(n.spirit, { magnitude: n.magnitude, traits: n.traits });
    this.stats.delete(n.spirit);
    return { ...this.setName(n.aura, n.spirit, n.strength, null), spirit: n.spirit };
  }

  private setName(aura: string, spirit: string, strength: number, nonce: bigint | null): NameSubmitResult {
    this.registerAura(aura);
    const book = this.names.get(aura)!;
    const prev = book.get(spirit);
    if (prev && prev.strength >= strength) return { accepted: false, strength: prev.strength, reason: 'not truer' };
    book.set(spirit, { strength, nonce });
    this.auras.get(aura)!.capacity = null;
    return { accepted: true, strength };
  }

  grantSyntheticName(aura: string, spirit: string, strength: number) {
    this.registerAura(aura);
    this.names.get(aura)!.set(spirit, { strength, nonce: null });
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
    for (const [spirit, e] of this.names.get(aura) ?? []) out[spirit] = e.strength;
    return out;
  }

  poolInfo(aura: string, spirit: string): PoolInfo | null {
    const st = this.statsFor(spirit);
    if (!st) return null;
    return { level: this.pool(aura, spirit, st).level, cap: st.poolCap };
  }

  tick(): TickResult {
    const t = this.t;
    // 1. decay strain
    for (const a of this.auras.values()) {
      a.strain *= t.strainDecay;
      if (a.strain < 1e-6) a.strain = 0;
    }
    // 2. resolve each cast against the caster's own vessel (one per aura per spirit per tick)
    const results: CastResult[] = [];
    const pools: Record<string, PoolInfo> = {};
    const seen = new Set<string>();
    const queue = this.queue;
    this.queue = [];
    for (const c of queue) {
      const key = c.aura + '|' + c.spirit;
      if (seen.has(key)) {
        results.push(this.refuse(c, 'duplicate'));
        continue;
      }
      seen.add(key);
      const st = this.statsFor(c.spirit);
      if (!st) {
        results.push(this.refuse(c, 'no-spirit'));
        continue;
      }
      const name = this.names.get(c.aura)?.get(c.spirit);
      if (!name) {
        results.push(this.refuse(c, 'unknown-name'));
        continue;
      }
      // 3. refill lazily, effective strength, grant = min(request, cap, vessel)
      const pool = this.pool(c.aura, c.spirit, st);
      const a = this.auras.get(c.aura)!;
      const effective = name.strength + this.bonus(st.spirit) - a.strain;
      const grant = Math.max(0, Math.min(c.request, castCap(effective, st.generosity, t), pool.level));
      pool.level -= grant;
      // 4. strain, backlash
      a.strain += castStrain(st, name.strength, t);
      const capacity = this.capacity(c.aura);
      const r: CastResult = {
        aura: c.aura,
        spirit: c.spirit,
        target: c.target,
        strength: name.strength,
        effective,
        grant,
        strainAfter: a.strain,
        capacity,
      };
      if (c.tag !== undefined) r.tag = c.tag;
      if (a.strain > capacity) {
        const chance = Math.min(1, Math.max(t.backlashMin, (a.strain - capacity) * t.backlashSlope));
        if (this.rng() < chance) {
          r.backlash = 'recoil';
          r.recoil = grant * t.recoilFactor;
        }
      }
      results.push(r);
      pools[key] = { level: pool.level, cap: st.poolCap };
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
      spirit: c.spirit,
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

  private bonus(_s: SpiritInfo): number {
    return this.t.attunementBonus; // optional rules off in v0
  }

  /** Capacity from the names this authority knows for the aura (in a round: the names carried in). */
  private capacity(aura: string): number {
    const a = this.auras.get(aura);
    if (!a) return this.t.capBase;
    if (a.capacity === null) {
      const strengths = [...(this.names.get(aura)?.values() ?? [])].map((e) => e.strength);
      a.capacity = capacityOf(strengths, this.t);
    }
    return a.capacity;
  }

  private statsFor(spirit: string): SpiritStats | null {
    let st = this.stats.get(spirit);
    if (st === undefined) {
      const info = this.registry.get(spirit) ?? spiritAt(spirit);
      st = info ? spiritStats(info, this.t) : null;
      this.stats.set(spirit, st);
    }
    return st;
  }

  /** Lazy token bucket per caster: created full, refilled on read. */
  private pool(aura: string, spirit: string, st: SpiritStats) {
    const key = aura + '|' + spirit;
    let p = this.pools.get(key);
    if (!p) {
      p = { level: st.poolCap, lastTick: this.tickNo };
      this.pools.set(key, p);
    }
    if (p.lastTick < this.tickNo) {
      p.level = Math.min(st.poolCap, p.level + st.refill * (this.tickNo - p.lastTick));
      p.lastTick = this.tickNo;
    }
    return p;
  }
}

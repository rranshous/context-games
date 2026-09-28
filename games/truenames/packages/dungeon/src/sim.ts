// The dungeon: an authoritative simulation of one round. Pure: no DOM, no timers, no sockets.
// A host (a Node process today) feeds it inputs and fixed time steps and ships its snapshots.
// Players arrive with zero-knowledge proofs only; the dungeon never learns where their spirits dwell.
import { LocalAuthority, castCap, spiritStats, TUNABLES, type ProofVerifier } from '@truenames/authority';
import type { CastResult, TargetSpec } from '@truenames/protocol';
import { spiritAt, type Spirit, type Traits } from '@truenames/universe';
import { parsePublic, type ZkNameClaim } from '@truenames/proofs';
import { BALANCE as B, SLOTS } from './balance.ts';
import { ANCIENTS, HEARTH_GOD, WARDEN_WELLS } from './world.ts';
import type { EnemyKind, SimEvent, SlotInfo, Snapshot, WireTraits, RoundResultMsg } from './protocol.ts';
import { movePlayer, collideCircle, MAX_CMD_DT, type Arena, type MoveCmd } from './movement.ts';

const TICK_S = TUNABLES.TICK_MS / 1000;
const dist2 = (ax: number, ay: number, bx: number, by: number) => (ax - bx) ** 2 + (ay - by) ** 2;
const wireTraits = (t: Traits): WireTraits => ({ ...t, flavor: t.flavor.toString() });

// public spirits (enemy names) by address; spiritAt costs several Poseidons, so cache
const spiritCache = new Map<string, Spirit>();
function publicSpirit(cell: string): Spirit {
  let sp = spiritCache.get(cell);
  if (!sp) { sp = spiritAt(cell)!; spiritCache.set(cell, sp); }
  return sp;
}

interface Slot extends SlotInfo {
  form: number;
  generosity: number;
  lastBits: number | null;
}

interface Player {
  id: string; // aura (hex public key)
  x: number; y: number;
  hp: number; ward: number; invuln: number;
  ax: number; ay: number;
  slots: (Slot | null)[];
  alive: boolean;
  ack: number; // last movement command applied
  budget: number; // seconds of movement the player may still spend (commands can't outrun real time)
}

interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number; y: number;
  hp: number; maxHp: number;
  r: number; speed: number; dmg: number;
  cd: number;
  hexDps: number; hexT: number;
  kx: number; ky: number;
  aura?: string; // shamans and the Warden: synthetic names on public spirits
  spirit?: string;
  element: number;
  castT?: number;
  strafe?: number;
}

interface Ally { id: number; owner: string; x: number; y: number; hp: number; life: number; hit: number; cd: number; element: number }
interface Proj { id: number; x: number; y: number; vx: number; vy: number; r: number; dmg: number; life: number; enemy: boolean; element: number }
interface Nova { id: number; x: number; y: number; t: number; max: number; dmg: number; r: number; element: number; enemy: boolean }
interface Pending { player: string; slot: number; ax: number; ay: number }

export interface DungeonOptions {
  level: number;
  context: bigint;
  verifier: ProofVerifier;
  rng?: () => number;
}

export class DungeonSim {
  readonly level: number;
  readonly W = B.arena.w;
  readonly H = B.arena.h;
  readonly pillars: { x: number; y: number; r: number }[] = [];
  readonly arena: Arena;
  private auth: LocalAuthority;
  private rand: (a: number, b: number) => number;
  private random: () => number;
  private hpMult: number;
  private dmgMult: number;

  private players = new Map<string, Player>();
  private enemies: Enemy[] = [];
  private allies: Ally[] = [];
  private projs: Proj[] = [];
  private novas: Nova[] = [];
  private events: SimEvent[] = [];
  private pending = new Map<string, Pending>();
  private nextId = 1;
  private castSeq = 0;
  private tickAcc = 0;
  private time = 0;

  private wave = 0;
  private spawnQueue: EnemyKind[] = [];
  private spawnT = 0;
  private breather = 2.5;
  private kills = 0;
  private warden: Enemy | null = null;
  paused = false;
  started = false;
  over: null | 'won' | 'lost' = null;

  constructor(opts: DungeonOptions) {
    this.level = opts.level;
    this.random = opts.rng ?? Math.random;
    this.rand = (a, b) => a + this.random() * (b - a);
    this.hpMult = B.descent.hpMult ** opts.level;
    this.dmgMult = B.descent.dmgMult ** opts.level;
    this.auth = new LocalAuthority({ proofs: opts.verifier, context: opts.context, seed: (this.random() * 2 ** 31) | 0 });
    const { W, H } = this;
    for (let i = 0; i < 14; i++) {
      const p = { x: this.rand(150, W - 150), y: this.rand(150, H - 150), r: this.rand(22, 48) };
      if (dist2(p.x, p.y, W / 2, H / 2) < 260 ** 2) continue;
      if (this.pillars.some((q) => dist2(p.x, p.y, q.x, q.y) < (p.r + q.r + 120) ** 2)) continue;
      this.pillars.push(p);
    }
    this.arena = { w: W, h: H, pillars: this.pillars };
  }

  // ---------- players ----------

  /** Admit a player by their proofs. Returns what each proof revealed (or why it was refused). */
  async admit(aura: string, bundle: { slot: number; claim: ZkNameClaim }[]): Promise<{ slots: (SlotInfo | null)[]; refused: string[] }> {
    this.auth.registerAura(aura);
    const slots: (Slot | null)[] = SLOTS.map(() => null);
    const refused: string[] = [];
    const seen = new Set<string>();
    for (const { slot, claim } of bundle) {
      if (!(slot >= 0 && slot < SLOTS.length) || slots[slot]) { refused.push('no such slot'); continue; }
      if (claim.aura !== aura) { refused.push('a name for another aura'); continue; }
      let pub;
      try { pub = parsePublic(claim.publicSignals); } catch { refused.push('bad public signals'); continue; }
      if (seen.has(pub.roundTag)) { refused.push('the same patron twice'); continue; }
      const r = await this.auth.submitProvenName(claim);
      if (!r.accepted || !r.spirit) { refused.push(r.reason ?? 'unknown'); continue; }
      seen.add(pub.roundTag);
      // the proof revealed only the details: element, magnitude, gameplay traits. Never the source.
      const traits = { ...pub.traits, flavor: 0n };
      slots[slot] = {
        spirit: r.spirit, element: pub.element, magnitude: pub.magnitude, traits: wireTraits(traits), strength: r.strength!,
        form: traits.form, generosity: spiritStats({ magnitude: pub.magnitude, traits }).generosity, lastBits: null,
      };
    }
    const n = this.players.size;
    this.players.set(aura, { id: aura, x: this.W / 2 + n * 40, y: this.H / 2, hp: B.player.hp, ward: 0, invuln: 0, ax: this.W / 2 + 100, ay: this.H / 2, slots, alive: true, ack: 0, budget: 0 });
    return { slots: slots.map((s) => s && { spirit: s.spirit, element: s.element, magnitude: s.magnitude, traits: s.traits, strength: s.strength }), refused };
  }

  /**
   * Movement commands, applied in order with the same code the client predicts with.
   * Each is acknowledged (so the client can drop it) even when it can't move you (paused, fallen).
   */
  commands(id: string, cmds: MoveCmd[]) {
    const p = this.players.get(id);
    if (!p) return;
    for (const c of cmds) {
      if (!(c.seq > p.ack) || ![c.mx, c.my, c.ax, c.ay, c.dt].every(Number.isFinite)) continue;
      p.ack = c.seq;
      p.ax = c.ax; p.ay = c.ay;
      if (!p.alive || this.over || this.paused || !this.started) continue;
      const dt = Math.max(0, Math.min(c.dt, MAX_CMD_DT, p.budget));
      p.budget -= dt;
      movePlayer(p, c, this.arena, dt);
    }
  }

  cast(id: string, slot: number, ax: number, ay: number) {
    const p = this.players.get(id);
    const s = p?.slots[slot];
    if (!p || !s || !p.alive || this.over || this.paused || !this.started) return;
    const tag = `c${this.castSeq++}`;
    this.pending.set(tag, { player: id, slot, ax, ay });
    const tgt: TargetSpec = [1, 2, 5].includes(s.form) ? { kind: 'self' } : { kind: 'point', x: ax, y: ay };
    this.auth.submitCast({ aura: id, spirit: s.spirit, request: B.request, target: tgt, tick: this.auth.currentTick(), tag });
  }

  /** Remove a player (left or abandoned). The round ends when no living player remains. */
  leave(id: string) {
    const p = this.players.get(id);
    if (p) { p.alive = false; p.hp = 0; }
    this.checkLost();
  }

  result(): RoundResultMsg {
    return { level: this.level, won: this.over === 'won', wave: this.wave + (this.over === 'won' || this.breather > 0 ? 0 : 1), kills: this.kills };
  }

  // ---------- stepping ----------

  start() {
    this.started = true;
  }

  step(dt: number) {
    if (!this.started || this.paused) return;
    this.time += dt;
    for (const p of this.players.values()) p.budget = Math.min(0.25, p.budget + dt);
    if (!this.over) {
      this.tickAcc += dt;
      while (this.tickAcc >= TICK_S) { this.tickAcc -= TICK_S; this.authorityTick(); }
    }
    this.stepWaves(dt);
    this.stepPlayers(dt);
    this.stepEnemies(dt);
    this.stepAllies(dt);
    this.stepProjectiles(dt);
    this.stepNovas(dt);
  }

  /** Current state plus everything that happened since the last snapshot. */
  snapshot(): Snapshot {
    const events = this.events;
    this.events = [];
    const w = this.warden && this.warden.hp > 0 ? this.warden : null;
    const wsp = w ? publicSpirit(w.spirit!) : null;
    return {
      t: 'snap',
      time: this.time,
      paused: this.paused,
      wave: this.wave,
      waves: B.waves.length,
      breather: this.breather,
      remaining: this.enemies.length + this.spawnQueue.length,
      kills: this.kills,
      players: [...this.players.values()].map((p) => {
        const a = this.auth.auraState(p.id);
        return {
          id: p.id, ack: p.ack, x: p.x, y: p.y, hp: p.hp, ward: p.ward, invuln: p.invuln > 0, strain: a.strain, capacity: a.capacity, alive: p.alive,
          slots: p.slots.map((s) => {
            if (!s) return null;
            const v = this.auth.poolInfo(p.id, s.spirit);
            return { lastBits: s.lastBits, vessel: v?.level ?? 0, cap: v?.cap ?? 1 };
          }),
        };
      }),
      enemies: this.enemies.map((e) => ({
        id: e.id, kind: e.kind, x: e.x, y: e.y, hp: e.hp, maxHp: e.maxHp, r: e.r, hexed: e.hexT > 0, element: e.element,
        strained: !!e.aura && this.auth.auraState(e.aura).strain > 1.5,
      })),
      allies: this.allies.map((a) => ({ id: a.id, x: a.x, y: a.y, life: a.life, element: a.element })),
      projs: this.projs.map((p) => ({ id: p.id, x: p.x, y: p.y, r: p.r, element: p.element, enemy: p.enemy })),
      novas: this.novas.map((n) => ({ id: n.id, x: n.x, y: n.y, r: n.r, t: n.t, max: n.max, element: n.element, enemy: n.enemy })),
      warden: w && wsp ? { hp: w.hp, maxHp: w.maxHp, element: wsp.element, magnitude: wsp.magnitude, traits: wireTraits(wsp.traits) } : null,
      events,
    };
  }

  // ---------- internals ----------

  private living(): Player[] {
    return [...this.players.values()].filter((p) => p.alive);
  }

  private nearestPlayer(x: number, y: number): Player | null {
    let best: Player | null = null, bd = Infinity;
    for (const p of this.living()) { const d = dist2(x, y, p.x, p.y); if (d < bd) { bd = d; best = p; } }
    return best;
  }

  private checkLost() {
    if (!this.over && this.players.size > 0 && this.living().length === 0) this.over = 'lost';
  }

  private startWave() {
    const w = B.waves[this.wave]!;
    const q: EnemyKind[] = [];
    for (const [k, n] of Object.entries(w)) for (let i = 0; i < Math.round(n * (1 + B.descent.countMult * this.level)); i++) q.push(k as EnemyKind);
    for (let i = q.length - 1; i > 0; i--) { const j = (this.random() * (i + 1)) | 0; [q[i], q[j]] = [q[j]!, q[i]!]; }
    if (this.wave === B.waves.length - 1) q.splice(Math.floor(q.length / 2), 0, 'warden');
    this.spawnQueue = q;
    this.spawnT = 0;
    this.events.push({ e: 'wave', wave: this.wave });
  }

  private spawn(kind: EnemyKind) {
    const d = B.enemies[kind];
    const { W, H } = this;
    let x = 0, y = 0;
    for (let k = 0; k < 30; k++) {
      const side = (this.random() * 4) | 0;
      x = side === 0 ? 30 : side === 1 ? W - 30 : this.rand(30, W - 30);
      y = side === 2 ? 30 : side === 3 ? H - 30 : this.rand(30, H - 30);
      if (this.living().every((p) => dist2(x, y, p.x, p.y) > 550 ** 2)) break;
    }
    const e: Enemy = { id: this.nextId++, kind, x, y, hp: d.hp * this.hpMult, maxHp: d.hp * this.hpMult, r: d.radius, speed: d.speed * this.rand(0.9, 1.1), dmg: d.dmg * this.dmgMult, cd: 0, hexDps: 0, hexT: 0, kx: 0, ky: 0, element: -1 };
    const D = B.descent;
    if (kind === 'warden') {
      e.aura = `npc:warden:${e.id}`;
      e.spirit = WARDEN_WELLS[(this.random() * WARDEN_WELLS.length) | 0]!;
      this.auth.grantSyntheticName(e.aura, e.spirit, TUNABLES.capRef + B.warden.bits + D.shamanBits * this.level + 4);
      e.castT = 2;
      this.warden = e;
      const sp = publicSpirit(e.spirit);
      e.element = sp.element;
      this.events.push({ e: 'warden', element: sp.element, magnitude: sp.magnitude, traits: wireTraits(sp.traits) });
    }
    if (kind === 'shaman') {
      e.aura = `npc:shaman:${e.id}`;
      e.spirit = this.random() < B.shaman.hearthChance ? HEARTH_GOD : ANCIENTS[(this.random() * ANCIENTS.length) | 0]!;
      this.auth.grantSyntheticName(e.aura, e.spirit, TUNABLES.capRef + this.wave + D.shamanBits * this.level + ((this.random() * 3) | 0));
      e.castT = this.rand(1, 2);
      e.strafe = this.random() < 0.5 ? 1 : -1;
      e.element = publicSpirit(e.spirit).element;
    }
    this.enemies.push(e);
    this.events.push({ e: 'spawn', x, y });
  }

  private hurtEnemy(e: Enemy, dmg: number, element: number, quiet = false) {
    if (dmg <= 0 || e.hp <= 0) return;
    e.hp -= dmg;
    if (!quiet) this.events.push({ e: 'hit', id: e.id, x: e.x, y: e.y - e.r, dmg, element });
    if (e.hp <= 0) {
      this.kills++;
      this.events.push({ e: 'kill', x: e.x, y: e.y, kind: e.kind, element });
      if (e.aura) this.auth.forgetAura(e.aura);
    }
  }

  private hurtPlayer(p: Player, dmg: number, why?: string) {
    if (this.over || !p.alive || p.invuln > 0 || dmg <= 0) return;
    const absorbed = Math.min(p.ward, dmg);
    p.ward -= absorbed;
    dmg -= absorbed;
    if (absorbed > 0) this.events.push({ e: 'absorb', p: p.id });
    if (dmg <= 0) return;
    p.hp -= dmg;
    this.events.push({ e: 'hurt', p: p.id, dmg, ...(why ? { why } : {}) });
    if (p.hp <= 0) { p.alive = false; this.checkLost(); }
  }

  private applyPlayerCast(r: CastResult) {
    const pend = r.tag ? this.pending.get(r.tag) : undefined;
    if (r.tag) this.pending.delete(r.tag);
    const p = pend && this.players.get(pend.player);
    if (!pend || !p || !p.alive) return;
    const s = p.slots[pend.slot]!;
    if (r.refused) { this.events.push({ e: 'refused', p: p.id, slot: pend.slot }); return; }
    s.lastBits = r.effective;
    const want = Math.min(B.request, castCap(r.effective, s.generosity));
    const effect = r.grant * TUNABLES.formEfficiency[s.form]! * B.effectScale;
    const element = s.element;
    // "your vessel runs low" means exactly that: the vessel limited this cast and is nearly empty
    const vessel = this.auth.poolInfo(p.id, s.spirit);
    const thin = r.grant < want * 0.7 && !!vessel && vessel.level < vessel.cap * 0.25;
    this.events.push({ e: 'cast', p: p.id, slot: pend.slot, form: s.form, element, effective: r.effective, effect, thin, x: p.x, y: p.y, ax: pend.ax, ay: pend.ay });
    if (r.recoil) { this.events.push({ e: 'backlash', p: p.id, dmg: r.recoil }); this.hurtPlayer(p, r.recoil, 'BACKLASH'); }
    const dx = pend.ax - p.x, dy = pend.ay - p.y;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d, uy = dy / d;
    switch (s.form) {
      case 0: { // bolt
        const f = B.forms.bolt;
        this.projs.push({ id: this.nextId++, x: p.x + ux * 16, y: p.y + uy * 16, vx: ux * f.speed, vy: uy * f.speed, r: f.radius + Math.min(8, effect / 6), dmg: effect, life: f.life, enemy: false, element });
        break;
      }
      case 1: { // ring
        const f = B.forms.ring;
        this.events.push({ e: 'ring', p: p.id, x: p.x, y: p.y, r: f.radius, element });
        for (const e of this.enemies) {
          const dd = Math.sqrt(dist2(e.x, e.y, p.x, p.y));
          if (dd < f.radius + e.r) {
            this.hurtEnemy(e, effect, element);
            const k = f.knock / Math.max(1, dd);
            e.kx += (e.x - p.x) * k * 4; e.ky += (e.y - p.y) * k * 4;
          }
        }
        break;
      }
      case 2: // ward
        p.ward = Math.min(B.player.wardMax, p.ward + effect * B.forms.ward.mult);
        this.events.push({ e: 'ring', p: p.id, x: p.x, y: p.y, r: 30, element, ward: true });
        break;
      case 3: { // lance
        const f = B.forms.lance;
        this.events.push({ e: 'beam', p: p.id, x: p.x, y: p.y, x2: p.x + ux * f.length, y2: p.y + uy * f.length, width: f.width, element, dur: 0.3 });
        for (const e of this.enemies) {
          const t = Math.max(0, Math.min(f.length, (e.x - p.x) * ux + (e.y - p.y) * uy));
          if (dist2(p.x + ux * t, p.y + uy * t, e.x, e.y) < (e.r + f.width / 2) ** 2) this.hurtEnemy(e, effect, element);
        }
        break;
      }
      case 4: { // nova
        const f = B.forms.nova;
        this.novas.push({ id: this.nextId++, x: pend.ax, y: pend.ay, t: f.delay, max: f.delay, dmg: effect, r: f.radius, element, enemy: false });
        break;
      }
      case 5: { // summon
        const f = B.forms.summon;
        this.allies.push({ id: this.nextId++, owner: p.id, x: p.x + this.rand(-20, 20), y: p.y + this.rand(-20, 20), hp: effect * f.hpPerEffect, life: f.life, hit: f.hitBase + effect * f.hitPerEffect, cd: 0, element });
        const mine = this.allies.filter((a) => a.owner === p.id);
        while (mine.length > f.maxActive) {
          const gone = mine.shift()!;
          this.allies = this.allies.filter((a) => a !== gone);
          this.events.push({ e: 'dismiss', x: gone.x, y: gone.y, element: gone.element });
        }
        this.events.push({ e: 'summon', p: p.id, x: p.x, y: p.y, element });
        break;
      }
      case 6: { // hex
        const f = B.forms.hex;
        let best: Enemy | null = null, bd = f.pick ** 2;
        for (const e of this.enemies) { const dd = dist2(e.x, e.y, pend.ax, pend.ay); if (dd < bd) { bd = dd; best = e; } }
        if (!best) { bd = Infinity; for (const e of this.enemies) { const dd = dist2(e.x, e.y, pend.ax, pend.ay); if (dd < bd) { bd = dd; best = e; } } }
        if (best) {
          best.hexDps += effect / f.duration;
          best.hexT = f.duration;
          this.events.push({ e: 'beam', p: p.id, x: p.x, y: p.y, x2: best.x, y2: best.y, width: 3, element, dur: 0.2 });
        }
        break;
      }
      case 7: { // blink
        const f = B.forms.blink;
        const range = Math.min(f.max, d, f.base + effect * f.perEffect);
        const x0 = p.x, y0 = p.y;
        p.x += ux * range; p.y += uy * range;
        this.collide(p, B.player.radius);
        p.invuln = 0.25;
        this.events.push({ e: 'blink', p: p.id, x: x0, y: y0, x2: p.x, y2: p.y, element });
        break;
      }
    }
  }

  private applyEnemyCast(r: CastResult) {
    const e = this.enemies.find((x) => x.aura === r.aura);
    if (!e || e.hp <= 0 || r.refused || r.grant <= 0) return;
    const sp = publicSpirit(e.spirit!);
    const frac = Math.max(0, Math.min(1, r.grant / castCap(r.strength, spiritStats(sp).generosity)));
    this.events.push({ e: 'enemyCast', x: e.x, y: e.y, effective: r.effective, warden: e.kind === 'warden' });
    if (e.kind === 'warden') {
      const tgt = r.target.kind === 'point' ? r.target : { x: e.x, y: e.y };
      this.novas.push({ id: this.nextId++, x: tgt.x, y: tgt.y, t: B.warden.novaDelay, max: B.warden.novaDelay, dmg: B.warden.novaDamage * this.dmgMult * (0.3 + 0.7 * frac), r: B.warden.novaRadius, element: sp.element, enemy: true });
      return;
    }
    const target = this.nearestPlayer(e.x, e.y);
    if (!target) return;
    const dx = target.x - e.x, dy = target.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    // damage is bounded: base bolt × descent, scaled by the fraction of its own cap it drew
    const dmg = B.shaman.boltDamage * this.dmgMult * (0.25 + 0.75 * frac);
    this.projs.push({ id: this.nextId++, x: e.x, y: e.y, vx: (dx / d) * B.shaman.boltSpeed, vy: (dy / d) * B.shaman.boltSpeed, r: 5 + 5 * frac, dmg, life: 2.5, enemy: true, element: sp.element });
  }

  private authorityTick() {
    for (const e of this.enemies) {
      if ((e.kind !== 'shaman' && e.kind !== 'warden') || e.hp <= 0) continue;
      e.castT! -= TICK_S;
      const target = this.nearestPlayer(e.x, e.y);
      if (e.castT! > 0 || !target) continue;
      if (e.kind === 'warden') {
        e.castT = this.rand(B.warden.castMin, B.warden.castMax);
        this.auth.submitCast({ aura: e.aura!, spirit: e.spirit!, request: B.request, target: { kind: 'point', x: target.x, y: target.y }, tick: this.auth.currentTick() });
      } else if (dist2(e.x, e.y, target.x, target.y) < 700 ** 2) {
        e.castT = this.rand(B.shaman.castMin, B.shaman.castMax);
        this.auth.submitCast({ aura: e.aura!, spirit: e.spirit!, request: B.request, target: { kind: 'entity', id: target.id }, tick: this.auth.currentTick() });
      }
    }
    for (const r of this.auth.tick().casts) {
      if (this.players.has(r.aura)) this.applyPlayerCast(r);
      else this.applyEnemyCast(r);
    }
  }

  private stepWaves(dt: number) {
    if (this.over) return;
    if (this.breather > 0) {
      this.breather -= dt;
      if (this.breather <= 0) this.startWave();
      return;
    }
    this.spawnT -= dt;
    if (this.spawnQueue.length && this.spawnT <= 0) { this.spawn(this.spawnQueue.shift()!); this.spawnT = B.spawnEvery; }
    if (!this.spawnQueue.length && this.enemies.length === 0) {
      this.wave++;
      if (this.wave >= B.waves.length) this.over = 'won';
      else { this.breather = B.breather; this.events.push({ e: 'breather', wave: this.wave }); }
    }
  }

  private stepPlayers(dt: number) {
    // movement arrives as commands (see commands()); here only the passage of time
    for (const p of this.players.values()) {
      if (!p.alive || this.over) continue;
      p.invuln = Math.max(0, p.invuln - dt);
      p.ward = Math.max(0, p.ward - p.ward * B.player.wardDecayPerSec * dt);
    }
  }

  private stepEnemies(dt: number) {
    for (const e of this.enemies) {
      e.cd = Math.max(0, e.cd - dt);
      if (e.hexT > 0) { e.hexT -= dt; this.hurtEnemy(e, e.hexDps * dt, 6, true); if (e.hexT <= 0) e.hexDps = 0; }
      const target = this.nearestPlayer(e.x, e.y);
      // chase the nearest of players and allies
      let tx = target?.x ?? e.x, ty = target?.y ?? e.y, td = target ? dist2(e.x, e.y, tx, ty) : Infinity;
      let targetAlly: Ally | null = null;
      for (const a of this.allies) { const d = dist2(e.x, e.y, a.x, a.y); if (d < td) { td = d; tx = a.x; ty = a.y; targetAlly = a; } }
      let vx = 0, vy = 0;
      if (e.kind === 'shaman' && target) {
        const keep = B.shaman.keepAway;
        const pd = Math.sqrt(dist2(e.x, e.y, target.x, target.y)) || 1;
        const px = (target.x - e.x) / pd, py = (target.y - e.y) / pd;
        if (pd < keep - 50) { vx = -px; vy = -py; }
        else if (pd > keep + 90) { vx = px; vy = py; }
        else { vx = -py * e.strafe! * 0.7; vy = px * e.strafe! * 0.7; }
      } else if (!this.over && Number.isFinite(td)) {
        const d = Math.sqrt(td) || 1;
        vx = (tx - e.x) / d; vy = (ty - e.y) / d;
      }
      e.x += (vx * e.speed + e.kx) * dt;
      e.y += (vy * e.speed + e.ky) * dt;
      e.kx *= Math.pow(0.02, dt); e.ky *= Math.pow(0.02, dt);
      this.collide(e, e.r);
      if (e.dmg > 0 && e.cd <= 0) {
        if (targetAlly && dist2(e.x, e.y, targetAlly.x, targetAlly.y) < (e.r + 12) ** 2) { targetAlly.hp -= e.dmg; e.cd = B.meleeCooldown; }
        else if (target && dist2(e.x, e.y, target.x, target.y) < (e.r + B.player.radius + 3) ** 2) { this.hurtPlayer(target, e.dmg); e.cd = B.meleeCooldown; }
      }
    }
    // separation
    const es = this.enemies;
    for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) {
      const a = es[i]!, b = es[j]!;
      const min = a.r + b.r, d2 = dist2(a.x, a.y, b.x, b.y);
      if (d2 < min * min && d2 > 0.01) {
        const d = Math.sqrt(d2), push = (min - d) / 2;
        const ux = (a.x - b.x) / d, uy = (a.y - b.y) / d;
        a.x += ux * push; a.y += uy * push; b.x -= ux * push; b.y -= uy * push;
      }
    }
    this.enemies = es.filter((e) => e.hp > 0);
  }

  private stepAllies(dt: number) {
    const S = B.forms.summon;
    for (const a of this.allies) {
      a.life -= dt; a.cd = Math.max(0, a.cd - dt);
      let best: Enemy | null = null, bd = Infinity;
      for (const e of this.enemies) { const d = dist2(a.x, a.y, e.x, e.y); if (d < bd) { bd = d; best = e; } }
      if (best) {
        const d = Math.sqrt(bd) || 1;
        if (d > best.r + 12) { a.x += ((best.x - a.x) / d) * S.speed * dt; a.y += ((best.y - a.y) / d) * S.speed * dt; }
        else if (a.cd <= 0) { this.hurtEnemy(best, a.hit, a.element); a.cd = S.hitEvery; }
      } else {
        const owner = this.players.get(a.owner);
        if (owner) {
          const d = Math.sqrt(dist2(a.x, a.y, owner.x, owner.y)) || 1;
          if (d > 50) { a.x += ((owner.x - a.x) / d) * S.speed * dt; a.y += ((owner.y - a.y) / d) * S.speed * dt; }
        }
      }
      this.collide(a, 10);
    }
    this.allies = this.allies.filter((a) => a.life > 0 && a.hp > 0);
  }

  private stepProjectiles(dt: number) {
    for (const p of this.projs) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      if (this.pillars.some((q) => dist2(p.x, p.y, q.x, q.y) < (q.r + p.r) ** 2)) { p.life = 0; this.events.push({ e: 'spark', x: p.x, y: p.y, element: p.element }); continue; }
      if (p.enemy) {
        const hit = this.living().find((pl) => dist2(p.x, p.y, pl.x, pl.y) < (p.r + B.player.radius) ** 2);
        if (hit) { this.hurtPlayer(hit, p.dmg); p.life = 0; this.events.push({ e: 'spark', x: p.x, y: p.y, element: p.element }); }
        else for (const a of this.allies) if (dist2(p.x, p.y, a.x, a.y) < (p.r + 10) ** 2) { a.hp -= p.dmg; p.life = 0; break; }
      } else {
        for (const e of this.enemies) if (dist2(p.x, p.y, e.x, e.y) < (p.r + e.r) ** 2) { this.hurtEnemy(e, p.dmg, p.element); p.life = 0; this.events.push({ e: 'spark', x: p.x, y: p.y, element: p.element }); break; }
      }
    }
    this.projs = this.projs.filter((p) => p.life > 0);
  }

  private stepNovas(dt: number) {
    for (const n of this.novas) {
      n.t -= dt;
      if (n.t > 0) continue;
      this.events.push({ e: 'nova', x: n.x, y: n.y, r: n.r, element: n.element, enemy: n.enemy });
      if (n.enemy) {
        for (const p of this.living()) if (dist2(p.x, p.y, n.x, n.y) < (n.r + B.player.radius) ** 2) this.hurtPlayer(p, n.dmg, 'the Warden');
      } else for (const e of this.enemies) if (dist2(e.x, e.y, n.x, n.y) < (n.r + e.r) ** 2) this.hurtEnemy(e, n.dmg, n.element);
    }
    this.novas = this.novas.filter((n) => n.t > 0);
  }

  private collide(o: { x: number; y: number }, r: number) {
    collideCircle(o, r, this.arena);
  }
}

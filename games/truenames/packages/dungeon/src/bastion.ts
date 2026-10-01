// The Bastion: tower defense. Your proven names become shrines along a road to your hearth.
// Every shrine speaks in your name through the same authority, so the rules of the Dark carry over
// with new consequences:
//  - strain is aura-wide: every shrine that speaks strains YOU; too many shrines and every word weakens,
//    and past capacity the backlash cracks your hearth
//  - one vessel per patron: every shrine to the same patron shares it, and a patron speaks once per tick
// Pure: no DOM, no timers. The host feeds messages and steps; snapshots come out.
import { LocalAuthority, TUNABLES, type ProofVerifier } from '@truenames/authority';
import type { CastResult } from '@truenames/protocol';
import type { ZkNameClaim } from '@truenames/proofs';
import { admitNames, publicSlots, type AdmittedSlot } from './admission.ts';
import { BALANCE as B, BASTION as T, type BastionFoe } from './balance.ts';
import type { BastionEvent, BastionLayout, BastionSnapshot, ClientMsg, RoundResultMsg, ServerMsg, SlotInfo } from './protocol.ts';

const TICK_S = TUNABLES.TICK_MS / 1000;
const FORM_KEYS = ['bolt', 'ring', 'ward', 'lance', 'nova', 'summon', 'hex', 'blink'] as const;
const dist2 = (ax: number, ay: number, bx: number, by: number) => (ax - bx) ** 2 + (ay - by) ** 2;

interface Shrine { id: number; slot: number; gx: number; gy: number; x: number; y: number; cd: number; waiting: boolean }
interface Foe {
  id: number; kind: BastionFoe; s: number; x: number; y: number;
  hp: number; maxHp: number; r: number; speed: number;
  slow: number; slowT: number; hexDps: number; hexT: number; blocked: boolean;
}
interface Bolt { id: number; x: number; y: number; target: number; dmg: number; element: number; life: number }
interface Guardian { id: number; x: number; y: number; s: number; hp: number; life: number; hit: number; cd: number; element: number; holding: number }
interface Nova { id: number; x: number; y: number; r: number; t: number; max: number; dmg: number; element: number }
interface Pending { shrine: number; target: number; tx: number; ty: number }

export interface BastionOptions {
  level: number;
  context: bigint;
  verifier: ProofVerifier;
  rng?: () => number;
}

/** The road as a polyline in world units, with cumulative lengths. */
function buildRoad() {
  const pts = T.path.map(([gx, gy]) => ({ x: gx * T.tile + T.tile / 2, y: gy * T.tile + T.tile / 2 }));
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y));
  const tiles = new Set<string>();
  for (let i = 1; i < T.path.length; i++) {
    const [ax, ay] = T.path[i - 1]!, [bx, by] = T.path[i]!;
    for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) {
      if (x >= 0 && x < T.cols && y >= 0 && y < T.rows) tiles.add(`${x},${y}`);
    }
  }
  return { pts, cum, length: cum[cum.length - 1]!, tiles };
}

export class BastionSim {
  readonly world = 'bastion' as const;
  readonly level: number;
  private auth: LocalAuthority;
  private random: () => number;
  private road = buildRoad();
  private hpMult: number;

  private you: string | null = null;
  private slots: (AdmittedSlot | null)[] = [];
  private shrines: Shrine[] = [];
  private foes: Foe[] = [];
  private bolts: Bolt[] = [];
  private guardians: Guardian[] = [];
  private novas: Nova[] = [];
  private events: BastionEvent[] = [];
  private pending = new Map<string, Pending>();
  private nextId = 1;
  private castSeq = 0;
  private tickAcc = 0;
  private time = 0;

  private wave = 0; // index of the wave running, or next to run
  private running = false;
  private breather: number = T.firstBreather;
  private spawnQueue: BastionFoe[] = [];
  private spawnT = 0;
  private hearth: number = T.hearth;
  private resonance: number = T.startResonance;
  private kills = 0;
  paused = false;
  started = false;
  over: null | 'won' | 'lost' = null;

  constructor(opts: BastionOptions) {
    this.level = opts.level;
    this.random = opts.rng ?? Math.random;
    this.hpMult = B.descent.hpMult ** opts.level;
    this.auth = new LocalAuthority({ proofs: opts.verifier, context: opts.context, seed: (this.random() * 2 ** 31) | 0 });
  }

  layout(): BastionLayout {
    const end = this.road.pts[this.road.pts.length - 1]!;
    return {
      cols: T.cols, rows: T.rows, tile: T.tile,
      road: this.road.pts.map((p) => [p.x, p.y]),
      roadTiles: [...this.road.tiles].map((k) => k.split(',').map(Number) as [number, number]),
      hearth: { x: end.x, y: end.y, max: T.hearth },
    };
  }

  // ---------- host interface (shared with the Dark) ----------

  async admit(aura: string, bundle: { slot: number; claim: ZkNameClaim }[]): Promise<{ slots: (SlotInfo | null)[]; refused: string[] }> {
    const { slots, refused } = await admitNames(this.auth, aura, bundle);
    this.you = aura;
    this.slots = slots;
    return { slots: publicSlots(slots), refused };
  }

  welcome(you: string, slots: (SlotInfo | null)[], refused: string[]): ServerMsg {
    return { t: 'welcome', world: 'bastion', you, level: this.level, bastion: this.layout(), slots, refused };
  }

  handle(_you: string, m: ClientMsg) {
    if (m.t === 'build') this.build(Math.floor(Number(m.slot)), Math.floor(Number(m.gx)), Math.floor(Number(m.gy)));
    else if (m.t === 'sell') this.sell(Math.floor(Number(m.id)));
    else if (m.t === 'call') this.callWave();
    else if (m.t === 'abandon') this.over = this.over ?? 'lost';
  }

  start() {
    this.started = true;
  }

  result(): RoundResultMsg {
    return { world: 'bastion', level: this.level, won: this.over === 'won', wave: Math.min(T.waves, this.wave + (this.over === 'won' ? 0 : 1)), kills: this.kills };
  }

  // ---------- player actions ----------

  shrineCost() {
    return T.shrineBase + T.shrineStep * this.shrines.length;
  }

  build(slot: number, gx: number, gy: number) {
    const s = this.slots[slot];
    const deny = (why: string) => this.events.push({ e: 'denied', why });
    if (!s || this.over) return deny('no such name');
    if (!(gx >= 0 && gx < T.cols && gy >= 0 && gy < T.rows)) return deny('beyond the bastion');
    if (this.road.tiles.has(`${gx},${gy}`)) return deny('not on the road');
    if (this.shrines.some((t) => t.gx === gx && t.gy === gy)) return deny('a shrine already stands there');
    const cost = this.shrineCost();
    if (this.resonance < cost) return deny('not enough resonance');
    this.resonance -= cost;
    const t: Shrine = { id: this.nextId++, slot, gx, gy, x: gx * T.tile + T.tile / 2, y: gy * T.tile + T.tile / 2, cd: 0.5, waiting: false };
    this.shrines.push(t);
    this.events.push({ e: 'built', id: t.id, slot, gx, gy });
  }

  sell(id: number) {
    const i = this.shrines.findIndex((t) => t.id === id);
    if (i < 0) return;
    this.shrines.splice(i, 1);
    const refund = Math.floor((T.shrineBase + T.shrineStep * this.shrines.length) * T.sellRefund);
    this.resonance += refund;
    this.events.push({ e: 'sold', id, refund });
  }

  callWave() {
    if (this.running || this.over || !this.started || this.wave >= T.waves) return;
    this.resonance += Math.floor(this.breather * T.earlyCallPerSecond);
    this.breather = 0;
  }

  // ---------- stepping ----------

  step(dt: number) {
    if (!this.started || this.paused || this.over) return;
    this.time += dt;
    this.tickAcc += dt;
    while (this.tickAcc >= TICK_S) { this.tickAcc -= TICK_S; this.authorityTick(); }
    this.stepWaves(dt);
    this.stepShrines(dt);
    this.stepFoes(dt);
    this.stepGuardians(dt);
    this.stepBolts(dt);
    this.stepNovas(dt);
    if (this.hearth <= 0) this.over = 'lost';
  }

  snapshot(): BastionSnapshot {
    const events = this.events;
    this.events = [];
    const a = this.you ? this.auth.auraState(this.you) : { strain: 0, capacity: 0 };
    const w = this.foes.find((f) => f.kind === 'warden');
    return {
      t: 'bsnap', time: this.time, paused: this.paused,
      wave: this.wave, waves: T.waves, breather: this.running ? 0 : this.breather, running: this.running,
      hearth: this.hearth, resonance: this.resonance, shrineCost: this.shrineCost(),
      kills: this.kills, remaining: this.foes.length + this.spawnQueue.length,
      strain: a.strain, capacity: a.capacity,
      slots: this.slots.map((s) => {
        if (!s || !this.you) return null;
        const v = this.auth.poolInfo(this.you, s.spirit);
        return { lastBits: s.lastBits, vessel: v?.level ?? 0, cap: v?.cap ?? 1 };
      }),
      shrines: this.shrines.map((t) => {
        const s = this.slots[t.slot]!;
        const every = T.forms[FORM_KEYS[s.form]!].every;
        return { id: t.id, slot: t.slot, gx: t.gx, gy: t.gy, form: s.form, element: s.element, ready: Math.max(0, Math.min(1, 1 - t.cd / every)) };
      }),
      foes: this.foes.map((f) => ({ id: f.id, kind: f.kind, x: f.x, y: f.y, hp: f.hp, maxHp: f.maxHp, r: f.r, slowed: f.slowT > 0, hexed: f.hexT > 0, blocked: f.blocked })),
      bolts: this.bolts.map((b) => ({ id: b.id, x: b.x, y: b.y, element: b.element })),
      guardians: this.guardians.map((g) => ({ id: g.id, x: g.x, y: g.y, life: g.life, element: g.element })),
      novas: this.novas.map((n) => ({ id: n.id, x: n.x, y: n.y, r: n.r, t: n.t, max: n.max, element: n.element })),
      warden: w ? { hp: w.hp, maxHp: w.maxHp } : null,
      events,
    };
  }

  // ---------- internals ----------

  private roadAt(s: number): { x: number; y: number } {
    const { pts, cum } = this.road;
    if (s <= 0) return { ...pts[0]! };
    for (let i = 1; i < pts.length; i++) {
      if (s <= cum[i]!) {
        const k = (s - cum[i - 1]!) / (cum[i]! - cum[i - 1]!);
        return { x: pts[i - 1]!.x + (pts[i]!.x - pts[i - 1]!.x) * k, y: pts[i - 1]!.y + (pts[i]!.y - pts[i - 1]!.y) * k };
      }
    }
    return { ...pts[pts.length - 1]! };
  }

  /** Nearest distance along the road to a point (coarse search is plenty). */
  private roadNear(x: number, y: number): number {
    let best = 0, bd = Infinity;
    for (let s = 0; s <= this.road.length; s += 8) {
      const p = this.roadAt(s);
      const d = dist2(p.x, p.y, x, y);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  private stepWaves(dt: number) {
    if (!this.running) {
      if (this.wave >= T.waves) return;
      this.breather -= dt;
      if (this.breather <= 0) this.startWave();
      return;
    }
    this.spawnT -= dt;
    if (this.spawnQueue.length && this.spawnT <= 0) { this.spawn(this.spawnQueue.shift()!); this.spawnT = T.spawnEvery; }
    if (!this.spawnQueue.length && !this.foes.length) {
      const bonus = T.waveBonus + T.waveBonusStep * this.wave;
      this.resonance += bonus;
      this.events.push({ e: 'cleared', wave: this.wave, bonus });
      this.running = false;
      this.wave++;
      if (this.wave >= T.waves) this.over = 'won';
      else this.breather = T.breather;
    }
  }

  private startWave() {
    const mix = T.wavesMix[this.wave]!;
    const q: BastionFoe[] = [];
    for (const [k, n] of Object.entries(mix)) for (let i = 0; i < Math.round(n * (1 + B.descent.countMult * this.level)); i++) q.push(k as BastionFoe);
    for (let i = q.length - 1; i > 0; i--) { const j = (this.random() * (i + 1)) | 0; [q[i], q[j]] = [q[j]!, q[i]!]; }
    const w = q.indexOf('warden');
    if (w >= 0) { q.splice(w, 1); q.splice(Math.floor(q.length * 0.6), 0, 'warden'); }
    this.spawnQueue = q;
    this.spawnT = 0;
    this.running = true;
    this.events.push({ e: 'wave', wave: this.wave });
  }

  private spawn(kind: BastionFoe) {
    const d = T.foes[kind];
    const hp = d.hp * T.waveHpGrowth ** this.wave * this.hpMult;
    const p = this.roadAt(0);
    this.foes.push({ id: this.nextId++, kind, s: 0, x: p.x, y: p.y, hp, maxHp: hp, r: d.radius, speed: d.speed * (0.92 + this.random() * 0.16), slow: 0, slowT: 0, hexDps: 0, hexT: 0, blocked: false });
    if (kind === 'warden') this.events.push({ e: 'warden' });
  }

  /** The foe furthest along the road within range of a point. */
  private target(x: number, y: number, range: number): Foe | null {
    let best: Foe | null = null;
    for (const f of this.foes) if (f.hp > 0 && dist2(f.x, f.y, x, y) <= (range + f.r) ** 2 && (!best || f.s > best.s)) best = f;
    return best;
  }

  private stepShrines(dt: number) {
    if (!this.you) return;
    for (const t of this.shrines) {
      t.cd = Math.max(0, t.cd - dt);
      if (t.cd > 0 || t.waiting) continue;
      const s = this.slots[t.slot]!;
      const f = T.forms[FORM_KEYS[s.form]!];
      const target = this.target(t.x, t.y, f.range);
      if (!target) continue;
      const tag = `s${this.castSeq++}`;
      this.pending.set(tag, { shrine: t.id, target: target.id, tx: target.x, ty: target.y });
      t.waiting = true; // until the authority answers
      this.auth.submitCast({ aura: this.you, spirit: s.spirit, facet: s.facet, request: B.request, target: { kind: 'point', x: target.x, y: target.y }, tick: this.auth.currentTick(), tag });
    }
  }

  private authorityTick() {
    for (const r of this.auth.tick().casts) this.applyCast(r);
  }

  private hurt(f: Foe, dmg: number, element: number, quiet = false) {
    if (dmg <= 0 || f.hp <= 0) return;
    f.hp -= dmg;
    if (!quiet) this.events.push({ e: 'hit', id: f.id, x: f.x, y: f.y - f.r, dmg, element });
    if (f.hp <= 0) {
      const reward = T.foes[f.kind].reward;
      this.kills++;
      this.resonance += reward;
      this.events.push({ e: 'kill', x: f.x, y: f.y, kind: f.kind, element, reward });
    }
  }

  private applyCast(r: CastResult) {
    const pend = r.tag ? this.pending.get(r.tag) : undefined;
    if (r.tag) this.pending.delete(r.tag);
    const t = pend && this.shrines.find((x) => x.id === pend.shrine);
    if (!pend || !t) return;
    t.waiting = false;
    const s = this.slots[t.slot]!;
    const key = FORM_KEYS[s.form]!;
    if (r.refused) {
      // another shrine to the same patron spoke this tick: try again next tick
      if (r.refused !== 'duplicate') this.events.push({ e: 'refused', id: t.id, slot: t.slot });
      return;
    }
    t.cd = T.forms[key].every;
    s.lastBits = r.effective;
    const effect = r.grant * TUNABLES.formEfficiency[s.form]! * B.effectScale;
    const element = s.element;
    this.events.push({ e: 'shrineCast', id: t.id, slot: t.slot, form: s.form, element, effective: r.effective, effect, x: t.x, y: t.y });
    if (r.recoil) {
      const dmg = T.backlashHearth + Math.floor(r.recoil / T.recoilPerHearth);
      this.hearth -= dmg;
      this.events.push({ e: 'backlash', id: t.id, hearth: dmg });
    }
    const target = this.foes.find((f) => f.id === pend.target && f.hp > 0);
    const tx = target?.x ?? pend.tx, ty = target?.y ?? pend.ty;
    switch (key) {
      case 'bolt':
        if (target) this.bolts.push({ id: this.nextId++, x: t.x, y: t.y, target: target.id, dmg: effect, element, life: 2 });
        break;
      case 'ring': {
        const f = T.forms.ring;
        this.events.push({ e: 'ring', x: t.x, y: t.y, r: f.range, element });
        for (const foe of this.foes) if (dist2(foe.x, foe.y, t.x, t.y) <= (f.range + foe.r) ** 2) this.hurt(foe, effect, element);
        break;
      }
      case 'ward': {
        const f = T.forms.ward;
        const slow = Math.min(f.maxSlow, effect * f.slowPerEffect);
        this.events.push({ e: 'ring', x: t.x, y: t.y, r: f.range, element, ward: true });
        for (const foe of this.foes) if (dist2(foe.x, foe.y, t.x, t.y) <= (f.range + foe.r) ** 2) { foe.slow = Math.max(foe.slow, slow); foe.slowT = f.duration; }
        break;
      }
      case 'lance': {
        const f = T.forms.lance;
        const dx = tx - t.x, dy = ty - t.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
        this.events.push({ e: 'beam', x: t.x, y: t.y, x2: t.x + ux * f.range, y2: t.y + uy * f.range, width: f.width, element, dur: 0.3 });
        for (const foe of this.foes) {
          const k = Math.max(0, Math.min(f.range, (foe.x - t.x) * ux + (foe.y - t.y) * uy));
          if (dist2(t.x + ux * k, t.y + uy * k, foe.x, foe.y) <= (foe.r + f.width / 2) ** 2) this.hurt(foe, effect, element);
        }
        break;
      }
      case 'nova': {
        const f = T.forms.nova;
        this.novas.push({ id: this.nextId++, x: tx, y: ty, r: f.radius, t: f.delay, max: f.delay, dmg: effect, element });
        break;
      }
      case 'summon': {
        const f = T.forms.summon;
        const s0 = this.roadNear(t.x, t.y);
        const p = this.roadAt(s0);
        this.guardians.push({ id: this.nextId++, x: p.x, y: p.y, s: s0, hp: Math.min(f.maxHp, effect * f.hpPerEffect), life: f.life, hit: f.hitBase + effect * f.hitPerEffect, cd: 0, element, holding: 0 });
        this.events.push({ e: 'summon', x: p.x, y: p.y, element });
        break;
      }
      case 'hex': {
        const f = T.forms.hex;
        if (!target) break;
        target.hexDps += effect / f.duration;
        target.hexT = f.duration;
        this.events.push({ e: 'beam', x: t.x, y: t.y, x2: target.x, y2: target.y, width: 3, element, dur: 0.2 });
        break;
      }
      case 'blink': {
        const f = T.forms.blink;
        if (!target) break;
        const push = Math.min(f.max, f.base + effect * f.perEffect);
        const x0 = target.x, y0 = target.y;
        target.s = Math.max(0, target.s - push);
        const p = this.roadAt(target.s);
        target.x = p.x; target.y = p.y;
        this.events.push({ e: 'throw', x: x0, y: y0, x2: p.x, y2: p.y, element });
        break;
      }
    }
  }

  private stepFoes(dt: number) {
    for (const g of this.guardians) g.holding = 0;
    for (const f of this.foes) {
      if (f.hexT > 0) { f.hexT -= dt; this.hurt(f, f.hexDps * dt, 6, true); if (f.hexT <= 0) f.hexDps = 0; }
      if (f.slowT > 0) { f.slowT -= dt; if (f.slowT <= 0) f.slow = 0; }
      if (f.hp <= 0) continue;
      // a guardian on the road holds the first few foes that reach it; the Warden tramples it
      const g = this.guardians.find((x) => x.hp > 0 && x.s > f.s - 4 && dist2(x.x, x.y, f.x, f.y) < (f.r + 12) ** 2);
      if (g && f.kind === 'warden') g.hp = 0;
      const holds = !!g && f.kind !== 'warden' && g.holding < T.forms.summon.holds;
      f.blocked = holds;
      if (holds) { g!.holding++; g!.hp -= T.foes[f.kind].hitGuardian * dt; continue; }
      f.s += f.speed * (1 - f.slow) * dt;
      const p = this.roadAt(f.s);
      f.x = p.x; f.y = p.y;
      if (f.s >= this.road.length) {
        const dmg = T.foes[f.kind].leak;
        this.hearth -= dmg;
        f.hp = 0;
        this.events.push({ e: 'leak', x: f.x, y: f.y, dmg });
      }
    }
    this.foes = this.foes.filter((f) => f.hp > 0);
  }

  private stepGuardians(dt: number) {
    const f = T.forms.summon;
    for (const g of this.guardians) {
      g.life -= dt;
      g.cd = Math.max(0, g.cd - dt);
      if (g.cd > 0) continue;
      const foe = this.foes.find((x) => dist2(x.x, x.y, g.x, g.y) < (x.r + 14) ** 2);
      if (foe) { this.hurt(foe, g.hit, g.element); g.cd = f.hitEvery; }
    }
    this.guardians = this.guardians.filter((g) => g.life > 0 && g.hp > 0);
  }

  private stepBolts(dt: number) {
    const speed = T.forms.bolt.speed;
    for (const b of this.bolts) {
      b.life -= dt;
      const f = this.foes.find((x) => x.id === b.target && x.hp > 0);
      if (!f) { b.life = 0; continue; }
      const dx = f.x - b.x, dy = f.y - b.y, d = Math.hypot(dx, dy);
      if (d <= speed * dt + f.r) { this.hurt(f, b.dmg, b.element); this.events.push({ e: 'spark', x: f.x, y: f.y, element: b.element }); b.life = 0; continue; }
      b.x += (dx / d) * speed * dt;
      b.y += (dy / d) * speed * dt;
    }
    this.bolts = this.bolts.filter((b) => b.life > 0);
  }

  private stepNovas(dt: number) {
    for (const n of this.novas) {
      n.t -= dt;
      if (n.t > 0) continue;
      this.events.push({ e: 'nova', x: n.x, y: n.y, r: n.r, element: n.element });
      for (const f of this.foes) if (dist2(f.x, f.y, n.x, n.y) <= (n.r + f.r) ** 2) this.hurt(f, n.dmg, n.element);
    }
    this.novas = this.novas.filter((n) => n.t > 0);
  }
}


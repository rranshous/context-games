// Dark Racer: a race around a closed road through the astral. Your proven names are what your car can do.
// Every speaking goes through the authority, so the rules of the Dark carry over as racing:
//  - strain is engine heat: the more you speak, the lower your top speed; past capacity, backlash spins you out
//  - vessels refill as you drive: a generous patron can be called again sooner
//  - power is what the name actually drew, on a gentle (logarithmic) curve, as in the Council
// Rivals are AI cars with auras of their own, racing under the names of public ancients.
// Several players can share a race: each takes the place of a rival on the grid before the start
// (the host holds the start for a short lobby), and each sees their own view. A player who leaves
// is handed to the autopilot.
// Pure: no DOM, no timers. The host feeds messages and steps; snapshots come out.
import { LocalAuthority, spiritStats, TUNABLES, type ProofVerifier } from '@truenames/authority';
import type { CastResult } from '@truenames/protocol';
import type { ZkNameClaim } from '@truenames/proofs';
import { spiritAt, wordBar } from '@truenames/universe';
import { admitNames, publicSlots, wireTraits, type AdmittedSlot } from './admission.ts';
import { BALANCE as B, RACER as R, logPower } from './balance.ts';
import { CHARTED } from './world.ts';
import { autopilot, buildTrack, driveCar, MAX_DRIVE_DT, nearestIndex, roadDir, type CarState, type DriveCmd, type Track } from './racing.ts';
import type { ClientMsg, RacerEvent, RacerRival, RacerSnapshot, RacerTrack, RoundResultMsg, ServerMsg, SlotInfo } from './protocol.ts';

const TICK_S = TUNABLES.TICK_MS / 1000;
const FORM = { bolt: 0, ring: 1, ward: 2, lance: 3, nova: 4, summon: 5, hex: 6, blink: 7 } as const;
const F = R.forms;

interface Name { spirit: string; facet: number; element: number; form: number; generosity: number; cd: number; lastBits: number | null }

interface Car extends CarState {
  id: number;
  aura: string;
  ai: boolean;
  element: number;
  names: Name[];
  shield: number;
  lap: number;
  prev: number; // centerline index last step (for lap counting)
  finished: number | null;
  finishT: number;
  skill: number;
  castT: number;
  ack: number;
  budget: number;
  immune: number; // just hit: a moment's grace so one blast doesn't spin you twice
  player: boolean; // a player's car (even if since handed to the autopilot)
}

interface Bolt { id: number; owner: number; x: number; y: number; vx: number; vy: number; target: number; power: number; life: number; element: number }
interface Mine { id: number; owner: number; x: number; y: number; arm: number; life: number; power: number; element: number }
interface Slick { id: number; owner: number; x: number; y: number; r: number; life: number; power: number; element: number }
interface Drone { id: number; owner: number; x: number; y: number; life: number; power: number; element: number }

export interface RacerOptions {
  level: number;
  context: bigint;
  verifier: ProofVerifier;
  rng?: () => number;
}

export class RacerSim {
  readonly world = 'racer' as const;
  readonly level: number;
  readonly track: Track;
  private auth: LocalAuthority;
  private random: () => number;
  private cars: Car[] = [];
  private bolts: Bolt[] = [];
  private mines: Mine[] = [];
  private slicks: Slick[] = [];
  private drones: Drone[] = [];
  private events: RacerEvent[] = [];
  private pending = new Map<string, { car: number; slot: number }>();
  private nextId = 1;
  private castSeq = 0;
  private tickAcc = 0;
  private time = 0;
  private countdown: number = R.countdown;
  private finishers = 0;
  private firstFinish: number | null = null;
  /** human players: aura → car id */
  private players = new Map<string, number>();
  private hits = new Map<number, number>();
  private done = new Map<number, 'won' | 'lost'>();
  /** seconds until the host starts the race (shown on the grid), or null once racing */
  lobby: number | null = null;
  paused = false;
  started = false;
  over: null | 'won' | 'lost' = null;

  constructor(opts: RacerOptions) {
    this.level = opts.level;
    this.random = opts.rng ?? Math.random;
    this.auth = new LocalAuthority({ proofs: opts.verifier, context: opts.context, seed: (this.random() * 2 ** 31) | 0 });
    this.track = buildTrack(R.tracks[opts.level % R.tracks.length]!);
    this.grid();
  }

  /** Car places on the grid: one per car, rivals until players take them. */
  get seats() { return R.rivals + 1; }
  get playerCount() { return this.players.size; }
  get full() { return this.players.size >= this.seats; }
  hasPlayer(aura: string) { return this.players.has(aura); }

  // ---------- host interface (shared with the other worlds) ----------

  /** Admit a player: their proven names take over the rearmost rival's car. Only before the start. */
  async admit(aura: string, bundle: { slot: number; claim: ZkNameClaim }[]): Promise<{ slots: (SlotInfo | null)[]; refused: string[] }> {
    if (this.started) throw new Error('the race has already started');
    if (this.players.has(aura)) throw new Error('that aura is already on the grid');
    if (this.full) throw new Error('the grid is full');
    const { slots, refused } = await admitNames(this.auth, aura, bundle);
    const names = slots.map((s) => s && this.nameOf(s));
    const car = [...this.cars].reverse().find((c) => c.ai && ![...this.players.values()].includes(c.id))!;
    Object.assign(car, { aura, ai: false, names: names as Name[], element: names.find(Boolean)?.element ?? 0, skill: 1, top: 1, player: true });
    this.players.set(aura, car.id);
    return { slots: publicSlots(slots), refused };
  }

  private nameOf(s: AdmittedSlot): Name {
    return { spirit: s.spirit, facet: s.facet, element: s.element, form: s.form, generosity: s.generosity, cd: 0, lastBits: null };
  }

  /** Line up on the grid behind the start, in pairs. Players take places from the back. */
  private grid() {
    const n = this.track.pts.length;
    const place = (k: number) => {
      const i = (n - 3 - Math.floor(k / 2) * 3 + n) % n;
      const p = this.track.pts[i]!, d = roadDir(this.track, i);
      const side = k % 2 === 0 ? -1 : 1;
      return { x: p.x - d.y * side * 30, y: p.y + d.x * side * 30, a: Math.atan2(d.y, d.x), i };
    };
    const mk = (id: number, aura: string, ai: boolean, element: number, names: Name[], skill: number, k: number): Car => {
      const g = place(k);
      return {
        id, aura, ai, element, names, skill, x: g.x, y: g.y, vx: 0, vy: 0, a: g.a, spin: 0, slide: 0, slow: 0, top: skill, hint: g.i,
        shield: 0, lap: -1, prev: g.i, finished: null, finishT: 0, castT: this.rand(R.rival.castMin, R.rival.castMax) + R.countdown, ack: 0, budget: 0, immune: 0, player: false,
      };
    };
    const rivals = this.seats;
    const pool = [...CHARTED];
    for (let r = 0; r < rivals; r++) {
      const raura = `npc:rival-${r}`;
      const own: Name[] = [];
      for (let k = 0; k < R.rival.names; k++) {
        const cell = pool.splice((this.random() * pool.length) | 0, 1)[0]!;
        const sp = spiritAt(cell)!;
        this.auth.grantSyntheticName(raura, cell, wordBar(sp.magnitude) + R.rival.resonance + B.descent.shamanBits * this.level);
        own.push({ spirit: cell, facet: 0, element: sp.element, form: sp.traits.form, generosity: spiritStats(sp).generosity, cd: 0, lastBits: null });
      }
      const skill = Math.min(R.rival.skillMax, R.rival.skillBase + R.rival.skillPerLevel * this.level + this.rand(0, R.rival.skillSpread));
      this.cars.push(mk(r, raura, true, own[0]!.element, own, skill, r));
    }
  }

  welcome(you: string, slots: (SlotInfo | null)[], refused: string[]): ServerMsg {
    const track: RacerTrack = { pts: this.track.pts.map((p) => [p.x, p.y]), halfWidth: this.track.halfWidth, laps: R.laps };
    const rivals: RacerRival[] = this.cars.filter((c) => !c.player).map((c) => {
      const sp = spiritAt(c.names[0]!.spirit)!;
      return { car: c.id, element: sp.element, magnitude: sp.magnitude, traits: wireTraits(sp.traits) };
    });
    return { t: 'welcome', world: 'racer', you, level: this.level, car: this.players.get(you) ?? -1, track, rivals, slots, refused };
  }

  handle(you: string, m: ClientMsg) {
    const id = this.players.get(you);
    const c = id === undefined ? undefined : this.cars[id];
    if (!c || this.done.has(c.id)) return;
    if (m.t === 'drive' && Array.isArray(m.cmds)) this.drive(c, m.cmds);
    else if (m.t === 'cast') this.cast(c, Math.floor(Number(m.slot)));
    else if (m.t === 'abandon') this.leave(you);
  }

  /** A player leaves (abandons or disconnects): their car races on under the autopilot. */
  leave(you: string) {
    const id = this.players.get(you);
    if (id === undefined) return;
    const c = this.cars[id]!;
    c.ai = true;
    if (!this.done.has(id)) this.done.set(id, 'lost');
    this.checkOver();
  }

  /** Has this player's race ended (finished, or no longer able to place)? */
  doneFor(you: string): boolean {
    const id = this.players.get(you);
    return id !== undefined && this.done.has(id);
  }

  start() {
    this.started = true;
  }

  result(you: string = [...this.players.keys()][0] ?? ''): RoundResultMsg {
    const id = this.players.get(you) ?? 0;
    const me = this.cars[id]!;
    return { world: 'racer', level: this.level, won: this.done.get(id) === 'won', wave: me.finished ?? this.placeOf(me), kills: this.hits.get(id) ?? 0 };
  }

  // ---------- your car ----------

  /** Your numbered drive commands, applied in order (acknowledged even when they can't move you). */
  private drive(c: Car, cmds: DriveCmd[]) {
    for (const cmd of cmds) {
      if (!cmd || !(cmd.seq > c.ack) || ![cmd.throttle, cmd.steer, cmd.dt].every(Number.isFinite)) continue;
      c.ack = cmd.seq;
      if (this.over || this.paused || !this.started) continue;
      const dt = Math.max(0, Math.min(cmd.dt, MAX_DRIVE_DT, c.budget));
      c.budget -= dt;
      const locked = this.countdown > 0 || c.finished !== null;
      driveCar(c, locked ? { throttle: 0, steer: 0 } : cmd, this.track, dt);
    }
  }

  private cast(c: Car, slot: number) {
    const s = c.names[slot];
    if (!s || this.over || this.paused || !this.started || this.countdown > 0 || c.finished !== null) return;
    if (s.cd > 0) return;
    s.cd = R.cooldown;
    const tag = `c${this.castSeq++}`;
    this.pending.set(tag, { car: c.id, slot });
    this.auth.submitCast({ aura: c.aura, spirit: s.spirit, facet: s.facet, request: B.request, target: { kind: 'self' }, tick: this.auth.currentTick(), tag });
  }

  // ---------- stepping ----------

  step(dt: number) {
    if (!this.started || this.paused || this.over) return;
    this.time += dt;
    if (this.countdown > 0) {
      this.countdown -= dt;
      if (this.countdown <= 0) this.events.push({ e: 'go' });
    }
    this.tickAcc += dt;
    while (this.tickAcc >= TICK_S) { this.tickAcc -= TICK_S; this.authorityTick(); }
    for (const c of this.cars) {
      for (const s of c.names) if (s) s.cd = Math.max(0, s.cd - dt);
      c.shield = Math.max(0, c.shield - dt);
      c.immune = Math.max(0, c.immune - dt);
      // strain is heat: the hotter your aura, the lower your top speed
      const a = this.auth.auraState(c.aura);
      const heat = a.capacity > 0 ? Math.min(1, a.strain / a.capacity) : 0;
      c.top = c.skill * (1 - R.heat * heat);
      if (c.ai) {
        c.budget = 0;
        const locked = this.countdown > 0;
        driveCar(c, locked ? { throttle: 0, steer: 0 } : autopilot(c, this.track, this.cars.filter((o) => o !== c)), this.track, dt);
        if (!locked && c.finished === null) this.aiCast(c, dt);
      } else {
        c.budget = Math.min(0.25, c.budget + dt);
      }
    }
    this.collideCars();
    this.laps();
    this.stepBolts(dt);
    this.stepMines(dt);
    this.stepSlicks(dt);
    this.stepDrones(dt);
    this.checkOver();
  }

  private authorityTick() {
    for (const r of this.auth.tick().casts) this.applyCast(r);
  }

  private applyCast(r: CastResult) {
    const pend = r.tag ? this.pending.get(r.tag) : undefined;
    if (r.tag) this.pending.delete(r.tag);
    const c = pend && this.cars[pend.car];
    if (!pend || !c) return;
    const s = c.names[pend.slot]!;
    if (r.refused) { this.events.push({ e: 'refused', car: c.id, slot: pend.slot, why: r.refused }); return; }
    s.lastBits = r.effective;
    const p = logPower(r.grant, TUNABLES.formEfficiency[s.form]!, R.powerScale);
    const el = s.element;
    this.events.push({ e: 'cast', car: c.id, slot: pend.slot, form: s.form, element: el, effective: r.effective, power: p, x: c.x, y: c.y });
    if (r.recoil) {
      const spin = Math.min(R.spin.max, 0.5 + r.recoil / 40);
      c.spin = Math.max(c.spin, spin);
      this.events.push({ e: 'backlash', car: c.id, spin });
    }
    const fx = Math.cos(c.a), fy = Math.sin(c.a);
    switch (s.form) {
      case FORM.bolt: {
        const target = this.ahead(c, F.bolt.seek);
        this.bolts.push({ id: this.nextId++, owner: c.id, x: c.x + fx * 20, y: c.y + fy * 20, vx: fx * F.bolt.speed + c.vx * 0.5, vy: fy * F.bolt.speed + c.vy * 0.5, target: target?.id ?? -1, power: p, life: F.bolt.life, element: el });
        break;
      }
      case FORM.ring: {
        const rad = F.ring.radius + p * 3;
        this.events.push({ e: 'ring', x: c.x, y: c.y, r: rad, element: el });
        for (const o of this.cars) {
          if (o === c) continue;
          const dx = o.x - c.x, dy = o.y - c.y, d = Math.hypot(dx, dy);
          if (d > rad || d === 0) continue;
          if (o.shield > 0) { this.absorb(o); continue; }
          const k = F.ring.push * p * (1 - d / rad * 0.5);
          o.vx += (dx / d) * k; o.vy += (dy / d) * k;
          this.addHit(c.id);
          this.events.push({ e: 'hit', car: o.id, by: c.id, x: o.x, y: o.y, spin: 0, element: el, what: 'shoved' });
        }
        break;
      }
      case FORM.ward:
        c.shield = Math.max(c.shield, F.ward.base + F.ward.perPower * p);
        this.events.push({ e: 'ring', x: c.x, y: c.y, r: 30, element: el, ward: true });
        break;
      case FORM.lance: {
        const L = F.lance.length, x2 = c.x + fx * L, y2 = c.y + fy * L;
        this.events.push({ e: 'beam', x: c.x, y: c.y, x2, y2, width: F.lance.width, element: el });
        for (const o of this.cars) {
          if (o === c) continue;
          const t = Math.max(0, Math.min(L, (o.x - c.x) * fx + (o.y - c.y) * fy));
          const px = c.x + fx * t, py = c.y + fy * t;
          if (Math.hypot(o.x - px, o.y - py) > F.lance.width / 2 + R.car.radius) continue;
          if (o.shield > 0) { this.absorb(o); continue; }
          o.slow = Math.max(o.slow, F.lance.slowBase + F.lance.slowPer * p);
          this.addHit(c.id);
          this.events.push({ e: 'slowed', car: o.id, x: o.x, y: o.y });
        }
        break;
      }
      case FORM.nova:
        this.mines.push({ id: this.nextId++, owner: c.id, x: c.x - fx * 28, y: c.y - fy * 28, arm: F.nova.arm, life: F.nova.life, power: p, element: el });
        break;
      case FORM.summon:
        this.drones.push({ id: this.nextId++, owner: c.id, x: c.x, y: c.y, life: F.summon.life, power: p, element: el });
        this.events.push({ e: 'spark', x: c.x, y: c.y, element: el });
        break;
      case FORM.hex:
        this.slicks.push({ id: this.nextId++, owner: c.id, x: c.x - fx * 34, y: c.y - fy * 34, r: F.hex.radiusBase + F.hex.radiusPer * p, life: F.hex.life, power: p, element: el });
        break;
      case FORM.blink: {
        const n = this.track.pts.length;
        const dist = Math.min(F.blink.max, F.blink.base + F.blink.perPower * p);
        const i = nearestIndex(this.track, c.x, c.y, c.hint);
        const j = (i + Math.round(dist / R.spacing)) % n;
        const q = this.track.pts[j]!, d = roadDir(this.track, j);
        // keep your line across the road, your speed, and face down the road
        const off = Math.max(-this.track.halfWidth * 0.6, Math.min(this.track.halfWidth * 0.6, (c.x - this.track.pts[i]!.x) * -roadDir(this.track, i).y + (c.y - this.track.pts[i]!.y) * roadDir(this.track, i).x));
        const x0 = c.x, y0 = c.y, sp = Math.max(0, c.vx * d.x + c.vy * d.y);
        c.x = q.x - d.y * off; c.y = q.y + d.x * off;
        c.a = Math.atan2(d.y, d.x);
        c.vx = d.x * sp; c.vy = d.y * sp;
        c.hint = j;
        // crossing the line by blinking still counts: lap bookkeeping sees the jump
        this.events.push({ e: 'blink', car: c.id, x: x0, y: y0, x2: c.x, y2: c.y, element: el });
        break;
      }
    }
  }

  private addHit(by: number) {
    this.hits.set(by, (this.hits.get(by) ?? 0) + 1);
  }

  private absorb(o: Car) {
    o.shield = 0;
    this.events.push({ e: 'absorb', car: o.id, x: o.x, y: o.y });
  }

  /** A spin-out, unless warded (the ward breaks) or just hit. */
  private hitCar(o: Car, by: number, power: number, element: number, what: string) {
    if (o.finished !== null) return;
    if (o.shield > 0) { this.absorb(o); return; }
    if (o.immune > 0) return;
    const spin = Math.min(R.spin.max, R.spin.base + R.spin.perPower * power);
    o.spin = Math.max(o.spin, spin);
    o.immune = spin + 0.4;
    if (by !== o.id) this.addHit(by);
    this.events.push({ e: 'hit', car: o.id, by, x: o.x, y: o.y, spin, element, what });
  }

  /** The nearest car ahead of c in the race, within reach. */
  private ahead(c: Car, reach: number): Car | null {
    const mine = this.score(c);
    let best: Car | null = null, bs = Infinity;
    for (const o of this.cars) {
      if (o === c || o.finished !== null) continue;
      const ds = this.score(o) - mine;
      if (ds <= 0) continue;
      const d = Math.hypot(o.x - c.x, o.y - c.y);
      if (d > reach) continue;
      if (ds < bs) { bs = ds; best = o; }
    }
    return best;
  }

  private behind(c: Car, reach: number): Car | null {
    const mine = this.score(c);
    for (const o of this.cars) {
      if (o === c || o.finished !== null) continue;
      if (this.score(o) < mine && Math.hypot(o.x - c.x, o.y - c.y) < reach) return o;
    }
    return null;
  }

  /** Race progress: laps and distance round, in samples. Finishers rank by when they finished. */
  private score(c: Car): number {
    const n = this.track.pts.length;
    if (c.finished !== null) return 1e9 - c.finished;
    return c.lap * n + c.prev;
  }

  private placeOf(c: Car): number {
    const s = this.score(c);
    return 1 + this.cars.filter((o) => o !== c && this.score(o) > s).length;
  }

  private laps() {
    const n = this.track.pts.length;
    for (const c of this.cars) {
      const i = nearestIndex(this.track, c.x, c.y, c.hint);
      c.hint = i;
      if (c.finished === null) {
        const jump = i - c.prev;
        if (jump < -n / 2) { // crossed the line forwards
          c.lap++;
          if (c.lap >= R.laps) {
            c.finished = ++this.finishers;
            c.finishT = this.time;
            this.firstFinish ??= this.time;
            this.events.push({ e: 'finish', car: c.id, place: c.finished });
          } else if (c.lap >= 1) this.events.push({ e: 'lap', car: c.id, lap: c.lap });
        } else if (jump > n / 2) c.lap--; // backwards over the line
      }
      c.prev = i;
    }
  }

  private collideCars() {
    const r2 = R.car.radius * 2;
    for (let i = 0; i < this.cars.length; i++) for (let j = i + 1; j < this.cars.length; j++) {
      const a = this.cars[i]!, b = this.cars[j]!;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d >= r2 || d === 0) continue;
      const nx = dx / d, ny = dy / d, push = (r2 - d) / 2;
      a.x -= nx * push; a.y -= ny * push;
      b.x += nx * push; b.y += ny * push;
      const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rel < 0) { // closing: trade the head-on part of their speeds (a light, bumpy exchange)
        const k = rel * 0.8;
        a.vx += nx * k; a.vy += ny * k;
        b.vx -= nx * k; b.vy -= ny * k;
      }
    }
  }

  private stepBolts(dt: number) {
    for (const b of this.bolts) {
      b.life -= dt;
      const t = this.cars[b.target];
      if (t && t.finished === null) { // seek: turn the velocity towards the target
        const want = Math.atan2(t.y - b.y, t.x - b.x), cur = Math.atan2(b.vy, b.vx);
        let da = Math.atan2(Math.sin(want - cur), Math.cos(want - cur));
        da = Math.max(-F.bolt.turn * dt, Math.min(F.bolt.turn * dt, da));
        const sp = Math.hypot(b.vx, b.vy);
        b.vx = Math.cos(cur + da) * sp; b.vy = Math.sin(cur + da) * sp;
      }
      b.x += b.vx * dt; b.y += b.vy * dt;
      for (const o of this.cars) {
        if (o.id === b.owner) continue;
        if (Math.hypot(o.x - b.x, o.y - b.y) < R.car.radius + 8) { this.hitCar(o, b.owner, b.power, b.element, 'struck'); b.life = 0; break; }
      }
      // off the road: it hits the dark
      if (b.life > 0) {
        const i = nearestIndex(this.track, b.x, b.y);
        const p = this.track.pts[i]!;
        if (Math.hypot(b.x - p.x, b.y - p.y) > this.track.halfWidth + 30) { b.life = 0; this.events.push({ e: 'spark', x: b.x, y: b.y, element: b.element }); }
      }
    }
    this.bolts = this.bolts.filter((b) => b.life > 0);
  }

  private stepMines(dt: number) {
    for (const m of this.mines) {
      m.arm -= dt; m.life -= dt;
      if (m.arm > 0) continue;
      if (!this.cars.some((o) => Math.hypot(o.x - m.x, o.y - m.y) < F.nova.trigger + R.car.radius)) continue;
      m.life = 0;
      this.events.push({ e: 'blast', x: m.x, y: m.y, r: F.nova.blast, element: m.element });
      for (const o of this.cars) if (Math.hypot(o.x - m.x, o.y - m.y) < F.nova.blast) this.hitCar(o, m.owner, m.power, m.element, 'blasted');
    }
    this.mines = this.mines.filter((m) => m.life > 0);
  }

  private stepSlicks(dt: number) {
    for (const s of this.slicks) {
      s.life -= dt;
      for (const o of this.cars) {
        if (o.finished !== null || Math.hypot(o.x - s.x, o.y - s.y) > s.r) continue;
        if (o.id === s.owner && s.life > F.hex.life - 1) continue; // it leaves your wheels clean
        if (o.slide <= 0) {
          if (o.shield > 0) { this.absorb(o); continue; }
          this.events.push({ e: 'slid', car: o.id, x: o.x, y: o.y });
          if (s.owner !== o.id) this.addHit(s.owner);
        }
        o.slide = Math.max(o.slide, F.hex.slideBase + F.hex.slidePer * s.power);
      }
    }
    this.slicks = this.slicks.filter((s) => s.life > 0);
  }

  private stepDrones(dt: number) {
    for (const d of this.drones) {
      d.life -= dt;
      // it hunts the leader (or, if its maker leads, whoever is second)
      const order = this.cars.filter((c) => c.finished === null).sort((a, b) => this.score(b) - this.score(a));
      const prey = order.find((c) => c.id !== d.owner);
      if (!prey) { d.life = 0; continue; }
      const dx = prey.x - d.x, dy = prey.y - d.y, l = Math.hypot(dx, dy) || 1;
      d.x += (dx / l) * F.summon.speed * dt; d.y += (dy / l) * F.summon.speed * dt;
      if (l < R.car.radius + 10) { this.hitCar(prey, d.owner, d.power, d.element, 'caught'); d.life = 0; }
    }
    this.drones = this.drones.filter((d) => d.life > 0);
  }

  /** Rivals speak their names when the moment suits the form. */
  private aiCast(c: Car, dt: number) {
    c.castT -= dt;
    if (c.castT > 0) return;
    const a = this.auth.auraState(c.aura);
    if (a.strain > a.capacity * 0.8) { c.castT = 0.8; return; }
    const ready = c.names.map((s, i) => ({ s, i })).filter((x) => x.s && x.s.cd <= 0);
    const fits = ready.find(({ s }) => {
      switch (s.form) {
        case FORM.bolt: case FORM.lance: case FORM.summon: return !!this.ahead(c, s.form === FORM.lance ? F.lance.length * 0.9 : F.bolt.seek);
        case FORM.nova: case FORM.hex: return !!this.behind(c, 400);
        case FORM.ring: return this.cars.some((o) => o !== c && Math.hypot(o.x - c.x, o.y - c.y) < F.ring.radius);
        case FORM.ward: return this.bolts.some((b) => b.target === c.id) || this.drones.length > 0;
        case FORM.blink: return Math.hypot(c.vx, c.vy) > 250;
        default: return false;
      }
    });
    if (!fits) { c.castT = 0.4; return; }
    c.castT = this.rand(R.rival.castMin, R.rival.castMax);
    this.cast(c, fits.i);
  }

  /** Each player's race ends on finishing, or when the podium fills without them, or after the grace. */
  private checkOver() {
    const closing = this.finishers >= R.podium || (this.firstFinish !== null && this.time - this.firstFinish > R.grace);
    for (const id of this.players.values()) {
      if (this.done.has(id)) continue;
      const c = this.cars[id]!;
      if (c.finished !== null) { this.done.set(id, c.finished <= R.podium ? 'won' : 'lost'); c.ai = true; } // a lap of honour on the autopilot
      else if (closing) this.done.set(id, 'lost');
    }
    if (this.players.size && [...this.players.values()].every((id) => this.done.has(id))) {
      this.over = this.done.get([...this.players.values()][0]!) ?? 'lost';
    }
  }

  private rand(a: number, b: number) {
    return a + this.random() * (b - a);
  }

  /** What happened since the last drain: shared by every player's view of the same moment. */
  drainEvents(): RacerEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** A single player's snapshot (the first player's, by default). */
  snapshot(you: string = [...this.players.keys()][0] ?? ''): RacerSnapshot {
    return this.viewFor(you, this.drainEvents());
  }

  /** One player's view: the shared race plus their own aura, names and acknowledgements. */
  viewFor(you: string, events: RacerEvent[]): RacerSnapshot {
    const id = this.players.get(you);
    const me = id === undefined ? undefined : this.cars[id];
    const a = me ? this.auth.auraState(me.aura) : { strain: 0, capacity: 1 };
    const order = [...this.cars].sort((x, y) => this.score(y) - this.score(x));
    return {
      t: 'rsnap', time: this.time, paused: this.paused, countdown: Math.max(0, this.countdown), laps: R.laps,
      lobby: this.lobby, players: this.players.size,
      ack: me?.ack ?? 0, strain: a.strain, capacity: a.capacity, hits: id === undefined ? 0 : this.hits.get(id) ?? 0,
      slots: (me?.names ?? []).map((s) => {
        if (!s) return null;
        const v = this.auth.poolInfo(me!.aura, s.spirit);
        return { lastBits: s.lastBits, vessel: v?.level ?? 0, cap: v?.cap ?? 1, ready: s.cd };
      }),
      cars: this.cars.map((c) => ({
        id: c.id, x: c.x, y: c.y, vx: c.vx, vy: c.vy, a: c.a, spin: c.spin, slide: c.slide, slow: c.slow, top: c.top,
        shield: c.shield, lap: c.lap, place: order.indexOf(c) + 1, finished: c.finished, element: c.element, player: c.player ? c.aura : null,
      })),
      bolts: this.bolts.map((b) => ({ id: b.id, x: b.x, y: b.y, element: b.element })),
      mines: this.mines.map((m) => ({ id: m.id, x: m.x, y: m.y, armed: m.arm <= 0, element: m.element })),
      slicks: this.slicks.map((s) => ({ id: s.id, x: s.x, y: s.y, r: s.r, life: s.life, element: s.element })),
      drones: this.drones.map((d) => ({ id: d.id, x: d.x, y: d.y, element: d.element })),
      events,
    };
  }
}

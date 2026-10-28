// A match, as numbers: no page, no drawing, so it runs the same in a browser and in Node
// (tools/bout.mjs plays matches headless to tune them). Side 0 is the commander, side 1
// the rival.
//
// A unit's ratings become the match's own numbers here, in body(). Those numbers never
// show: players see ratings, and what the ratings do.

import { AIDS } from './aids.js';
import { price } from './spec.js';

export function body(spec) {
  const s = spec.stats, has = new Set(spec.abilities);
  return {
    r: [7, 10, 14, 19, 26][spec.size - 1],
    hp: 20 + s.health * 22,
    armor: s.armor * 0.065,
    speed: 14 + s.speed * 10,
    // Up close hits harder: it has to get there. Not from the air, where nothing on the
    // ground can hit back up close anyway.
    dmg: (2 + s.damage * 4) * (s.range === 1 && !(has.has('wings') || has.has('rotors')) ? 1.8 : 1),
    cooldown: 1 / (0.31 + s.rate * 0.15),
    melee: s.range === 1,
    range: s.range === 1 ? 6 : 20 + s.range * 20,
    sight: 70 + s.sight * 20,
    flying: has.has('wings') || has.has('rotors'),
    has,
  };
}

const HQ = { r: 38, hp: 1600, armor: 0.15, dmg: 10, cooldown: 1.25, range: 140, sight: 260, speed: 0, melee: false, flying: false, has: new Set() };
const SUPPLY_CAP = 30;
const BAYS = 2;              // units a base can make at once
const INCOME = { base: 13, deposit: 6.5, gatherer: 5 };
const START_MATTER = 600;
const CAPTURE = { reach: 70, seconds: 3 };
const YOUNG = { size: 1, stats: { health: 2, armor: 1, speed: 7, damage: 2, rate: 5, range: 1, sight: 3 }, abilities: [] };

/** A seeded random, so a map's rocks are the same every time. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export class Sim {
  /** sides: [{ aid, roster: [design], income? }, ...]: a design is { name, spec, aid, art, ... }. */
  constructor(level, sides) {
    this.level = level;
    this.w = level.w; this.h = level.h;
    this.t = 0;
    this.nextId = 1;
    this.entities = [];
    this.effects = [];
    this.winner = null;
    this.stats = [{ made: 0, lost: 0, killed: 0 }, { made: 0, lost: 0, killed: 0 }];
    const homes = [{ x: 150, y: level.h - 150 }, { x: level.w - 150, y: 150 }];
    this.sides = sides.map((s, i) => ({
      id: i, aid: s.aid, income: s.income ?? 1, matter: START_MATTER,
      roster: s.roster.map((d) => ({ ...d, priced: price(d.spec, d.aid), body: body(d.spec) })),
      queue: [], bays: [], rally: null, home: homes[i],
    }));
    this.hqs = this.sides.map((s) => this.add({ kind: 'hq', side: s.id, ...HQ, x: s.home.x, y: s.home.y, name: 'base' }));
    this.deposits = level.deposits.map(([x, y], i) => ({ id: i, x, y, owner: null, pull: 0, toward: null }));
    // Rocks: scattered by the map's seed, clear of the bases and the deposits.
    const rand = rng(level.seed), keepClear = [...homes, ...this.deposits];
    this.rocks = [];
    for (let tries = 0; this.rocks.length < Math.round(level.w * level.h / 90000) && tries < 400; tries++) {
      const rock = { x: 80 + rand() * (level.w - 160), y: 80 + rand() * (level.h - 160), r: 22 + rand() * 38 };
      if (keepClear.every((p) => dist(p, rock) > rock.r + 120) && this.rocks.every((o) => dist(o, rock) > o.r + rock.r + 60)) this.rocks.push(rock);
    }
  }

  add(e) {
    const ent = { id: this.nextId++, cool: 0, order: { kind: 'idle' }, target: null, still: 0, reveal: 0, poison: null, shield: 0, quiet: 0, leap: 0, sieged: false, siegeT: 0, face: 1, ...e };
    ent.maxHp = ent.hp;
    if (ent.has.has('shield')) ent.shield = ent.maxShield = ent.hp * 0.4;
    this.entities.push(ent);
    return ent;
  }

  spawn(side, design, near, young = false) {
    const b = young ? body(YOUNG) : design.body;
    const at = near ?? this.hqs[side];
    // From the base, a new unit comes out on the side facing where it's headed, so it never
    // has to find its way around the base first.
    const toward = near ? null : this.sides[side].rally ?? { x: this.w / 2, y: this.h / 2 };
    const a = toward ? Math.atan2(toward.y - at.y, toward.x - at.x) + (Math.random() - 0.5) * 1.2 : Math.random() * Math.PI * 2;
    return this.add({ kind: 'unit', side, design, young, name: young ? `${design.name} young` : design.name, ...b, has: new Set(b.has),
      x: at.x + Math.cos(a) * ((at.r ?? 0) + b.r + 6), y: at.y + Math.sin(a) * ((at.r ?? 0) + b.r + 6) });
  }

  units(side) { return this.entities.filter((e) => e.kind === 'unit' && (side == null || e.side === side)); }

  supply(side) {
    const s = this.sides[side];
    return this.units(side).reduce((n, u) => n + (u.young ? 0 : u.design.priced.supply), 0) + [...s.queue, ...s.bays.map((b) => b.design)].reduce((n, d) => n + d.priced.supply, 0);
  }

  // ---------- what the sides may do ----------

  /** Start making one of a side's roster designs, if it can pay for it and has room. */
  produce(side, index) {
    const s = this.sides[side], d = s.roster[index];
    if (!d || s.matter < d.priced.cost || this.supply(side) + d.priced.supply > SUPPLY_CAP || s.queue.length >= 6) return false;
    s.matter -= d.priced.cost;
    s.queue.push(d);
    return true;
  }

  cancel(side, queueIndex) {
    const s = this.sides[side], [d] = s.queue.splice(queueIndex, 1);
    if (d) s.matter += d.priced.cost;
  }

  /** Orders: move (go, ignoring fights), fight (go, fighting what's met), attack (that one), stop. */
  command(side, ids, order) {
    for (const e of this.entities) if (ids.includes(e.id) && e.side === side && e.kind === 'unit') { e.order = { ...order }; e.target = order.kind === 'attack' ? order.target : null; }
  }

  setRally(side, x, y) { this.sides[side].rally = { x, y }; }

  // ---------- seeing ----------

  hidden(e) { return (e.has.has('burrow') || e.has.has('cloak')) && e.still >= 1.5 && e.reveal <= 0; }

  /** Whether a side can see an entity: it's in some sight of theirs, and not hidden (a hidden unit shows up only right next to them). */
  sees(side, e) {
    if (e.side === side) return true;
    const hide = this.hidden(e);
    for (const o of this.entities) if (o.side === side && dist(o, e) <= (hide ? o.r + e.r + 30 : o.sight)) return true;
    return false;
  }

  canHit(a, b) { return !(a.melee && b.flying); }

  // ---------- a tick ----------

  step(dt) {
    if (this.winner != null) return;
    this.t += dt;
    for (const ef of this.effects) ef.ttl -= dt;
    this.effects = this.effects.filter((ef) => ef.ttl > 0);
    this.seen = [0, 1].map((side) => new Set(this.entities.filter((e) => this.sees(side, e)).map((e) => e.id)));

    this.economy(dt);
    for (const e of this.entities) if (e.hp > 0) this.act(e, dt);
    this.separate();
    this.bury();
    for (const s of this.sides) if (this.hqs[s.id].hp <= 0) this.winner = 1 - s.id;
  }

  economy(dt) {
    const near = (d, side) => this.units(side).filter((u) => dist(u, d) <= CAPTURE.reach);
    for (const d of this.deposits) {
      const here = [near(d, 0).length, near(d, 1).length];
      const holder = here[0] && !here[1] ? 0 : here[1] && !here[0] ? 1 : null;
      if (holder == null || holder === d.owner) { d.pull = holder === d.owner ? 0 : d.pull; continue; }
      if (d.toward !== holder) { d.toward = holder; d.pull = 0; }
      d.pull += dt;
      if (d.pull >= CAPTURE.seconds) { d.owner = holder; d.pull = 0; d.toward = null; }
    }
    for (const s of this.sides) {
      const owned = this.deposits.filter((d) => d.owner === s.id);
      const gatherers = owned.reduce((n, d) => n + Math.min(2, near(d, s.id).filter((u) => u.has.has('forage') || u.has.has('harvest')).length), 0);
      s.rate = (INCOME.base + INCOME.deposit * owned.length + INCOME.gatherer * gatherers) * s.income;
      s.matter += s.rate * dt;
      // The bays: whatever is first in line starts as soon as a bay is free.
      while (s.bays.length < BAYS && s.queue.length) { const d = s.queue.shift(); s.bays.push({ design: d, left: d.priced.seconds }); }
      for (const b of s.bays) b.left -= dt;
      for (const b of s.bays.filter((x) => x.left <= 0)) {
        const u = this.spawn(s.id, b.design);
        this.stats[s.id].made++;
        if (s.rally) u.order = { kind: 'fight', x: s.rally.x, y: s.rally.y };
      }
      s.bays = s.bays.filter((x) => x.left > 0);
    }
  }

  act(e, dt) {
    e.cool -= dt; e.reveal -= dt; e.leap -= dt; e.quiet += dt;
    if (e.poison) { this.hurt(e, e.poison.dps * dt, null, true); if ((e.poison.left -= dt) <= 0) e.poison = null; }
    if (e.has.has('regenerate')) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.015 * dt);
    if (e.maxShield && e.quiet > 4) e.shield = Math.min(e.maxShield, e.shield + e.maxShield * 0.1 * dt);
    if (e.has.has('mend') || e.has.has('repair')) {
      // Each ally is tended once a moment, however many tend it: healers don't add up.
      for (const o of this.entities) if (o.side === e.side && o.kind === 'unit' && o !== e && o.mended !== this.t && dist(o, e) < 90 && o.hp < o.maxHp) { o.hp = Math.min(o.maxHp, o.hp + 3 * dt); o.mended = this.t; }
    }
    if (e.kind === 'hq') return this.fightFrom(e, dt, this.nearestEnemy(e, e.range + e.r));

    // Pick what to fight: what it was told to attack, or, unless it's only moving, the
    // nearest enemy it can see.
    let t = e.target;
    if (t && (t.hp <= 0 || !this.seen[e.side].has(t.id))) { t = e.target = null; if (e.order.kind === 'attack') e.order = { kind: 'idle' }; }
    if (!t && e.order.kind !== 'move') t = this.nearestEnemy(e, e.sight);
    if (t && e.order.kind !== 'attack' && dist(e, t) > e.sight * 1.5) t = null;

    if (t) {
      e.target = t;
      const reach = this.reachOf(e) + e.r + t.r;
      const d = dist(e, t);
      if (e.has.has('leap') && !e.flying && e.leap <= 0 && d > reach && d < reach + 120) {
        const k = (d - reach + 2) / d;
        e.x += (t.x - e.x) * k; e.y += (t.y - e.y) * k; e.leap = 6; e.still = 0;
        this.effects.push({ kind: 'leap', x: e.x, y: e.y, ttl: 0.4, side: e.side });
      }
      if (dist(e, t) <= reach) return this.fightFrom(e, dt, t);
      // Siege needs a target farther than it can reach unlocked: it locks down if the target
      // is within its locked reach, and otherwise packs up and walks.
      if (e.has.has('siege') && !e.sieged && d <= e.range * 1.8 + e.r + t.r) return this.lockDown(e, dt);
      return this.walk(e, t, dt);
    }
    e.target = null;
    const o = e.order;
    if (o.kind === 'move' || o.kind === 'fight') {
      if (Math.hypot(o.x - e.x, o.y - e.y) < e.r + 4) e.order = { kind: 'idle' };
      else return this.walk(e, o, dt);
    }
    e.still += dt;
  }

  reachOf(e) { return e.sieged ? e.range * 1.8 : e.range; }

  lockDown(e, dt) {
    e.still += dt;
    if ((e.siegeT += dt) >= 1) { e.sieged = true; e.siegeT = 0; }
  }

  walk(e, to, dt) {
    if (e.sieged) { e.siegeT += dt; if (e.siegeT < 1) return; e.sieged = false; e.siegeT = 0; }
    if (!e.flying) { this.unstick(e); to = this.around(e, to); }
    const dx = to.x - e.x, dy = to.y - e.y, d = Math.hypot(dx, dy);
    if (d < 0.5) return;
    const step = Math.min(d, e.speed * dt);
    e.x += (dx / d) * step; e.y += (dy / d) * step;
    e.walked = (e.walked ?? 0) + step;   // how far it has walked: its stride keeps time with this
    e.moved = this.t;
    if (Math.abs(dx) > 1) e.face = dx > 0 ? 1 : -1;
    e.still = 0;
  }

  /** Where to head for, to get to `to` without walking into a rock: past the edge of the nearest one in the way. */
  around(e, to) {
    const dx = to.x - e.x, dy = to.y - e.y, len = Math.hypot(dx, dy);
    if (len < 1) return to;
    const ux = dx / len, uy = dy / len;
    let block = null, along = Infinity;
    for (const o of [...this.rocks, ...this.hqs]) {
      if (o === to || o.x === to.x && o.y === to.y) continue;
      const t = (o.x - e.x) * ux + (o.y - e.y) * uy;            // how far along the way it sits
      if (t < 0 || t > len + o.r) continue;
      const off = (o.x - e.x) * uy - (o.y - e.y) * ux;          // how far to the side
      if (Math.abs(off) < o.r + e.r + 4 && t < along) { along = t; block = { o, off }; }
    }
    if (!block) return to;
    // Pass on the side it's already leaning toward, just clear of the edge. The unit's own
    // side is remembered per rock, so it doesn't dither when the leaning flips.
    const { o, off } = block;
    const clear = o.r + e.r + 10, past = (s) => ({ x: o.x + uy * s * clear, y: o.y - ux * s * clear });   // (uy, -ux) is the side `off` measures toward
    // A way past that's off the map or into another rock is no way: take the other side.
    const open = (p) => p.x > e.r && p.y > e.r && p.x < this.w - e.r && p.y < this.h - e.r
      && [...this.rocks, ...this.hqs].every((q) => q === o || Math.hypot(q.x - p.x, q.y - p.y) > q.r + e.r);
    if (e.passing?.rock !== o) {
      const lean = off >= 0 ? -1 : 1;
      e.passing = { rock: o, side: open(past(lean)) || !open(past(-lean)) ? lean : -lean };
    }
    const way = past(e.passing.side), dd = Math.hypot(e.x - o.x, e.y - o.y) || 0.01;
    // Up against it, the straight line to the way past would cut into it: walk along its edge
    // instead, toward that side, leaning a little away.
    if (dd < o.r + e.r + 14) {
      const rx = (e.x - o.x) / dd, ry = (e.y - o.y) / dd;
      let tx = -ry, ty = rx;
      if ((way.x - e.x) * tx + (way.y - e.y) * ty < 0) { tx = -tx; ty = -ty; }
      return { x: e.x + (tx * 0.9 + rx * 0.35) * 30, y: e.y + (ty * 0.9 + ry * 0.35) * 30 };
    }
    return way;
  }

  /** A unit that's trying to walk and has barely moved in a while is wedged: it tries the
   *  other way round what's in its way. (Not "hasn't come closer": going round a big rock
   *  can take a while without getting any closer.) */
  unstick(e) {
    if (!e.progress || this.t - e.progress.t > 1.5) {
      if (e.progress && e.passing && Math.hypot(e.x - e.progress.x, e.y - e.progress.y) < Math.max(8, e.speed * 0.3)) e.passing.side *= -1;
      e.progress = { x: e.x, y: e.y, t: this.t };
    }
  }

  nearestEnemy(e, within) {
    let best = null, bd = Infinity;
    for (const o of this.entities) {
      if (o.side === e.side || o.hp <= 0 || !this.seen[e.side].has(o.id) || !this.canHit(e, o)) continue;
      const d = dist(e, o) - o.r;
      // Units first: a base is only picked when no unit is in reach.
      const score = d + (o.kind === 'hq' ? 400 : 0);
      if (d <= within && score < bd) { bd = score; best = o; }
    }
    return best;
  }

  fightFrom(e, dt, t) {
    if (e.kind === 'unit') e.still += dt;
    if (!t) return;
    if (t.x !== e.x) e.face = t.x > e.x ? 1 : -1;
    if (e.cool > 0) return;
    e.cool = e.cooldown;
    e.swung = this.t;   // when it last attacked, and at what: for drawing a lunge or a recoil
    e.swungAt = { x: t.x, y: t.y };
    const ambush = this.hidden(e) && e.has.has('burrow');
    e.reveal = 4;   // longer than the slowest pause between attacks: once it strikes, it stays seen while it fights
    let dmg = e.dmg * (ambush ? 2 : 1);
    this.hurt(t, dmg, e);
    if (e.has.has('venom') && t.kind === 'unit') {
      // Doses add up, to three's worth.
      const dose = (e.dmg * 0.4) / 3;
      t.poison = { dps: Math.min(dose * 3, (t.poison?.dps ?? 0) + dose), left: 3, from: e.side };
    }
    if (e.has.has('blast')) for (const o of this.entities) if (o.side !== e.side && o !== t && o.hp > 0 && dist(o, t) < 45 && this.canHit(e, o)) this.hurt(o, dmg * 0.5, e);
    this.effects.push({ kind: e.melee ? 'bite' : 'shot', x0: e.x, y0: e.y, x: t.x, y: t.y, ttl: e.melee ? 0.15 : 0.12, side: e.side, blast: e.has.has('blast'), big: ambush,
      lab: e.kind === 'hq' ? 'base' : e.design.aid, venom: e.has.has('venom'), r: e.r, at: this.t });
  }

  hurt(t, amount, from, pure = false) {
    let a = pure ? amount : amount * (1 - t.armor);
    t.quiet = 0;
    if (!pure) t.hit = this.t;
    if (t.shield > 0) { const soak = Math.min(t.shield, a); t.shield -= soak; a -= soak; }
    t.hp -= a;
    if (t.hp <= 0 && !t.dead) {
      t.dead = true;
      if (from || t.poison) this.stats[from?.side ?? t.poison.from].killed += t.kind === 'unit' ? 1 : 0;
    }
  }

  bury() {
    for (const e of this.entities.filter((x) => x.hp <= 0 && x.kind === 'unit')) {
      this.stats[e.side].lost++;
      this.effects.push({ kind: 'death', x: e.x, y: e.y, r: e.r, ttl: 0.6, side: e.side, at: this.t, art: e.design.art, face: e.face, flying: e.flying, young: e.young, lab: e.design.aid });
      if (e.has.has('brood') && !e.young) for (let i = 0; i < 2; i++) this.spawn(e.side, e.design, { x: e.x, y: e.y, r: 0 }, true).order = { ...e.order };
    }
    this.entities = this.entities.filter((x) => x.hp > 0 || x.kind === 'hq');
  }

  /** Push overlapping bodies apart (fliers only bump fliers), and out of rocks and the map's edge. */
  separate() {
    const us = this.entities.filter((e) => e.kind === 'unit');
    for (let i = 0; i < us.length; i++) {
      const a = us[i];
      for (let j = i + 1; j < us.length; j++) {
        const b = us[j];
        if (a.flying !== b.flying) continue;
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01, min = a.r + b.r;
        if (d >= min) continue;
        const push = (min - d) / 2, ax = a.sieged ? 0 : 1, bx = b.sieged ? 0 : 1;
        a.x -= (dx / d) * push * ax; a.y -= (dy / d) * push * ax;
        b.x += (dx / d) * push * bx; b.y += (dy / d) * push * bx;
      }
      if (!a.flying) for (const o of [...this.rocks, ...this.hqs]) {
        const dx = a.x - o.x, dy = a.y - o.y, d = Math.hypot(dx, dy) || 0.01, min = a.r + o.r;
        if (d < min) {
          // Out of the rock, and a little around it, toward where it's headed.
          a.x = o.x + (dx / d) * min; a.y = o.y + (dy / d) * min;
          const goal = a.target ?? a.order;
          if (goal?.x != null && a.passing?.rock !== o) { const side = Math.sign((goal.x - o.x) * dy - (goal.y - o.y) * dx) || 1; a.x += (-dy / d) * side * 1.5; a.y += (dx / d) * side * 1.5; }
        }
      }
      a.x = Math.max(a.r, Math.min(this.w - a.r, a.x)); a.y = Math.max(a.r, Math.min(this.h - a.r, a.y));
    }
  }
}

export { SUPPLY_CAP, AIDS };

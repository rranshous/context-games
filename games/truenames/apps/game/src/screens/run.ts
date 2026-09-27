// A walk into the dark: one arena, five waves, shrines that scry while you fight.
import type { App, Screen } from '../main.ts';
import { frag, esc } from '../dom.ts';
import { BALANCE as B, descentName, SLOTS } from '../balance.ts';
import {
  ELEMENT_COLOR, ASPECTS, FORMS, ANCIENTS, HEARTH_GOD, TICK_MS, WARDEN_WELLS,
  spiritName, magnitudeTitle, addressOf, truths,
} from '../lore.ts';
import { persist, spiritOf } from '../save.ts';
import { scanKey } from '../services.ts';
import { LocalAuthority, castCap, spiritStats, TUNABLES } from '@truenames/authority';
import type { CastResult, TargetSpec } from '@truenames/protocol';
import { cellsBelow, spiritAt, target, type Spirit } from '@truenames/universe';
import { sanctumScreen } from './sanctum.ts';
import { sigilCanvas, sigilURL } from '../sigil.ts';
import * as sfx from '../audio.ts';
import { HELP, showTip, hideTip } from '../help.ts';

type EnemyKind = 'husk' | 'runner' | 'brute' | 'shaman' | 'warden';

interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number; y: number;
  hp: number; maxHp: number;
  r: number; speed: number; dmg: number;
  cd: number;
  hexDps: number; hexT: number;
  kx: number; ky: number; // knockback velocity
  flash: number;
  // shamans
  aura?: string;
  cell?: string;
  castT?: number;
  strafe?: number;
}

interface Ally { x: number; y: number; hp: number; life: number; hit: number; cd: number; color: string }
interface Proj { x: number; y: number; vx: number; vy: number; r: number; dmg: number; life: number; enemy: boolean; color: string }
interface Nova { x: number; y: number; t: number; dmg: number; r: number; color: string; element: number; enemy?: boolean; max?: number }
interface Fx { kind: 'beam' | 'ring' | 'burst' | 'blink'; x: number; y: number; x2?: number; y2?: number; r?: number; t: number; max: number; color: string }
interface Particle { x: number; y: number; vx: number; vy: number; t: number; max: number; color: string; size: number }
interface Floater { x: number; y: number; text: string; color: string; t: number; size: number }
interface Pillar { x: number; y: number; r: number }
interface Shrine { x: number; y: number; prefix: string; element: number; depth: number; state: 'idle' | 'waking' | 'scrying' | 'spent'; wake: number; start: bigint; budget: bigint; found: number }

interface Slot {
  cell: string;
  spirit: Spirit;
  form: number;
  color: string;
  name: string;
  lastBits: number | null;
  lastGrant: number;
  flash: number;
  thin: number;
  generosity: number;
}

// spiritAt costs several BigInt Poseidons: never call it per frame.
const spiritCache = new Map<string, Spirit>();
function spiritOfCell(cell: string): Spirit {
  let sp = spiritCache.get(cell);
  if (!sp) { sp = spiritAt(cell)!; spiritCache.set(cell, sp); }
  return sp;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const dist2 = (ax: number, ay: number, bx: number, by: number) => (ax - bx) ** 2 + (ay - by) ** 2;

export function runScreen(app: App, level = app.save.lastDescent): Screen {
  const S = app.services;
  const D = B.descent;
  const hpMult = D.hpMult ** level, dmgMult = D.dmgMult ** level;
  const save = app.save;
  const me = save.aura!.pub;
  const auth = new LocalAuthority(undefined, (Math.random() * 2 ** 31) | 0);
  auth.registerAura(me);
  for (const rec of Object.values(save.names)) auth.submitName(rec.claim);

  const slots: (Slot | null)[] = save.loadout.slice(0, SLOTS.length).map((cell) => {
    if (!cell || !S.learned(cell)) return null;
    const sp = spiritOf(save, cell) ?? spiritAt(cell);
    if (!sp) return null;
    return { cell, spirit: sp, form: sp.traits.form, color: ELEMENT_COLOR[sp.element]!, name: spiritName(sp), lastBits: null, lastGrant: 0, flash: 0, thin: 0, generosity: spiritStats(sp).generosity };
  });

  // ---------- world ----------
  const W = B.arena.w, H = B.arena.h;
  const player = { x: W / 2, y: H / 2, hp: B.player.hp, ward: 0, invuln: 0, hurt: 0 };
  const pillars: Pillar[] = [];
  for (let i = 0; i < 14; i++) {
    const p = { x: rand(150, W - 150), y: rand(150, H - 150), r: rand(22, 48) };
    if (dist2(p.x, p.y, W / 2, H / 2) < 260 ** 2) continue;
    if (pillars.some((q) => dist2(p.x, p.y, q.x, q.y) < (p.r + q.r + 120) ** 2)) continue;
    pillars.push(p);
  }
  const shrines: Shrine[] = [];
  for (let i = 0; i < B.shrines; i++) {
    const element = i === 0 ? save.aura!.element : (Math.random() * 8) | 0;
    const aspect = (Math.random() * 8) | 0;
    let x = 0, y = 0;
    for (let k = 0; k < 50; k++) {
      x = rand(200, W - 200); y = rand(200, H - 200);
      if (dist2(x, y, W / 2, H / 2) > 400 ** 2 && !shrines.some((s) => dist2(x, y, s.x, s.y) < 600 ** 2) && !pillars.some((p) => dist2(x, y, p.x, p.y) < (p.r + 110) ** 2)) break;
    }
    shrines.push({ x, y, prefix: `${element}${aspect}`, element, depth: 0, state: 'idle', wake: 0, start: 0n, budget: 0n, found: 0 });
  }

  const tint = ELEMENT_COLOR[(save.aura!.element + level * 3) % 8]!;
  const motes = Array.from({ length: 220 }, (_, i) => ({ x: rand(0, W), y: rand(0, H), v: rand(6, 22), d: String(i % 8) }));
  let enemies: Enemy[] = [];
  let allies: Ally[] = [];
  let projs: Proj[] = [];
  let novas: Nova[] = [];
  let fx: Fx[] = [];
  let parts: Particle[] = [];
  let floaters: Floater[] = [];
  let nextId = 1;
  let shake = 0;

  // ---------- waves ----------
  let wave = 0;
  let spawnQueue: EnemyKind[] = [];
  let spawnT = 0;
  let breather = 2.5;
  let banner: { text: string; sub: string; t: number } | null = { text: descentName(level).toUpperCase(), sub: level === 0 ? 'Wave 1. They come for the light in you.' : `Descent ${level + 1}. The dark is thicker here.`, t: 3 };
  let over: null | 'won' | 'lost' = null;
  let kills = 0, finds = 0;
  let warden: Enemy | null = null;
  let paused = false;

  function startWave() {
    const w = B.waves[wave]!;
    spawnQueue = [];
    for (const [k, n] of Object.entries(w)) for (let i = 0; i < Math.round(n * (1 + D.countMult * level)); i++) spawnQueue.push(k as EnemyKind);
    for (let i = spawnQueue.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [spawnQueue[i], spawnQueue[j]] = [spawnQueue[j]!, spawnQueue[i]!]; }
    if (wave === B.waves.length - 1) spawnQueue.splice(Math.floor(spawnQueue.length / 2), 0, 'warden');
    spawnT = 0;
  }

  function spawn(kind: EnemyKind) {
    const d = B.enemies[kind];
    let x = 0, y = 0;
    for (let k = 0; k < 30; k++) {
      const side = (Math.random() * 4) | 0;
      x = side === 0 ? 30 : side === 1 ? W - 30 : rand(30, W - 30);
      y = side === 2 ? 30 : side === 3 ? H - 30 : rand(30, H - 30);
      if (dist2(x, y, player.x, player.y) > 550 ** 2) break;
    }
    const e: Enemy = { id: nextId++, kind, x, y, hp: d.hp * hpMult, maxHp: d.hp * hpMult, r: d.radius, speed: d.speed * rand(0.9, 1.1), dmg: d.dmg * dmgMult, cd: 0, hexDps: 0, hexT: 0, kx: 0, ky: 0, flash: 0 };
    if (kind === 'warden') {
      // The mightiest ancients serve the Warden; it drinks from the same wells you might.
      e.aura = `npc:warden:${e.id}`;
      e.cell = WARDEN_WELLS[(Math.random() * WARDEN_WELLS.length) | 0]!;
      auth.grantSyntheticName(e.aura, e.cell, TUNABLES.capRef + B.warden.bits + D.shamanBits * level + 4);
      e.castT = 2;
      e.strafe = 0;
      warden = e;
      banner = { text: `THE WARDEN OF ${descentName(level).toUpperCase()}`, sub: `It speaks the name of ${spiritName(spiritOfCell(e.cell))}.`, t: 3.5 };
      sfx.sfxWarden();
    }
    if (kind === 'shaman') {
      e.aura = `npc:shaman:${e.id}`;
      e.cell = Math.random() < B.shaman.hearthChance ? HEARTH_GOD : ANCIENTS[(Math.random() * ANCIENTS.length) | 0]!;
      const strength = TUNABLES.capRef + wave + D.shamanBits * level + ((Math.random() * 3) | 0);
      auth.grantSyntheticName(e.aura, e.cell, strength);
      e.castT = rand(1, 2);
      e.strafe = Math.random() < 0.5 ? 1 : -1;
    }
    enemies.push(e);
    burst(x, y, '#554a66', 10);
  }

  // ---------- input ----------
  const keys = new Set<string>();
  const mouse = { sx: 0, sy: 0 };
  const cam = { x: player.x, y: player.y };
  let viewW = window.innerWidth, viewH = window.innerHeight;
  const toWorld = (sx: number, sy: number) => ({ x: sx - viewW / 2 + cam.x, y: sy - viewH / 2 + cam.y });

  let castSeq = 0;
  const pending = new Map<string, { slot: number; aimX: number; aimY: number }>();

  function cast(i: number) {
    const s = slots[i];
    if (!s || over || paused) return;
    const aim = toWorld(mouse.sx, mouse.sy);
    const tag = `c${castSeq++}`;
    pending.set(tag, { slot: i, aimX: aim.x, aimY: aim.y });
    const tgt: TargetSpec = [1, 2, 5].includes(s.form) ? { kind: 'self' } : { kind: 'point', x: aim.x, y: aim.y };
    auth.submitCast({ aura: me, cell: s.cell, request: B.request, target: tgt, tick: auth.currentTick(), tag });
    s.flash = 0.25;
    // gathering spark: the result lands on the next tick
    for (let k = 0; k < 4; k++) parts.push({ x: player.x, y: player.y, vx: rand(-40, 40), vy: rand(-40, 40), t: 0, max: 0.25, color: s.color, size: 2 });
  }

  const onKey = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (e.type === 'keydown') {
      if (k === 'escape') { togglePause(); return; }
      const slotForKey = SLOTS.findIndex((s) => s.key === k);
      if (!e.repeat && slotForKey >= 0) cast(slotForKey);
      keys.add(k);
    } else keys.delete(k);
  };
  const onMouseMove = (e: MouseEvent) => { mouse.sx = e.clientX; mouse.sy = e.clientY; };
  const onMouseDown = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('.overlay')) return;
    const slotForButton = SLOTS.findIndex((s) => s.button === e.button);
    if (slotForButton >= 0) cast(slotForButton);
  };
  const onContext = (e: MouseEvent) => e.preventDefault();
  const onBlur = () => keys.clear();

  // ---------- effects of casts ----------
  function hurtEnemy(e: Enemy, dmg: number, color: string) {
    if (dmg <= 0 || e.hp <= 0) return;
    e.hp -= dmg;
    e.flash = 0.12;
    if (hitSoundT <= 0) { sfx.sfxHit(); hitSoundT = 0.05; }
    floaters.push({ x: e.x + rand(-6, 6), y: e.y - e.r - 6, text: dmg >= 10 ? dmg.toFixed(0) : dmg.toFixed(1), color, t: 0, size: 12 + Math.min(10, dmg / 4) });
    if (e.hp <= 0) {
      kills++;
      sfx.sfxKill();
      burst(e.x, e.y, B.enemies[e.kind].color, 18);
      burst(e.x, e.y, color, 10);
      if (e.aura) auth.forgetAura(e.aura);
    }
  }

  function hurtPlayer(dmg: number, why?: string) {
    if (over || player.invuln > 0 || dmg <= 0) return;
    const absorbed = Math.min(player.ward, dmg);
    player.ward -= absorbed;
    dmg -= absorbed;
    if (absorbed > 0) burst(player.x, player.y, '#cfe8ff', 4);
    if (dmg <= 0) return;
    player.hp -= dmg;
    player.hurt = 0.25;
    sfx.sfxHurt();
    shake = Math.min(12, shake + dmg * 0.6);
    if (why) floaters.push({ x: player.x, y: player.y - 30, text: why, color: '#ff7a6b', t: 0, size: 15 });
    if (player.hp <= 0) end('lost');
  }

  function applyPlayerCast(r: CastResult) {
    const p = r.tag ? pending.get(r.tag) : undefined;
    if (r.tag) pending.delete(r.tag);
    if (!p) return;
    const s = slots[p.slot]!;
    if (r.refused) {
      floaters.push({ x: player.x, y: player.y - 26, text: 'unheard', color: '#9c8f74', t: 0, size: 13 });
      return;
    }
    s.lastBits = r.effective;
    s.lastGrant = r.grant;
    const want = Math.min(B.request, castCap(r.effective, s.generosity));
    s.thin = r.grant < want * 0.7 ? 1.2 : 0;
    const eff = TUNABLES.formEfficiency[s.form]!;
    const effect = r.grant * eff * B.effectScale;
    floaters.push({ x: player.x - 60 + p.slot * 24, y: player.y - 26 - (p.slot % 2) * 12, text: `${r.effective.toFixed(1)}`, color: s.color, t: 0, size: 13 });
    if (s.thin) floaters.push({ x: player.x, y: player.y - 44, text: 'the well runs thin', color: '#9c8f74', t: 0, size: 12 });
    sfx.sfxCast(s.form, s.spirit.element, effect / 30);
    if (r.recoil) {
      sfx.sfxBacklash();
      hurtPlayer(r.recoil, 'BACKLASH');
      burst(player.x, player.y, '#ff5040', 20);
    }
    const dx = p.aimX - player.x, dy = p.aimY - player.y;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d, uy = dy / d;
    const color = s.color;
    switch (s.form) {
      case 0: { // bolt
        const f = B.forms.bolt;
        projs.push({ x: player.x + ux * 16, y: player.y + uy * 16, vx: ux * f.speed, vy: uy * f.speed, r: f.radius + Math.min(8, effect / 6), dmg: effect, life: f.life, enemy: false, color });
        break;
      }
      case 1: { // ring
        const f = B.forms.ring;
        fx.push({ kind: 'ring', x: player.x, y: player.y, r: f.radius, t: 0, max: 0.4, color });
        for (const e of enemies) {
          const dd = Math.sqrt(dist2(e.x, e.y, player.x, player.y));
          if (dd < f.radius + e.r) {
            hurtEnemy(e, effect, color);
            const k = f.knock / Math.max(1, dd);
            e.kx += (e.x - player.x) * k * 4; e.ky += (e.y - player.y) * k * 4;
          }
        }
        break;
      }
      case 2: { // ward
        player.ward = Math.min(B.player.wardMax, player.ward + effect * B.forms.ward.mult);
        fx.push({ kind: 'ring', x: player.x, y: player.y, r: 30, t: 0, max: 0.5, color: '#cfe8ff' });
        break;
      }
      case 3: { // lance
        const f = B.forms.lance;
        const x2 = player.x + ux * f.length, y2 = player.y + uy * f.length;
        fx.push({ kind: 'beam', x: player.x, y: player.y, x2, y2, t: 0, max: 0.3, color, r: f.width });
        for (const e of enemies) {
          const t = Math.max(0, Math.min(f.length, (e.x - player.x) * ux + (e.y - player.y) * uy));
          const px = player.x + ux * t, py = player.y + uy * t;
          if (dist2(px, py, e.x, e.y) < (e.r + f.width / 2) ** 2) hurtEnemy(e, effect, color);
        }
        break;
      }
      case 4: { // nova
        const f = B.forms.nova;
        novas.push({ x: p.aimX, y: p.aimY, t: f.delay, dmg: effect, r: f.radius, color, element: s.spirit.element });
        break;
      }
      case 5: { // summon
        const f = B.forms.summon;
        allies.push({ x: player.x + rand(-20, 20), y: player.y + rand(-20, 20), hp: effect * f.hpPerEffect, life: f.life, hit: f.hitBase + effect * f.hitPerEffect, cd: 0, color });
        burst(player.x, player.y, color, 12);
        break;
      }
      case 6: { // hex
        const f = B.forms.hex;
        let best: Enemy | null = null, bd = f.pick ** 2;
        for (const e of enemies) { const dd = dist2(e.x, e.y, p.aimX, p.aimY); if (dd < bd) { bd = dd; best = e; } }
        if (!best) for (const e of enemies) { const dd = dist2(e.x, e.y, p.aimX, p.aimY); if (!best || dd < bd) { bd = dd; best = e; } }
        if (best) {
          best.hexDps += effect / f.duration;
          best.hexT = f.duration;
          fx.push({ kind: 'beam', x: player.x, y: player.y, x2: best.x, y2: best.y, t: 0, max: 0.2, color, r: 3 });
        }
        break;
      }
      case 7: { // blink
        const f = B.forms.blink;
        const range = Math.min(f.max, d, f.base + effect * f.perEffect);
        fx.push({ kind: 'blink', x: player.x, y: player.y, t: 0, max: 0.35, color });
        player.x += ux * range; player.y += uy * range;
        player.invuln = 0.25;
        fx.push({ kind: 'blink', x: player.x, y: player.y, t: 0, max: 0.35, color });
        break;
      }
    }
  }

  function applyShamanCast(r: CastResult) {
    const e = enemies.find((x) => x.aura === r.aura);
    if (!e || e.hp <= 0 || r.refused || r.grant <= 0) return;
    if (e.kind === 'warden') {
      const sp = spiritOfCell(e.cell!);
      const frac = Math.max(0, Math.min(1, r.grant / castCap(r.strength, spiritStats(sp).generosity)));
      const tgt = r.target.kind === 'point' ? r.target : { x: player.x, y: player.y };
      novas.push({ x: tgt.x, y: tgt.y, t: B.warden.novaDelay, max: B.warden.novaDelay, dmg: B.warden.novaDamage * dmgMult * (0.3 + 0.7 * frac), r: B.warden.novaRadius, color: ELEMENT_COLOR[sp.element]!, element: sp.element, enemy: true });
      floaters.push({ x: e.x, y: e.y - 44, text: `${r.effective.toFixed(0)}`, color: '#e7c26b', t: 0, size: 13 });
      sfx.sfxEnemyCast();
      return;
    }
    const dx = player.x - e.x, dy = player.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const sp = spiritOfCell(e.cell!);
    const color = ELEMENT_COLOR[sp.element]!;
    // Strength decides how much of the well a shaman wins (contention); damage is bounded:
    // base bolt x descent, scaled by the fraction of its own cap it actually drew (strain and crowding weaken it).
    const full = castCap(r.strength, spiritStats(sp).generosity);
    const frac = Math.max(0, Math.min(1, r.grant / full));
    const dmg = B.shaman.boltDamage * dmgMult * (0.25 + 0.75 * frac);
    projs.push({ x: e.x, y: e.y, vx: (dx / d) * B.shaman.boltSpeed, vy: (dy / d) * B.shaman.boltSpeed, r: 5 + 5 * frac, dmg, life: 2.5, enemy: true, color });
    floaters.push({ x: e.x, y: e.y - 20, text: `${r.effective.toFixed(0)}`, color: '#9c8f74', t: 0, size: 11 });
    sfx.sfxEnemyCast();
  }

  function authorityTick() {
    for (const e of enemies) {
      if (e.kind === 'warden' && e.hp > 0) {
        e.castT! -= TICK_MS / 1000;
        if (e.castT! <= 0) {
          e.castT = rand(B.warden.castMin, B.warden.castMax);
          auth.submitCast({ aura: e.aura!, cell: e.cell!, request: B.request, target: { kind: 'point', x: player.x, y: player.y }, tick: auth.currentTick() });
        }
        continue;
      }
      if (e.kind !== 'shaman' || e.hp <= 0) continue;
      e.castT! -= TICK_MS / 1000;
      if (e.castT! <= 0 && dist2(e.x, e.y, player.x, player.y) < 700 ** 2) {
        e.castT = rand(B.shaman.castMin, B.shaman.castMax);
        auth.submitCast({ aura: e.aura!, cell: e.cell!, request: B.request, target: { kind: 'entity', id: 'player' }, tick: auth.currentTick() });
      }
    }
    const res = auth.tick();
    for (const r of res.casts) {
      if (r.aura === me) applyPlayerCast(r);
      else applyShamanCast(r);
    }
  }

  // ---------- shrines ----------
  const myShrineTasks = new Set<string>(); // only this walk's shrines earn credit
  function wakeShrine(s: Shrine) {
    for (let d = B.shrineMinDepth; d <= B.shrineMaxDepth; d++) {
      const done = S.scanned(s.prefix, d);
      const running = S.scryTask(s.prefix, d);
      const frontier = running ? running.stopAt : done;
      if (frontier < cellsBelow(d - s.prefix.length)) {
        s.depth = d;
        s.budget = 1n << BigInt(target(d)); // one expected find's worth of work
        s.start = frontier;
        S.startScry(s.prefix, d, 'shrine', s.budget);
        myShrineTasks.add(scanKey(s.prefix, d));
        s.state = 'scrying';
        sfx.sfxShrineWake();
        banner = { text: 'THE SHRINE WAKES', sub: `It searches ${addressOf(s.prefix)} at depth ${d}.`, t: 2.5 };
        burst(s.x, s.y, ELEMENT_COLOR[s.element]!, 30);
        return;
      }
    }
    s.state = 'spent';
    banner = { text: 'THE SHRINE IS SILENT', sub: 'Everything near it has already been found.', t: 2.5 };
  }

  function shrineProgress(s: Shrine): number {
    if (s.state !== 'scrying') return s.state === 'spent' ? 1 : 0;
    const t = S.scryTask(s.prefix, s.depth);
    if (!t) return 1;
    const done = Number(t.doneUpTo - s.start);
    return Math.max(0, Math.min(1, done / Number(s.budget)));
  }

  const offFind = S.finds.on((f) => {
    if (f.source !== 'shrine' || !f.isNew || over || !myShrineTasks.has(f.taskId)) return;
    finds++;
    const sh = shrines.find((s) => s.state === 'scrying' && f.spirit.cell.startsWith(s.prefix));
    const c = ELEMENT_COLOR[f.spirit.element]!;
    if (sh) {
      sh.found++;
      burst(sh.x, sh.y, c, 40);
      floaters.push({ x: sh.x, y: sh.y - 50, text: spiritName(f.spirit), color: c, t: -1, size: 20 });
    }
    app.toast(`<img class="sigil-sm" src="${sigilURL(f.spirit)}" alt=""> A spirit answers the shrine: <span style="color:${c}">${esc(spiritName(f.spirit))}</span>, ${magnitudeTitle(f.spirit.magnitude)} of ${esc(ASPECTS[f.spirit.element]![f.spirit.aspect]!)}. Meditate on it in the sanctum.`, c);
  });

  // Meditation keeps working during the walk: truer names reach this run's authority at once.
  const offName = S.names.on((n) => {
    const rec = save.names[n.cell];
    if (!rec || over) return;
    auth.submitName(rec.claim);
    const sl = slots.find((x) => x?.cell === n.cell);
    if (sl) floaters.push({ x: player.x, y: player.y + 34, text: `${sl.name} grows truer · ${truths(n.strength)}`, color: sl.color, t: -0.6, size: 14 });
  });

  // ---------- update ----------
  let tickAcc = 0;
  let hitSoundT = 0;

  function update(dt: number) {
    if (paused) return;
    if (banner) { banner.t -= dt; if (banner.t <= 0) banner = null; }
    hitSoundT -= dt;
    if (!over) {
      tickAcc += dt * 1000;
      while (tickAcc >= TICK_MS) { tickAcc -= TICK_MS; authorityTick(); }
    }
    // waves
    if (!over) {
      if (breather > 0) {
        breather -= dt;
        if (breather <= 0) { startWave(); sfx.sfxWave(); }
      } else {
        spawnT -= dt;
        if (spawnQueue.length && spawnT <= 0) { spawn(spawnQueue.shift()!); spawnT = B.spawnEvery; }
        if (!spawnQueue.length && enemies.length === 0) {
          wave++;
          if (wave >= B.waves.length) end('won');
          else {
            breather = B.breather;
            banner = { text: `WAVE ${wave + 1}`, sub: wave + 1 === 3 ? 'Shamans walk with them. They draw on the same wells you do.' : 'Breathe. Let the strain ebb.', t: 3 };
          }
        }
      }
    }
    // player
    let mx = 0, my = 0;
    if (keys.has('w') || keys.has('arrowup')) my -= 1;
    if (keys.has('s') || keys.has('arrowdown')) my += 1;
    if (keys.has('a') || keys.has('arrowleft')) mx -= 1;
    if (keys.has('d') || keys.has('arrowright')) mx += 1;
    const ml = Math.hypot(mx, my);
    if (ml > 0 && !over) { player.x += (mx / ml) * B.player.speed * dt; player.y += (my / ml) * B.player.speed * dt; }
    collide(player, B.player.radius);
    player.invuln = Math.max(0, player.invuln - dt);
    player.hurt = Math.max(0, player.hurt - dt);
    player.ward = Math.max(0, player.ward - player.ward * B.player.wardDecayPerSec * dt);

    // shrines
    for (const s of shrines) {
      const near = dist2(s.x, s.y, player.x, player.y) < B.shrineRadius ** 2;
      if (s.state === 'idle' || s.state === 'waking') {
        if (near) { s.state = 'waking'; s.wake += dt; if (s.wake >= B.shrineWake) wakeShrine(s); }
        else { s.wake = Math.max(0, s.wake - dt); if (s.wake === 0) s.state = 'idle'; }
      } else if (s.state === 'scrying' && !S.scryTask(s.prefix, s.depth)) s.state = 'spent';
    }

    // enemies
    for (const e of enemies) {
      e.flash = Math.max(0, e.flash - dt);
      e.cd = Math.max(0, e.cd - dt);
      if (e.hexT > 0) { e.hexT -= dt; hurtEnemyQuiet(e, e.hexDps * dt); if (e.hexT <= 0) e.hexDps = 0; }
      // target: nearest of player and allies
      let tx = player.x, ty = player.y, td = dist2(e.x, e.y, player.x, player.y);
      let targetAlly: Ally | null = null;
      for (const a of allies) { const d = dist2(e.x, e.y, a.x, a.y); if (d < td) { td = d; tx = a.x; ty = a.y; targetAlly = a; } }
      const dx = tx - e.x, dy = ty - e.y, d = Math.sqrt(td) || 1;
      let vx = 0, vy = 0;
      if (e.kind === 'shaman') {
        const keep = B.shaman.keepAway;
        const pd = Math.sqrt(dist2(e.x, e.y, player.x, player.y)) || 1;
        const px = (player.x - e.x) / pd, py = (player.y - e.y) / pd;
        if (pd < keep - 50) { vx = -px; vy = -py; }
        else if (pd > keep + 90) { vx = px; vy = py; }
        else { vx = -py * e.strafe! * 0.7; vy = px * e.strafe! * 0.7; }
      } else if (!over) {
        vx = dx / d; vy = dy / d;
      }
      e.x += (vx * e.speed + e.kx) * dt;
      e.y += (vy * e.speed + e.ky) * dt;
      e.kx *= Math.pow(0.02, dt); e.ky *= Math.pow(0.02, dt);
      e.x = Math.max(e.r, Math.min(W - e.r, e.x));
      e.y = Math.max(e.r, Math.min(H - e.r, e.y));
      collide(e, e.r);
      // melee
      if (e.dmg > 0 && e.cd <= 0) {
        if (targetAlly && dist2(e.x, e.y, targetAlly.x, targetAlly.y) < (e.r + 12) ** 2) { targetAlly.hp -= e.dmg; e.cd = B.meleeCooldown; }
        else if (dist2(e.x, e.y, player.x, player.y) < (e.r + B.player.radius + 3) ** 2) { hurtPlayer(e.dmg); e.cd = B.meleeCooldown; }
      }
    }
    // separation
    for (let i = 0; i < enemies.length; i++) for (let j = i + 1; j < enemies.length; j++) {
      const a = enemies[i]!, b = enemies[j]!;
      const min = a.r + b.r, d2 = dist2(a.x, a.y, b.x, b.y);
      if (d2 < min * min && d2 > 0.01) {
        const d = Math.sqrt(d2), push = (min - d) / 2;
        const ux = (a.x - b.x) / d, uy = (a.y - b.y) / d;
        a.x += ux * push; a.y += uy * push; b.x -= ux * push; b.y -= uy * push;
      }
    }
    enemies = enemies.filter((e) => e.hp > 0);

    // allies
    for (const a of allies) {
      a.life -= dt; a.cd = Math.max(0, a.cd - dt);
      let best: Enemy | null = null, bd = Infinity;
      for (const e of enemies) { const d = dist2(a.x, a.y, e.x, e.y); if (d < bd) { bd = d; best = e; } }
      if (best) {
        const d = Math.sqrt(bd) || 1;
        if (d > best.r + 12) { a.x += ((best.x - a.x) / d) * B.forms.summon.speed * dt; a.y += ((best.y - a.y) / d) * B.forms.summon.speed * dt; }
        else if (a.cd <= 0) { hurtEnemy(best, a.hit, a.color); a.cd = B.forms.summon.hitEvery; }
      } else {
        const d = Math.sqrt(dist2(a.x, a.y, player.x, player.y)) || 1;
        if (d > 50) { a.x += ((player.x - a.x) / d) * B.forms.summon.speed * dt; a.y += ((player.y - a.y) / d) * B.forms.summon.speed * dt; }
      }
      collide(a, 10);
      if (Math.random() < dt * 10) parts.push({ x: a.x, y: a.y, vx: rand(-15, 15), vy: rand(-30, -5), t: 0, max: 0.6, color: a.color, size: 2 });
    }
    allies = allies.filter((a) => a.life > 0 && a.hp > 0);

    // projectiles
    for (const p of projs) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      if (pillars.some((q) => dist2(p.x, p.y, q.x, q.y) < (q.r + p.r) ** 2)) { p.life = 0; burst(p.x, p.y, p.color, 6); continue; }
      if (p.enemy) {
        if (dist2(p.x, p.y, player.x, player.y) < (p.r + B.player.radius) ** 2) { hurtPlayer(p.dmg); p.life = 0; burst(p.x, p.y, p.color, 8); }
        else for (const a of allies) if (dist2(p.x, p.y, a.x, a.y) < (p.r + 10) ** 2) { a.hp -= p.dmg; p.life = 0; break; }
      } else {
        for (const e of enemies) if (dist2(p.x, p.y, e.x, e.y) < (p.r + e.r) ** 2) { hurtEnemy(e, p.dmg, p.color); p.life = 0; burst(p.x, p.y, p.color, 8); break; }
      }
      if (Math.random() < 0.6) parts.push({ x: p.x, y: p.y, vx: rand(-20, 20), vy: rand(-20, 20), t: 0, max: 0.3, color: p.color, size: 2 });
    }
    projs = projs.filter((p) => p.life > 0);

    for (const n of novas) {
      n.t -= dt;
      if (n.t <= 0) {
        fx.push({ kind: 'burst', x: n.x, y: n.y, r: n.r, t: 0, max: 0.45, color: n.color });
        sfx.sfxNova(n.element);
        if (n.enemy) { if (dist2(player.x, player.y, n.x, n.y) < (n.r + B.player.radius) ** 2) hurtPlayer(n.dmg, 'the Warden'); }
        else for (const e of enemies) if (dist2(e.x, e.y, n.x, n.y) < (n.r + e.r) ** 2) hurtEnemy(e, n.dmg, n.color);
        burst(n.x, n.y, n.color, 30);
        shake = Math.min(10, shake + 4);
      }
    }
    novas = novas.filter((n) => n.t > 0);

    for (const f of fx) f.t += dt;
    fx = fx.filter((f) => f.t < f.max);
    for (const p of parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; }
    parts = parts.filter((p) => p.t < p.max);
    if (parts.length > 1500) parts.splice(0, parts.length - 1500);
    for (const f of floaters) { f.t += dt; f.y -= 28 * dt; }
    floaters = floaters.filter((f) => f.t < 1.2);
    for (const s of slots) if (s) { s.flash = Math.max(0, s.flash - dt); s.thin = Math.max(0, s.thin - dt); }
    shake = Math.max(0, shake - dt * 30);

    cam.x += (player.x - cam.x) * Math.min(1, dt * 8);
    cam.y += (player.y - cam.y) * Math.min(1, dt * 8);
  }

  function hurtEnemyQuiet(e: Enemy, dmg: number) {
    if (e.hp <= 0) return;
    e.hp -= dmg;
    if (Math.random() < 0.3) parts.push({ x: e.x + rand(-e.r, e.r), y: e.y + rand(-e.r, e.r), vx: 0, vy: -30, t: 0, max: 0.5, color: '#b56bff', size: 2 });
    if (e.hp <= 0) { kills++; burst(e.x, e.y, B.enemies[e.kind].color, 18); if (e.aura) auth.forgetAura(e.aura); }
  }

  function collide(o: { x: number; y: number }, r: number) {
    for (const q of pillars) {
      const d2 = dist2(o.x, o.y, q.x, q.y), min = q.r + r;
      if (d2 < min * min) {
        const d = Math.sqrt(d2) || 1;
        o.x = q.x + ((o.x - q.x) / d) * min;
        o.y = q.y + ((o.y - q.y) / d) * min;
      }
    }
    o.x = Math.max(r, Math.min(W - r, o.x));
    o.y = Math.max(r, Math.min(H - r, o.y));
  }

  function burst(x: number, y: number, color: string, n: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = rand(40, 220);
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, max: rand(0.3, 0.8), color, size: rand(1.5, 3.5) });
    }
  }

  // ---------- drawing ----------
  function draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    viewW = w; viewH = h;
    ctx.fillStyle = '#0a0911';
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    const sx = shake ? rand(-shake, shake) : 0, sy = shake ? rand(-shake, shake) : 0;
    ctx.translate(Math.round(w / 2 - cam.x + sx), Math.round(h / 2 - cam.y + sy));

    // ground: the eightfold lattice, tinted by the descent's element
    ctx.fillStyle = tint + '0a';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = tint + '14';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const x0 = Math.max(0, Math.floor((cam.x - w / 2) / 100) * 100), x1 = Math.min(W, cam.x + w / 2 + 100);
    const y0 = Math.max(0, Math.floor((cam.y - h / 2) / 100) * 100), y1 = Math.min(H, cam.y + h / 2 + 100);
    for (let x = x0; x <= x1; x += 100) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
    for (let y = y0; y <= y1; y += 100) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
    ctx.stroke();
    ctx.strokeStyle = tint + '44';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, W, H);
    // drifting motes: the astral leaking through
    ctx.font = '11px JetBrains Mono, monospace';
    for (const m of motes) {
      m.y -= m.v * 0.016;
      if (m.y < 0) { m.y = H; m.x = rand(0, W); }
      const a = 0.05 + 0.12 * Math.sin(t * 0.7 + m.x);
      if (Math.abs(m.x - cam.x) > w / 2 + 20 || Math.abs(m.y - cam.y) > h / 2 + 20) continue;
      ctx.fillStyle = `rgba(231,194,107,${Math.max(0.02, a).toFixed(3)})`;
      ctx.fillText(m.d, m.x, m.y);
    }

    // shrines
    for (const s of shrines) {
      const c = ELEMENT_COLOR[s.element]!;
      const prog = shrineProgress(s);
      const alpha = s.state === 'spent' ? 0.25 : 0.55 + 0.25 * Math.sin(t * 2 + s.x);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = c;
      ctx.lineWidth = 2;
      octagon(ctx, B.shrineRadius, t * 0.2);
      ctx.stroke();
      octagon(ctx, B.shrineRadius * 0.6, -t * 0.3);
      ctx.stroke();
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.fillStyle = c;
      ctx.textAlign = 'center';
      const digits = s.prefix + '0123456701234567';
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 + t * (s.state === 'scrying' ? 0.9 : 0.15);
        ctx.fillText(digits[i]!, Math.cos(a) * (B.shrineRadius * 0.8), Math.sin(a) * (B.shrineRadius * 0.8) + 3);
      }
      ctx.globalAlpha = 1;
      if (s.state === 'waking') {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, B.shrineRadius + 8, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * s.wake) / B.shrineWake);
        ctx.stroke();
      } else if (s.state === 'scrying') {
        ctx.strokeStyle = c;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, B.shrineRadius + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog);
        ctx.stroke();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = c + '22';
        ctx.beginPath(); ctx.arc(0, 0, B.shrineRadius * (0.5 + 0.1 * Math.sin(t * 6)), 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.fillStyle = c;
      ctx.font = '12px EB Garamond, serif';
      ctx.textAlign = 'center';
      ctx.globalAlpha = 0.8;
      ctx.fillText(s.state === 'spent' ? (s.found ? `${s.found} answered` : 'nothing answered') : ASPECTS[s.element]![Number(s.prefix[1])]!, 0, B.shrineRadius + 26);
      ctx.restore();
    }

    // pillars
    for (const p of pillars) {
      ctx.fillStyle = '#15121f';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(231,194,107,0.18)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // novas (pending)
    for (const n of novas) {
      ctx.strokeStyle = n.color;
      ctx.globalAlpha = 0.6;
      ctx.setLineDash([6, 6]);
      if (n.enemy) {
        const k = 1 - n.t / (n.max ?? 1);
        ctx.fillStyle = `rgba(255,80,64,${(0.06 + 0.18 * k).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#ff5040';
      }
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r * (1 - (n.t / (n.max ?? B.forms.nova.delay)) * 0.3), 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // rival threads: a shaman drawing on a well you also hold
    ctx.setLineDash([3, 7]);
    for (const e of enemies) {
      if (!e.cell || !slots.some((sl) => sl?.cell === e.cell)) continue;
      ctx.strokeStyle = ELEMENT_COLOR[spiritOfCell(e.cell).element]! + '55';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(player.x, player.y); ctx.stroke();
    }
    ctx.setLineDash([]);
    // enemies
    for (const e of enemies) drawEnemy(ctx, e, t);
    // allies
    ctx.globalCompositeOperation = 'lighter';
    for (const a of allies) {
      ctx.fillStyle = a.color + '99';
      ctx.beginPath(); ctx.arc(a.x, a.y, 9 + Math.sin(t * 10) * 1.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    // player
    drawPlayer(ctx, t);

    // projectiles, fx, particles
    ctx.globalCompositeOperation = 'lighter';
    for (const p of projs) {
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff88';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.45, 0, Math.PI * 2); ctx.fill();
    }
    for (const f of fx) {
      const k = f.t / f.max;
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = f.color;
      ctx.fillStyle = f.color;
      if (f.kind === 'beam') {
        ctx.lineWidth = (f.r ?? 10) * (1 - k * 0.6);
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x2!, f.y2!); ctx.stroke();
        ctx.lineWidth = Math.max(1, (f.r ?? 10) * 0.3);
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      } else if (f.kind === 'ring') {
        ctx.lineWidth = 6 * (1 - k) + 1;
        ctx.beginPath(); ctx.arc(f.x, f.y, (f.r ?? 50) * (0.3 + 0.7 * k), 0, Math.PI * 2); ctx.stroke();
      } else if (f.kind === 'burst') {
        ctx.globalAlpha = 0.5 * (1 - k);
        ctx.beginPath(); ctx.arc(f.x, f.y, (f.r ?? 50) * (0.6 + 0.4 * k), 0, Math.PI * 2); ctx.fill();
      } else if (f.kind === 'blink') {
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(f.x, f.y, 10 + 30 * k, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    for (const p of parts) {
      ctx.globalAlpha = 1 - p.t / p.max;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // floaters
    ctx.textAlign = 'center';
    for (const f of floaters) {
      ctx.globalAlpha = Math.max(0, Math.min(1, 1.2 - f.t));
      ctx.fillStyle = f.color;
      ctx.font = `${f.size}px JetBrains Mono, monospace`;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // the dark presses in; your aura holds it back
    const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
    vg.addColorStop(0, 'rgba(4,3,8,0)');
    vg.addColorStop(1, 'rgba(4,3,8,0.78)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    // aim reticle
    ctx.strokeStyle = 'rgba(231,194,107,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(mouse.sx, mouse.sy, 8, 0, Math.PI * 2); ctx.stroke();

    drawHud(ctx, w, h, t);
  }

  function octagon(ctx: CanvasRenderingContext2D, r: number, rot: number) {
    ctx.beginPath();
    for (let i = 0; i <= 8; i++) {
      const a = rot + (i / 8) * Math.PI * 2 + Math.PI / 8;
      if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
  }

  function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, t: number) {
    const d = B.enemies[e.kind];
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.fillStyle = e.flash > 0 ? '#ffffff' : d.color;
    if (e.kind === 'runner') {
      const a = Math.atan2(player.y - e.y, player.x - e.x);
      ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(e.r + 3, 0); ctx.lineTo(-e.r, e.r * 0.8); ctx.lineTo(-e.r, -e.r * 0.8); ctx.closePath(); ctx.fill();
    } else if (e.kind === 'warden') {
      const sp = spiritOfCell(e.cell!);
      ctx.fillStyle = e.flash > 0 ? '#ffffff' : d.color;
      octagon(ctx, e.r, t * 0.15);
      ctx.fill();
      ctx.strokeStyle = ELEMENT_COLOR[sp.element]!;
      ctx.lineWidth = 2;
      octagon(ctx, e.r + 8, -t * 0.25);
      ctx.stroke();
      ctx.drawImage(sigilCanvas(sp, 64), -e.r * 0.7, -e.r * 0.7, e.r * 1.4, e.r * 1.4);
    } else if (e.kind === 'brute') {
      octagon(ctx, e.r, t * 0.5);
      ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(0, 0, e.r, 0, Math.PI * 2); ctx.fill();
    }
    if (e.kind === 'shaman') {
      const sp = spiritOfCell(e.cell!);
      ctx.strokeStyle = ELEMENT_COLOR[sp.element]!;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, e.r + 5 + Math.sin(t * 5) * 1.5, 0, Math.PI * 2); ctx.stroke();
      // strained shamans flicker: they are vulnerable
      const st = auth.auraState(e.aura!).strain;
      if (st > 1.5) { ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 20); ctx.strokeStyle = '#ff9e5a'; ctx.beginPath(); ctx.arc(0, 0, e.r + 9, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; }
    }
    ctx.rotate(0);
    ctx.restore();
    // eyes
    ctx.fillStyle = e.hexT > 0 ? '#b56bff' : '#ffddaa';
    const a = Math.atan2(player.y - e.y, player.x - e.x);
    ctx.fillRect(e.x + Math.cos(a) * e.r * 0.5 - 2, e.y + Math.sin(a) * e.r * 0.5 - 1, 2, 2);
    // hp bar
    if (e.hp < e.maxHp) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(e.x - e.r, e.y - e.r - 8, e.r * 2, 3);
      ctx.fillStyle = '#ff7a6b';
      ctx.fillRect(e.x - e.r, e.y - e.r - 8, (e.r * 2 * Math.max(0, e.hp)) / e.maxHp, 3);
    }
  }

  function drawPlayer(ctx: CanvasRenderingContext2D, t: number) {
    const st = auth.auraState(me);
    const strained = st.strain / st.capacity;
    const glow = ELEMENT_COLOR[save.aura!.element]!;
    ctx.save();
    ctx.translate(player.x, player.y);
    // aura: dims and reddens with strain
    ctx.globalCompositeOperation = 'lighter';
    const auraR = 26 + Math.sin(t * 3) * 2;
    const g = ctx.createRadialGradient(0, 0, 4, 0, 0, auraR);
    g.addColorStop(0, strained > 1 ? '#ff504088' : glow + '66');
    g.addColorStop(1, '#00000000');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, auraR, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    if (player.ward > 0) {
      ctx.strokeStyle = `rgba(207,232,255,${Math.min(0.9, 0.3 + player.ward / 60)})`;
      ctx.lineWidth = 2 + Math.min(4, player.ward / 15);
      ctx.beginPath(); ctx.arc(0, 0, B.player.radius + 7, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = player.hurt > 0 ? '#ff7a6b' : '#e9dcb8';
    ctx.globalAlpha = player.invuln > 0 ? 0.5 : 1;
    ctx.beginPath(); ctx.arc(0, 0, B.player.radius, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    const aim = toWorld(mouse.sx, mouse.sy);
    const a = Math.atan2(aim.y - player.y, aim.x - player.x);
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(Math.cos(a) * 8, Math.sin(a) * 8, 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawIndicators(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const m = 18;
    for (const e of enemies) {
      const sx = e.x - cam.x + w / 2, sy = e.y - cam.y + h / 2;
      if (sx > -e.r && sx < w + e.r && sy > -e.r && sy < h + e.r) continue;
      const dx = sx - w / 2, dy = sy - h / 2;
      const k = Math.min((w / 2 - m) / Math.abs(dx || 1e-6), (h / 2 - m) / Math.abs(dy || 1e-6));
      const ix = w / 2 + dx * k, iy = h / 2 + dy * k;
      const a = Math.atan2(dy, dx);
      const near = Math.max(0.25, 1 - Math.hypot(dx, dy) / 1400);
      ctx.save();
      ctx.translate(ix, iy);
      ctx.rotate(a);
      ctx.globalAlpha = near;
      ctx.fillStyle = e.kind === 'shaman' ? '#e7c26b' : B.enemies[e.kind].color;
      ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, 5); ctx.lineTo(-5, -5); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    for (const s of shrines) {
      if (s.state === 'spent') continue;
      const sx = s.x - cam.x + w / 2, sy = s.y - cam.y + h / 2;
      if (sx > 0 && sx < w && sy > 0 && sy < h) continue;
      const dx = sx - w / 2, dy = sy - h / 2;
      const k = Math.min((w / 2 - 34) / Math.abs(dx || 1e-6), (h / 2 - 34) / Math.abs(dy || 1e-6));
      ctx.strokeStyle = ELEMENT_COLOR[s.element]!;
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 1.5;
      ctx.save();
      ctx.translate(w / 2 + dx * k, h / 2 + dy * k);
      octagon(ctx, 9, 0);
      ctx.stroke();
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  // hover help for the canvas HUD: regions are rebuilt every frame
  let hud: { x: number; y: number; w: number; h: number; tip: string }[] = [];
  let tipShown = false;
  function hudHover() {
    const r = paused || over ? null : hud.find((q) => mouse.sx >= q.x && mouse.sx <= q.x + q.w && mouse.sy >= q.y && mouse.sy <= q.y + q.h);
    if (r) { showTip(r.tip, mouse.sx, mouse.sy); tipShown = true; }
    else if (tipShown) { hideTip(); tipShown = false; }
  }

  function drawHud(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    hud = [
      { x: 16, y: 16, w: 224, h: 34, tip: HELP.life },
      { x: w / 2 - 170, y: 12, w: 340, h: 54, tip: HELP.wave },
      { x: w - 320, y: 10, w: 310, h: 22, tip: HELP.humRun },
    ];
    drawIndicators(ctx, w, h);
    // health
    ctx.fillStyle = 'rgba(10,9,17,0.7)';
    ctx.fillRect(16, 16, 224, 34);
    ctx.fillStyle = '#3a1f22';
    ctx.fillRect(22, 22, 212, 10);
    ctx.fillStyle = '#ff7a6b';
    ctx.fillRect(22, 22, (212 * Math.max(0, player.hp)) / B.player.hp, 10);
    if (player.ward > 0) { ctx.fillStyle = '#cfe8ff'; ctx.fillRect(22, 34, (212 * player.ward) / B.player.wardMax, 4); }
    ctx.fillStyle = '#e9dcb8';
    ctx.font = '12px JetBrains Mono, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`life ${Math.max(0, Math.ceil(player.hp))}${player.ward > 0 ? ` · ward ${Math.ceil(player.ward)}` : ''}`, 22, 47);

    // wave & finds
    ctx.textAlign = 'center';
    ctx.font = '18px Cinzel, serif';
    ctx.fillStyle = '#e7c26b';
    ctx.fillText(over ? '' : breather > 0 && wave > 0 ? `WAVE ${wave} CLEARED` : `WAVE ${wave + 1} / ${B.waves.length}`, w / 2, 30);
    ctx.font = '11px EB Garamond, serif';
    ctx.fillStyle = '#9c8f74';
    ctx.fillText(`descent ${level + 1} · ${descentName(level)}`, w / 2, 62);
    ctx.font = '12px EB Garamond, serif';
    ctx.fillStyle = '#9c8f74';
    ctx.fillText(`${kills} banished · ${enemies.length + spawnQueue.length} remain${finds ? ` · ${finds} spirits found` : ''}`, w / 2, 48);
    if (warden && warden.hp > 0) {
      const bw = Math.min(420, w * 0.5);
      ctx.fillStyle = 'rgba(10,9,17,0.8)';
      ctx.fillRect(w / 2 - bw / 2 - 4, 72, bw + 8, 22);
      ctx.fillStyle = '#3a1f22';
      ctx.fillRect(w / 2 - bw / 2, 84, bw, 6);
      ctx.fillStyle = '#e7c26b';
      ctx.fillRect(w / 2 - bw / 2, 84, (bw * warden.hp) / warden.maxHp, 6);
      ctx.font = '11px Cinzel, serif';
      ctx.fillText(`the Warden · ${spiritName(spiritOfCell(warden.cell!))}`, w / 2, 81);
      hud.push({ x: w / 2 - bw / 2 - 4, y: 72, w: bw + 8, h: 22, tip: HELP.warden });
    }
    ctx.textAlign = 'right';
    ctx.font = '12px EB Garamond, serif';
    ctx.fillStyle = '#9c8f74';
    ctx.fillText(`meditation hums at ${Math.round(S.pool.rate()).toLocaleString()} utterances/s`, w - 16, 26);

    // slots
    const active = slots.map((s, i) => ({ s, i })).filter((x) => x.s);
    const sw = 150, gap = 8;
    const total = active.length * sw + (active.length - 1) * gap;
    let x = w / 2 - total / 2;
    const y = h - 78;
    // strain meter
    const st = auth.auraState(me);
    const mw = Math.max(total, 300);
    const mx = w / 2 - mw / 2, my = y - 22;
    ctx.fillStyle = 'rgba(10,9,17,0.75)';
    ctx.fillRect(mx - 6, my - 14, mw + 12, 26);
    const scale = Math.max(st.capacity * 1.6, st.strain * 1.05);
    ctx.fillStyle = '#2a2233';
    ctx.fillRect(mx, my, mw, 7);
    ctx.fillStyle = st.strain > st.capacity ? (Math.sin(t * 20) > 0 ? '#ff5040' : '#ff9e5a') : '#ff9e5a';
    ctx.fillRect(mx, my, Math.min(mw, (mw * st.strain) / scale), 7);
    const capX = mx + (mw * st.capacity) / scale;
    ctx.fillStyle = '#e9dcb8';
    ctx.fillRect(capX - 1, my - 3, 2, 13);
    ctx.textAlign = 'left';
    ctx.font = '11px JetBrains Mono, monospace';
    ctx.fillStyle = '#9c8f74';
    ctx.fillText(`strain ${st.strain.toFixed(1)} / ${st.capacity.toFixed(1)}`, mx, my - 3);
    hud.push({ x: mx - 6, y: my - 14, w: mw + 12, h: 26, tip: HELP.strain });
    if (save.runs.length < 2 && !over) {
      ctx.textAlign = 'center';
      ctx.font = 'italic 14px EB Garamond, serif';
      ctx.fillStyle = 'rgba(233,220,184,0.7)';
      ctx.fillText('WASD to move · aim with the mouse · left/right click and keys 1, 2 to evoke · stand in a shrine to wake it · Esc to pause', w / 2, my - 22);
      ctx.textAlign = 'left';
    }
    for (const { s, i } of active) {
      const sl = s!;
      hud.push({ x, y, w: sw, h: 62, tip: `<b style="color:${sl.color}">${sl.name}</b>: ${FORMS[sl.form]!.name}, ${FORMS[sl.form]!.desc}. Your name holds ${truths(S.strength(sl.cell))}.<br>${HELP.hudSlot}` });
      ctx.fillStyle = sl.flash > 0 ? 'rgba(231,194,107,0.22)' : 'rgba(10,9,17,0.8)';
      ctx.fillRect(x, y, sw, 62);
      ctx.strokeStyle = sl.color;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, sw - 1, 61);
      ctx.fillStyle = '#e7c26b';
      ctx.font = '12px JetBrains Mono, monospace';
      ctx.fillText(SLOTS[i]!.label, x + 6, y + 14);
      ctx.globalAlpha = sl.flash > 0 ? 1 : 0.55;
      ctx.drawImage(sigilCanvas(sl.spirit, 64), x + sw - 44, y + 18, 32, 32);
      ctx.globalAlpha = 1;
      ctx.fillStyle = sl.color;
      ctx.font = '14px Cinzel, serif';
      ctx.fillText(sl.name.slice(0, 12), x + 6, y + 30);
      ctx.fillStyle = '#9c8f74';
      ctx.font = '11px EB Garamond, serif';
      ctx.fillText(`${FORMS[sl.form]!.name} · ${truths(S.strength(sl.cell))}`, x + 6, y + 44);
      ctx.textAlign = 'right';
      ctx.font = '12px JetBrains Mono, monospace';
      ctx.fillStyle = sl.thin > 0 ? '#ff9e5a' : '#e9dcb8';
      ctx.fillText(sl.lastBits !== null ? `${sl.lastBits.toFixed(1)}` : '—', x + sw - 6, y + 14);
      ctx.textAlign = 'left';
      // pool
      const pool = auth.poolInfo(sl.cell);
      if (pool) {
        ctx.fillStyle = '#2a2233';
        ctx.fillRect(x + 6, y + 52, sw - 12, 4);
        ctx.fillStyle = sl.color;
        ctx.fillRect(x + 6, y + 52, ((sw - 12) * pool.level) / pool.cap, 4);
      }
      // rivals: enemy casters drinking from the same well
      const rivals = enemies.filter((e) => e.cell === sl.cell).length;
      if (rivals) {
        ctx.fillStyle = '#ff9e5a';
        ctx.font = '11px EB Garamond, serif';
        ctx.fillText(`${rivals} rival${rivals > 1 ? 's' : ''} at this well`, x + 6, y - 4);
        hud.push({ x, y: y - 16, w: sw, h: 14, tip: HELP.rivals });
      }
      x += sw + gap;
    }

    if (banner) {
      ctx.textAlign = 'center';
      ctx.globalAlpha = Math.min(1, banner.t);
      ctx.fillStyle = '#e7c26b';
      ctx.font = '32px Cinzel, serif';
      ctx.fillText(banner.text, w / 2, h * 0.3);
      ctx.fillStyle = '#e9dcb8';
      ctx.font = 'italic 18px EB Garamond, serif';
      ctx.fillText(banner.sub, w / 2, h * 0.3 + 30);
      ctx.globalAlpha = 1;
    }
  }

  // ---------- flow ----------
  let overlay: HTMLElement | null = null;
  let uiRoot: HTMLElement;

  function end(result: 'won' | 'lost') {
    if (over) return;
    over = result;
    if (result === 'won') sfx.sfxVictory(); else sfx.sfxDeath();
    save.runs.push({ at: Date.now(), descent: level, wave: wave + (result === 'won' || breather > 0 ? 0 : 1), won: result === 'won', kills, finds });
    const unlocked = result === 'won' && level >= save.descent;
    if (unlocked) save.descent = level + 1;
    persist(save);
    const scrying = shrines.filter((s) => s.state === 'scrying' && S.scryTask(s.prefix, s.depth)).length;
    overlay = frag(`<div class="overlay">
      <h1 style="font-size:40px; color:var(--gold)">${result === 'won' ? 'The dark recedes' : 'You fall'}</h1>
      <div class="prose">${result === 'won' ? `Five waves broken in ${descentName(level)}. The wells are quiet again.${unlocked ? `<br><em>The way down opens: ${descentName(level + 1)}.</em>` : ''}` : `The dark took you at wave ${wave + (breather > 0 ? 0 : 1)}. Your names are kept; names are always kept.`}</div>
      <div class="dim">${kills} banished${finds ? ` · ${finds} spirits answered the shrines` : ''}${scrying ? ` · ${scrying} shrine${scrying > 1 ? 's' : ''} still searching` : ''}</div>
      <button class="primary" id="back">Return to the sanctum</button>
    </div>`);
    overlay.querySelector('#back')!.addEventListener('click', () => app.go(sanctumScreen(app)));
    uiRoot.appendChild(overlay);
  }

  function togglePause() {
    if (over) return;
    paused = !paused;
    if (paused) {
      overlay = frag(`<div class="overlay">
        <h1 style="font-size:32px; color:var(--gold)">Stillness</h1>
        <div class="dim">Meditation goes on while you rest.</div>
        <div style="display:flex; gap:10px"><button class="primary" id="resume">Resume</button><button id="abandon">Abandon the walk</button></div>
        <div class="faint" style="max-width:520px; font-size:14px; line-height:1.5">WASD to move · aim with the mouse · left/right click and keys 1, 2 to evoke. Every evocation strains your aura; strain ebbs over time. Past your capacity, spirits answer with backlash. Stand in a shrine to wake it.</div>
      </div>`);
      overlay.querySelector('#resume')!.addEventListener('click', togglePause);
      overlay.querySelector('#abandon')!.addEventListener('click', () => { paused = false; overlay?.remove(); end('lost'); });
      uiRoot.appendChild(overlay);
    } else {
      overlay?.remove();
      overlay = null;
    }
  }

  let time = 0;
  return {
    mount(ui) {
      uiRoot = ui;
      window.addEventListener('keydown', onKey);
      window.addEventListener('keyup', onKey);
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mousedown', onMouseDown);
      window.addEventListener('contextmenu', onContext);
      window.addEventListener('blur', onBlur);
      mouse.sx = window.innerWidth / 2 + 100; mouse.sy = window.innerHeight / 2;
      document.body.style.cursor = 'crosshair';
      (window as any).__run = { player, enemies: () => enemies, auth, slots, shrines, cast, end, state: () => ({ wave, kills, finds, over, breather }) };
    },
    unmount() {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('contextmenu', onContext);
      window.removeEventListener('blur', onBlur);
      document.body.style.cursor = '';
      hideTip();
      offFind();
      offName();
      delete (window as any).__run;
    },
    frame(dt, ctx, w, h) {
      time += dt;
      update(dt);
      draw(ctx, w, h, time);
      hudHover();
      return true;
    },
  };
}

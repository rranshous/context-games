// A walk into the dark, as seen by a player. THIN CLIENT: the dungeon process runs the round.
// This screen sends intent (movement, aim, casts), renders the dungeon's snapshots with smoothing,
// and turns its events into light and sound. It never touches the save or the sanctum.
import type { Screen } from '../main.ts';
import type { DungeonLink, Journey, RoundHost, RoundResult, Welcome } from '../round.ts';
import { frag } from '../dom.ts';
import { BALANCE as B, descentName, SLOTS } from '@truenames/dungeon/balance';
import type { EnemyKind, SimEvent, Snapshot, SnapPlayer, WireTraits } from '@truenames/dungeon/protocol';
import { movePlayer, type MoveCmd } from '@truenames/dungeon/movement';
import { ELEMENT_COLOR, FORMS, spiritName, truths, type SpiritLike } from '../lore.ts';
import { spiritStats } from '@truenames/authority';
import { sigilCanvas } from '../sigil.ts';
import * as sfx from '../audio.ts';
import { HELP, showTip, hideTip } from '../help.ts';

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const HEX = '#b56bff';
const colorOf = (el: number) => (el >= 0 ? ELEMENT_COLOR[el]! : '#9c8f74');
const toTraits = (t: WireTraits) => ({ ...t, flavor: BigInt(t.flavor) });
// Networking model (the standard one: Valve / Gambetta):
//  - you:        client-side prediction with the dungeon's own movement code, reconciled on every snapshot
//  - everything else: entity interpolation, drawn INTERP seconds in the past between two snapshots
const TICK = 1 / 60; // client input tick (matches the dungeon's step)
const SEND_EVERY = 1 / 30; // command batches per second
const INTERP = 0.1; // interpolation delay for other entities (two snapshot intervals at 20 Hz)
const SNAP_CORRECTION = 80; // corrections larger than this are teleports (blink): no smoothing
const CORRECTION_DECAY = 12; // how fast a small correction is smoothed away

interface Pos { x: number; y: number }
interface Fx { kind: 'beam' | 'ring' | 'burst' | 'blink'; x: number; y: number; x2?: number; y2?: number; r?: number; t: number; max: number; color: string }
interface Particle { x: number; y: number; vx: number; vy: number; t: number; max: number; color: string; size: number }
interface Floater { x: number; y: number; text: string; color: string; t: number; size: number }

interface Slot {
  view: SpiritLike;
  strength: number;
  form: number;
  color: string;
  name: string;
  generosity: number;
  lastBits: number | null;
  vessel: number;
  cap: number;
  flash: number;
  thin: number;
}

export function runScreen(link: DungeonLink, welcome: Welcome, journey: Journey, host: RoundHost): Screen {
  const level = welcome.level;
  const me = welcome.you;
  const W = welcome.arena.w, H = welcome.arena.h;
  const pillars = welcome.pillars;
  const slots: (Slot | null)[] = welcome.slots.map((s) => {
    if (!s) return null;
    const view: SpiritLike = { element: s.element, magnitude: s.magnitude, traits: toTraits(s.traits) };
    return { view, strength: s.strength, form: s.traits.form, color: ELEMENT_COLOR[s.element]!, name: spiritName(view), generosity: spiritStats(view).generosity, lastBits: null, vessel: 1, cap: 1, flash: 0, thin: 0 };
  });
  for (const r of welcome.refused) host.toast(`A name was not heard at the threshold: ${r}`, '#ff7a6b');

  // ---------- mirror of the dungeon ----------
  let snap: Snapshot | null = null; // latest (HUD, self)
  let view: Snapshot | null = null; // the snapshot being interpolated towards (what's drawn)
  const player = { x: W / 2, y: H / 2, hp: B.player.hp, ward: 0, invuln: false, strain: 0, capacity: 4, hurt: 0 };
  const cam = { x: player.x, y: player.y };
  const enemyFlash = new Map<number, number>();
  let over: RoundResult | null = null;
  let paused = false;

  // ---------- local-only visuals ----------
  const tint = ELEMENT_COLOR[(journey.element + level * 3) % 8]!;
  const motes = Array.from({ length: 220 }, (_, i) => ({ x: rand(0, W), y: rand(0, H), v: rand(6, 22), d: String(i % 8) }));
  let fx: Fx[] = [];
  let parts: Particle[] = [];
  let floaters: Floater[] = [];
  let shake = 0;
  let hitSoundT = 0;
  let banner: { text: string; sub: string; t: number } | null = { text: descentName(level).toUpperCase(), sub: level === 0 ? 'Wave 1. They come for the light in you.' : `Descent ${level + 1}. The dark is thicker here.`, t: 3 };
  let wardenName = '';

  // ---------- prediction (you) ----------
  const arena = { w: W, h: H, pillars };
  const pred: Pos = { x: W / 2, y: H / 2 }; // where you are, as far as the client can tell
  const offset: Pos = { x: 0, y: 0 }; // leftover correction, smoothed away
  let predInit = false;
  let alive = true;
  let pending: MoveCmd[] = []; // sent, not yet acknowledged by the dungeon
  let outbox: MoveCmd[] = []; // not yet sent
  let seq = 0;
  let tickAcc = 0;
  let sendT = 0;

  // ---------- interpolation (everything else) ----------
  const snaps: Snapshot[] = []; // recent snapshots, oldest first
  let clockOffset: number | null = null; // dungeon time minus client time
  const pos = new Map<string, Pos>(); // interpolated positions this frame, keyed "kind:id"
  const later: { time: number; ev: SimEvent }[] = []; // world events, shown when the interpolated view reaches them
  const now = () => performance.now() / 1000;
  const renderTime = () => (clockOffset === null ? 0 : now() + clockOffset - INTERP);

  function interpolate() {
    pos.clear();
    if (!snaps.length) return;
    const rt = renderTime();
    let i = snaps.findIndex((x) => x.time > rt);
    if (i === -1) i = snaps.length - 1; // ahead of the newest: hold it
    const b = snaps[i]!, a = snaps[Math.max(0, i - 1)]!;
    const k = b === a || b.time === a.time ? 1 : Math.max(0, Math.min(1, (rt - a.time) / (b.time - a.time)));
    view = b;
    const index = (x: Snapshot) => {
      const m = new Map<string, Pos>();
      for (const e of x.enemies) m.set('e:' + e.id, e);
      for (const e of x.allies) m.set('a:' + e.id, e);
      for (const e of x.projs) m.set('j:' + e.id, e);
      for (const e of x.players) if (e.id !== me) m.set('p:' + e.id, e);
      return m;
    };
    const ia = index(a);
    for (const [key, pb] of index(b)) {
      const pa = ia.get(key);
      pos.set(key, pa ? { x: pa.x + (pb.x - pa.x) * k, y: pa.y + (pb.y - pa.y) * k } : { x: pb.x, y: pb.y });
    }
  }

  function burst(x: number, y: number, color: string, n: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = rand(40, 220);
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, max: rand(0.3, 0.8), color, size: rand(1.5, 3.5) });
    }
  }

  // ---------- from the dungeon ----------
  link.onSnapshot = (s) => {
    snap = s;
    // the dungeon's clock, estimated; a pause or a big jump resets it outright
    const target = s.time - now();
    clockOffset = clockOffset === null || Math.abs(target - clockOffset) > 0.5 ? target : clockOffset + (target - clockOffset) * 0.1;
    snaps.push(s);
    while (snaps.length > 2 && snaps[1]!.time < renderTime() - 0.2) snaps.shift();
    if (snaps.length > 60) snaps.shift();
    const mine = s.players.find((p) => p.id === me);
    if (mine) {
      alive = mine.alive;
      Object.assign(player, { hp: mine.hp, ward: mine.ward, invuln: mine.invuln, strain: mine.strain, capacity: mine.capacity });
      mine.slots.forEach((v, i) => { const sl = slots[i]; if (sl && v) { sl.lastBits = v.lastBits; sl.vessel = v.vessel; sl.cap = v.cap; } });
      reconcile(mine);
    }
    for (const ev of s.events) {
      if ('p' in ev && ev.p === me) onEvent(ev, mine); // your own doings: at once
      else later.push({ time: s.time, ev }); // the world's: when the interpolated view gets there
    }
  };

  /** Server reconciliation: start from the dungeon's position, replay what it hasn't applied yet. */
  function reconcile(mine: SnapPlayer) {
    pending = pending.filter((c) => c.seq > mine.ack);
    const corrected = { x: mine.x, y: mine.y };
    for (const c of pending) movePlayer(corrected, c, arena);
    if (predInit) {
      const dx = pred.x - corrected.x, dy = pred.y - corrected.y;
      if (Math.hypot(dx, dy) < SNAP_CORRECTION) { offset.x += dx; offset.y += dy; } // hide small corrections
      else { offset.x = 0; offset.y = 0; } // a blink or a big miss: go there now
    }
    predInit = true;
    pred.x = corrected.x; pred.y = corrected.y;
  }

  /** One client tick: predict your own movement at once and queue the command for the dungeon. */
  function clientTick() {
    if (paused || over || !alive || !predInit) return;
    let mx = 0, my = 0;
    if (keys.has('w') || keys.has('arrowup')) my -= 1;
    if (keys.has('s') || keys.has('arrowdown')) my += 1;
    if (keys.has('a') || keys.has('arrowleft')) mx -= 1;
    if (keys.has('d') || keys.has('arrowright')) mx += 1;
    const aim = toWorld(mouse.sx, mouse.sy);
    const cmd: MoveCmd = { seq: ++seq, mx, my, ax: aim.x, ay: aim.y, dt: TICK };
    movePlayer(pred, cmd, arena);
    pending.push(cmd);
    outbox.push(cmd);
    if (pending.length > 600) pending.shift(); // the dungeon has stopped answering; don't grow forever
  }
  link.onEnd = (r) => end(r);
  link.onClose = () => { if (!over) host.toast('The dungeon fell silent.', '#ff7a6b'); };

  function onEvent(ev: SimEvent, mine: SnapPlayer | undefined) {
    switch (ev.e) {
      case 'cast': {
        if (ev.p !== me) return;
        const sl = slots[ev.slot];
        if (!sl) return;
        sl.thin = ev.thin ? 1.2 : 0;
        floaters.push({ x: ev.x - 60 + ev.slot * 24, y: ev.y - 26 - (ev.slot % 2) * 12, text: ev.effective.toFixed(1), color: sl.color, t: 0, size: 13 });
        if (ev.thin) floaters.push({ x: ev.x, y: ev.y - 44, text: 'your vessel runs low', color: '#9c8f74', t: 0, size: 12 });
        sfx.sfxCast(ev.form, ev.element, ev.effect / 30);
        return;
      }
      case 'refused':
        if (ev.p === me) floaters.push({ x: player.x, y: player.y - 26, text: 'unheard', color: '#9c8f74', t: 0, size: 13 });
        return;
      case 'backlash':
        if (ev.p === me) { sfx.sfxBacklash(); burst(player.x, player.y, '#ff5040', 20); }
        return;
      case 'hit': {
        enemyFlash.set(ev.id, 0.12);
        if (hitSoundT <= 0) { sfx.sfxHit(); hitSoundT = 0.05; }
        floaters.push({ x: ev.x + rand(-6, 6), y: ev.y - 6, text: ev.dmg >= 10 ? ev.dmg.toFixed(0) : ev.dmg.toFixed(1), color: colorOf(ev.element), t: 0, size: 12 + Math.min(10, ev.dmg / 4) });
        return;
      }
      case 'kill':
        sfx.sfxKill();
        burst(ev.x, ev.y, B.enemies[ev.kind].color, 18);
        burst(ev.x, ev.y, colorOf(ev.element), 10);
        return;
      case 'hurt':
        if (ev.p !== me) return;
        player.hurt = 0.25;
        sfx.sfxHurt();
        shake = Math.min(12, shake + ev.dmg * 0.6);
        if (ev.why) floaters.push({ x: player.x, y: player.y - 30, text: ev.why, color: '#ff7a6b', t: 0, size: 15 });
        return;
      case 'absorb':
        if (ev.p === me) burst(player.x, player.y, '#cfe8ff', 4);
        return;
      case 'beam':
        fx.push({ kind: 'beam', x: ev.x, y: ev.y, x2: ev.x2, y2: ev.y2, t: 0, max: ev.dur, color: colorOf(ev.element), r: ev.width });
        return;
      case 'ring':
        fx.push({ kind: 'ring', x: ev.x, y: ev.y, r: ev.r, t: 0, max: ev.ward ? 0.5 : 0.4, color: ev.ward ? '#cfe8ff' : colorOf(ev.element) });
        return;
      case 'blink':
        fx.push({ kind: 'blink', x: ev.x, y: ev.y, t: 0, max: 0.35, color: colorOf(ev.element) });
        fx.push({ kind: 'blink', x: ev.x2, y: ev.y2, t: 0, max: 0.35, color: colorOf(ev.element) });
        return;
      case 'nova':
        fx.push({ kind: 'burst', x: ev.x, y: ev.y, r: ev.r, t: 0, max: 0.45, color: colorOf(ev.element) });
        sfx.sfxNova(ev.element);
        burst(ev.x, ev.y, colorOf(ev.element), 30);
        shake = Math.min(10, shake + 4);
        return;
      case 'summon': burst(ev.x, ev.y, colorOf(ev.element), 12); return;
      case 'dismiss': burst(ev.x, ev.y, colorOf(ev.element), 8); return;
      case 'spark': burst(ev.x, ev.y, colorOf(ev.element), 7); return;
      case 'enemyCast':
        floaters.push({ x: ev.x, y: ev.y - (ev.warden ? 44 : 20), text: ev.effective.toFixed(0), color: ev.warden ? '#e7c26b' : '#9c8f74', t: 0, size: ev.warden ? 13 : 11 });
        sfx.sfxEnemyCast();
        return;
      case 'spawn': burst(ev.x, ev.y, '#554a66', 10); return;
      case 'wave': sfx.sfxWave(); return;
      case 'breather':
        banner = { text: `WAVE ${ev.wave + 1}`, sub: ev.wave + 1 === 3 ? 'Shamans walk with them, speaking names of their own.' : 'Breathe. Let the strain ebb.', t: 3 };
        return;
      case 'warden': {
        const view: SpiritLike = { element: ev.element, magnitude: ev.magnitude, traits: toTraits(ev.traits) };
        wardenName = spiritName(view);
        banner = { text: `THE WARDEN OF ${descentName(level).toUpperCase()}`, sub: `It speaks the name of ${wardenName}.`, t: 3.5 };
        sfx.sfxWarden();
        return;
      }
    }
  }

  // ---------- input ----------
  const keys = new Set<string>();
  const mouse = { sx: 0, sy: 0 };
  let viewW = window.innerWidth, viewH = window.innerHeight;
  const toWorld = (sx: number, sy: number) => ({ x: sx - viewW / 2 + cam.x, y: sy - viewH / 2 + cam.y });
  function cast(i: number) {
    const s = slots[i];
    if (!s || over || paused) return;
    const aim = toWorld(mouse.sx, mouse.sy);
    link.cast(i, aim.x, aim.y);
    s.flash = 0.25;
    // gathering spark: the dungeon answers on its next tick
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

  // ---------- update (local only) ----------
  function update(dt: number) {
    // you: predicted at the client's tick rate, commands batched to the dungeon
    tickAcc = Math.min(tickAcc + dt, 0.25);
    while (tickAcc >= TICK) { tickAcc -= TICK; clientTick(); }
    sendT -= dt;
    if (sendT <= 0 && outbox.length) { link.cmds(outbox); outbox = []; sendT = SEND_EVERY; }
    const decay = Math.exp(-dt * CORRECTION_DECAY);
    offset.x *= decay; offset.y *= decay;
    player.x = pred.x + offset.x; player.y = pred.y + offset.y;
    // everything else: interpolated in the past; world events play when the view reaches them
    interpolate();
    const rt = renderTime();
    while (later.length && later[0]!.time <= rt) onEvent(later.shift()!.ev, undefined);
    if (paused) return;
    if (banner) { banner.t -= dt; if (banner.t <= 0) banner = null; }
    hitSoundT -= dt;
    player.hurt = Math.max(0, player.hurt - dt);
    for (const [id, t] of enemyFlash) { if (t - dt <= 0) enemyFlash.delete(id); else enemyFlash.set(id, t - dt); }
    // trails
    for (const p of view?.projs ?? []) { const s = pos.get('j:' + p.id); if (s && Math.random() < 0.6) parts.push({ x: s.x, y: s.y, vx: rand(-20, 20), vy: rand(-20, 20), t: 0, max: 0.3, color: colorOf(p.element), size: 2 }); }
    for (const a of view?.allies ?? []) { const s = pos.get('a:' + a.id); if (s && Math.random() < dt * 10) parts.push({ x: s.x, y: s.y, vx: rand(-15, 15), vy: rand(-30, -5), t: 0, max: 0.6, color: colorOf(a.element), size: 2 }); }
    for (const e of view?.enemies ?? []) { const s = pos.get('e:' + e.id); if (s && e.hexed && Math.random() < 0.3) parts.push({ x: s.x + rand(-e.r, e.r), y: s.y + rand(-e.r, e.r), vx: 0, vy: -30, t: 0, max: 0.5, color: HEX, size: 2 }); }
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

    // pillars
    for (const p of pillars) {
      ctx.fillStyle = '#15121f';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(231,194,107,0.18)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // novas (pending)
    for (const n of view?.novas ?? []) {
      ctx.strokeStyle = colorOf(n.element);
      ctx.globalAlpha = 0.6;
      ctx.setLineDash([6, 6]);
      if (n.enemy) {
        const k = 1 - n.t / n.max;
        ctx.fillStyle = `rgba(255,80,64,${(0.06 + 0.18 * k).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#ff5040';
      }
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r * (1 - (n.t / n.max) * 0.3), 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    for (const e of view?.enemies ?? []) drawEnemy(ctx, e, t);
    ctx.globalCompositeOperation = 'lighter';
    for (const a of view?.allies ?? []) {
      const s = pos.get('a:' + a.id);
      if (!s) continue;
      ctx.globalAlpha = Math.min(1, 0.25 + a.life / B.forms.summon.life); // fades as it expires
      ctx.fillStyle = colorOf(a.element) + '99';
      ctx.beginPath(); ctx.arc(s.x, s.y, 9 + Math.sin(t * 10) * 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = 'source-over';

    drawPlayer(ctx, t);

    ctx.globalCompositeOperation = 'lighter';
    for (const p of view?.projs ?? []) {
      const s = pos.get('j:' + p.id);
      if (!s) continue;
      ctx.fillStyle = colorOf(p.element);
      ctx.beginPath(); ctx.arc(s.x, s.y, p.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff88';
      ctx.beginPath(); ctx.arc(s.x, s.y, p.r * 0.45, 0, Math.PI * 2); ctx.fill();
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

  function drawEnemy(ctx: CanvasRenderingContext2D, e: Snapshot['enemies'][number], t: number) {
    const s = pos.get('e:' + e.id);
    if (!s) return;
    const x = s.x, y = s.y;
    const d = B.enemies[e.kind as EnemyKind];
    const flash = (enemyFlash.get(e.id) ?? 0) > 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = flash ? '#ffffff' : d.color;
    if (e.kind === 'runner') {
      ctx.rotate(Math.atan2(player.y - y, player.x - x));
      ctx.beginPath(); ctx.moveTo(e.r + 3, 0); ctx.lineTo(-e.r, e.r * 0.8); ctx.lineTo(-e.r, -e.r * 0.8); ctx.closePath(); ctx.fill();
    } else if (e.kind === 'warden') {
      octagon(ctx, e.r, t * 0.15);
      ctx.fill();
      ctx.strokeStyle = colorOf(e.element);
      ctx.lineWidth = 2;
      octagon(ctx, e.r + 8, -t * 0.25);
      ctx.stroke();
      const w = snap?.warden;
      if (w) ctx.drawImage(sigilCanvas({ element: w.element, magnitude: w.magnitude, traits: toTraits(w.traits) }, 64), -e.r * 0.7, -e.r * 0.7, e.r * 1.4, e.r * 1.4);
    } else if (e.kind === 'brute') {
      octagon(ctx, e.r, t * 0.5);
      ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(0, 0, e.r, 0, Math.PI * 2); ctx.fill();
    }
    if (e.kind === 'shaman') {
      ctx.strokeStyle = colorOf(e.element);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, e.r + 5 + Math.sin(t * 5) * 1.5, 0, Math.PI * 2); ctx.stroke();
      // strained shamans flicker: they are vulnerable
      if (e.strained) { ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 20); ctx.strokeStyle = '#ff9e5a'; ctx.beginPath(); ctx.arc(0, 0, e.r + 9, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; }
    }
    ctx.restore();
    ctx.fillStyle = e.hexed ? HEX : '#ffddaa';
    const a = Math.atan2(player.y - y, player.x - x);
    ctx.fillRect(x + Math.cos(a) * e.r * 0.5 - 2, y + Math.sin(a) * e.r * 0.5 - 1, 2, 2);
    if (e.hp < e.maxHp) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x - e.r, y - e.r - 8, e.r * 2, 3);
      ctx.fillStyle = '#ff7a6b';
      ctx.fillRect(x - e.r, y - e.r - 8, (e.r * 2 * Math.max(0, e.hp)) / e.maxHp, 3);
    }
  }

  function drawPlayer(ctx: CanvasRenderingContext2D, t: number) {
    // other players first (a shared dungeon), then you
    for (const p of view?.players ?? []) {
      if (p.id === me || !p.alive) continue;
      const s = pos.get('p:' + p.id);
      if (!s) continue;
      ctx.fillStyle = '#9c8f74';
      ctx.beginPath(); ctx.arc(s.x, s.y, B.player.radius, 0, Math.PI * 2); ctx.fill();
    }
    const strained = player.strain / player.capacity;
    const glow = ELEMENT_COLOR[journey.element]!;
    ctx.save();
    ctx.translate(player.x, player.y);
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
    ctx.globalAlpha = player.invuln ? 0.5 : 1;
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
    for (const e of view?.enemies ?? []) {
      const s = pos.get('e:' + e.id);
      if (!s) continue;
      const sx = s.x - cam.x + w / 2, sy = s.y - cam.y + h / 2;
      if (sx > -e.r && sx < w + e.r && sy > -e.r && sy < h + e.r) continue;
      const dx = sx - w / 2, dy = sy - h / 2;
      const k = Math.min((w / 2 - m) / Math.abs(dx || 1e-6), (h / 2 - m) / Math.abs(dy || 1e-6));
      ctx.save();
      ctx.translate(w / 2 + dx * k, h / 2 + dy * k);
      ctx.rotate(Math.atan2(dy, dx));
      ctx.globalAlpha = Math.max(0.25, 1 - Math.hypot(dx, dy) / 1400);
      ctx.fillStyle = e.kind === 'shaman' ? '#e7c26b' : B.enemies[e.kind as EnemyKind].color;
      ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, 5); ctx.lineTo(-5, -5); ctx.closePath(); ctx.fill();
      ctx.restore();
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
    ];
    drawIndicators(ctx, w, h);
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

    const wave = snap?.wave ?? 0, breather = snap?.breather ?? 1;
    ctx.textAlign = 'center';
    ctx.font = '18px Cinzel, serif';
    ctx.fillStyle = '#e7c26b';
    ctx.fillText(over ? '' : breather > 0 && wave > 0 ? `WAVE ${wave} CLEARED` : `WAVE ${wave + 1} / ${B.waves.length}`, w / 2, 30);
    ctx.font = '11px EB Garamond, serif';
    ctx.fillStyle = '#9c8f74';
    ctx.fillText(`descent ${level + 1} · ${descentName(level)}`, w / 2, 62);
    ctx.font = '12px EB Garamond, serif';
    ctx.fillText(`${snap?.kills ?? 0} banished · ${snap?.remaining ?? 0} remain`, w / 2, 48);
    const warden = snap?.warden;
    if (warden) {
      const bw = Math.min(420, w * 0.5);
      ctx.fillStyle = 'rgba(10,9,17,0.8)';
      ctx.fillRect(w / 2 - bw / 2 - 4, 72, bw + 8, 22);
      ctx.fillStyle = '#3a1f22';
      ctx.fillRect(w / 2 - bw / 2, 84, bw, 6);
      ctx.fillStyle = '#e7c26b';
      ctx.fillRect(w / 2 - bw / 2, 84, (bw * warden.hp) / warden.maxHp, 6);
      ctx.font = '11px Cinzel, serif';
      ctx.fillText(`the Warden · ${wardenName}`, w / 2, 81);
      hud.push({ x: w / 2 - bw / 2 - 4, y: 72, w: bw + 8, h: 22, tip: HELP.warden });
    }

    const active = slots.map((s, i) => ({ s, i })).filter((x) => x.s);
    const sw = 150, gap = 8;
    const total = active.length * sw + (active.length - 1) * gap;
    let x = w / 2 - total / 2;
    const y = h - 78;
    const mw = Math.max(total, 300);
    const mx = w / 2 - mw / 2, my = y - 22;
    ctx.fillStyle = 'rgba(10,9,17,0.75)';
    ctx.fillRect(mx - 6, my - 14, mw + 12, 26);
    const scale = Math.max(player.capacity * 1.6, player.strain * 1.05);
    ctx.fillStyle = '#2a2233';
    ctx.fillRect(mx, my, mw, 7);
    ctx.fillStyle = player.strain > player.capacity ? (Math.sin(t * 20) > 0 ? '#ff5040' : '#ff9e5a') : '#ff9e5a';
    ctx.fillRect(mx, my, Math.min(mw, (mw * player.strain) / scale), 7);
    ctx.fillStyle = '#e9dcb8';
    ctx.fillRect(mx + (mw * player.capacity) / scale - 1, my - 3, 2, 13);
    ctx.textAlign = 'left';
    ctx.font = '11px JetBrains Mono, monospace';
    ctx.fillStyle = '#9c8f74';
    ctx.fillText(`strain ${player.strain.toFixed(1)} / ${player.capacity.toFixed(1)}`, mx, my - 3);
    hud.push({ x: mx - 6, y: my - 14, w: mw + 12, h: 26, tip: HELP.strain });
    if (journey.newcomer && !over) {
      ctx.textAlign = 'center';
      ctx.font = 'italic 14px EB Garamond, serif';
      ctx.fillStyle = 'rgba(233,220,184,0.7)';
      ctx.fillText('WASD to move · aim with the mouse · left/right click and keys 1, 2 to evoke · Esc to pause', w / 2, my - 22);
      ctx.textAlign = 'left';
    }
    for (const { s, i } of active) {
      const sl = s!;
      hud.push({ x, y, w: sw, h: 62, tip: `<b style="color:${sl.color}">${sl.name}</b>: ${FORMS[sl.form]!.name}, ${FORMS[sl.form]!.desc}. Your name holds ${truths(sl.strength)}.<br>${HELP.hudSlot}` });
      ctx.fillStyle = sl.flash > 0 ? 'rgba(231,194,107,0.22)' : 'rgba(10,9,17,0.8)';
      ctx.fillRect(x, y, sw, 62);
      ctx.strokeStyle = sl.color;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, sw - 1, 61);
      ctx.fillStyle = '#e7c26b';
      ctx.font = '12px JetBrains Mono, monospace';
      ctx.fillText(SLOTS[i]!.label, x + 6, y + 14);
      ctx.globalAlpha = sl.flash > 0 ? 1 : 0.55;
      ctx.drawImage(sigilCanvas(sl.view, 64), x + sw - 44, y + 18, 32, 32);
      ctx.globalAlpha = 1;
      ctx.fillStyle = sl.color;
      ctx.font = '14px Cinzel, serif';
      ctx.fillText(sl.name.slice(0, 12), x + 6, y + 30);
      ctx.fillStyle = '#9c8f74';
      ctx.font = '11px EB Garamond, serif';
      ctx.fillText(`${FORMS[sl.form]!.name} · ${truths(sl.strength)}`, x + 6, y + 44);
      ctx.textAlign = 'right';
      ctx.font = '12px JetBrains Mono, monospace';
      ctx.fillStyle = sl.thin > 0 ? '#ff9e5a' : '#e9dcb8';
      ctx.fillText(sl.lastBits !== null ? `${sl.lastBits.toFixed(1)}` : '—', x + sw - 6, y + 14);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#2a2233';
      ctx.fillRect(x + 6, y + 52, sw - 12, 4);
      ctx.fillStyle = sl.color;
      ctx.fillRect(x + 6, y + 52, ((sw - 12) * sl.vessel) / Math.max(1, sl.cap), 4);
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

  function end(result: RoundResult) {
    if (over) return;
    over = result;
    if (result.won) sfx.sfxVictory(); else sfx.sfxDeath();
    const { unlocked } = host.report(result);
    overlay?.remove();
    overlay = frag(`<div class="overlay">
      <h1 style="font-size:40px; color:var(--gold)">${result.won ? 'The dark recedes' : 'You fall'}</h1>
      <div class="prose">${result.won ? `Five waves broken in ${descentName(level)}. The dark is quiet again.${unlocked ? `<br><em>The way down opens: ${descentName(level + 1)}.</em>` : ''}` : `The dark took you at wave ${result.wave}. Your names are kept; names are always kept.`}</div>
      <div class="dim">${result.kills} banished</div>
      <button class="primary" id="back">Return to the sanctum</button>
    </div>`);
    overlay.querySelector('#back')!.addEventListener('click', () => host.leave());
    uiRoot.appendChild(overlay);
  }

  function togglePause() {
    if (over) return;
    paused = !paused;
    link.pause(paused);
    if (paused) {
      overlay = frag(`<div class="overlay">
        <h1 style="font-size:32px; color:var(--gold)">Stillness</h1>
        <div class="dim">Meditation goes on while you rest.</div>
        <div style="display:flex; gap:10px"><button class="primary" id="resume">Resume</button><button id="abandon">Abandon the walk</button></div>
        <div class="faint" style="max-width:520px; font-size:14px; line-height:1.5">WASD to move · aim with the mouse · left/right click and keys 1, 2 to evoke. Every evocation strains your aura; strain ebbs over time. Past your capacity, spirits answer with backlash.</div>
      </div>`);
      overlay.querySelector('#resume')!.addEventListener('click', togglePause);
      overlay.querySelector('#abandon')!.addEventListener('click', () => { paused = false; link.pause(false); overlay?.remove(); overlay = null; link.abandon(); });
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
      // debug/bot hook: read-only view of what this client knows
      (window as any).__run = {
        player, slots, cast,
        enemies: () => (view?.enemies ?? []).map((e) => ({ ...e, ...(pos.get('e:' + e.id) ?? {}) })),
        state: () => ({ wave: snap?.wave ?? 0, kills: snap?.kills ?? 0, over: over ? (over.won ? 'won' : 'lost') : null, breather: snap?.breather ?? 0 }),
        aura: () => ({ strain: player.strain, capacity: player.capacity }),
        net: () => ({ pending: pending.length, correction: Math.hypot(offset.x, offset.y), buffered: snaps.length, behind: snap ? snap.time - renderTime() : 0 }),
      };
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
      link.onSnapshot = link.onEnd = link.onClose = null;
      link.close();
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

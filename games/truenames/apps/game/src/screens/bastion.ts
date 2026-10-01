// The Bastion, as seen by a player: tower defense. THIN CLIENT: the dungeon runs the round.
// You raise shrines to your patrons along the road; the dungeon decides everything they do.
// Never touches the save or the sanctum (see CLAUDE.md rule 6).
import type { Screen } from '../main.ts';
import type { BastionWelcome, DungeonLink, Journey, RoundHost, RoundResult } from '../round.ts';
import { frag } from '../dom.ts';
import { BASTION as T, worldDescentName } from '@truenames/dungeon/balance';
import type { BastionEvent, BastionSnapshot, WireTraits } from '@truenames/dungeon/protocol';
import { ELEMENT_COLOR, ELEMENT_NAMES, FORMS, spiritName, truths, type SpiritLike } from '../lore.ts';
import { FORM_GLYPH } from './codex.ts';
import { sigilCanvas } from '../sigil.ts';
import * as sfx from '../audio.ts';
import { HELP, showTip, hideTip } from '../help.ts';

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const colorOf = (el: number) => (el >= 0 ? ELEMENT_COLOR[el]! : '#9c8f74');
const toTraits = (t: WireTraits) => ({ ...t, flavor: BigInt(t.flavor) });
const INTERP = 0.1;
const FORM_KEYS = ['bolt', 'ring', 'ward', 'lance', 'nova', 'summon', 'hex', 'blink'] as const;
const HUD_TOP = 64, HUD_BOTTOM = 118;

interface Fx { kind: 'beam' | 'ring' | 'burst' | 'throw'; x: number; y: number; x2?: number; y2?: number; r?: number; t: number; max: number; color: string; ward?: boolean }
interface Particle { x: number; y: number; vx: number; vy: number; t: number; max: number; color: string; size: number }
interface Floater { x: number; y: number; text: string; color: string; t: number; size: number }
interface Pos { x: number; y: number }

interface Slot { view: SpiritLike; strength: number; form: number; color: string; name: string; lastBits: number | null; vessel: number; cap: number; flash: number }

export function bastionScreen(link: DungeonLink, welcome: BastionWelcome, journey: Journey, host: RoundHost): Screen {
  const level = welcome.level;
  const L = welcome.bastion;
  const W = L.cols * L.tile, H = L.rows * L.tile;
  const roadTiles = new Set(L.roadTiles.map(([x, y]) => `${x},${y}`));
  const slots: (Slot | null)[] = welcome.slots.map((s, i) => {
    if (!s) return null;
    const own = journey.cosmetics[i];
    const view: SpiritLike = own ? { element: own.element, magnitude: own.magnitude, traits: toTraits(own.traits) } : { element: s.element, magnitude: s.magnitude, traits: toTraits(s.traits) };
    const name = own ? spiritName(view) : `${FORMS[s.traits.form]!.name} of ${ELEMENT_NAMES[s.element]}`;
    return { view, strength: s.strength, form: s.traits.form, color: ELEMENT_COLOR[s.element]!, name, lastBits: null, vessel: 1, cap: 1, flash: 0 };
  });
  for (const r of welcome.refused) host.toast(`A word was not heard at the threshold: ${r}`, '#ff7a6b');

  // ---------- mirror ----------
  let snap: BastionSnapshot | null = null;
  let view: BastionSnapshot | null = null;
  const snaps: BastionSnapshot[] = [];
  let clockOffset: number | null = null;
  const now = () => performance.now() / 1000;
  const renderTime = () => (clockOffset === null ? 0 : now() + clockOffset - INTERP);
  const pos = new Map<string, Pos>();
  const later: { time: number; ev: BastionEvent }[] = [];
  let over: RoundResult | null = null;
  let paused = false;

  // ---------- local visuals ----------
  let fx: Fx[] = [];
  let parts: Particle[] = [];
  let floaters: Floater[] = [];
  let shake = 0;
  let hitSoundT = 0;
  let banner: { text: string; sub: string; t: number } | null = { text: worldDescentName('bastion', level).toUpperCase(), sub: 'Raise shrines to your patrons along the road. Every shrine speaks in your name.', t: 4 };
  const motes = Array.from({ length: 120 }, (_, i) => ({ x: rand(0, W), y: rand(0, H), v: rand(4, 14), d: String(i % 8) }));

  // ---------- selection & input ----------
  let chosen: number | null = slots.findIndex(Boolean); // slot to build
  if (chosen < 0) chosen = null;
  let selectedShrine: number | null = null;
  const mouse = { sx: 0, sy: 0 };
  let scale = 1, ox = 0, oy = 0; // world → screen
  const toWorld = (sx: number, sy: number) => ({ x: (sx - ox) / scale, y: (sy - oy) / scale });
  const tileAt = (sx: number, sy: number) => { const p = toWorld(sx, sy); return { gx: Math.floor(p.x / L.tile), gy: Math.floor(p.y / L.tile) }; };

  function burst(x: number, y: number, color: string, n: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = rand(30, 180);
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, max: rand(0.3, 0.7), color, size: rand(1.5, 3) });
    }
  }

  function interpolate() {
    pos.clear();
    if (!snaps.length) return;
    const rt = renderTime();
    let i = snaps.findIndex((x) => x.time > rt);
    if (i === -1) i = snaps.length - 1;
    const b = snaps[i]!, a = snaps[Math.max(0, i - 1)]!;
    const k = b === a || b.time === a.time ? 1 : Math.max(0, Math.min(1, (rt - a.time) / (b.time - a.time)));
    view = b;
    const index = (x: BastionSnapshot) => {
      const m = new Map<string, Pos>();
      for (const e of x.foes) m.set('f:' + e.id, e);
      for (const e of x.bolts) m.set('b:' + e.id, e);
      for (const e of x.guardians) m.set('g:' + e.id, e);
      return m;
    };
    const ia = index(a);
    for (const [key, pb] of index(b)) {
      const pa = ia.get(key);
      pos.set(key, pa ? { x: pa.x + (pb.x - pa.x) * k, y: pa.y + (pb.y - pa.y) * k } : { x: pb.x, y: pb.y });
    }
  }

  link.onBastion = (s) => {
    snap = s;
    const target = s.time - now();
    clockOffset = clockOffset === null || Math.abs(target - clockOffset) > 0.5 ? target : clockOffset + (target - clockOffset) * 0.1;
    snaps.push(s);
    while (snaps.length > 2 && snaps[1]!.time < renderTime() - 0.2) snaps.shift();
    if (snaps.length > 60) snaps.shift();
    s.slots.forEach((v, i) => { const sl = slots[i]; if (sl && v) { sl.lastBits = v.lastBits; sl.vessel = v.vessel; sl.cap = v.cap; } });
    for (const ev of s.events) {
      // your own acts (building, selling, refusals) at once; the world's when the view reaches them
      if (ev.e === 'built' || ev.e === 'sold' || ev.e === 'denied' || ev.e === 'cleared') onEvent(ev);
      else later.push({ time: s.time, ev });
    }
  };
  link.onEnd = (r) => end(r);
  link.onClose = () => { if (!over) host.toast('The dungeon fell silent.', '#ff7a6b'); };

  function onEvent(ev: BastionEvent) {
    switch (ev.e) {
      case 'shrineCast': {
        const sl = slots[ev.slot];
        if (sl) sl.flash = 0.2;
        floaters.push({ x: ev.x, y: ev.y - 26, text: ev.effective.toFixed(1), color: colorOf(ev.element), t: 0, size: 11 });
        sfx.sfxCast(ev.form, ev.element, Math.min(1, ev.effect / 60) * 0.6);
        return;
      }
      case 'refused': return;
      case 'backlash':
        sfx.sfxBacklash();
        floaters.push({ x: L.hearth.x, y: L.hearth.y - 36, text: 'BACKLASH', color: '#ff5040', t: 0, size: 15 });
        burst(L.hearth.x, L.hearth.y, '#ff5040', 24);
        shake = Math.min(10, shake + 5);
        return;
      case 'hit':
        if (hitSoundT <= 0) { sfx.sfxHit(); hitSoundT = 0.06; }
        floaters.push({ x: ev.x + rand(-5, 5), y: ev.y - 4, text: ev.dmg >= 10 ? ev.dmg.toFixed(0) : ev.dmg.toFixed(1), color: colorOf(ev.element), t: 0, size: 11 + Math.min(9, ev.dmg / 6) });
        return;
      case 'kill':
        sfx.sfxKill();
        burst(ev.x, ev.y, T.foes[ev.kind].color, 14);
        floaters.push({ x: ev.x, y: ev.y - 14, text: `+${ev.reward}`, color: '#e7c26b', t: -0.1, size: 12 });
        return;
      case 'leak':
        sfx.sfxHurt();
        burst(ev.x, ev.y, '#ff7a6b', 20);
        floaters.push({ x: ev.x, y: ev.y - 30, text: `−${ev.dmg}`, color: '#ff7a6b', t: 0, size: 16 });
        shake = Math.min(12, shake + 3 + ev.dmg);
        return;
      case 'beam': fx.push({ kind: 'beam', x: ev.x, y: ev.y, x2: ev.x2, y2: ev.y2, r: ev.width, t: 0, max: ev.dur, color: colorOf(ev.element) }); return;
      case 'ring': fx.push({ kind: 'ring', x: ev.x, y: ev.y, r: ev.r, t: 0, max: ev.ward ? 0.7 : 0.4, color: ev.ward ? '#cfe8ff' : colorOf(ev.element), ward: ev.ward }); return;
      case 'nova': fx.push({ kind: 'burst', x: ev.x, y: ev.y, r: ev.r, t: 0, max: 0.45, color: colorOf(ev.element) }); sfx.sfxNova(ev.element); burst(ev.x, ev.y, colorOf(ev.element), 24); shake = Math.min(8, shake + 2); return;
      case 'throw': fx.push({ kind: 'throw', x: ev.x, y: ev.y, x2: ev.x2, y2: ev.y2, t: 0, max: 0.4, color: colorOf(ev.element) }); return;
      case 'summon': burst(ev.x, ev.y, colorOf(ev.element), 12); return;
      case 'spark': burst(ev.x, ev.y, colorOf(ev.element), 6); return;
      case 'built': { const sl = slots[ev.slot]; burst(ev.gx * L.tile + L.tile / 2, ev.gy * L.tile + L.tile / 2, sl?.color ?? '#e7c26b', 18); sfx.sfxShrineRaise(); return; }
      case 'sold': floaters.push({ x: toWorld(mouse.sx, mouse.sy).x, y: toWorld(mouse.sx, mouse.sy).y, text: `+${ev.refund}`, color: '#e7c26b', t: 0, size: 12 }); selectedShrine = null; return;
      case 'denied': host.toast(ev.why, '#9c8f74'); return;
      case 'wave': sfx.sfxWave(); banner = { text: `WAVE ${ev.wave + 1}`, sub: ev.wave === T.waves - 1 ? 'The Warden comes down the road.' : 'They come for the hearth.', t: 2.5 }; return;
      case 'cleared': banner = { text: `WAVE ${ev.wave + 1} HELD`, sub: `+${ev.bonus} resonance. Raise shrines while the road is quiet.`, t: 2.5 }; return;
      case 'warden': sfx.sfxWarden(); banner = { text: 'THE WARDEN', sub: 'It walks the road toward your hearth.', t: 3 }; return;
    }
  }

  // ---------- input ----------
  const onKey = (e: KeyboardEvent) => {
    if (e.type !== 'keydown') return;
    const k = e.key.toLowerCase();
    if (k === 'escape') { if (chosen !== null || selectedShrine !== null) { chosen = null; selectedShrine = null; } else togglePause(); return; }
    if (k === ' ') { e.preventDefault(); if (!over && !paused) link.callWave(); return; }
    const n = Number(k);
    if (n >= 1 && n <= 4 && slots[n - 1]) { chosen = n - 1; selectedShrine = null; }
  };
  const onMouseMove = (e: MouseEvent) => { mouse.sx = e.clientX; mouse.sy = e.clientY; };
  const onMouseDown = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('.overlay, button, .toast')) return;
    if (e.button === 2) { chosen = null; selectedShrine = null; return; }
    if (e.button !== 0 || over || paused) return;
    // HUD cards
    for (const c of cardRects) if (mouse.sx >= c.x && mouse.sx <= c.x + c.w && mouse.sy >= c.y && mouse.sy <= c.y + c.h) { chosen = c.slot; selectedShrine = null; return; }
    if (sellRect && mouse.sx >= sellRect.x && mouse.sx <= sellRect.x + sellRect.w && mouse.sy >= sellRect.y && mouse.sy <= sellRect.y + sellRect.h && selectedShrine !== null) { link.sell(selectedShrine); return; }
    if (callRect && mouse.sx >= callRect.x && mouse.sx <= callRect.x + callRect.w && mouse.sy >= callRect.y && mouse.sy <= callRect.y + callRect.h) { link.callWave(); return; }
    const { gx, gy } = tileAt(mouse.sx, mouse.sy);
    if (gx < 0 || gy < 0 || gx >= L.cols || gy >= L.rows) return;
    const existing = snap?.shrines.find((t) => t.gx === gx && t.gy === gy);
    if (existing) { selectedShrine = existing.id; chosen = null; return; }
    if (chosen !== null) link.build(chosen, gx, gy);
  };
  const onContext = (e: MouseEvent) => e.preventDefault();

  // ---------- update ----------
  function update(dt: number) {
    interpolate();
    const rt = renderTime();
    while (later.length && later[0]!.time <= rt) onEvent(later.shift()!.ev);
    if (paused) return;
    if (banner) { banner.t -= dt; if (banner.t <= 0) banner = null; }
    hitSoundT -= dt;
    for (const g of view?.guardians ?? []) { const p = pos.get('g:' + g.id); if (p && Math.random() < dt * 8) parts.push({ x: p.x, y: p.y, vx: rand(-12, 12), vy: rand(-25, -5), t: 0, max: 0.6, color: colorOf(g.element), size: 2 }); }
    for (const b of view?.bolts ?? []) { const p = pos.get('b:' + b.id); if (p && Math.random() < 0.7) parts.push({ x: p.x, y: p.y, vx: rand(-15, 15), vy: rand(-15, 15), t: 0, max: 0.25, color: colorOf(b.element), size: 2 }); }
    for (const f of view?.foes ?? []) { const p = pos.get('f:' + f.id); if (p && f.hexed && Math.random() < 0.3) parts.push({ x: p.x + rand(-f.r, f.r), y: p.y + rand(-f.r, f.r), vx: 0, vy: -25, t: 0, max: 0.5, color: '#b56bff', size: 2 }); }
    for (const f of fx) f.t += dt;
    fx = fx.filter((f) => f.t < f.max);
    for (const p of parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.95; p.vy *= 0.95; }
    parts = parts.filter((p) => p.t < p.max);
    if (parts.length > 1400) parts.splice(0, parts.length - 1400);
    for (const f of floaters) { f.t += dt; f.y -= 24 * dt; }
    floaters = floaters.filter((f) => f.t < 1.1);
    for (const s of slots) if (s) s.flash = Math.max(0, s.flash - dt);
    shake = Math.max(0, shake - dt * 30);
  }

  // ---------- drawing ----------
  let cardRects: { x: number; y: number; w: number; h: number; slot: number }[] = [];
  let sellRect: { x: number; y: number; w: number; h: number } | null = null;
  let callRect: { x: number; y: number; w: number; h: number } | null = null;
  let hud: { x: number; y: number; w: number; h: number; tip: string }[] = [];
  let tipShown = false;

  function octagon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot = 0) {
    ctx.beginPath();
    for (let i = 0; i <= 8; i++) {
      const a = rot + (i / 8) * Math.PI * 2 + Math.PI / 8;
      if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
  }

  function draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    ctx.fillStyle = '#0a0911';
    ctx.fillRect(0, 0, w, h);
    scale = Math.min((w - 32) / W, (h - HUD_TOP - HUD_BOTTOM - 16) / H);
    ox = Math.round((w - W * scale) / 2);
    oy = Math.round(HUD_TOP + (h - HUD_TOP - HUD_BOTTOM - H * scale) / 2);
    ctx.save();
    const sx = shake ? rand(-shake, shake) : 0, sy = shake ? rand(-shake, shake) : 0;
    ctx.translate(ox + sx, oy + sy);
    ctx.scale(scale, scale);

    // ground & lattice
    ctx.fillStyle = '#100e18';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(231,194,107,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= L.cols; x++) { ctx.moveTo(x * L.tile, 0); ctx.lineTo(x * L.tile, H); }
    for (let y = 0; y <= L.rows; y++) { ctx.moveTo(0, y * L.tile); ctx.lineTo(W, y * L.tile); }
    ctx.stroke();
    ctx.font = '10px JetBrains Mono, monospace';
    for (const m of motes) {
      m.y -= m.v * 0.016; if (m.y < 0) { m.y = H; m.x = rand(0, W); }
      ctx.fillStyle = `rgba(231,194,107,${(0.05 + 0.08 * Math.sin(t * 0.7 + m.x)).toFixed(3)})`;
      ctx.fillText(m.d, m.x, m.y);
    }
    // the road
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1d1827';
    ctx.lineWidth = L.tile * 0.92;
    ctx.beginPath(); L.road.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    ctx.strokeStyle = 'rgba(231,194,107,0.12)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 10]);
    ctx.lineDashOffset = -t * 20;
    ctx.beginPath(); L.road.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    ctx.setLineDash([]);

    // the hearth
    const hp = snap?.hearth ?? L.hearth.max;
    const hk = Math.max(0, hp / L.hearth.max);
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(L.hearth.x, L.hearth.y, 4, L.hearth.x, L.hearth.y, 60);
    g.addColorStop(0, `rgba(255,170,90,${(0.25 + 0.35 * hk).toFixed(3)})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(L.hearth.x, L.hearth.y, 60, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = '#e7c26b';
    ctx.lineWidth = 2;
    octagon(ctx, L.hearth.x, L.hearth.y, 20, t * 0.3); ctx.stroke();
    ctx.strokeStyle = hk > 0.35 ? '#ffb070' : '#ff5040';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(L.hearth.x, L.hearth.y, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * hk); ctx.stroke();

    // placement preview
    const hovered = tileAt(mouse.sx, mouse.sy);
    const inside = hovered.gx >= 0 && hovered.gy >= 0 && hovered.gx < L.cols && hovered.gy < L.rows;
    if (chosen !== null && inside && !over) {
      const sl = slots[chosen]!;
      const free = !roadTiles.has(`${hovered.gx},${hovered.gy}`) && !snap?.shrines.some((s) => s.gx === hovered.gx && s.gy === hovered.gy);
      const afford = (snap?.resonance ?? 0) >= (snap?.shrineCost ?? Infinity);
      const cx = hovered.gx * L.tile + L.tile / 2, cy = hovered.gy * L.tile + L.tile / 2;
      ctx.fillStyle = free && afford ? sl.color + '33' : 'rgba(255,80,64,0.18)';
      ctx.fillRect(hovered.gx * L.tile, hovered.gy * L.tile, L.tile, L.tile);
      const range = T.forms[FORM_KEYS[sl.form]!].range;
      ctx.strokeStyle = sl.color + '66';
      ctx.setLineDash([4, 6]);
      ctx.beginPath(); ctx.arc(cx, cy, range, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }

    // pending novas
    for (const n of view?.novas ?? []) {
      ctx.strokeStyle = colorOf(n.element);
      ctx.globalAlpha = 0.6;
      ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r * (1 - (n.t / n.max) * 0.3), 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // shrines
    for (const s of view?.shrines ?? snap?.shrines ?? []) {
      const sl = slots[s.slot];
      const cx = s.gx * L.tile + L.tile / 2, cy = s.gy * L.tile + L.tile / 2;
      const color = colorOf(s.element);
      if (selectedShrine === s.id) {
        ctx.strokeStyle = color + '88';
        ctx.setLineDash([4, 6]);
        ctx.beginPath(); ctx.arc(cx, cy, T.forms[FORM_KEYS[s.form]!].range, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.fillStyle = '#17131f';
      octagon(ctx, cx, cy, L.tile * 0.42); ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = selectedShrine === s.id ? 3 : 1.5;
      octagon(ctx, cx, cy, L.tile * 0.42); ctx.stroke();
      if (sl) ctx.drawImage(sigilCanvas(sl.view, 64), cx - 13, cy - 13, 26, 26);
      // readiness ring
      ctx.strokeStyle = color + (s.ready >= 1 ? 'dd' : '66');
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, L.tile * 0.47, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * s.ready); ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = '11px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(FORM_GLYPH[s.form]!, cx + L.tile * 0.36, cy - L.tile * 0.28);
    }

    // foes
    for (const f of view?.foes ?? []) {
      const p = pos.get('f:' + f.id);
      if (!p) continue;
      const d = T.foes[f.kind];
      ctx.fillStyle = d.color;
      if (f.kind === 'runner') { ctx.beginPath(); ctx.arc(p.x, p.y, f.r, 0, Math.PI * 2); ctx.fill(); }
      else if (f.kind === 'brute' || f.kind === 'warden') { octagon(ctx, p.x, p.y, f.r, t * (f.kind === 'warden' ? 0.2 : 0.5)); ctx.fill(); if (f.kind === 'warden') { ctx.strokeStyle = '#e7c26b'; ctx.lineWidth = 2; octagon(ctx, p.x, p.y, f.r + 7, -t * 0.3); ctx.stroke(); } }
      else { ctx.beginPath(); ctx.arc(p.x, p.y, f.r, 0, Math.PI * 2); ctx.fill(); }
      if (f.slowed) { ctx.strokeStyle = 'rgba(207,232,255,0.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, f.r + 3, 0, Math.PI * 2); ctx.stroke(); }
      ctx.fillStyle = f.hexed ? '#b56bff' : '#ffddaa';
      ctx.fillRect(p.x - 3, p.y - 2, 2, 2); ctx.fillRect(p.x + 1, p.y - 2, 2, 2);
      if (f.hp < f.maxHp) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(p.x - f.r, p.y - f.r - 7, f.r * 2, 3);
        ctx.fillStyle = '#ff7a6b'; ctx.fillRect(p.x - f.r, p.y - f.r - 7, (f.r * 2 * Math.max(0, f.hp)) / f.maxHp, 3);
      }
    }

    ctx.globalCompositeOperation = 'lighter';
    for (const gd of view?.guardians ?? []) {
      const p = pos.get('g:' + gd.id);
      if (!p) continue;
      ctx.globalAlpha = Math.min(1, 0.3 + gd.life / T.forms.summon.life);
      ctx.fillStyle = colorOf(gd.element) + 'aa';
      ctx.beginPath(); ctx.arc(p.x, p.y, 10 + Math.sin(t * 9) * 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    for (const b of view?.bolts ?? []) {
      const p = pos.get('b:' + b.id);
      if (!p) continue;
      ctx.fillStyle = colorOf(b.element);
      ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff99';
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2); ctx.fill();
    }
    for (const f of fx) {
      const k = f.t / f.max;
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = f.color;
      ctx.fillStyle = f.color;
      if (f.kind === 'beam') {
        ctx.lineWidth = (f.r ?? 8) * (1 - k * 0.6);
        ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x2!, f.y2!); ctx.stroke();
        ctx.lineWidth = Math.max(1, (f.r ?? 8) * 0.3); ctx.strokeStyle = '#ffffff'; ctx.stroke();
      } else if (f.kind === 'ring') {
        ctx.lineWidth = f.ward ? 2 : 5 * (1 - k) + 1;
        if (f.ward) { ctx.globalAlpha = 0.25 * (1 - k); ctx.beginPath(); ctx.arc(f.x, f.y, f.r ?? 50, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1 - k; }
        ctx.beginPath(); ctx.arc(f.x, f.y, (f.r ?? 50) * (f.ward ? 1 : 0.3 + 0.7 * k), 0, Math.PI * 2); ctx.stroke();
      } else if (f.kind === 'burst') {
        ctx.globalAlpha = 0.5 * (1 - k);
        ctx.beginPath(); ctx.arc(f.x, f.y, (f.r ?? 50) * (0.6 + 0.4 * k), 0, Math.PI * 2); ctx.fill();
      } else if (f.kind === 'throw') {
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 5]);
        ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x2!, f.y2!); ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(f.x2!, f.y2!, 8 + 20 * k, 0, Math.PI * 2); ctx.stroke();
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
      ctx.globalAlpha = Math.max(0, Math.min(1, 1.1 - f.t));
      ctx.fillStyle = f.color;
      ctx.font = `${f.size}px JetBrains Mono, monospace`;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    drawHud(ctx, w, h, t);
  }

  function drawHud(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    hud = [];
    const s = snap;
    // top bar: hearth, resonance, wave, strain
    ctx.fillStyle = 'rgba(10,9,17,0.85)';
    ctx.fillRect(0, 0, w, HUD_TOP - 8);
    ctx.textAlign = 'left';
    ctx.font = '14px Cinzel, serif';
    ctx.fillStyle = '#ffb070';
    ctx.fillText(`hearth ${Math.max(0, s?.hearth ?? L.hearth.max)} / ${L.hearth.max}`, 18, 24);
    hud.push({ x: 12, y: 8, w: 170, h: 22, tip: HELP.hearth });
    ctx.fillStyle = '#e7c26b';
    ctx.fillText(`resonance ${s?.resonance ?? 0}`, 18, 46);
    hud.push({ x: 12, y: 30, w: 170, h: 22, tip: HELP.resonance });
    ctx.textAlign = 'center';
    ctx.font = '18px Cinzel, serif';
    ctx.fillText(s ? (s.running ? `WAVE ${s.wave + 1} / ${s.waves}` : s.wave >= s.waves ? '' : `WAVE ${s.wave + 1} IN ${Math.ceil(s.breather)}`) : '', w / 2, 26);
    ctx.font = '11px EB Garamond, serif';
    ctx.fillStyle = '#9c8f74';
    ctx.fillText(`${worldDescentName('bastion', level)} · ${s?.kills ?? 0} banished · ${s?.remaining ?? 0} on the road`, w / 2, 44);
    hud.push({ x: w / 2 - 170, y: 8, w: 340, h: 44, tip: HELP.bastionWave });
    // call wave
    callRect = null;
    if (s && !s.running && s.wave < s.waves && !over) {
      callRect = { x: w / 2 + 140, y: 12, w: 124, h: 30 };
      ctx.strokeStyle = '#e7c26b';
      ctx.fillStyle = 'rgba(231,194,107,0.1)';
      ctx.fillRect(callRect.x, callRect.y, callRect.w, callRect.h);
      ctx.strokeRect(callRect.x + 0.5, callRect.y + 0.5, callRect.w - 1, callRect.h - 1);
      ctx.fillStyle = '#e7c26b';
      ctx.font = '12px Cinzel, serif';
      ctx.fillText(`call it now (+${Math.floor(s.breather * T.earlyCallPerSecond)})`, callRect.x + callRect.w / 2, callRect.y + 19);
      hud.push({ ...callRect, tip: HELP.callWave });
    }
    // strain
    const mw = 260, mx = w - mw - 24, my = 30;
    const strain = s?.strain ?? 0, cap = s?.capacity ?? 4;
    const sc = Math.max(cap * 1.6, strain * 1.05);
    ctx.fillStyle = '#2a2233';
    ctx.fillRect(mx, my, mw, 7);
    ctx.fillStyle = strain > cap ? (Math.sin(t * 20) > 0 ? '#ff5040' : '#ff9e5a') : '#ff9e5a';
    ctx.fillRect(mx, my, Math.min(mw, (mw * strain) / sc), 7);
    ctx.fillStyle = '#e9dcb8';
    ctx.fillRect(mx + (mw * cap) / sc - 1, my - 3, 2, 13);
    ctx.textAlign = 'left';
    ctx.font = '11px JetBrains Mono, monospace';
    ctx.fillStyle = '#9c8f74';
    ctx.fillText(`strain ${strain.toFixed(1)} / ${cap.toFixed(1)}`, mx, my - 6);
    hud.push({ x: mx - 6, y: my - 18, w: mw + 12, h: 30, tip: HELP.bastionStrain });

    // bottom: shrine cards
    const n = slots.length, cw = 190, ch = 84, gap = 10;
    const total = n * cw + (n - 1) * gap;
    let x = w / 2 - total / 2;
    const y = h - HUD_BOTTOM + 18;
    cardRects = [];
    const cost = s?.shrineCost ?? T.shrineBase;
    const afford = (s?.resonance ?? 0) >= cost;
    slots.forEach((sl, i) => {
      if (!sl) { x += cw + gap; return; }
      cardRects.push({ x, y, w: cw, h: ch, slot: i });
      const count = (s?.shrines ?? []).filter((t) => t.slot === i).length;
      const sel = chosen === i;
      ctx.fillStyle = sel ? 'rgba(231,194,107,0.16)' : sl.flash > 0 ? 'rgba(231,194,107,0.1)' : 'rgba(10,9,17,0.85)';
      ctx.fillRect(x, y, cw, ch);
      ctx.strokeStyle = sel ? '#e7c26b' : sl.color;
      ctx.lineWidth = sel ? 2 : 1;
      ctx.strokeRect(x + 0.5, y + 0.5, cw - 1, ch - 1);
      ctx.drawImage(sigilCanvas(sl.view, 64), x + cw - 46, y + 8, 36, 36);
      ctx.fillStyle = '#e7c26b';
      ctx.font = '12px JetBrains Mono, monospace';
      ctx.fillText(String(i + 1), x + 8, y + 16);
      ctx.fillStyle = sl.color;
      ctx.font = '14px Cinzel, serif';
      ctx.fillText(sl.name.slice(0, 14), x + 22, y + 17);
      ctx.fillStyle = '#9c8f74';
      ctx.font = '11px EB Garamond, serif';
      ctx.fillText(`${FORM_GLYPH[sl.form]} ${FORMS[sl.form]!.name} shrine · ${truths(sl.strength)}`, x + 8, y + 34);
      ctx.fillText(`${count} standing · last rang ${sl.lastBits !== null ? sl.lastBits.toFixed(1) : '—'}`, x + 8, y + 50);
      ctx.fillStyle = afford ? '#e7c26b' : '#6b5f4a';
      ctx.fillText(`raise: ${cost} resonance`, x + 8, y + 66);
      ctx.fillStyle = '#2a2233';
      ctx.fillRect(x + 8, y + 74, cw - 16, 4);
      ctx.fillStyle = sl.color;
      ctx.fillRect(x + 8, y + 74, ((cw - 16) * sl.vessel) / Math.max(1, sl.cap), 4);
      hud.push({ x, y, w: cw, h: ch, tip: `<b style="color:${sl.color}">${sl.name}</b>: ${FORMS[sl.form]!.name} shrine. ${HELP[`shrine_${FORM_KEYS[sl.form]!}` as keyof typeof HELP] ?? ''}<br>${HELP.shrineCard}` });
      x += cw + gap;
    });
    // selected shrine: let it fall
    sellRect = null;
    if (selectedShrine !== null && s) {
      const sh = s.shrines.find((t) => t.id === selectedShrine);
      if (sh) {
        const refund = Math.floor((T.shrineBase + T.shrineStep * (s.shrines.length - 1)) * T.sellRefund);
        sellRect = { x: w / 2 - 110, y: h - HUD_BOTTOM - 26, w: 220, h: 28 };
        ctx.fillStyle = 'rgba(10,9,17,0.9)';
        ctx.fillRect(sellRect.x, sellRect.y, sellRect.w, sellRect.h);
        ctx.strokeStyle = '#9c8f74';
        ctx.strokeRect(sellRect.x + 0.5, sellRect.y + 0.5, sellRect.w - 1, sellRect.h - 1);
        ctx.fillStyle = '#e9dcb8';
        ctx.font = '12px Cinzel, serif';
        ctx.textAlign = 'center';
        ctx.fillText(`let this shrine fall (+${refund})`, w / 2, sellRect.y + 18);
        ctx.textAlign = 'left';
      }
    }
    if (journey.newcomer && !over) {
      ctx.textAlign = 'center';
      ctx.font = 'italic 13px EB Garamond, serif';
      ctx.fillStyle = 'rgba(233,220,184,0.7)';
      ctx.fillText('1–4 or click a card to choose a patron · click the ground to raise a shrine · click a shrine to select it · space calls the wave · Esc pauses', w / 2, h - HUD_BOTTOM + 8);
    }
    if (snap?.warden) {
      const bw = Math.min(360, w * 0.4);
      ctx.fillStyle = '#3a1f22'; ctx.fillRect(w / 2 - bw / 2, HUD_TOP - 6, bw, 5);
      ctx.fillStyle = '#e7c26b'; ctx.fillRect(w / 2 - bw / 2, HUD_TOP - 6, (bw * snap.warden.hp) / snap.warden.maxHp, 5);
    }
    if (banner) {
      ctx.textAlign = 'center';
      ctx.globalAlpha = Math.min(1, banner.t);
      ctx.fillStyle = '#e7c26b';
      ctx.font = '30px Cinzel, serif';
      ctx.fillText(banner.text, w / 2, h * 0.36);
      ctx.fillStyle = '#e9dcb8';
      ctx.font = 'italic 17px EB Garamond, serif';
      ctx.fillText(banner.sub, w / 2, h * 0.36 + 28);
      ctx.globalAlpha = 1;
    }
  }

  function hudHover() {
    const r = paused || over ? null : hud.find((q) => mouse.sx >= q.x && mouse.sx <= q.x + q.w && mouse.sy >= q.y && mouse.sy <= q.y + q.h);
    if (r) { showTip(r.tip, mouse.sx, mouse.sy); tipShown = true; }
    else if (tipShown) { hideTip(); tipShown = false; }
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
      <h1 style="font-size:40px; color:var(--gold)">${result.won ? 'The bastion holds' : 'The hearth goes dark'}</h1>
      <div class="prose">${result.won ? `Ten waves broken at ${worldDescentName('bastion', level)}.${unlocked ? `<br><em>A harder wall awaits: ${worldDescentName('bastion', level + 1)}.</em>` : ''}` : `The road reached your hearth at wave ${result.wave}. Your names are kept; names are always kept.`}</div>
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
        <div class="dim">The road waits. Meditation goes on while you rest.</div>
        <div style="display:flex; gap:10px"><button class="primary" id="resume">Resume</button><button id="abandon">Abandon the bastion</button></div>
        <div class="faint" style="max-width:560px; font-size:14px; line-height:1.5">Choose a patron (1–4 or click its card) and click the ground to raise a shrine. Each shrine speaks its patron's name at foes in range. Every word strains your aura, and shrines to the same patron share one vessel. Space calls the next wave early for extra resonance.</div>
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
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mousedown', onMouseDown);
      window.addEventListener('contextmenu', onContext);
      mouse.sx = window.innerWidth / 2; mouse.sy = window.innerHeight / 2;
      (window as any).__bastion = {
        state: () => snap && { wave: snap.wave, running: snap.running, hearth: snap.hearth, resonance: snap.resonance, cost: snap.shrineCost, shrines: snap.shrines.length, kills: snap.kills, strain: snap.strain, capacity: snap.capacity, over: over ? (over.won ? 'won' : 'lost') : null },
        layout: () => L, slots, build: (slot: number, gx: number, gy: number) => link.build(slot, gx, gy), call: () => link.callWave(),
      };
    },
    unmount() {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('contextmenu', onContext);
      hideTip();
      link.onBastion = link.onEnd = link.onClose = null;
      link.close();
      delete (window as any).__bastion;
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

// A match on screen: draws the sim, takes orders by mouse, keys or touch, and shows what
// you can make. The sim (sim.js) is the match; this only shows it and passes orders in.
//
// Mouse: click or drag a box to select; right-click to move (or attack what's under it);
// A then click to move fighting, S to stop; right-click with nothing selected sets where
// new units gather. 1–5 make units. Arrows pan, the wheel zooms, space goes home, P pauses.
// Touch: tap to select, tap ground or an enemy to order (Fight or Move, by the button),
// drag to pan, pinch to zoom; Box makes the next drag select, Rally the next tap.

import { AIDS } from './aids.js';
import { Fx, drawSwaying, gaitOf, pose, silhouette } from './anim.js';
import { cutout } from './cutout.js';
import { RIVAL_UNITS } from './levels.js';
import { Rival } from './rival.js';
import { SUPPLY_CAP, Sim, rng } from './sim.js';
import { $, el, picture, priced } from './ui.js';
import { icon } from './icons.js';
import { isMuted, play, setMuted, wake } from './sound.js';

const RIVAL = '#d0503c';
const DT = 1 / 30;

export function startMatch({ level, aidId, roster, onEnd }) {
  const sim = new Sim(level, [
    { aid: aidId, roster: roster.map((d) => ({ ...d, aid: aidId })) },
    { aid: 'rival', roster: level.units.map((k) => RIVAL_UNITS[k]), income: level.rival.income },
  ]);
  return new Match(sim, new Rival(sim, 1, level.rival, level.units), aidId, onEnd);
}

class Match {
  constructor(sim, rival, aidId, onEnd) {
    Object.assign(this, { sim, rival, aidId, onEnd });
    this.color = AIDS[aidId].color;
    this.canvas = $('field'); this.g = this.canvas.getContext('2d');
    this.mini = $('minimap'); this.mg = this.mini.getContext('2d');
    this.selected = new Set();
    this.mode = { box: false, order: 'fight', rally: false, armed: false };
    this.keys = new Set();
    this.pointers = new Map();
    this.marks = [];             // order marks on the ground, ours, not the sim's
    this.paused = false; this.speed = 1; this.acc = 0; this.running = true;
    this.off = new AbortController();
    this.images = new Map();

    for (const d of sim.sides.flatMap((s) => s.roster)) this.image(d.art);
    this.image(`img/bases/${aidId}.jpg`); this.image('img/bases/rival.jpg');
    this.ground = this.paintGround();
    this.fx = new Fx(this.ground, this.images);
    this.gaits = new Map();
    this.fog = document.createElement('canvas');

    this.resize();
    const home = sim.hqs[0];
    this.cam = { x: 0, y: 0, z: Math.max(0.6, Math.min(1.6, Math.min(this.vw, this.vh) / 520)) };
    this.look(home.x + Math.min(200, this.vw / 4 / this.cam.z), home.y - Math.min(150, this.vh / 5 / this.cam.z) + 40);

    // New units gather a little way out from the base, toward the middle of the map.
    const mid = { x: sim.w / 2, y: sim.h / 2 }, d = Math.hypot(mid.x - home.x, mid.y - home.y);
    sim.setRally(0, home.x + (mid.x - home.x) / d * 150, home.y + (mid.y - home.y) / d * 150);
    this.told = { made: 0, owners: sim.deposits.map((x) => x.owner), alarm: -99, wave: null };
    this.pings = [];

    this.wire();
    this.buildMakes();
    this.dress();
    window.explorer = this.explorer();
    this.paused = true;
    const touch = matchMedia('(pointer: coarse)').matches, lv = sim.level;
    const keys = touch
      ? [['tap', 'pick a unit, or send it'], ['drag', 'look around'], ['pinch', 'zoom'], [icon('all'), 'your whole army'], [icon('box'), 'pick with a box'], [icon('rally'), 'where new units gather']]
      : [['click', 'pick, or drag a box'], ['right-click', 'move or attack'], ['A', 'then click: fight your way there'], ['1–5', 'make units'], ['Q', 'your whole army'], ['space', 'back to base'], ['arrows · wheel', 'look around'], ['P', 'pause']];
    this.overlay(lv.name, [
      el('p', { className: 'lede', textContent: lv.blurb }),
      el('div', { className: 'facing' }, el('span', { className: 'label', textContent: 'You face' }),
        ...[...new Set(lv.units)].map((k) => el('span', { className: 'foe' }, picture(RIVAL_UNITS[k].art), el('span', { textContent: RIVAL_UNITS[k].name })))),
      el('p', { className: 'goal' }, 'Hold the ', icon('matter'), ' deposits for matter, make units from your roster, and destroy their ', icon('base'), ' base.'),
      el('dl', { className: 'keys' }, ...keys.flatMap(([k, what]) => [el('dt', {}, typeof k === 'string' ? el('kbd', { textContent: k }) : k), el('dd', { textContent: what })])),
    ], [['Begin', () => { wake(); this.paused = false; $('overlay').hidden = true; }]], 'start');
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  image(url) {
    if (!url || this.images.has(url)) return;
    this.images.set(url, null);
    cutout(url).then((src) => { const im = new Image(); im.onload = () => this.images.set(url, im); im.src = src; }).catch(() => {});
  }

  // ---------- the ground ----------

  paintGround() {
    const { w, h, ground, seed } = this.sim.level, c = Object.assign(document.createElement('canvas'), { width: w, height: h }), g = c.getContext('2d');
    const rand = rng(seed + 1);
    g.fillStyle = ground; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {   // broad patches of lighter and darker ground
      const x = rand() * w, y = rand() * h, r = 80 + rand() * 220, grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, rand() < 0.5 ? '#ffffff0c' : '#0000001a'); grad.addColorStop(1, '#00000000');
      g.fillStyle = grad; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < w * h / 160; i++) { g.fillStyle = rand() < 0.5 ? '#ffffff10' : '#00000022'; g.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 1 + rand() * 2); }
    for (const rock of this.sim.rocks) {
      g.beginPath();
      const n = 9 + Math.floor(rand() * 5);
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2, k = rock.r * (0.85 + rand() * 0.25);
        g[i ? 'lineTo' : 'moveTo'](rock.x + Math.cos(a) * k, rock.y + Math.sin(a) * k * 0.8);
      }
      const grad = g.createRadialGradient(rock.x - rock.r * 0.3, rock.y - rock.r * 0.4, rock.r * 0.1, rock.x, rock.y, rock.r);
      grad.addColorStop(0, '#77716a'); grad.addColorStop(1, '#3a3733');
      g.fillStyle = grad; g.shadowColor = '#0008'; g.shadowBlur = 14; g.shadowOffsetY = 6; g.fill();
      g.shadowColor = 'transparent';
    }
    return c;
  }

  /** The map's edge, darkening into the shadow beyond it. */
  paintRim() {
    const { w, h } = this.sim, c = Object.assign(document.createElement('canvas'), { width: w, height: h }), g = c.getContext('2d'), k = 90;
    for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [[0, 0, k, 0, 0, 0, k, h], [w, 0, w - k, 0, w - k, 0, k, h], [0, 0, 0, k, 0, 0, w, k], [0, h, 0, h - k, 0, h - k, w, k]]) {
      const grad = g.createLinearGradient(x0, y0, x1, y1);
      grad.addColorStop(0, '#00000099'); grad.addColorStop(1, '#00000000');
      g.fillStyle = grad; g.fillRect(rx, ry, rw, rh);
    }
    return c;
  }

  // ---------- the camera ----------

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1), r = this.canvas.getBoundingClientRect();
    this.dpr = dpr; this.vw = r.width; this.vh = r.height;
    this.canvas.width = r.width * dpr; this.canvas.height = r.height * dpr;
    this.fog.width = this.canvas.width; this.fog.height = this.canvas.height;
    const mr = this.mini.getBoundingClientRect();
    this.mini.width = mr.width * dpr; this.mini.height = mr.height * dpr;
    if (this.cam) this.clampCam();
  }

  look(x, y) { this.cam.x = x - this.vw / 2 / this.cam.z; this.cam.y = y - this.vh / 2 / this.cam.z; this.clampCam(); }

  clampCam() {
    const { w, h } = this.sim, c = this.cam, vw = this.vw / c.z, vh = this.vh / c.z;
    c.x = vw >= w ? (w - vw) / 2 : Math.max(-60, Math.min(w - vw + 60, c.x));
    c.y = vh >= h ? (h - vh) / 2 : Math.max(-60, Math.min(h - vh + 160, c.y));
  }

  zoomAt(sx, sy, k) {
    const c = this.cam, wx = c.x + sx / c.z, wy = c.y + sy / c.z;
    c.z = Math.max(0.35, Math.min(2.2, c.z * k));
    c.x = wx - sx / c.z; c.y = wy - sy / c.z;
    this.clampCam();
  }

  world(sx, sy) { return { x: this.cam.x + sx / this.cam.z, y: this.cam.y + sy / this.cam.z }; }

  // ---------- orders ----------

  wire() {
    const on = (t, k, f, o = {}) => t.addEventListener(k, f, { signal: this.off.signal, ...o });
    const c = this.canvas;
    on(window, 'resize', () => this.resize());
    on(c, 'contextmenu', (e) => e.preventDefault());
    on(c, 'wheel', (e) => { e.preventDefault(); this.zoomAt(e.offsetX, e.offsetY, e.deltaY < 0 ? 1.12 : 1 / 1.12); }, { passive: false });
    on(c, 'pointerdown', (e) => this.down(e));
    on(c, 'pointermove', (e) => this.move(e));
    on(c, 'pointerup', (e) => this.up(e));
    on(c, 'pointercancel', (e) => { this.pointers.delete(e.pointerId); this.box = null; });
    on(window, 'keydown', (e) => this.key(e, true));
    on(window, 'keyup', (e) => this.key(e, false));
    const miniGo = (e) => { const r = this.mini.getBoundingClientRect(); this.look((e.clientX - r.left) / r.width * this.sim.w, (e.clientY - r.top) / r.height * this.sim.h); };
    on(this.mini, 'pointerdown', (e) => { e.preventDefault(); this.mini.setPointerCapture(e.pointerId); miniGo(e); });
    on(this.mini, 'pointermove', (e) => { if (e.buttons) miniGo(e); });

    $('all-army').onclick = () => { this.selected = new Set(this.sim.units(0).map((u) => u.id)); };
    $('box-mode').onclick = () => { this.mode.box = !this.mode.box; };
    $('order-mode').onclick = () => { this.mode.order = this.mode.order === 'fight' ? 'move' : 'fight'; };
    $('rally-mode').onclick = () => { this.mode.rally = !this.mode.rally; };
    $('pause').onclick = () => this.pause(!this.paused);
    $('speed').onclick = () => { this.speed = this.speed === 1 ? 2 : 1; };
    $('mute').onclick = () => { setMuted(!isMuted()); wake(); this.dress(); };
    on(window, 'pointerdown', wake);
    on(window, 'keydown', wake);
  }

  down(e) {
    this.canvas.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY, x0: e.offsetX, y0: e.offsetY, moved: false, button: e.button, touch: e.pointerType !== 'mouse' });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      this.box = null;
    }
  }

  move(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.offsetX - p.x, dy = e.offsetY - p.y;
    p.x = e.offsetX; p.y = e.offsetY;
    if (Math.hypot(p.x - p.x0, p.y - p.y0) > 8) p.moved = true;
    if (this.pinch && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      this.zoomAt(mx, my, d / this.pinch.d);
      this.cam.x -= (mx - this.pinch.mx) / this.cam.z; this.cam.y -= (my - this.pinch.my) / this.cam.z; this.clampCam();
      this.pinch = { d, mx, my };
      return;
    }
    if (!p.moved) return;
    const boxing = p.touch ? this.mode.box : p.button === 0;
    if (boxing) this.box = { x0: p.x0, y0: p.y0, x1: p.x, y1: p.y };
    else if (p.touch || p.button === 1) { this.cam.x -= dx / this.cam.z; this.cam.y -= dy / this.cam.z; this.clampCam(); }
  }

  up(e) {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (!p) return;
    if (this.pinch) { if (!this.pointers.size) this.pinch = null; return; }
    if (this.box) {
      const b = this.box, a = this.world(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1)), z = this.world(Math.max(b.x0, b.x1), Math.max(b.y0, b.y1));
      const inside = this.sim.units(0).filter((u) => u.x >= a.x && u.x <= z.x && u.y >= a.y && u.y <= z.y).map((u) => u.id);
      this.selected = new Set(e.shiftKey ? [...this.selected, ...inside] : inside);
      this.box = null; this.mode.box = false;
      return;
    }
    if (p.moved) return;
    const at = this.world(p.x0, p.y0);
    if (!p.touch && p.button === 2) return this.order(at, 'move');
    this.tap(at, p.touch, e.shiftKey);
  }

  /** What's under a point: one of yours, or an enemy you can see. */
  under(at) {
    let best = null, bd = Infinity;
    for (const e of this.sim.entities) {
      if (e.side !== 0 && !this.sim.seen?.[0].has(e.id)) continue;
      const d = Math.hypot(e.x - at.x, e.y - (at.y + e.r * 0.6)), reach = e.r * 1.4 + 10 / this.cam.z;
      if (d < reach && d < bd) { bd = d; best = e; }
    }
    return best;
  }

  tap(at, touch, shift) {
    if (this.mode.rally) { this.sim.setRally(0, at.x, at.y); this.mode.rally = false; this.mark(at, 'rally'); return; }
    const hit = this.under(at);
    if (hit?.side === 0 && hit.kind === 'unit') {
      const now = performance.now();
      if (this.lastTap?.id === hit.id && now - this.lastTap.t < 350) {
        // Twice: every one of that design on screen.
        const a = this.world(0, 0), z = this.world(this.vw, this.vh);
        this.selected = new Set(this.sim.units(0).filter((u) => u.design === hit.design && !u.young === !hit.young && u.x > a.x && u.x < z.x && u.y > a.y && u.y < z.y).map((u) => u.id));
      } else if (shift) this.selected.has(hit.id) ? this.selected.delete(hit.id) : this.selected.add(hit.id);
      else this.selected = new Set([hit.id]);
      this.lastTap = { id: hit.id, t: now };
      return;
    }
    if (this.mode.armed) { this.mode.armed = false; return this.order(at, 'fight'); }
    if (touch && this.selected.size) return this.order(at, this.mode.order);
    if (!touch) this.selected.clear();
  }

  order(at, kind) {
    const ids = [...this.selected];
    if (!ids.length) { if (kind === 'move') { this.sim.setRally(0, at.x, at.y); this.mark(at, 'rally'); } return; }
    const hit = this.under(at);
    if (hit && hit.side !== 0) { this.sim.command(0, ids, { kind: 'attack', target: hit }); this.mark(hit, 'attack'); return; }
    // Spread out around the point, so they don't all fight for the same spot.
    const us = ids.map((id) => this.sim.entities.find((e) => e.id === id)).filter(Boolean);
    const ring = Math.sqrt(us.length) * 14;
    us.forEach((u, i) => {
      const a = i * 2.4, k = i ? ring * Math.sqrt(i / us.length) : 0;
      this.sim.command(0, [u.id], { kind, x: at.x + Math.cos(a) * k, y: at.y + Math.sin(a) * k });
    });
    this.mark(at, kind);
  }

  mark(at, kind) { this.marks.push({ x: at.x, y: at.y, kind, ttl: 0.6 }); }

  key(e, down) {
    if (e.target.closest?.('input, textarea')) return;
    const k = e.key.toLowerCase();
    if (down) this.keys.add(k); else this.keys.delete(k);
    if (!down) return;
    if (k === 'a' && this.selected.size) this.mode.armed = true;
    if (k === 'escape') { this.mode.armed = false; this.mode.rally = false; this.mode.box = false; }
    if (k === 'p') this.pause(!this.paused);
    if (k === ' ') { e.preventDefault(); this.look(this.sim.hqs[0].x, this.sim.hqs[0].y); }
    if (k === 'q') this.selected = new Set(this.sim.units(0).map((u) => u.id));
    if (k === 's' || k === 'h') this.sim.command(0, [...this.selected], { kind: 'idle' });
    if (k === '=' || k === '+') this.zoomAt(this.vw / 2, this.vh / 2, 1.15);
    if (k === '-') this.zoomAt(this.vw / 2, this.vh / 2, 1 / 1.15);
    const n = Number(k);
    if (n >= 1 && n <= 9) this.make(n - 1);
  }

  make(i) { this.sim.produce(0, i); }

  pause(on) {
    if (this.sim.winner != null || (!on && !$('overlay').hidden && !this.pausedByMe)) return;
    this.pausedByMe = on;
    this.paused = on;
    this.dress();
    if (!on) return void ($('overlay').hidden = true);
    this.overlay('Paused', [], [['Resume', () => this.pause(false)], ['Give up', () => this.end('lost')]]);
  }

  /** A card over the field: the start, a pause, the end. Lines are words or elements. */
  overlay(title, lines, buttons, kind = '') {
    $('overlay').replaceChildren(el('div', { className: `box ${kind}` }, el('h2', { textContent: title }), ...lines.map((l) => typeof l === 'string' ? el('p', { textContent: l }) : l),
      el('div', { className: 'go' }, ...buttons.map(([t, f], i) => el('button', { className: i ? 'quiet' : 'main', textContent: t, onclick: f })))));
    $('overlay').hidden = false;
    $('overlay').querySelector('.go button')?.focus();
  }

  // ---------- the loop ----------

  frame(now) {
    if (!this.running) return;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (!this.paused) {
      this.acc += dt * this.speed;
      while (this.acc >= DT) { this.rival.tick(DT); this.sim.step(DT); this.acc -= DT; this.fx.take(this.sim.effects, (x, y) => this.visibleAt(x, y)); }
      this.fx.update(dt * this.speed);
      for (const snd of this.fx.sounds) play(snd.kind, this.screenAt(snd), snd.big);
      this.fx.sounds = [];
      this.notice();
      if (this.sim.winner != null) return this.finish();
    }
    const pan = 520 * dt / this.cam.z, k = this.keys;
    if (k.has('arrowleft')) this.cam.x -= pan;
    if (k.has('arrowright')) this.cam.x += pan;
    if (k.has('arrowup')) this.cam.y -= pan;
    if (k.has('arrowdown')) this.cam.y += pan;
    this.clampCam();
    for (const m of this.marks) m.ttl -= dt;
    this.marks = this.marks.filter((m) => m.ttl > 0);
    for (const id of this.selected) if (!this.sim.entities.some((e) => e.id === id)) this.selected.delete(id);
    this.draw();
    if ((this.tick = (this.tick ?? 0) + 1) % 6 === 0) { this.hud(); this.drawMini(); }
    requestAnimationFrame((t) => this.frame(t));
  }

  screenAt(p) { return { x: (p.x - this.cam.x) * this.cam.z, y: (p.y - this.cam.y) * this.cam.z, w: this.vw, h: this.vh }; }

  onScreen(p) { const s = this.screenAt(p); return s.x > 0 && s.y > 0 && s.x < this.vw && s.y < this.vh; }

  /** Tell the commander what they'd want to know: a unit ready, a deposit taken or lost, an attack somewhere they aren't looking. */
  notice() {
    const sim = this.sim, t = sim.t;
    if (sim.stats[0].made > this.told.made) { this.told.made = sim.stats[0].made; play('ready'); }
    sim.deposits.forEach((d, i) => {
      if (d.owner === this.told.owners[i]) return;
      if (d.owner === 0) { this.toast('Deposit taken', false, 'matter'); play('taken'); }
      else if (this.told.owners[i] === 0) { this.toast('Deposit lost', true, 'matter'); play('lost'); this.ping(d); }
      this.told.owners[i] = d.owner;
    });
    if (t - this.told.alarm > 12) {
      const struck = sim.entities.find((e) => e.side === 0 && t - (e.hit ?? -9) < 0.2 && !this.onScreen(e));
      if (struck) {
        this.told.alarm = t;
        this.toast(struck.kind === 'hq' ? 'Your base is under attack' : 'Your units are under attack', true, struck.kind === 'hq' ? 'base' : 'alarm');
        play('alarm'); this.ping(struck);
      }
    }
    if (this.rival.launched && this.rival.launched !== this.told.wave) {
      this.told.wave = this.rival.launched;
      this.toast('Their army is on the move', true, 'alarm'); play('alarm'); this.ping(this.rival.launched);
    }
    for (const p of this.pings) p.age += 1 / 60;
    this.pings = this.pings.filter((p) => p.age < 3);
  }

  ping(p) { this.pings.push({ x: p.x, y: p.y, age: 0 }); }

  toast(text, bad = false, mark = 'ready') {
    const t = el('div', { className: `toast${bad ? ' bad' : ''}` }, icon(mark), text);
    $('toasts').append(t);
    setTimeout(() => t.remove(), 3200);
    while ($('toasts').children.length > 3) $('toasts').firstChild.remove();
  }

  finish() {
    const won = this.sim.winner === 0, s = this.sim.stats, t = Math.round(this.sim.t);
    this.draw(); this.hud();
    play(won ? 'won' : 'beaten');
    const tally = (n, what) => el('div', {}, el('b', { textContent: n }), el('span', { textContent: what }));
    this.overlay(won ? 'Victory' : 'Defeat', [
      el('p', { className: 'lede', textContent: won ? `Their base is down. ${this.sim.level.name} is yours.` : 'Your base is down.' }),
      el('div', { className: 'tally' }, tally(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, 'the fight'), tally(s[0].made, 'made'), tally(s[0].lost, 'lost'), tally(s[0].killed, 'of theirs destroyed')),
    ], [['Back to the front', () => this.end(won ? 'won' : 'lost')]], won ? 'won' : 'lost');
    this.running = false;
  }

  end(result) {
    this.running = false;
    this.off.abort();
    $('overlay').hidden = true;
    delete window.explorer;
    this.onEnd(result);
  }

  // ---------- drawing ----------

  draw() {
    const g = this.g, c = this.cam, dpr = this.dpr, sim = this.sim;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Past the edge of the map: the same ground, in shadow.
    g.fillStyle = sim.level.ground; g.fillRect(0, 0, this.vw, this.vh);
    g.fillStyle = '#000000b0'; g.fillRect(0, 0, this.vw, this.vh);
    const shake = this.fx.shake ? [(Math.random() - 0.5) * this.fx.shake, (Math.random() - 0.5) * this.fx.shake] : [0, 0];
    g.setTransform(c.z * dpr, 0, 0, c.z * dpr, (-c.x * c.z + shake[0]) * dpr, (-c.y * c.z + shake[1]) * dpr);
    g.drawImage(this.ground, 0, 0);
    g.drawImage(this.rim ??= this.paintRim(), 0, 0);

    for (const d of sim.deposits) this.drawDeposit(d);
    if (sim.sides[0].rally) this.drawFlag(sim.sides[0].rally);

    const seen = sim.seen?.[0] ?? new Set();
    const shown = sim.entities.filter((e) => e.side === 0 || seen.has(e.id)).sort((a, b) => (a.y + (a.flying ? 1000 : 0)) - (b.y + (b.flying ? 1000 : 0)));
    for (const e of shown) this.drawShadow(e);
    this.fx.drawBodies(g, c.z);
    for (const e of shown) this.drawEntity(e);
    this.fx.draw(g, c.z, [this.color, RIVAL]);
    for (const m of this.marks) {
      g.strokeStyle = m.kind === 'attack' || m.kind === 'fight' ? RIVAL : m.kind === 'rally' ? '#e6e2d8' : this.color;
      g.globalAlpha = m.ttl / 0.6; g.lineWidth = 2 / c.z;
      g.beginPath(); g.ellipse(m.x, m.y, 18 * (1.4 - m.ttl), 9 * (1.4 - m.ttl), 0, 0, Math.PI * 2); g.stroke();
      g.globalAlpha = 1;
    }
    this.drawFog();
    if (this.box) {
      const b = this.box;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.strokeStyle = this.color; g.lineWidth = 1; g.fillStyle = `${this.color}22`;
      g.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0); g.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
    }
  }

  drawDeposit(d) {
    const g = this.g, col = d.owner === 0 ? this.color : d.owner === 1 ? RIVAL : '#c8b46a';
    const glow = g.createRadialGradient(d.x, d.y, 2, d.x, d.y, 46);
    glow.addColorStop(0, `${col}88`); glow.addColorStop(1, `${col}00`);
    g.fillStyle = glow; g.beginPath(); g.arc(d.x, d.y, 46, 0, Math.PI * 2); g.fill();
    // A cluster of crystals.
    for (const [dx, dy, s] of [[0, -6, 13], [-11, 3, 9], [10, 4, 10], [2, 8, 7]]) {
      g.fillStyle = col; g.strokeStyle = '#0006'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(d.x + dx, d.y + dy - s); g.lineTo(d.x + dx + s * 0.45, d.y + dy); g.lineTo(d.x + dx, d.y + dy + s * 0.35); g.lineTo(d.x + dx - s * 0.45, d.y + dy); g.closePath(); g.fill(); g.stroke();
    }
    g.strokeStyle = `${col}aa`; g.lineWidth = 1.5 / this.cam.z; g.setLineDash([4, 6]);
    g.beginPath(); g.ellipse(d.x, d.y, 70, 70 * 0.55, 0, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    if (d.toward != null && d.pull > 0) {
      g.strokeStyle = d.toward === 0 ? this.color : RIVAL; g.lineWidth = 4 / this.cam.z;
      g.beginPath(); g.arc(d.x, d.y, 26, -Math.PI / 2, -Math.PI / 2 + (d.pull / 4) * Math.PI * 2); g.stroke();
    }
  }

  drawFlag(p) {
    const g = this.g;
    g.strokeStyle = '#e6e2d8'; g.lineWidth = 2 / this.cam.z;
    g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x, p.y - 26); g.stroke();
    g.fillStyle = this.color; g.beginPath(); g.moveTo(p.x, p.y - 26); g.lineTo(p.x + 16, p.y - 21); g.lineTo(p.x, p.y - 16); g.fill();
  }

  drawShadow(e) {
    const g = this.g;
    g.fillStyle = '#0000004d';
    g.beginPath(); g.ellipse(e.x, e.y + e.r * 0.35, e.r * 1.15, e.r * 0.5, 0, 0, Math.PI * 2); g.fill();
  }

  drawEntity(e) {
    const g = this.g, z = this.cam.z, mine = e.side === 0, col = mine ? this.color : RIVAL, sel = this.selected.has(e.id), t = this.sim.t;
    const unit = e.kind === 'unit';
    if (unit && !this.gaits.has(e.design)) this.gaits.set(e.design, gaitOf(e.design));
    const p = unit ? pose(e, this.gaits.get(e.design), t) : { lift: 0, tilt: 0, sx: 1, sy: 1, dx: 0, dy: 0, flash: Math.max(0, 1 - (t - (e.hit ?? -9)) / 0.13) * 0.5 };
    // The team ring, under it: the one sure way to tell whose it is.
    g.strokeStyle = sel ? '#ffffff' : col; g.lineWidth = (sel ? 3 : 2) / z;
    g.beginPath(); g.ellipse(e.x, e.y + e.r * 0.35, e.r * 1.1, e.r * 0.48, 0, 0, Math.PI * 2); g.stroke();
    if (sel) { g.strokeStyle = col; g.lineWidth = 1.5 / z; g.beginPath(); g.ellipse(e.x, e.y + e.r * 0.35, e.r * 1.1 + 4 / z, e.r * 0.48 + 3 / z, 0, 0, Math.PI * 2); g.stroke(); }

    const url = unit ? e.design.art : mine ? `img/bases/${this.aidId}.jpg` : 'img/bases/rival.jpg';
    const im = this.images.get(url);
    const boxH = unit ? e.r * (e.young ? 3 : 3.8) : e.r * 2.8, boxW = e.r * 4.4;
    let h = boxH;
    g.globalAlpha = this.sim.hidden(e) ? 0.4 : 1;
    g.save();
    g.translate(e.x + p.dx, e.y + e.r * 0.45 - p.lift + p.dy);
    g.rotate(p.tilt * (e.face || 1));
    if (im) {
      const k = Math.min(boxH / im.height, boxW / im.width), w = im.width * k;
      h = im.height * k;
      g.scale((unit && e.face < 0 ? -1 : 1) * p.sx, p.sy);
      drawSwaying(g, im, w, h, p.sway);
      if (p.flash > 0) { g.globalAlpha = p.flash * 0.85; g.drawImage(silhouette(im), -w / 2, -h, w, h); }
    } else {
      g.fillStyle = col; g.beginPath(); g.arc(0, -e.r, e.r, 0, Math.PI * 2); g.fill();
    }
    g.restore();
    g.globalAlpha = 1;
    if (unit && p.dust && this.sim.t - (e.moved ?? -1) < 0.12) this.fx.dust(e.x - (e.face || 1) * e.r * 0.8, e.y, e.r);
    if (unit && p.footfall && e.r >= 14 && Math.random() < 0.3) this.fx.dust(e.x, e.y, e.r);

    const top = e.y + e.r * 0.45 - p.lift - h * p.sy;
    if (e.poison) { g.fillStyle = '#9fe060'; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(e.x + Math.sin(t * 4 + i * 2) * e.r, top + h * 0.4 + i * 4, 2 / z + 1, 0, Math.PI * 2); g.fill(); } }
    if (e.sieged) {
      g.strokeStyle = col; g.lineWidth = 2 / z;
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(e.x + s * e.r * 1.3, e.y + e.r * 0.8); g.lineTo(e.x + s * e.r * 1.6, e.y + e.r * 1.1); g.stroke(); }
    }
    // Health, when it's hurt or picked.
    if (e.hp < e.maxHp || sel || !unit) {
      const w = Math.max(26, e.r * 2.2), x = e.x - w / 2, y = top - 8, k = Math.max(0, e.hp / e.maxHp);
      g.fillStyle = '#000a'; g.fillRect(x - 1, y - 1, w + 2, 6);
      g.fillStyle = k > 0.6 ? '#7fc35a' : k > 0.3 ? '#d6b44a' : '#d0503c'; g.fillRect(x, y, w * k, 4);
      if (e.maxShield) { g.fillStyle = '#6ab0e8'; g.fillRect(x, y - 3, w * (e.shield / e.maxShield), 2); }
    }
  }

  visibleAt(x, y) { return this.sim.entities.some((e) => e.side === 0 && Math.hypot(e.x - x, e.y - y) <= e.sight); }

  /** What your side can't see is dimmed: everything beyond your units' and base's sight. */
  drawFog() {
    const f = this.fog.getContext('2d'), c = this.cam, dpr = this.dpr;
    f.setTransform(1, 0, 0, 1, 0, 0);
    f.globalCompositeOperation = 'source-over';
    f.clearRect(0, 0, this.fog.width, this.fog.height);
    f.fillStyle = 'rgba(6, 7, 9, 0.62)'; f.fillRect(0, 0, this.fog.width, this.fog.height);
    f.globalCompositeOperation = 'destination-out';
    for (const e of this.sim.entities) {
      if (e.side !== 0) continue;
      const x = (e.x - c.x) * c.z * dpr, y = (e.y - c.y) * c.z * dpr, r = e.sight * c.z * dpr;
      const grad = f.createRadialGradient(x, y, r * 0.75, x, y, r);
      grad.addColorStop(0, '#000f'); grad.addColorStop(1, '#0000');
      f.fillStyle = grad; f.beginPath(); f.arc(x, y, r, 0, Math.PI * 2); f.fill();
    }
    this.g.setTransform(1, 0, 0, 1, 0, 0);
    this.g.drawImage(this.fog, 0, 0);
  }

  drawMini() {
    const g = this.mg, sim = this.sim, k = this.mini.width / sim.w, kh = this.mini.height / sim.h;
    g.setTransform(k, 0, 0, kh, 0, 0);
    g.drawImage(this.ground, 0, 0);
    g.fillStyle = '#0006'; g.fillRect(0, 0, sim.w, sim.h);
    for (const d of sim.deposits) { g.fillStyle = d.owner === 0 ? this.color : d.owner === 1 ? RIVAL : '#c8b46a'; g.fillRect(d.x - 18, d.y - 18, 36, 36); }
    const seen = sim.seen?.[0] ?? new Set();
    for (const e of sim.entities) {
      if (e.side !== 0 && !seen.has(e.id)) continue;
      g.fillStyle = e.side === 0 ? this.color : RIVAL;
      const s = e.kind === 'hq' ? 70 : Math.max(22, e.r * 2);
      g.fillRect(e.x - s / 2, e.y - s / 2, s, s);
    }
    for (const p of this.pings) {
      g.strokeStyle = `rgba(255, 90, 60, ${1 - p.age / 3})`; g.lineWidth = 6 / k;
      g.beginPath(); g.arc(p.x, p.y, 60 + (p.age % 1) * 220, 0, Math.PI * 2); g.stroke();
    }
    const c = this.cam;
    g.strokeStyle = '#fff'; g.lineWidth = 3 / k;
    g.strokeRect(c.x, c.y, this.vw / c.z, this.vh / c.z);
  }

  // ---------- what you can make ----------

  buildMakes() {
    const side = this.sim.sides[0], a = AIDS[this.aidId];
    $('makes').replaceChildren(...side.roster.map((d, i) => {
      // Tapping the count takes back the last one waiting.
      const count = el('span', { className: 'count', title: 'tap to take one back', onclick: (e) => {
        e.stopPropagation();
        const j = side.queue.lastIndexOf(d);
        if (j >= 0) this.sim.cancel(0, j);
      } });
      return el('button', { className: 'make', onclick: () => this.make(i), dataset: { tip: d.name, about: d.description, cost: `${a.makes === 'grows' ? 'Grows' : 'Builds'} in ${d.priced.seconds}s, takes ${d.priced.supply} room.` } },
        el('i', { className: 'progress' }), picture(d.art), el('strong', { textContent: d.name }),
        el('span', { className: 'line' }, icon('matter'), el('span', { textContent: d.priced.cost }), el('span', { className: 'why' })), el('kbd', { textContent: i + 1 }), count);
    }));
  }

  /** The HUD's fixed parts: their icons, and the labels that follow a setting. */
  dress() {
    const label = (id, name, text) => $(id).replaceChildren(icon(name), ...(text ? [el('span', { textContent: text })] : []));
    label('mute', isMuted() ? 'muted' : 'sound');
    label('pause', this.paused && this.pausedByMe ? 'play' : 'pause');
    label('all-army', 'all', 'All army');
    label('box-mode', 'box', 'Box');
    label('order-mode', this.mode.order === 'fight' ? 'fight' : 'move', this.mode.order === 'fight' ? 'Fight' : 'Move');
    label('rally-mode', 'rally', 'Rally');
    if (!$('matter').firstChild) {
      $('matter').append(icon('matter'), el('b'), el('small'));
      $('supply').append(icon('army'), el('b'), el('i', { className: 'fill' }, el('i')));
      $('clock').append(icon('clock'), el('b'));
    }
  }

  hud() {
    const sim = this.sim, side = sim.sides[0], t = Math.floor(sim.t), room = sim.supply(0);
    $('matter').querySelector('b').textContent = Math.floor(side.matter);
    $('matter').querySelector('small').textContent = `+${(side.rate ?? 0).toFixed(1)}/s`;
    $('supply').querySelector('b').textContent = `${room}/${SUPPLY_CAP}`;
    $('supply').querySelector('.fill i').style.width = `${100 * room / SUPPLY_CAP}%`;
    $('supply').classList.toggle('full', room >= SUPPLY_CAP);
    $('clock').querySelector('b').textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    $('speed').textContent = `×${this.speed}`;
    $('box-mode').classList.toggle('on', this.mode.box);
    $('rally-mode').classList.toggle('on', this.mode.rally);
    $('order-mode').classList.toggle('move', this.mode.order === 'move');
    if (this.dressedFor !== `${this.mode.order}${this.paused && this.pausedByMe}`) { this.dressedFor = `${this.mode.order}${this.paused && this.pausedByMe}`; this.dress(); }
    // Each unit's button: what's growing (its fill), how many wait (its count), and why it can't be made now.
    [...$('makes').children].forEach((b, i) => {
      const d = side.roster[i];
      const bay = side.bays.filter((x) => x.design === d).sort((x, y) => x.left - y.left)[0];
      const waiting = side.queue.filter((x) => x === d).length + side.bays.filter((x) => x.design === d).length;
      const short = d.priced.cost - Math.floor(side.matter), crowded = room + d.priced.supply > SUPPLY_CAP, busy = side.queue.length >= 6;
      b.querySelector('.progress').style.width = bay ? `${100 * (1 - bay.left / d.priced.seconds)}%` : '0';
      b.classList.toggle('making', Boolean(bay));
      const count = b.querySelector('.count');
      count.textContent = waiting > 1 || (waiting && !bay) ? `×${waiting}` : '';
      count.classList.toggle('takeback', side.queue.includes(d));
      b.classList.toggle('poor', short > 0 || crowded || busy);
      b.querySelector('.why').textContent = crowded ? 'army full' : busy ? 'line full' : short > 0 ? `short ${short}` : '';
    });
    // What's picked, grouped by design: tap a group to keep just that group.
    const picked = [...this.selected].map((id) => sim.entities.find((e) => e.id === id)).filter(Boolean);
    const groups = new Map();
    for (const u of picked) { const g = groups.get(u.name) ?? { units: [], art: u.design.art }; g.units.push(u); groups.set(u.name, g); }
    const key = [...groups].map(([n, g]) => `${n}:${g.units.length}:${g.units.reduce((h, u) => h + Math.round(10 * u.hp / u.maxHp), 0)}`).join('|') + this.mode.rally + this.mode.armed;
    if (key !== this.pickedKey) {
      this.pickedKey = key;
      const hint = this.mode.rally ? 'tap where new units should gather' : this.mode.armed ? 'click where to fight' : '';
      $('picked').replaceChildren(...[...groups].map(([name, g]) => {
        const health = g.units.reduce((h, u) => h + u.hp / u.maxHp, 0) / g.units.length;
        return el('button', { className: 'group', title: name, onclick: () => { this.selected = new Set(g.units.map((u) => u.id)); } },
          picture(g.art), el('span', { textContent: g.units.length > 1 ? `${g.units.length} ${name}` : name }), el('i', { style: `width:${Math.round(health * 100)}%` }));
      }), ...(hint ? [el('span', { className: 'hint', textContent: hint })] : []));
    }
  }

  // ---------- for Claude, playing it ----------

  explorer() {
    const sim = this.sim;
    const brief = (e) => ({ id: e.id, name: e.name, side: e.side, x: Math.round(e.x), y: Math.round(e.y), hp: Math.round(e.hp), order: e.order.kind });
    return {
      sim, match: this,
      state: () => ({
        t: Math.round(sim.t), winner: sim.winner, matter: Math.floor(sim.sides[0].matter), supply: sim.supply(0),
        mine: sim.units(0).map(brief), seen: sim.entities.filter((e) => e.side === 1 && sim.seen?.[0].has(e.id)).map(brief),
        bases: sim.hqs.map(brief), deposits: sim.deposits.map((d) => ({ x: d.x, y: d.y, owner: d.owner })),
        making: sim.sides[0].bays.map((b) => b.design.name), queued: sim.sides[0].queue.map((d) => d.name),
      }),
      make: (i) => sim.produce(0, i),
      order: (ids, kind, x, y) => sim.command(0, ids, { kind, x, y }),
      speed: (n) => { this.speed = n; },
      look: (x, y) => this.look(x, y),
    };
  }
}

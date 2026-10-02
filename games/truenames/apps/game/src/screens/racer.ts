// Dark Racer, as seen by a player. THIN CLIENT: the dungeon runs the race. This screen predicts your
// own car with the dungeon's own physics (racing.ts), draws the other cars a little in the past between
// snapshots, and turns events into light and sound. It never touches the save or the sanctum.
import type { Screen } from '../main.ts';
import type { DungeonLink, Journey, RacerWelcome, PilotView, Pilot, RoundHost, RoundResult } from '../round.ts';
import { lendRound, note, explorerCode } from '../explorer.ts';
import { compileDriving } from '../actant-mind.ts';
import { frag } from '../dom.ts';
import { RACER as R, worldDescentName } from '@truenames/dungeon/balance';
import type { RacerCar, RacerEvent, RacerSnapshot, WireTraits } from '@truenames/dungeon/protocol';
import { autopilot, driveCar, type CarState, type DriveCmd, type Track } from '@truenames/dungeon/racing';
import { ELEMENT_COLOR, ELEMENT_NAMES, FORMS, spiritName, truths, type SpiritLike } from '../lore.ts';
import { sigilCanvas } from '../sigil.ts';
import * as sfx from '../audio.ts';
import { showTip, hideTip } from '../help.ts';

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const colorOf = (el: number) => (el >= 0 ? ELEMENT_COLOR[el]! : '#9c8f74');
const toTraits = (t: WireTraits) => ({ ...t, flavor: BigInt(t.flavor) });
const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;
const TICK = 1 / 60;
const SEND_EVERY = 1 / 30;
const INTERP = 0.1;
const SNAP_CORRECTION = 90; // bigger corrections (a blink, a crash you didn't predict) are taken at once
const CORRECTION_DECAY = 10;
const HEX = '#b56bff';

/** How each name is spoken: a key for the left hand, and the mouse or number keys as alternatives. */
const CONTROLS = [
  { label: 'J', keys: ['j', ' '], button: 0, alt: 'space · left click' },
  { label: 'K', keys: ['k'], button: 2, alt: 'right click' },
  { label: 'L', keys: ['l', '1'], button: -1, alt: '1' },
  { label: ';', keys: [';', '2'], button: -1, alt: '2' },
];
/** What each form does on the road, for the HUD's hover help. */
const ON_ROAD = [
  'a seeking bolt at the car ahead: it spins them out',
  'a shockwave that shoves every car near you aside',
  'a ward: the next strike, slick or shove breaks on it',
  'a lance straight ahead: every car it touches is slowed',
  'a mine dropped behind you: it blasts whoever comes close',
  'a servant that hunts down the leader',
  'a slick behind you: cars that cross it lose their grip',
  'a step through the astral: you reappear further down the road',
];

interface Fx { kind: 'beam' | 'ring' | 'burst' | 'blink'; x: number; y: number; x2?: number; y2?: number; r?: number; t: number; max: number; color: string }
interface Particle { x: number; y: number; vx: number; vy: number; t: number; max: number; color: string; size: number }
interface Floater { x: number; y: number; text: string; color: string; t: number; size: number }
interface Slot { view: SpiritLike; strength: number; form: number; color: string; name: string; lastBits: number | null; vessel: number; cap: number; ready: number; flash: number }

export function racerScreen(link: DungeonLink, welcome: RacerWelcome, journey: Journey, host: RoundHost): Screen {
  const level = welcome.level;
  const mine = welcome.car;
  const track: Track = { pts: welcome.track.pts.map(([x, y]) => ({ x, y })), halfWidth: welcome.track.halfWidth };
  const laps = welcome.track.laps;
  const N = track.pts.length;
  const road = new Path2D();
  track.pts.forEach((p, i) => (i ? road.lineTo(p.x, p.y) : road.moveTo(p.x, p.y)));
  road.closePath();
  const bounds = track.pts.reduce((b, p) => ({ x0: Math.min(b.x0, p.x), y0: Math.min(b.y0, p.y), x1: Math.max(b.x1, p.x), y1: Math.max(b.y1, p.y) }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
  const circuit = worldDescentName('racer', level);

  const slots: (Slot | null)[] = welcome.slots.map((s, i) => {
    if (!s) return null;
    const own = journey.cosmetics[i];
    const view: SpiritLike = own ? { element: own.element, magnitude: own.magnitude, traits: toTraits(own.traits) } : { element: s.element, magnitude: s.magnitude, traits: toTraits(s.traits) };
    const name = own ? spiritName(view) : `${FORMS[s.traits.form]!.name} of ${ELEMENT_NAMES[s.element]}`;
    return { view, strength: s.strength, form: s.traits.form, color: ELEMENT_COLOR[s.element]!, name, lastBits: null, vessel: 1, cap: 1, ready: 0, flash: 0 };
  });
  const rivalName = new Map<number, string>();
  for (const r of welcome.rivals) rivalName.set(r.car, spiritName({ element: r.element, magnitude: r.magnitude, traits: toTraits(r.traits) }));
  for (const r of welcome.refused) host.toast(`A word was not heard at the threshold: ${r}`, '#ff7a6b');
  const myColor = ELEMENT_COLOR[journey.element]!;

  // ---------- mirror of the dungeon ----------
  let snap: RacerSnapshot | null = null;
  let over: RoundResult | null = null;
  let paused = false;
  let countdown: number = R.countdown;
  let lobby: number | null = null; // seconds until the start while the grid gathers
  let onGrid = 1;
  const hud = { strain: 0, capacity: 1, lap: -1, place: 6, finished: null as number | null, shield: 0 };

  // ---------- prediction (your car) ----------
  const car: CarState = { x: 0, y: 0, vx: 0, vy: 0, a: 0, spin: 0, slide: 0, slow: 0, top: 1, hint: -1 };
  const drawn = { x: 0, y: 0 };
  const offset = { x: 0, y: 0 };
  let predInit = false;
  let pending: DriveCmd[] = [];
  let outbox: DriveCmd[] = [];
  let seq = 0, tickAcc = 0, sendT = 0;

  // ---------- interpolation (everyone else) ----------
  const snaps: RacerSnapshot[] = [];
  let clockOffset: number | null = null;
  const now = () => performance.now() / 1000;
  const renderTime = () => (clockOffset === null ? 0 : now() + clockOffset - INTERP);
  const others = new Map<number, RacerCar & { da: number }>();
  const objs = new Map<string, { x: number; y: number }>();

  function interpolate() {
    others.clear(); objs.clear();
    if (!snaps.length) return;
    const rt = renderTime();
    let i = snaps.findIndex((x) => x.time > rt);
    if (i === -1) i = snaps.length - 1;
    const b = snaps[i]!, a = snaps[Math.max(0, i - 1)]!;
    const k = b === a || b.time === a.time ? 1 : Math.max(0, Math.min(1, (rt - a.time) / (b.time - a.time)));
    const lerp = (p: number, q: number) => p + (q - p) * k;
    for (const cb of b.cars) {
      if (cb.id === mine) continue;
      const ca = a.cars.find((c) => c.id === cb.id) ?? cb;
      const da = Math.atan2(Math.sin(cb.a - ca.a), Math.cos(cb.a - ca.a));
      others.set(cb.id, { ...cb, x: lerp(ca.x, cb.x), y: lerp(ca.y, cb.y), a: ca.a + da * k, da });
    }
    const idx = (s: RacerSnapshot) => {
      const m = new Map<string, { x: number; y: number }>();
      for (const o of s.bolts) m.set('b' + o.id, o);
      for (const o of s.drones) m.set('d' + o.id, o);
      return m;
    };
    const ia = idx(a);
    for (const [key, pb] of idx(b)) { const pa = ia.get(key) ?? pb; objs.set(key, { x: lerp(pa.x, pb.x), y: lerp(pa.y, pb.y) }); }
  }

  link.onRacer = (s) => {
    snap = s;
    const target = s.time - now();
    clockOffset = clockOffset === null || Math.abs(target - clockOffset) > 0.5 ? target : clockOffset + (target - clockOffset) * 0.1;
    snaps.push(s);
    while (snaps.length > 2 && snaps[1]!.time < renderTime() - 0.2) snaps.shift();
    if (snaps.length > 60) snaps.shift();
    countdown = s.countdown;
    if (lobby !== null && s.lobby === null) banner = { text: circuit.toUpperCase(), sub: onGrid > 1 ? `${onGrid} racers on the grid. ${laps} laps; the top ${R.podium} make the podium.` : `${laps} laps against five rivals. Finish in the top ${R.podium}.`, t: 3 };
    lobby = s.lobby;
    onGrid = s.players;
    for (const c of s.cars) if (c.player && c.id !== mine && !rivalName.has(c.id)) rivalName.set(c.id, `racer ${c.player.slice(0, 6)}`);
    Object.assign(hud, { strain: s.strain, capacity: s.capacity });
    s.slots.forEach((v, i) => { const sl = slots[i]; if (sl && v) { sl.lastBits = v.lastBits; sl.vessel = v.vessel; sl.cap = v.cap; sl.ready = v.ready; } });
    const me = s.cars.find((c) => c.id === mine);
    if (me) {
      Object.assign(hud, { lap: me.lap, place: me.place, finished: me.finished, shield: me.shield });
      reconcile(me, s.ack);
    }
    for (const ev of s.events) onEvent(ev);
  };

  /** Start from where the dungeon says you are and replay what it hasn't applied yet. */
  function reconcile(me: RacerCar, ack: number) {
    pending = pending.filter((c) => c.seq > ack);
    if (me.finished !== null) { // over the line: the autopilot drives your lap of honour; just follow it
      pending = [];
      Object.assign(car, { x: me.x, y: me.y, vx: me.vx, vy: me.vy, a: me.a, spin: me.spin, slide: me.slide, slow: me.slow, top: me.top });
      offset.x = offset.y = 0;
      predInit = true;
      return;
    }
    const corrected: CarState = { x: me.x, y: me.y, vx: me.vx, vy: me.vy, a: me.a, spin: me.spin, slide: me.slide, slow: me.slow, top: me.top, hint: car.hint };
    for (const c of pending) driveCar(corrected, locked() ? { throttle: 0, steer: 0 } : c, track, c.dt);
    if (predInit) {
      const dx = drawn.x - corrected.x, dy = drawn.y - corrected.y;
      if (Math.hypot(dx, dy) < SNAP_CORRECTION) { offset.x = dx; offset.y = dy; } else { offset.x = 0; offset.y = 0; }
    }
    predInit = true;
    Object.assign(car, corrected);
  }
  const locked = () => lobby !== null || countdown > 0 || hud.finished !== null;

  function clientTick() {
    if (paused || over || !predInit) return;
    let throttle = 0, steer = 0;
    if (pilot) {
      // an actant drives: its code sees the race and gives an order each frame
      const order = pilotOrder();
      throttle = order.throttle; steer = order.steer;
      if (order.cast !== undefined && order.cast !== null && !locked()) cast(order.cast);
    } else {
      if (keys.has('w') || keys.has('arrowup')) throttle += 1;
      if (keys.has('s') || keys.has('arrowdown')) throttle -= 1;
      if (keys.has('a') || keys.has('arrowleft')) steer -= 1;
      if (keys.has('d') || keys.has('arrowright')) steer += 1;
    }
    const cmd: DriveCmd = { seq: ++seq, throttle, steer, dt: TICK };
    driveCar(car, locked() ? { throttle: 0, steer: 0 } : cmd, track, TICK);
    pending.push(cmd);
    outbox.push(cmd);
    if (pending.length > 600) pending.shift();
  }

  let pilot: Pilot | undefined = journey.pilot ?? (explorerCode('racer') as Pilot | null) ?? undefined; // an actant's (or the explorer's) driving code
  const pilotMemory: Record<string, unknown> = {}; // the pilot's own, kept between frames of this race
  const pilotStart = performance.now();
  /** The pilot's order, never trusted: bad output or a throw falls back to the rivals' autopilot. */
  function pilotView(): PilotView {
    const myPlace = hud.place;
    return {
      car: { ...car }, track, laps, place: myPlace, lap: hud.lap,
      strain: hud.strain, capacity: hud.capacity, time: (performance.now() - pilotStart) / 1000, memory: pilotMemory,
      others: [...others.values()].map((o) => ({ x: o.x, y: o.y, vx: o.vx, vy: o.vy, place: o.place, ahead: o.place < myPlace, dist: Math.hypot(o.x - car.x, o.y - car.y) })),
      slots: slots.map((s, i) => s && { index: i, form: FORMS[s.form]!.name, ready: s.ready, vessel: s.vessel, cap: s.cap }),
    };
  }
  function pilotOrder(): { throttle: number; steer: number; cast?: number | null } {
    const view = pilotView();
    try {
      const o = pilot!(view);
      if (o && Number.isFinite(o.throttle) && Number.isFinite(o.steer)) return o;
    } catch { /* fall through */ }
    return autopilot(car, track, view.others);
  }

  link.onEnd = (r) => end(r);
  link.onClose = () => { if (!over) host.toast('The dungeon fell silent.', '#ff7a6b'); };

  // ---------- local-only visuals ----------
  const tint = ELEMENT_COLOR[(journey.element + level * 3) % 8]!;
  let fx: Fx[] = [];
  let parts: Particle[] = [];
  let floaters: Floater[] = [];
  let shake = 0;
  let banner: { text: string; sub: string; t: number } | null = null;
  let lastCount = 4;
  const cam = { x: 0, y: 0, z: 1 };

  function burst(x: number, y: number, color: string, n: number, speed = 200) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = rand(30, speed);
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, max: rand(0.3, 0.8), color, size: rand(1.5, 3.5) });
    }
  }
  const who = (id: number) => (id === mine ? 'you' : rivalName.get(id) ?? 'a rival');

  function onEvent(ev: RacerEvent) {
    switch (ev.e) {
      case 'go': banner = { text: 'GO', sub: '', t: 1 }; sfx.sfxVictory(); return;
      case 'cast': {
        if (ev.car === mine) {
          const sl = slots[ev.slot];
          if (sl) sl.flash = 0.3;
          floaters.push({ x: car.x, y: car.y - 30, text: `${ev.power}`, color: colorOf(ev.element), t: 0, size: 14 });
          sfx.sfxCast(ev.form, ev.element, 0.4 + ev.power / 20);
          note(`you spoke ${FORMS[ev.form]!.name}: power ${ev.power}`);
        } else if (Math.hypot(ev.x - car.x, ev.y - car.y) < 700) sfx.sfxEnemyCast();
        return;
      }
      case 'refused': if (ev.car === mine) floaters.push({ x: car.x, y: car.y - 30, text: 'unheard', color: '#9c8f74', t: 0, size: 13 }); return;
      case 'backlash': if (ev.car === mine) note('backlash: spun out'); if (ev.car === mine) { sfx.sfxBacklash(); burst(car.x, car.y, '#ff5040', 20); floaters.push({ x: car.x, y: car.y - 34, text: 'BACKLASH', color: '#ff5040', t: 0, size: 15 }); } return;
      case 'hit': {
        burst(ev.x, ev.y, colorOf(ev.element), 16);
        if (ev.car === mine) {
          note(`${ev.what} by ${who(ev.by)}`);
          sfx.sfxHurt();
          shake = Math.min(14, shake + 8);
          floaters.push({ x: car.x, y: car.y - 34, text: ev.spin > 0 ? `${ev.what} by ${who(ev.by)}` : `shoved by ${who(ev.by)}`, color: '#ff7a6b', t: 0, size: 14 });
        } else {
          if (ev.by === mine) note(`you struck ${who(ev.car)}`);
          if (ev.by === mine) { sfx.sfxHit(); floaters.push({ x: ev.x, y: ev.y - 24, text: ev.spin > 0 ? 'spun out' : 'shoved', color: colorOf(ev.element), t: 0, size: 13 }); }
        }
        return;
      }
      case 'absorb': burst(ev.x, ev.y, '#cfe8ff', 10); if (ev.car === mine) floaters.push({ x: car.x, y: car.y - 30, text: 'warded', color: '#cfe8ff', t: 0, size: 13 }); return;
      case 'slowed': if (ev.car === mine) note('lanced: slowed'); burst(ev.x, ev.y, '#a8e6ff', 8); if (ev.car === mine) { sfx.sfxHurt(); floaters.push({ x: car.x, y: car.y - 30, text: 'lanced: slowed', color: '#a8e6ff', t: 0, size: 13 }); } return;
      case 'slid': burst(ev.x, ev.y, HEX, 8); if (ev.car === mine) floaters.push({ x: car.x, y: car.y - 30, text: 'slick!', color: HEX, t: 0, size: 13 }); return;
      case 'beam': fx.push({ kind: 'beam', x: ev.x, y: ev.y, x2: ev.x2, y2: ev.y2, r: ev.width, t: 0, max: 0.3, color: colorOf(ev.element) }); return;
      case 'ring': fx.push({ kind: 'ring', x: ev.x, y: ev.y, r: ev.r, t: 0, max: ev.ward ? 0.5 : 0.4, color: ev.ward ? '#cfe8ff' : colorOf(ev.element) }); return;
      case 'blink':
        fx.push({ kind: 'blink', x: ev.x, y: ev.y, t: 0, max: 0.4, color: colorOf(ev.element) });
        fx.push({ kind: 'blink', x: ev.x2, y: ev.y2, t: 0, max: 0.4, color: colorOf(ev.element) });
        burst(ev.x, ev.y, colorOf(ev.element), 12);
        return;
      case 'blast':
        fx.push({ kind: 'burst', x: ev.x, y: ev.y, r: ev.r, t: 0, max: 0.45, color: colorOf(ev.element) });
        burst(ev.x, ev.y, colorOf(ev.element), 26);
        sfx.sfxNova(ev.element);
        if (Math.hypot(ev.x - car.x, ev.y - car.y) < 400) shake = Math.min(12, shake + 5);
        return;
      case 'spark': burst(ev.x, ev.y, colorOf(ev.element), 8); return;
      case 'lap':
        if (ev.car === mine) note(`lap ${ev.lap + 1} begins, place ${hud.place}`);
        if (ev.car === mine) { banner = { text: ev.lap === laps - 1 ? 'FINAL LAP' : `LAP ${ev.lap + 1}`, sub: '', t: 1.6 }; sfx.sfxWave(); }
        return;
      case 'finish':
        note(ev.car === mine ? `you finished ${ordinal(ev.place)}` : `${who(ev.car)} finished ${ordinal(ev.place)}`);
        if (ev.car === mine) banner = { text: `${ordinal(ev.place).toUpperCase()} PLACE`, sub: '', t: 3 };
        else floaters.push({ x: car.x, y: car.y - 60, text: `${who(ev.car)} finishes ${ordinal(ev.place)}`, color: '#9c8f74', t: 0, size: 12 });
        return;
    }
  }

  // ---------- input ----------
  const keys = new Set<string>();
  const mouse = { sx: 0, sy: 0 };
  function cast(i: number) {
    const s = slots[i];
    if (!s || over || paused || locked()) return;
    if (s.ready > 0) return;
    link.cast(i, 0, 0);
    s.flash = 0.2;
    s.ready = R.cooldown; // until the dungeon says otherwise (keeps a pilot from sending a burst)
  }
  const onKey = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (e.type === 'keydown') {
      if (k === 'escape') { togglePause(); return; }
      if (k === 'enter' && lobby !== null) { link.go(); return; }
      if (k === ' ' || k.startsWith('arrow')) e.preventDefault();
      const i = CONTROLS.findIndex((c) => c.keys.includes(k));
      if (!e.repeat && i >= 0) cast(i);
      keys.add(k);
    } else keys.delete(k);
  };
  const onMouseMove = (e: MouseEvent) => { mouse.sx = e.clientX; mouse.sy = e.clientY; };
  const onMouseDown = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('.overlay')) return;
    const i = CONTROLS.findIndex((c) => c.button === e.button);
    if (i >= 0) cast(i);
  };
  const onContext = (e: MouseEvent) => e.preventDefault();
  const onBlur = () => keys.clear();

  // ---------- update ----------
  function update(dt: number) {
    tickAcc = Math.min(tickAcc + dt, 0.25);
    while (tickAcc >= TICK) { tickAcc -= TICK; clientTick(); }
    sendT -= dt;
    if (sendT <= 0 && outbox.length) { link.drive(outbox); outbox = []; sendT = SEND_EVERY; }
    const decay = Math.exp(-dt * CORRECTION_DECAY);
    offset.x *= decay; offset.y *= decay;
    drawn.x = car.x + offset.x; drawn.y = car.y + offset.y;
    interpolate();
    if (paused) return;
    if (lobby !== null) lobby = Math.max(0, lobby - dt);
    else if (countdown > 0) {
      countdown = Math.max(0, countdown - dt);
      const c = Math.ceil(countdown);
      if (c < lastCount && c > 0) { lastCount = c; sfx.sfxHit(); }
    }
    if (banner) { banner.t -= dt; if (banner.t <= 0) banner = null; }
    for (const s of slots) if (s) { s.flash = Math.max(0, s.flash - dt); s.ready = Math.max(0, s.ready - dt); }
    // exhaust, spin sparks, slick trails
    const speed = Math.hypot(car.vx, car.vy);
    if (speed > 60 && Math.random() < 0.7) parts.push({ x: drawn.x - Math.cos(car.a) * 16, y: drawn.y - Math.sin(car.a) * 16, vx: -car.vx * 0.1 + rand(-20, 20), vy: -car.vy * 0.1 + rand(-20, 20), t: 0, max: 0.4, color: hud.strain > hud.capacity ? '#ff5040' : myColor, size: 2 });
    if (car.spin > 0) burst(drawn.x, drawn.y, '#ffd27a', 1, 120);
    for (const o of others.values()) {
      if (o.spin > 0 && Math.random() < 0.5) burst(o.x, o.y, '#ffd27a', 1, 120);
      if (o.slide > 0 && Math.random() < 0.4) parts.push({ x: o.x, y: o.y, vx: 0, vy: 0, t: 0, max: 0.8, color: HEX, size: 3 });
    }
    if (car.slide > 0 && Math.random() < 0.5) parts.push({ x: drawn.x, y: drawn.y, vx: 0, vy: 0, t: 0, max: 0.8, color: HEX, size: 3 });
    for (const b of snap?.bolts ?? []) { const p = objs.get('b' + b.id); if (p) parts.push({ x: p.x, y: p.y, vx: rand(-20, 20), vy: rand(-20, 20), t: 0, max: 0.3, color: colorOf(b.element), size: 2 }); }
    for (const f of fx) f.t += dt;
    fx = fx.filter((f) => f.t < f.max);
    for (const p of parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.95; p.vy *= 0.95; }
    parts = parts.filter((p) => p.t < p.max);
    if (parts.length > 1500) parts.splice(0, parts.length - 1500);
    for (const f of floaters) { f.t += dt; f.y -= 26 * dt; }
    floaters = floaters.filter((f) => f.t < 1.4);
    shake = Math.max(0, shake - dt * 30);
    // camera: ahead of the car, pulling back with speed
    const k = Math.min(1, dt * 5);
    cam.x += (drawn.x + car.vx * 0.35 - cam.x) * k;
    cam.y += (drawn.y + car.vy * 0.35 - cam.y) * k;
    cam.z += (1.05 - 0.25 * Math.min(1, speed / R.car.maxSpeed) - cam.z) * Math.min(1, dt * 2);
  }

  // ---------- drawing ----------
  function drawCar(ctx: CanvasRenderingContext2D, x: number, y: number, a: number, color: string, you: boolean, c: { shield: number; slow: number; spin: number }, t: number) {
    ctx.save();
    ctx.translate(x, y);
    if (c.shield > 0) {
      ctx.strokeStyle = `rgba(207,232,255,${(0.5 + 0.3 * Math.sin(t * 8)).toFixed(2)})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, 0, 24, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, you ? 34 : 26);
    g.addColorStop(0, color + (you ? '77' : '44'));
    g.addColorStop(1, '#00000000');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, you ? 34 : 26, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.rotate(a);
    ctx.fillStyle = c.slow > 0 ? '#a8e6ff' : color;
    ctx.beginPath();
    ctx.moveTo(16, 0); ctx.lineTo(9, 8); ctx.lineTo(-13, 9); ctx.lineTo(-15, 0); ctx.lineTo(-13, -9); ctx.lineTo(9, -8); ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = you ? '#fff4d6' : 'rgba(0,0,0,0.6)';
    ctx.lineWidth = you ? 1.8 : 1;
    ctx.stroke();
    ctx.fillStyle = 'rgba(10,9,17,0.75)';
    ctx.fillRect(1, -5, 7, 10); // canopy
    ctx.fillStyle = '#ffe8b0';
    ctx.fillRect(14, -6, 2, 3); ctx.fillRect(14, 3, 2, 3); // lamps
    ctx.restore();
  }

  function draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    ctx.fillStyle = '#07060c';
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    const sx = shake ? rand(-shake, shake) : 0, sy = shake ? rand(-shake, shake) : 0;
    ctx.translate(w / 2 + sx, h / 2 + sy);
    ctx.scale(cam.z, cam.z);
    ctx.translate(-cam.x, -cam.y);
    const vw = w / cam.z, vh = h / cam.z;

    // the astral: a faint lattice
    ctx.strokeStyle = tint + '12';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const gx0 = Math.floor((cam.x - vw / 2) / 120) * 120, gy0 = Math.floor((cam.y - vh / 2) / 120) * 120;
    for (let x = gx0; x < cam.x + vw / 2 + 120; x += 120) { ctx.moveTo(x, cam.y - vh / 2 - 10); ctx.lineTo(x, cam.y + vh / 2 + 10); }
    for (let y = gy0; y < cam.y + vh / 2 + 120; y += 120) { ctx.moveTo(cam.x - vw / 2 - 10, y); ctx.lineTo(cam.x + vw / 2 + 10, y); }
    ctx.stroke();

    // the road: glowing edges, dark surface, a faint center line, chevrons showing the way
    ctx.lineJoin = 'round';
    ctx.strokeStyle = tint + '55';
    ctx.lineWidth = track.halfWidth * 2 + 10;
    ctx.stroke(road);
    ctx.strokeStyle = '#15121e';
    ctx.lineWidth = track.halfWidth * 2;
    ctx.stroke(road);
    ctx.strokeStyle = 'rgba(231,194,107,0.1)';
    ctx.lineWidth = 2;
    ctx.setLineDash([18, 22]);
    ctx.stroke(road);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(231,194,107,0.07)';
    for (let i = 10; i < N; i += 24) {
      const p = track.pts[i]!, q = track.pts[(i + 1) % N]!;
      if (Math.abs(p.x - cam.x) > vw || Math.abs(p.y - cam.y) > vh) continue;
      const a = Math.atan2(q.y - p.y, q.x - p.x);
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-8, 16); ctx.lineTo(-2, 0); ctx.lineTo(-8, -16); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    // the line: a checkered band across the road
    {
      const p = track.pts[0]!, q = track.pts[1]!;
      const a = Math.atan2(q.y - p.y, q.x - p.x);
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(a);
      const cells = 8, cw = (track.halfWidth * 2) / cells;
      for (let r = 0; r < 2; r++) for (let c = 0; c < cells; c++) {
        ctx.fillStyle = (r + c) % 2 ? 'rgba(233,220,184,0.55)' : 'rgba(10,9,17,0.8)';
        ctx.fillRect(-8 + r * 8, -track.halfWidth + c * cw, 8, cw);
      }
      ctx.restore();
    }

    // slicks and mines on the road
    for (const s of snap?.slicks ?? []) {
      const g = ctx.createRadialGradient(s.x, s.y, 2, s.x, s.y, s.r);
      g.addColorStop(0, HEX + '66'); g.addColorStop(1, HEX + '00');
      ctx.globalAlpha = Math.min(1, s.life / 2);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    for (const m of snap?.mines ?? []) {
      ctx.fillStyle = colorOf(m.element);
      ctx.beginPath(); ctx.arc(m.x, m.y, 6, 0, Math.PI * 2); ctx.fill();
      if (m.armed) {
        ctx.strokeStyle = `rgba(255,80,64,${(0.4 + 0.4 * Math.sin(t * 9)).toFixed(2)})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(m.x, m.y, R.forms.nova.trigger, 0, Math.PI * 2); ctx.stroke();
      }
    }

    // cars: rivals (interpolated), then you (predicted)
    ctx.textAlign = 'center';
    for (const o of others.values()) {
      if (Math.abs(o.x - cam.x) > vw || Math.abs(o.y - cam.y) > vh) continue;
      drawCar(ctx, o.x, o.y, o.a, colorOf(o.element), false, o, t);
      ctx.font = '11px EB Garamond, serif';
      ctx.fillStyle = o.player ? 'rgba(231,194,107,0.95)' : 'rgba(233,220,184,0.7)';
      ctx.fillText(`${rivalName.get(o.id) ?? ''} · ${ordinal(o.place)}`, o.x, o.y - 26);
    }
    if (predInit) drawCar(ctx, drawn.x, drawn.y, car.a, myColor, true, { shield: hud.shield, slow: car.slow, spin: car.spin }, t);

    ctx.globalCompositeOperation = 'lighter';
    for (const b of snap?.bolts ?? []) {
      const p = objs.get('b' + b.id); if (!p) continue;
      ctx.fillStyle = colorOf(b.element);
      ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff99';
      ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
    }
    for (const d of snap?.drones ?? []) {
      const p = objs.get('d' + d.id); if (!p) continue;
      ctx.fillStyle = colorOf(d.element) + 'aa';
      ctx.beginPath(); ctx.arc(p.x, p.y, 9 + Math.sin(t * 12) * 2, 0, Math.PI * 2); ctx.fill();
    }
    for (const f of fx) {
      const k = f.t / f.max;
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = f.color; ctx.fillStyle = f.color;
      if (f.kind === 'beam') {
        ctx.lineCap = 'round';
        ctx.lineWidth = (f.r ?? 10) * (1 - k * 0.6);
        ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x2!, f.y2!); ctx.stroke();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1, (f.r ?? 10) * 0.3); ctx.stroke();
      } else if (f.kind === 'ring') {
        ctx.lineWidth = 6 * (1 - k) + 1;
        ctx.beginPath(); ctx.arc(f.x, f.y, (f.r ?? 50) * (0.3 + 0.7 * k), 0, Math.PI * 2); ctx.stroke();
      } else if (f.kind === 'burst') {
        ctx.globalAlpha = 0.5 * (1 - k);
        ctx.beginPath(); ctx.arc(f.x, f.y, (f.r ?? 50) * (0.6 + 0.4 * k), 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(f.x, f.y, 10 + 34 * k, 0, Math.PI * 2); ctx.stroke();
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
    for (const f of floaters) {
      ctx.globalAlpha = Math.max(0, Math.min(1, 1.4 - f.t));
      ctx.fillStyle = f.color;
      ctx.font = `${f.size}px JetBrains Mono, monospace`;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    vg.addColorStop(0, 'rgba(4,3,8,0)');
    vg.addColorStop(1, 'rgba(4,3,8,0.7)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
    drawHud(ctx, w, h, t);
  }

  let hudRects: { x: number; y: number; w: number; h: number; tip: string }[] = [];
  let tipShown = false;
  function hudHover() {
    const r = paused || over ? null : hudRects.find((q) => mouse.sx >= q.x && mouse.sx <= q.x + q.w && mouse.sy >= q.y && mouse.sy <= q.y + q.h);
    if (r) { showTip(r.tip, mouse.sx, mouse.sy); tipShown = true; } else if (tipShown) { hideTip(); tipShown = false; }
  }

  function drawHud(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    hudRects = [];
    // place and lap
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(10,9,17,0.75)';
    ctx.fillRect(16, 16, 170, 64);
    ctx.fillStyle = '#e7c26b';
    ctx.font = '34px Cinzel, serif';
    const place = hud.finished ?? hud.place;
    ctx.fillText(ordinal(place), 26, 54);
    const pw = ctx.measureText(ordinal(place)).width;
    ctx.font = '13px EB Garamond, serif';
    ctx.fillStyle = '#9c8f74';
    ctx.fillText(`of ${snap?.cars.length ?? 1 + welcome.rivals.length}`, 32 + pw, 54);
    ctx.fillStyle = '#e9dcb8';
    ctx.font = '12px JetBrains Mono, monospace';
    ctx.fillText(hud.finished !== null ? 'finished' : `lap ${Math.max(1, Math.min(laps, hud.lap + 1))} / ${laps}`, 26, 72);
    const sp = Math.hypot(car.vx, car.vy);
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(sp / 4)} · ${car.top < 0.99 ? 'hot' : 'cool'}`, 180, 72);
    hudRects.push({ x: 16, y: 16, w: 170, h: 64, tip: `Your place in the race and your lap. Finish in the top ${R.podium} to open the next circuit. WASD or the arrow keys drive.` });

    ctx.textAlign = 'center';
    ctx.font = '13px Cinzel, serif';
    ctx.fillStyle = '#9c8f74';
    ctx.fillText(`Dark Racer · ${circuit}`, w / 2, 28);

    // minimap
    const mw = 190, mh = 140, mx = w - mw - 16, my = 16;
    ctx.fillStyle = 'rgba(10,9,17,0.75)';
    ctx.fillRect(mx, my, mw, mh);
    const sc = Math.min((mw - 20) / (bounds.x1 - bounds.x0), (mh - 20) / (bounds.y1 - bounds.y0));
    const toM = (x: number, y: number) => [mx + 10 + (x - bounds.x0) * sc, my + 10 + (y - bounds.y0) * sc] as const;
    ctx.strokeStyle = tint + '88';
    ctx.lineWidth = 3;
    ctx.beginPath();
    track.pts.forEach((p, i) => { const [x, y] = toM(p.x, p.y); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.closePath(); ctx.stroke();
    for (const o of others.values()) { const [x, y] = toM(o.x, o.y); ctx.fillStyle = colorOf(o.element); ctx.fillRect(x - 2, y - 2, 4, 4); }
    { const [x, y] = toM(drawn.x, drawn.y); ctx.fillStyle = '#fff4d6'; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill(); }

    // heat (strain) and the names
    const active = slots.map((s, i) => ({ s, i })).filter((x) => x.s);
    const sw = 150, gap = 8;
    const total = Math.max(300, active.length * sw + (active.length - 1) * gap);
    let x = w / 2 - (active.length * sw + (active.length - 1) * gap) / 2;
    const y = h - 78;
    const bx = w / 2 - total / 2, by = y - 22;
    ctx.fillStyle = 'rgba(10,9,17,0.75)';
    ctx.fillRect(bx - 6, by - 14, total + 12, 26);
    const scale = Math.max(hud.capacity * 1.6, hud.strain * 1.05, 0.01);
    ctx.fillStyle = '#2a2233';
    ctx.fillRect(bx, by, total, 7);
    ctx.fillStyle = hud.strain > hud.capacity ? (Math.sin(t * 20) > 0 ? '#ff5040' : '#ff9e5a') : '#ff9e5a';
    ctx.fillRect(bx, by, Math.min(total, (total * hud.strain) / scale), 7);
    ctx.fillStyle = '#e9dcb8';
    ctx.fillRect(bx + (total * hud.capacity) / scale - 1, by - 3, 2, 13);
    ctx.textAlign = 'left';
    ctx.font = '11px JetBrains Mono, monospace';
    ctx.fillStyle = '#9c8f74';
    ctx.fillText(`heat (strain) ${hud.strain.toFixed(1)} / ${hud.capacity.toFixed(1)}`, bx, by - 3);
    hudRects.push({ x: bx - 6, y: by - 14, w: total + 12, h: 26, tip: '<b>Heat</b> is your strain. Every word you speak strains your aura, and a strained aura drags on your engine: the hotter you run, the lower your top speed. It ebbs as you drive. Past the white mark, a name can answer with <em>backlash</em> and spin you out.' });
    for (const { s, i } of active) {
      const sl = s!;
      const ctl = CONTROLS[i]!;
      hudRects.push({ x, y, w: sw, h: 62, tip: `<b style="color:${sl.color}">${sl.name}</b>: ${FORMS[sl.form]!.name}. On the road: ${ON_ROAD[sl.form]}. Your name holds ${truths(sl.strength)}.<br>Speak it with <em>${ctl.label}</em> (or ${ctl.alt}). Its power is what the name actually draws: your truths, less your heat, limited by the patron's vessel (the bar).` });
      ctx.fillStyle = sl.flash > 0 ? 'rgba(231,194,107,0.22)' : 'rgba(10,9,17,0.8)';
      ctx.fillRect(x, y, sw, 62);
      ctx.strokeStyle = sl.color;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, sw - 1, 61);
      ctx.fillStyle = '#e7c26b';
      ctx.font = '13px JetBrains Mono, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(ctl.label, x + 6, y + 15);
      ctx.globalAlpha = sl.ready > 0 ? 0.3 : 0.8;
      ctx.drawImage(sigilCanvas(sl.view, 64), x + sw - 44, y + 18, 32, 32);
      ctx.globalAlpha = 1;
      ctx.fillStyle = sl.color;
      ctx.font = '14px Cinzel, serif';
      ctx.fillText(sl.name.slice(0, 12), x + 22, y + 15);
      ctx.fillStyle = '#9c8f74';
      ctx.font = '11px EB Garamond, serif';
      ctx.fillText(`${FORMS[sl.form]!.name} · ${truths(sl.strength)}`, x + 6, y + 32);
      ctx.fillText(ctl.alt, x + 6, y + 45);
      ctx.fillStyle = '#2a2233';
      ctx.fillRect(x + 6, y + 52, sw - 12, 4);
      ctx.fillStyle = sl.color;
      ctx.fillRect(x + 6, y + 52, ((sw - 12) * sl.vessel) / Math.max(1, sl.cap), 4);
      if (sl.ready > 0) { // recovering: a veil that lifts
        ctx.fillStyle = 'rgba(10,9,17,0.55)';
        ctx.fillRect(x, y, sw * (sl.ready / R.cooldown), 62);
      }
      x += sw + gap;
    }
    if (journey.newcomer && !pilot && !over) {
      ctx.textAlign = 'center';
      ctx.font = 'italic 14px EB Garamond, serif';
      ctx.fillStyle = 'rgba(233,220,184,0.7)';
      ctx.fillText('WASD or arrows to drive · J K L ; (or space, clicks, 1, 2) to speak your words · Esc to pause', w / 2, by - 22);
    }

    ctx.textAlign = 'center';
    if (lobby !== null && !over) {
      ctx.fillStyle = 'rgba(10,9,17,0.8)';
      ctx.fillRect(w / 2 - 260, h * 0.3 - 54, 520, 118);
      ctx.fillStyle = '#e7c26b';
      ctx.font = '26px Cinzel, serif';
      ctx.fillText('AT THE LINE', w / 2, h * 0.3 - 18);
      ctx.fillStyle = '#e9dcb8';
      ctx.font = 'italic 17px EB Garamond, serif';
      ctx.fillText(`${onGrid} ${onGrid === 1 ? 'racer' : 'racers'} on the grid · rivals fill the rest`, w / 2, h * 0.3 + 10);
      ctx.fillStyle = '#9c8f74';
      ctx.font = '14px EB Garamond, serif';
      ctx.fillText(`the race starts in ${Math.ceil(lobby)}s, when everyone joining has spoken their words · Enter to go now`, w / 2, h * 0.3 + 40);
    } else if (countdown > 0 && !over) {
      const c = Math.ceil(countdown);
      ctx.fillStyle = '#e7c26b';
      ctx.font = '96px Cinzel, serif';
      ctx.globalAlpha = 0.5 + 0.5 * (countdown - Math.floor(countdown));
      ctx.fillText(String(c), w / 2, h * 0.42);
      ctx.globalAlpha = 1;
    }
    if (banner) {
      ctx.globalAlpha = Math.min(1, banner.t);
      ctx.fillStyle = '#e7c26b';
      ctx.font = '34px Cinzel, serif';
      ctx.fillText(banner.text, w / 2, h * 0.28);
      if (banner.sub) { ctx.fillStyle = '#e9dcb8'; ctx.font = 'italic 18px EB Garamond, serif'; ctx.fillText(banner.sub, w / 2, h * 0.28 + 30); }
      ctx.globalAlpha = 1;
    }
  }

  // ---------- flow ----------
  let overlay: HTMLElement | null = null;
  let uiRoot: HTMLElement;
  function end(result: RoundResult) {
    if (over) return;
    over = result;
    note(`the race ended: place ${result.wave}, ${result.kills} strikes`);
    if (result.won) sfx.sfxVictory(); else sfx.sfxDeath();
    const { unlocked } = host.report(result);
    if (journey.pilot) setTimeout(() => host.leave(), 6000); // an actant's instance goes home on its own
    overlay?.remove();
    const place = ordinal(result.wave);
    overlay = frag(`<div class="overlay">
      <h1 style="font-size:40px; color:var(--gold)">${result.won ? `${place} place` : result.wave > 0 ? `${place}: off the podium` : 'Out of the race'}</h1>
      <div class="prose">${result.won ? `You raced ${circuit} and made the podium.${unlocked ? `<br><em>A new circuit opens: ${worldDescentName('racer', level + 1)}.</em>` : ''}` : `The podium filled without you. Your names are kept; names are always kept.`}</div>
      <div class="dim">${result.kills} ${result.kills === 1 ? 'strike' : 'strikes'} on your rivals</div>
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
        <div class="dim">The race holds its breath.</div>
        <div style="display:flex; gap:10px"><button class="primary" id="resume">Resume</button><button id="abandon">Leave the race</button></div>
        <div class="faint" style="max-width:540px; font-size:14px; line-height:1.5">WASD or arrows to drive · J K L ; (or space, left/right click, 1, 2) to speak your names. Every name you speak heats your engine (strain): the hotter you run, the slower your top speed. It ebbs as you drive.</div>
      </div>`);
      overlay.querySelector('#resume')!.addEventListener('click', togglePause);
      overlay.querySelector('#abandon')!.addEventListener('click', () => { paused = false; link.pause(false); overlay?.remove(); overlay = null; link.abandon(); });
      uiRoot.appendChild(overlay);
    } else { overlay?.remove(); overlay = null; }
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
      // Explorer Claude: the race lends its view, state and controls (see explorer.ts)
      lendRound({
        world: 'racer',
        view: () => pilotView(),
        state: () => ({ countdown, lobby, place: hud.place, lap: hud.lap + 1, laps, finished: hud.finished, strain: hud.strain, capacity: hud.capacity, over: over ? (over.won ? 'won' : 'lost') : null }),
        control: (code) => { if (journey.pilot) return; pilot = code ? compileDriving(code) : undefined; },
        go: () => link.go(),
        pause: (on) => { if (over || paused === on) return; paused = on; link.pause(on); },
        players: () => onGrid,
      });
      (window as any).__racer = {
        car, slots, cast, hud, keys,
        state: () => ({ countdown, place: hud.place, lap: hud.lap, finished: hud.finished, over: over ? (over.won ? 'won' : 'lost') : null }),
        net: () => ({ pending: pending.length, correction: Math.hypot(offset.x, offset.y), buffered: snaps.length }),
        track, others: () => [...others.values()],
      };
    },
    unmount() {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('contextmenu', onContext);
      window.removeEventListener('blur', onBlur);
      hideTip();
      link.onRacer = link.onEnd = link.onClose = null;
      link.close();
      delete (window as any).__racer;
      lendRound(null);
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

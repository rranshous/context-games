// How things move on screen. Each unit has one picture, so it isn't animated by frames:
// it moves by its gait. Walkers bob and their legs shuffle (the bottom of the picture
// sways), rollers rumble and raise dust, slitherers ripple, hoppers hop, fliers hover and
// bank. Everything lunges or recoils when it attacks, flashes when it's hit, and topples
// when it dies, leaving a mark on the ground.
//
// Only drawing lives here: the sim (sim.js) says what happened, and this shows it.

export const GAITS = ['walks', 'rolls', 'slithers', 'hops', 'flies', 'hovers'];

/** A design's gait: the one its aid gave it, or a guess from how it's described. */
export function gaitOf(d) {
  if (GAITS.includes(d.gait)) return d.gait;
  const has = (a) => d.spec?.abilities?.includes(a), look = `${d.look ?? ''} ${d.description ?? ''}`.toLowerCase();
  if (has('wings') || has('rotors')) return 'flies';
  if (/\b(wheels?|wheeled|treads?|tracked|tracks|caterpillar|rolls|rolling|carriage)\b/.test(look)) return 'rolls';
  if (/\b(serpent|snake|slither\w*|worm|slug|eel|legless|grub)\b/.test(look)) return 'slithers';
  if (/\b(frog|toad|hops?|hopping|kangaroo|springs)\b/.test(look)) return 'hops';
  if (/\b(hover\w*|floats?|floating|levitat\w*)\b/.test(look)) return 'hovers';
  return 'walks';
}

const TAU = Math.PI * 2;

/** Where and how to draw a unit now: lift, tilt, squash, how its strips sway, and its flash. */
export function pose(e, gait, t) {
  const moving = t - (e.moved ?? -1) < 0.12;
  const stride = e.r * 1.7;
  const phase = (e.walked ?? 0) / stride;
  const p = { lift: 0, tilt: 0, sx: 1, sy: 1, sway: null, dx: 0, dy: 0, flash: 0, dust: false, footfall: false };
  const seed = e.id * 1.7;

  if (gait === 'flies') {
    p.lift = e.r * 0.9 + 12 + Math.sin(t * 3 + seed) * 3;
    p.sy = 1 + Math.sin(t * 22 + seed) * 0.04;   // wingbeat
    p.tilt = moving ? 0.12 : Math.sin(t * 1.3 + seed) * 0.03;
  } else if (gait === 'hovers') {
    p.lift = 7 + Math.sin(t * 2.2 + seed) * 2.5;
    p.tilt = moving ? 0.05 : 0;
  } else if (!moving) {
    p.sy = 1 + Math.sin(t * 2 + seed) * 0.018;   // breathing, or an idling engine
    p.sx = 1 - (p.sy - 1) * 0.5;
  } else if (gait === 'walks') {
    const s = Math.sin(phase * Math.PI);
    p.lift = Math.abs(s) * e.r * 0.13;
    p.tilt = s * 0.05;
    p.sy = 1 - Math.cos(phase * TAU) * 0.03;
    p.sway = { kind: 'legs', amp: e.r * 0.16, phase };
    p.footfall = Math.abs(s) < 0.15;
  } else if (gait === 'rolls') {
    p.lift = Math.abs(Math.sin(t * 38 + seed)) * 0.9;
    p.tilt = 0.035;
    p.dust = true;
  } else if (gait === 'slithers') {
    p.sway = { kind: 'ripple', amp: e.r * 0.13, phase };
    p.sy = 1 + Math.sin(phase * TAU) * 0.03;
  } else if (gait === 'hops') {
    const k = (phase * 0.6) % 1, up = Math.sin(k * Math.PI);
    p.lift = up * e.r * 0.8;
    p.sy = k < 0.12 || k > 0.88 ? 0.9 : 1.05;
    p.sx = 2 - p.sy;
    p.footfall = k > 0.9;
  }

  // Attacking: a lunge toward what it hit, close up; a recoil from it, at range.
  const since = t - (e.swung ?? -9);
  if (since < 0.22 && e.swungAt) {
    const k = Math.sin((since / 0.22) * Math.PI), dx = e.swungAt.x - e.x, dy = e.swungAt.y - e.y, d = Math.hypot(dx, dy) || 1;
    const push = e.melee ? e.r * 0.45 * k : -e.r * 0.14 * k;
    p.dx = (dx / d) * push; p.dy = (dy / d) * push;
  }
  p.flash = Math.max(0, 1 - (t - (e.hit ?? -9)) / 0.13);
  return p;
}

const silhouettes = new WeakMap();
/** The picture in solid white, for the flash when something is hit. */
export function silhouette(im) {
  if (!silhouettes.has(im)) {
    const c = Object.assign(document.createElement('canvas'), { width: im.width, height: im.height }), g = c.getContext('2d');
    g.drawImage(im, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    silhouettes.set(im, c);
  }
  return silhouettes.get(im);
}

/** Draw a picture into a box whose bottom-middle is at (0, 0), swaying in strips if its gait does. */
export function drawSwaying(g, im, w, h, sway) {
  if (!sway) return g.drawImage(im, -w / 2, -h, w, h);
  const N = 7, sh = im.height / N, dh = h / N;
  for (let i = 0; i < N; i++) {
    const k = i / (N - 1);
    let off = 0;
    if (sway.kind === 'legs') off = Math.max(0, (k - 0.5) / 0.5) * sway.amp * Math.sin(sway.phase * TAU);
    else off = sway.amp * Math.sin(sway.phase * TAU - i * 0.9) * (0.4 + k * 0.6);
    g.drawImage(im, 0, i * sh, im.width, sh + 0.5, -w / 2 + off, -h + i * dh, w, dh + 0.6);
  }
}

// ---------- shots, splashes, dust, falling bodies, and the marks they leave ----------

const LOOK = {
  hollis: { shot: '#b8e060', venom: '#9be04a', splat: '#5c7a2a', mark: ['#2c3a1acc', '#3d2a1a99'] },
  brackett: { shot: '#ffd27a', venom: '#ffd27a', splat: '#c8c0b0', mark: ['#111111cc', '#2a2622aa'] },
  base: { shot: '#ffe6a0', venom: '#ffe6a0', splat: '#d0c8b0', mark: ['#111111aa', '#2a2622aa'] },
};

export class Fx {
  constructor(ground, images) {
    this.ground = ground;        // the ground's canvas: marks are painted into it, and stay
    this.images = images;
    this.shots = []; this.bits = []; this.bodies = []; this.flashes = [];
    this.known = new WeakSet();
    this.shake = 0;
    this.sounds = [];            // what happened this frame that could be heard
  }

  /** Pick up what the sim did since the last look. */
  take(effects, visible) {
    for (const ef of effects) {
      if (this.known.has(ef)) continue;
      this.known.add(ef);
      if (!visible(ef.x0 ?? ef.x, ef.y0 ?? ef.y) && !visible(ef.x, ef.y)) continue;   // what happens in the dark stays there
      if (ef.kind === 'shot') {
        const d = Math.hypot(ef.x - ef.x0, ef.y - ef.y0);
        const lob = ef.blast || ef.lab === 'hollis';
        this.shots.push({ ...ef, age: 0, dur: Math.max(0.07, Math.min(lob ? 0.55 : 0.3, d / (lob ? 420 : 900))), arc: lob ? Math.min(90, d * 0.25) : 0 });
        if (ef.lab !== 'hollis') this.flashes.push({ x: ef.x0, y: ef.y0 - ef.r * 1.2, age: 0, life: 0.07, size: ef.r * 0.7 + 5 });
        this.sounds.push({ kind: ef.lab === 'hollis' ? 'spit' : ef.blast ? 'thump' : 'shot', x: ef.x0, y: ef.y0 });
      } else if (ef.kind === 'bite') {
        this.burst(ef.x, ef.y - 8, '#ffffff', 5, 60, 0.18);
        this.sounds.push({ kind: 'bite', x: ef.x, y: ef.y });
      } else if (ef.kind === 'death') {
        this.bodies.push({ ...ef, age: 0 });
        this.burst(ef.x, ef.y - ef.r, (LOOK[ef.lab] ?? LOOK.base).splat, 10 + ef.r, 110, 0.5);
        this.sounds.push({ kind: ef.lab === 'hollis' ? 'squelch' : 'crash', x: ef.x, y: ef.y, big: ef.r > 15 });
      } else if (ef.kind === 'leap') {
        this.burst(ef.x, ef.y, '#a08a68', 8, 70, 0.4);
      }
    }
  }

  burst(x, y, color, n, speed, life, up = 0) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = speed * (0.3 + Math.random() * 0.7);
      this.bits.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 - up, life: life * (0.6 + Math.random() * 0.6), age: 0, color, size: 1.5 + Math.random() * 2.5, fall: up ? 260 : 0 });
    }
  }

  dust(x, y, r) {
    if (Math.random() > 0.35) return;
    this.bits.push({ x: x + (Math.random() - 0.5) * r, y: y + r * 0.3, vx: (Math.random() - 0.5) * 20, vy: -8 - Math.random() * 10, life: 0.7, age: 0, color: '#9a8a6a', size: 2 + r * 0.15, soft: true });
  }

  /** A mark on the ground where something ended: scorch for machines, a stain for flesh. */
  mark(x, y, r, lab) {
    const g = this.ground.getContext('2d'), [a, b] = (LOOK[lab] ?? LOOK.base).mark;
    for (let i = 0; i < 5; i++) {
      const ox = (Math.random() - 0.5) * r, oy = (Math.random() - 0.5) * r * 0.5, rr = r * (0.4 + Math.random() * 0.6);
      const grad = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rr);
      grad.addColorStop(0, i % 2 ? a : b); grad.addColorStop(1, '#0000');
      g.fillStyle = grad; g.beginPath(); g.ellipse(x + ox, y + oy, rr, rr * 0.55, 0, 0, TAU); g.fill();
    }
    if (lab !== 'hollis') { g.fillStyle = '#5a5650'; for (let i = 0; i < 4; i++) g.fillRect(x + (Math.random() - 0.5) * r * 1.6, y + (Math.random() - 0.5) * r * 0.7, 2 + Math.random() * 3, 2); }
  }

  update(dt) {
    for (const s of this.shots) {
      s.age += dt;
      if (s.age >= s.dur && !s.landed) {
        s.landed = true;
        const look = LOOK[s.lab] ?? LOOK.base;
        if (s.blast) {
          this.flashes.push({ x: s.x, y: s.y - 6, age: 0, life: 0.18, size: 40, color: '#ffb060' });
          this.burst(s.x, s.y, '#ffb060', 14, 160, 0.45, 60);
          this.mark(s.x, s.y, 22, 'brackett');
          this.shake = Math.max(this.shake, 4);
          this.sounds.push({ kind: 'boom', x: s.x, y: s.y });
        } else this.burst(s.x, s.y - 8, s.venom ? look.venom : look.shot, s.big ? 10 : 4, 70, 0.25);
      }
    }
    this.shots = this.shots.filter((s) => s.age < s.dur + 0.05);
    for (const b of this.bits) { b.age += dt; b.x += b.vx * dt; b.y += b.vy * dt; b.vy += (b.fall ?? 0) * dt; b.vx *= 0.96; }
    this.bits = this.bits.filter((b) => b.age < b.life);
    for (const f of this.flashes) f.age += dt;
    this.flashes = this.flashes.filter((f) => f.age < f.life);
    for (const b of this.bodies) {
      b.age += dt;
      if (b.age >= 0.75 && !b.marked) { b.marked = true; this.mark(b.x, b.y, b.r * 1.3, b.lab); }
    }
    this.bodies = this.bodies.filter((b) => b.age < 0.9);
    this.shake = Math.max(0, this.shake - dt * 18);
  }

  /** Falling bodies: they tip over, sink and fade. Drawn with the living, under the shots. */
  drawBodies(g, z) {
    for (const b of this.bodies) {
      const im = this.images.get(b.art);
      if (!im) continue;
      const k = Math.min(1, b.age / 0.6), h = b.r * (b.young ? 3 : 3.8), w = Math.min(b.r * 4.4, h * im.width / im.height);
      const hh = w * im.height / im.width;
      g.save();
      g.globalAlpha = 1 - Math.max(0, (b.age - 0.45) / 0.45);
      g.translate(b.x, b.y + b.r * 0.45 - (b.flying ? (1 - k) * (b.r + 12) : 0));
      g.rotate(k * 1.25 * (b.face || 1));
      g.scale(b.face < 0 ? -1 : 1, 1 - k * 0.25);
      g.filter = `brightness(${1 - k * 0.5})`;
      g.drawImage(im, -w / 2, -hh, w, hh);
      g.restore();
      g.filter = 'none';
    }
  }

  draw(g, z, colors) {
    for (const s of this.shots) {
      if (s.landed) continue;
      const k = Math.min(1, s.age / s.dur), look = LOOK[s.lab] ?? LOOK.base;
      const x = s.x0 + (s.x - s.x0) * k, y = s.y0 + (s.y - s.y0) * k - 10 - Math.sin(k * Math.PI) * s.arc;
      if (s.lab === 'hollis' && !s.blast) {
        g.fillStyle = s.venom ? look.venom : look.shot;
        g.beginPath(); g.ellipse(x, y, 3.2 + (s.big ? 2 : 0), 2.6, 0, 0, TAU); g.fill();
        g.globalAlpha = 0.4; g.beginPath(); g.ellipse(x - (s.x - s.x0) * 0.03, y + 1, 2, 1.6, 0, 0, TAU); g.fill(); g.globalAlpha = 1;
      } else if (s.blast) {
        g.fillStyle = '#2a2622'; g.beginPath(); g.arc(x, y, 4, 0, TAU); g.fill();
        g.strokeStyle = '#ffb06088'; g.lineWidth = 2 / z; g.beginPath(); g.arc(x, y, 6, 0, TAU); g.stroke();
      } else {
        // A tracer: a bright streak along its way.
        const k0 = Math.max(0, k - 0.35), x0 = s.x0 + (s.x - s.x0) * k0, y0 = s.y0 + (s.y - s.y0) * k0 - 10;
        g.strokeStyle = colors[s.side]; g.lineWidth = (s.big ? 3.5 : 2.2) / z; g.lineCap = 'round';
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x, y); g.stroke();
        g.strokeStyle = look.shot; g.lineWidth = 1 / z;
        g.beginPath(); g.moveTo((x0 + x) / 2, (y0 + y) / 2); g.lineTo(x, y); g.stroke();
      }
    }
    for (const b of this.bits) {
      g.globalAlpha = (1 - b.age / b.life) * (b.soft ? 0.35 : 1);
      g.fillStyle = b.color;
      if (b.soft) { g.beginPath(); g.arc(b.x, b.y, b.size * (1 + b.age), 0, TAU); g.fill(); } else g.fillRect(b.x - b.size / 2, b.y - b.size / 2, b.size, b.size);
    }
    g.globalAlpha = 1;
    for (const f of this.flashes) {
      const k = 1 - f.age / f.life, grad = g.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.size);
      grad.addColorStop(0, `${f.color ?? '#fff6d0'}`); grad.addColorStop(1, '#ffb06000');
      g.globalAlpha = k; g.fillStyle = grad; g.beginPath(); g.arc(f.x, f.y, f.size, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;
  }
}

// Car physics and the road, shared by the dungeon and the client (Dark Racer). The client predicts its
// own car with exactly this code, as the Dark does for walking; the dungeon applies the same commands.
// Arcade model: velocity lives in the world frame; the car turns, and grip bleeds away sideways motion.
import { RACER as R } from './balance.ts';

export interface Pt { x: number; y: number }

/** The road: a closed centerline sampled every R.spacing units, and its half-width. */
export interface Track {
  pts: Pt[];
  halfWidth: number;
}

/** Everything the physics needs about one car. Timers count down inside driveCar. */
export interface CarState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  a: number; // heading, radians
  spin: number; // seconds of spin-out left (no control)
  slide: number; // seconds on a slick left (little grip)
  slow: number; // seconds of lance-slow left
  top: number; // top-speed multiplier (heat, rival skill); set by the dungeon
  hint: number; // nearest centerline index last time (search hint)
}

/** One tick of driver intent. */
export interface DriveCmd {
  seq: number;
  throttle: number; // -1 (brake/reverse) .. 1
  steer: number; // -1 (left) .. 1 (right)
  dt: number;
}

export const MAX_DRIVE_DT = 1 / 20;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Smooth a loop of control points (closed Catmull-Rom) and resample it evenly. */
export function buildTrack(ctrl: [number, number][], halfWidth: number = R.halfWidth, spacing: number = R.spacing): Track {
  const n = ctrl.length;
  const dense: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = ctrl[(i - 1 + n) % n]!, p1 = ctrl[i]!, p2 = ctrl[(i + 1) % n]!, p3 = ctrl[(i + 2) % n]!;
    for (let k = 0; k < 40; k++) {
      const t = k / 40, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      dense.push({ x: f(p0[0], p1[0], p2[0], p3[0]), y: f(p0[1], p1[1], p2[1], p3[1]) });
    }
  }
  // resample by arc length
  const pts: Pt[] = [dense[0]!];
  let carry = 0;
  for (let i = 1; i <= dense.length; i++) {
    const a = dense[i - 1]!, b = dense[i % dense.length]!;
    let seg = Math.hypot(b.x - a.x, b.y - a.y);
    let ax = a.x, ay = a.y;
    while (carry + seg >= spacing) {
      const k = (spacing - carry) / seg;
      ax += (b.x - ax) * k; ay += (b.y - ay) * k;
      seg -= spacing - carry;
      carry = 0;
      pts.push({ x: Math.round(ax * 10) / 10, y: Math.round(ay * 10) / 10 });
    }
    carry += seg;
  }
  if (Math.hypot(pts[pts.length - 1]!.x - pts[0]!.x, pts[pts.length - 1]!.y - pts[0]!.y) < spacing * 0.5) pts.pop();
  return { pts, halfWidth };
}

/** Index of the centerline sample nearest (x, y): a local search around the hint, full search if lost. */
export function nearestIndex(track: Track, x: number, y: number, hint = -1): number {
  const pts = track.pts, n = pts.length;
  let best = -1, bd = Infinity;
  const scan = (i: number) => {
    const p = pts[((i % n) + n) % n]!;
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bd) { bd = d; best = ((i % n) + n) % n; }
  };
  if (hint >= 0) for (let i = hint - 25; i <= hint + 25; i++) scan(i);
  if (best < 0 || bd > (track.halfWidth * 2) ** 2) { bd = Infinity; for (let i = 0; i < n; i++) scan(i); }
  return best;
}

/** Direction of the road at sample i (unit vector). */
export function roadDir(track: Track, i: number): Pt {
  const n = track.pts.length;
  const a = track.pts[((i - 1) % n + n) % n]!, b = track.pts[(i + 1) % n]!;
  const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
}

/** Keep a car on the road: the edges are walls that give back a little. */
export function collideTrack(c: CarState, track: Track) {
  const i = nearestIndex(track, c.x, c.y, c.hint);
  c.hint = i;
  const p = track.pts[i]!, d = roadDir(track, i);
  // signed lateral offset from the centerline
  const nx = -d.y, ny = d.x;
  const off = (c.x - p.x) * nx + (c.y - p.y) * ny;
  const lim = track.halfWidth - R.car.radius;
  if (Math.abs(off) <= lim) return;
  const s = Math.sign(off);
  c.x -= nx * (off - s * lim);
  c.y -= ny * (off - s * lim);
  const vn = (c.vx * nx + c.vy * ny) * s; // speed into the wall
  if (vn > 0) {
    c.vx -= nx * s * vn * (1 + R.car.bounce);
    c.vy -= ny * s * vn * (1 + R.car.bounce);
    c.vx *= 0.97; c.vy *= 0.97; // scraping
  }
}

/** One tick of driving. Pure and deterministic given the same state and command. */
export function driveCar(c: CarState, cmd: { throttle: number; steer: number }, track: Track, dt: number) {
  const K = R.car;
  if (dt <= 0) return;
  if (c.spin > 0) {
    c.a += K.spinRate * dt;
    const k = Math.exp(-2.2 * dt);
    c.vx *= k; c.vy *= k;
  } else {
    const th = clamp(Number(cmd.throttle) || 0, -1, 1), st = clamp(Number(cmd.steer) || 0, -1, 1);
    const fx0 = Math.cos(c.a), fy0 = Math.sin(c.a);
    const along = c.vx * fx0 + c.vy * fy0;
    // steering needs motion (no turning in place), and reverses when rolling backwards
    const steerK = clamp(Math.abs(along) / 140, 0, 1) * (along < -5 ? -1 : 1);
    c.a += st * K.turnRate * steerK * (c.slide > 0 ? 0.6 : 1) * dt;
    const fx = Math.cos(c.a), fy = Math.sin(c.a);
    let fwd = c.vx * fx + c.vy * fy;
    let lat = -c.vx * fy + c.vy * fx;
    const top = K.maxSpeed * c.top * (c.slow > 0 ? R.forms.lance.slowMult : 1);
    if (th > 0) { if (fwd < top) fwd = Math.min(top, fwd + th * K.accel * dt); }
    else if (th < 0) fwd += th * (fwd > 0 ? K.brake : K.accel * 0.6) * dt;
    fwd = Math.max(-K.reverseMax, fwd);
    if (fwd > top) fwd -= (fwd - top) * Math.min(1, 3 * dt); // over the limit (heat, a lance): ease down
    fwd *= Math.exp(-K.drag * dt * (th === 0 ? 3 : 1));
    lat *= Math.exp(-K.grip * (c.slide > 0 ? 0.12 : 1) * dt);
    c.vx = fx * fwd - fy * lat;
    c.vy = fy * fwd + fx * lat;
  }
  c.x += c.vx * dt;
  c.y += c.vy * dt;
  c.spin = Math.max(0, c.spin - dt);
  c.slide = Math.max(0, c.slide - dt);
  c.slow = Math.max(0, c.slow - dt);
  collideTrack(c, track);
}

/** A driver: aim a little down the road, ease off for bends, pull out to pass. Rivals use it (and tests). */
export function autopilot(c: CarState, track: Track, others: readonly Pt[] = []): { throttle: number; steer: number } {
  const n = track.pts.length;
  const i = nearestIndex(track, c.x, c.y, c.hint);
  const speed = Math.hypot(c.vx, c.vy);
  const look = 3 + Math.round(speed / 55);
  const base = track.pts[(i + look) % n]!, dir = roadDir(track, i + look);
  const nx = -dir.y, ny = dir.x;
  // someone close ahead: aim for the side of the road away from them
  let lane = 0;
  const fx = Math.cos(c.a), fy = Math.sin(c.a);
  for (const o of others) {
    const dx = o.x - c.x, dy = o.y - c.y;
    const along = dx * fx + dy * fy, side = -dx * fy + dy * fx;
    if (along > 0 && along < 140 && Math.abs(side) < 34) lane = side > 0 ? -1 : 1;
  }
  const off = lane * track.halfWidth * 0.55;
  const t = { x: base.x + nx * off, y: base.y + ny * off };
  let da = Math.atan2(t.y - c.y, t.x - c.x) - c.a;
  da = Math.atan2(Math.sin(da), Math.cos(da));
  // how sharply the road bends over the next stretch
  const d0 = roadDir(track, i + look), d1 = roadDir(track, i + look * 2 + 4);
  const bend = Math.acos(clamp(d0.x * d1.x + d0.y * d1.y, -1, 1));
  let throttle = 1;
  if (Math.abs(da) > 0.7 && speed > 160) throttle = 0;
  if (bend > 0.9 && speed > 300) throttle = -0.4;
  else if (bend > 0.6 && speed > 360) throttle = 0;
  return { throttle, steer: clamp(da * 2.4, -1, 1) };
}

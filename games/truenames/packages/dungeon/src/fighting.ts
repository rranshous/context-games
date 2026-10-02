// Fighting in the Dark by code: what a fighter (an actant's fighting code) sees each frame, what it orders, and
// `autofight`, a plain mover and aimer it can lean on (the Dark's counterpart of racing's `autopilot`).
// Shared by the client (which runs a fighter in place of the keyboard) and the actant bench (which runs it headless).
import type { Snapshot } from './protocol.ts';

export interface FightView {
  /** You: position, health (of 100), ward (absorbs harm), heat (strain) and where backlash starts (capacity). */
  me: { x: number; y: number; hp: number; ward: number; strain: number; capacity: number; alive: boolean };
  /** The others fighting beside you. */
  allies: { x: number; y: number; hp: number; alive: boolean; dist: number }[];
  /** Enemies, nearest first. Shamans keep their distance and cast; the Warden casts novas. */
  enemies: { id: number; kind: string; x: number; y: number; hp: number; maxHp: number; r: number; dist: number }[];
  /** Enemy shots in flight, nearest first. */
  shots: { x: number; y: number; dist: number }[];
  /** Enemy novas about to burst (t seconds left): stand clear of r around (x, y). */
  novas: { x: number; y: number; r: number; t: number }[];
  /** Your words: form, and how full its being's vessel is (a cast draws on it; it refills). */
  slots: ({ index: number; form: string; vessel: number; cap: number } | null)[];
  wave: number;
  waves: number;
  arena: { w: number; h: number };
  /** Seconds since the round opened. */
  time: number;
  /** Yours to keep anything in between frames (fresh each round). */
  memory: Record<string, unknown>;
}

/** Move (direction, normalized on use), aim (a point), and optionally speak a word (slot index), aimed at the aim point. */
export interface FightOrder { mx: number; my: number; ax: number; ay: number; cast?: number | null }

export type Fighter = (view: FightView) => FightOrder;

/**
 * A plain fighter's legs and eyes: keep away from what's close, dodge shots and novas, stay off the walls, stay near
 * your allies, close in when nothing threatens, and aim at the nearest enemy. It never speaks a word.
 */
export function autofight(v: FightView): { mx: number; my: number; ax: number; ay: number } {
  const { me } = v;
  let mx = 0, my = 0;
  const away = (x: number, y: number, reach: number, w: number) => {
    const dx = me.x - x, dy = me.y - y, d = Math.hypot(dx, dy) || 1;
    if (d < reach) { const k = (w * (reach - d)) / reach / d; mx += dx * k; my += dy * k; }
  };
  for (const e of v.enemies) away(e.x, e.y, e.kind === 'shaman' ? 0 : 230 + e.r, e.kind === 'brute' || e.kind === 'warden' ? 2 : 1);
  for (const s of v.shots) away(s.x, s.y, 120, 1.5);
  for (const n of v.novas) away(n.x, n.y, n.r + 40, 3);
  // walls
  const edge = 140;
  if (me.x < edge) mx += (edge - me.x) / edge; if (me.x > v.arena.w - edge) mx -= (me.x - (v.arena.w - edge)) / edge;
  if (me.y < edge) my += (edge - me.y) / edge; if (me.y > v.arena.h - edge) my -= (me.y - (v.arena.h - edge)) / edge;
  const target = v.enemies[0];
  // nothing close: close in to striking range (or toward the middle while the dark gathers)
  if (Math.hypot(mx, my) < 0.05) {
    const goal = target && target.dist > 380 ? target : !target ? { x: v.arena.w / 2, y: v.arena.h / 2, dist: Math.hypot(me.x - v.arena.w / 2, me.y - v.arena.h / 2) } : null;
    if (goal && goal.dist > 60) { mx += (goal.x - me.x) / goal.dist * 0.6; my += (goal.y - me.y) / goal.dist * 0.6; }
  }
  // stay near allies
  const living = v.allies.filter((a) => a.alive);
  if (living.length) {
    const cx = living.reduce((s, a) => s + a.x, 0) / living.length, cy = living.reduce((s, a) => s + a.y, 0) / living.length;
    const d = Math.hypot(cx - me.x, cy - me.y);
    if (d > 260) { mx += ((cx - me.x) / d) * 0.4; my += ((cy - me.y) / d) * 0.4; }
  }
  return { mx, my, ax: target ? target.x : me.x + 100, ay: target ? target.y : me.y };
}

/**
 * A fighter's view of a snapshot: you (by aura), at your own position (the client passes its prediction), with your
 * words' forms (the snapshot carries vessels, not forms).
 */
export function fightViewOf(s: Snapshot, you: string, forms: (string | null)[], arena: { w: number; h: number }, time: number, memory: Record<string, unknown>, at?: { x: number; y: number }): FightView {
  const mine = s.players.find((p) => p.id === you);
  const x = at?.x ?? mine?.x ?? arena.w / 2, y = at?.y ?? mine?.y ?? arena.h / 2;
  const d = (px: number, py: number) => Math.hypot(px - x, py - y);
  return {
    me: { x, y, hp: mine?.hp ?? 0, ward: mine?.ward ?? 0, strain: mine?.strain ?? 0, capacity: mine?.capacity ?? 1, alive: mine?.alive ?? false },
    allies: s.players.filter((p) => p.id !== you).map((p) => ({ x: p.x, y: p.y, hp: p.hp, alive: p.alive, dist: d(p.x, p.y) })),
    enemies: s.enemies.map((e) => ({ id: e.id, kind: e.kind, x: e.x, y: e.y, hp: e.hp, maxHp: e.maxHp, r: e.r, dist: d(e.x, e.y) })).sort((a, b) => a.dist - b.dist),
    shots: s.projs.filter((p) => p.enemy).map((p) => ({ x: p.x, y: p.y, dist: d(p.x, p.y) })).sort((a, b) => a.dist - b.dist),
    novas: s.novas.filter((n) => n.enemy).map((n) => ({ x: n.x, y: n.y, r: n.r, t: n.t })),
    slots: forms.map((f, i) => (f ? { index: i, form: f, vessel: mine?.slots[i]?.vessel ?? 0, cap: mine?.slots[i]?.cap ?? 1 } : null)),
    wave: s.wave, waves: s.waves, arena, time, memory,
  };
}

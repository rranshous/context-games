// Sound, made in the browser: no files. Noise and a few oscillators, shaped. Machines
// click and boom; flesh spits and squelches. Sounds near the middle of the screen are
// loudest, and they're panned by where they happen.

import { recall, remember } from './ui.js';

let ac = null, master = null, noiseBuf = null;
let muted = recall('mantle-muted') === '1';
const recent = new Map();

function audio() {
  if (ac) return ac;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ac = new AC();
  master = ac.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(ac.destination);
  noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ac;
}

/** Browsers only let sound start after a tap or a click. */
export function wake() { audio()?.resume?.(); }
export const isMuted = () => muted;
export function setMuted(on) { muted = on; remember('mantle-muted', on ? '1' : '0'); if (master) master.gain.value = on ? 0 : 0.5; }

function out(vol, pan) {
  const g = ac.createGain(); g.gain.value = vol;
  if (ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p).connect(master); } else g.connect(master);
  return g;
}

function noise(dest, { t = 0, dur, type = 'lowpass', freq = 1000, to, q = 1, vol = 1 }) {
  const s = ac.createBufferSource(); s.buffer = noiseBuf;
  const f = ac.createBiquadFilter(); f.type = type; f.Q.value = q;
  const now = ac.currentTime + t;
  f.frequency.setValueAtTime(freq, now); if (to) f.frequency.exponentialRampToValueAtTime(to, now + dur);
  const g = ac.createGain(); g.gain.setValueAtTime(vol, now); g.gain.exponentialRampToValueAtTime(0.001, now + dur);
  s.connect(f).connect(g).connect(dest); s.start(now, Math.random() * 0.5); s.stop(now + dur + 0.05);
}

function tone(dest, { t = 0, dur, type = 'sine', freq, to, vol = 1 }) {
  const o = ac.createOscillator(); o.type = type;
  const now = ac.currentTime + t;
  o.frequency.setValueAtTime(freq, now); if (to) o.frequency.exponentialRampToValueAtTime(to, now + dur);
  const g = ac.createGain(); g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(vol, now + 0.01); g.gain.exponentialRampToValueAtTime(0.001, now + dur);
  o.connect(g).connect(dest); o.start(now); o.stop(now + dur + 0.05);
}

const SOUNDS = {
  shot: (d) => { noise(d, { dur: 0.07, type: 'highpass', freq: 1800, vol: 0.5 }); tone(d, { dur: 0.05, type: 'square', freq: 220, to: 90, vol: 0.12 }); },
  thump: (d) => { tone(d, { dur: 0.25, freq: 140, to: 45, vol: 0.6 }); noise(d, { dur: 0.15, freq: 600, vol: 0.3 }); },
  spit: (d) => { noise(d, { dur: 0.12, type: 'bandpass', freq: 900, to: 300, q: 4, vol: 0.7 }); tone(d, { dur: 0.1, type: 'triangle', freq: 500, to: 180, vol: 0.12 }); },
  bite: (d) => noise(d, { dur: 0.06, type: 'bandpass', freq: 1500, q: 2, vol: 0.5 }),
  boom: (d) => { noise(d, { dur: 0.7, freq: 500, to: 60, vol: 0.9 }); tone(d, { dur: 0.5, freq: 80, to: 30, vol: 0.5 }); },
  crash: (d, big) => { noise(d, { dur: big ? 0.6 : 0.35, freq: 1400, to: 200, vol: 0.6 }); tone(d, { dur: 0.3, type: 'square', freq: 320, to: 90, vol: 0.08 }); },
  squelch: (d, big) => { noise(d, { dur: big ? 0.5 : 0.3, type: 'bandpass', freq: 700, to: 150, q: 3, vol: 0.8 }); tone(d, { dur: 0.25, freq: 260, to: 70, vol: 0.2 }); },
  ready: (d) => { tone(d, { dur: 0.18, type: 'triangle', freq: 660, vol: 0.25 }); tone(d, { t: 0.12, dur: 0.25, type: 'triangle', freq: 990, vol: 0.2 }); },
  alarm: (d) => { tone(d, { dur: 0.3, type: 'sawtooth', freq: 220, vol: 0.12 }); tone(d, { t: 0.32, dur: 0.4, type: 'sawtooth', freq: 175, vol: 0.12 }); },
  taken: (d) => { tone(d, { dur: 0.2, type: 'sine', freq: 520, vol: 0.2 }); tone(d, { t: 0.1, dur: 0.3, type: 'sine', freq: 780, vol: 0.18 }); },
  lost: (d) => { tone(d, { dur: 0.3, type: 'triangle', freq: 400, to: 260, vol: 0.2 }); },
  won: (d) => [523, 659, 784, 1046].forEach((f, i) => tone(d, { t: i * 0.14, dur: 0.5, type: 'triangle', freq: f, vol: 0.22 })),
  beaten: (d) => [392, 330, 262, 196].forEach((f, i) => tone(d, { t: i * 0.2, dur: 0.6, type: 'sawtooth', freq: f, vol: 0.1 })),
};

/** Play one, at a place on screen: { x, y } in screen pixels and the screen's size, or nothing for "here". */
export function play(kind, at, big = false) {
  if (muted || !audio() || ac.state !== 'running') return;
  // Not too many of one kind at once: a crowd of guns is a rattle, not a roar.
  const now = performance.now(), last = recent.get(kind) ?? [];
  const fresh = last.filter((t) => now - t < 120);
  if (fresh.length >= 3) return;
  recent.set(kind, [...fresh, now]);
  let vol = 1, pan = 0;
  if (at) {
    const dx = (at.x - at.w / 2) / (at.w / 2), dy = (at.y - at.h / 2) / (at.h / 2), far = Math.hypot(dx, dy);
    if (far > 1.6) return;
    vol = Math.max(0.15, 1 - far * 0.55); pan = dx * 0.7;
  }
  SOUNDS[kind]?.(out(vol, pan), big);
}

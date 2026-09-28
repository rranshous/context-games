// Synthesized sound. No assets: everything is oscillators and filtered noise.
// The drone is the sound of meditation: it swells with the hum of your workers.

let ac: AudioContext | null = null;
let master: GainNode;
let droneGain: GainNode;
let droneOsc: OscillatorNode[] = [];
let noiseBuf: AudioBuffer;
let muted = false;
try { muted = localStorage.getItem('truenames-muted') === '1'; } catch {}

// element base pitches (Hz), a loose just-intonation spread
const ELEMENT_ROOT = [220, 293.3, 247.5, 165, 196, 185, 330, 174.6];
const PENTA = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2, 9 / 4, 5 / 2, 3, 10 / 3, 4];

export function initAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  try { ac = new AudioContext(); } catch { return; }
  master = ac.createGain();
  master.gain.value = muted ? 0 : 0.5;
  master.connect(ac.destination);
  // noise
  noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  // drone: root, fifth, slightly detuned octave through a lowpass
  droneGain = ac.createGain();
  droneGain.gain.value = 0;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 400;
  droneGain.connect(lp);
  lp.connect(master);
  for (const [f, g] of [[55, 0.5], [82.4, 0.3], [110.6, 0.15]] as const) {
    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const og = ac.createGain();
    og.gain.value = g;
    o.connect(og);
    og.connect(droneGain);
    o.start();
    droneOsc.push(o);
  }
}

export function isMuted() {
  return muted;
}

export function setMuted(m: boolean) {
  muted = m;
  try { localStorage.setItem('truenames-muted', m ? '1' : '0'); } catch {}
  if (ac) master.gain.setTargetAtTime(m ? 0 : 0.5, ac.currentTime, 0.05);
}

/** Drone level follows the hum (utterances/s); quiet in combat. */
export function setDrone(hum: number, level = 1) {
  if (!ac) return;
  const v = hum > 0 ? Math.min(0.12, 0.03 + Math.log10(1 + hum) * 0.02) * level : 0;
  droneGain.gain.setTargetAtTime(v, ac.currentTime, 0.8);
  const wob = 1 + Math.min(0.02, hum / 2e6);
  droneOsc[2]?.frequency.setTargetAtTime(110.6 * wob, ac.currentTime, 1);
}

function env(g: GainNode, t: number, a: number, peak: number, d: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function tone(freq: number, type: OscillatorType, a: number, peak: number, d: number, when = 0, bend = 1) {
  if (!ac || muted) return;
  const t = ac.currentTime + when;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (bend !== 1) o.frequency.exponentialRampToValueAtTime(freq * bend, t + a + d);
  env(g, t, a, peak, d);
  o.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + a + d + 0.05);
}

function noise(a: number, peak: number, d: number, filterFreq: number, q = 1, when = 0, sweepTo?: number) {
  if (!ac || muted) return;
  const t = ac.currentTime + when;
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  const f = ac.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(filterFreq, t);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + a + d);
  f.Q.value = q;
  const g = ac.createGain();
  env(g, t, a, peak, d);
  src.connect(f);
  f.connect(g);
  g.connect(master);
  src.start(t, Math.random() * 0.5);
  src.stop(t + a + d + 0.05);
}

/** An evocation. Power 0..1 scales loudness and brightness. */
export function sfxCast(form: number, element: number, power: number) {
  const r = ELEMENT_ROOT[element] ?? 220;
  const p = Math.max(0.15, Math.min(1, power));
  switch (form) {
    case 0: tone(r * 2, 'triangle', 0.005, 0.18 * p, 0.18, 0, 1.8); noise(0.005, 0.08 * p, 0.12, 2400, 2); break; // bolt
    case 1: tone(r / 2, 'sine', 0.01, 0.35 * p, 0.45, 0, 0.5); noise(0.01, 0.12 * p, 0.35, 500, 0.7); break; // ring
    case 2: for (let i = 0; i < 3; i++) tone(r * PENTA[i * 2]! * 2, 'sine', 0.03, 0.06 * p, 0.6, i * 0.04); break; // ward
    case 3: tone(r, 'sawtooth', 0.005, 0.1 * p, 0.25, 0, 3); noise(0.005, 0.1 * p, 0.2, 3000, 3, 0, 800); break; // lance
    case 4: tone(r / 4, 'sine', 0.2, 0.2 * p, 0.3); break; // nova (gathering; the boom is sfxNova)
    case 5: for (let i = 0; i < 4; i++) tone(r * PENTA[i]!, 'triangle', 0.01, 0.08 * p, 0.2, i * 0.07); break; // summon
    case 6: tone(r * 0.75, 'square', 0.02, 0.05 * p, 0.5, 0, 0.7); tone(r * 0.76, 'square', 0.02, 0.05 * p, 0.5, 0, 0.69); break; // hex
    case 7: noise(0.01, 0.15 * p, 0.25, 600, 1, 0, 5000); break; // blink
  }
}

export function sfxNova(element: number) {
  const r = ELEMENT_ROOT[element] ?? 220;
  tone(r / 4, 'sine', 0.005, 0.4, 0.7, 0, 0.4);
  noise(0.005, 0.25, 0.6, 300, 0.5);
}

export function sfxHit() { noise(0.002, 0.06, 0.06, 1800, 2); }
export function sfxKill() { tone(90, 'sine', 0.002, 0.15, 0.15, 0, 0.5); noise(0.002, 0.07, 0.15, 900, 1); }
export function sfxHurt() { tone(70, 'sawtooth', 0.005, 0.2, 0.25, 0, 0.6); }
export function sfxBacklash() {
  tone(110, 'sawtooth', 0.005, 0.2, 0.5, 0, 0.5);
  tone(116.5, 'sawtooth', 0.005, 0.2, 0.5, 0, 0.5);
  noise(0.005, 0.2, 0.4, 400, 0.5);
}
export function sfxEnemyCast() { tone(140, 'triangle', 0.01, 0.05, 0.2, 0, 1.5); }

/** A name grows truer: a note that climbs with strength. */
export function sfxName(strength: number, element: number) {
  const r = ELEMENT_ROOT[element] ?? 220;
  const n = PENTA[strength % PENTA.length]! * (strength >= 22 ? 2 : 1);
  tone(r * n, 'sine', 0.01, 0.09, 1.2);
  tone(r * n * 2, 'sine', 0.01, 0.03, 0.8, 0.02);
}

/** A spirit answers: a bell chord, deeper and longer for mightier spirits. */
export function sfxFind(element: number, magnitude: number) {
  const r = ELEMENT_ROOT[element] ?? 220;
  const base = magnitude >= 4 ? r / 2 : r;
  [1, 5 / 4, 3 / 2, 2].forEach((m, i) => tone(base * m, 'sine', 0.01, 0.1, 1.5 + magnitude * 0.3, i * 0.09));
}

export function sfxWave() { tone(73.4, 'sine', 0.3, 0.2, 1.5); tone(110, 'sine', 0.3, 0.08, 1.5); }
export function sfxVictory() { [1, 5 / 4, 3 / 2, 2, 5 / 2].forEach((m, i) => tone(220 * m, 'triangle', 0.02, 0.08, 1.5, i * 0.12)); }
export function sfxDeath() { [1, 0.94, 0.84, 0.75].forEach((m, i) => tone(220 * m, 'sine', 0.05, 0.1, 1, i * 0.25)); }
export function sfxWarden() { [1, 0.75, 0.5].forEach((m, i) => tone(110 * m, 'sawtooth', 0.3, 0.08, 2, i * 0.3, 0.98)); tone(36.7, 'sine', 0.5, 0.3, 3); }
export function sfxShrineRaise() { [1, 5 / 4, 3 / 2].forEach((m, i) => tone(165 * m, 'sine', 0.05, 0.07, 0.8, i * 0.06)); }

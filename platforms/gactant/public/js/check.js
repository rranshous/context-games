// The check page: what this device's browser can do, found out step by step with the
// person in front of it, and saved to the server as it goes (POST /api/reports), so
// whoever is building gactant can read it without anyone relaying results.
//
// It checks what playing on a console (or a TV, or anything new) depends on: controllers
// (are they a gamepad the page can read, or only a pointer?), each button and stick, a
// second controller, speech out, the microphone, speech recognition, recording, and
// whether pictures cross from the sandbox.

import { api, el, myName } from './ui.js';
import { Sandbox } from './sandbox.js';

const BUTTONS = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'left stick (press it in)', 'right stick (press it in)', 'd-pad up', 'd-pad down', 'd-pad left', 'd-pad right'];
const STANDARD = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'LS', 'RS', 'up', 'down', 'left', 'right', 'home'];

const report = { device: '', started: new Date().toISOString(), steps: {} };
let reportId = null;
const save = async () => {
  try { ({ id: reportId } = await api('POST', 'reports', { id: reportId, report })); } catch (err) { console.warn('report not saved', err); }
  idEl.textContent = reportId ? `report ${reportId} · saved` : 'not saved yet';
};

// ---------- the page ----------

const card = el('div', { class: 'check-card' });
const idEl = el('span', { class: 'check-id' }, 'not saved yet');
const live = el('div', { class: 'check-live' });
const keysEl = el('div', { class: 'check-keys' });
document.body.append(
  el('header', { class: 'top' }, el('a', { class: 'brand', href: '/' }, 'gactant'), el('span', { class: 'tagline' }, 'device check'), el('span', { class: 'spacer' }), idEl),
  el('main', { class: 'check-main' }, card, el('h3', {}, 'controllers, live'), live, keysEl));

function show(title, text, ...rest) {
  card.replaceChildren(el('h2', {}, title), text ? el('p', { class: 'check-text' }, text) : null, ...rest.filter(Boolean));
}
const button = (label, onclick, primary = false) => el('button', { class: `check-btn${primary ? ' primary' : ''}`, onclick }, label);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- controllers: polled all the time, shown live ----------

const prev = new Map();      // pad index -> [pressed...]
let presses = [];            // { pad, button, at } since the last take()
const keys = [];
addEventListener('keydown', (e) => { keys.push(e.key); keysEl.textContent = `keys seen: ${keys.slice(-12).join(' ')}`; });

function poll() {
  const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
  for (const p of pads) {
    const was = prev.get(p.index) ?? [];
    p.buttons.forEach((b, i) => { if (b.pressed && !was[i]) presses.push({ pad: p.index, button: i, at: performance.now() }); });
    prev.set(p.index, p.buttons.map((b) => b.pressed));
  }
  live.replaceChildren(...(pads.length ? pads.map((p) => el('div', { class: 'check-pad' },
    el('div', {}, `controller ${p.index + 1}: ${p.id} (${p.mapping || 'no standard mapping'})`),
    el('div', { class: 'check-btns' }, ...p.buttons.map((b, i) => el('span', { class: `check-b${b.pressed ? ' on' : ''}` }, STANDARD[i] ?? i))),
    el('div', { class: 'check-axes' }, p.axes.map((a, i) => `axis ${i}: ${a.toFixed(2)}`).join('   '))))
    : [el('div', { class: 'check-none' }, navigator.getGamepads ? 'no controller seen by the page yet' : 'this browser has no Gamepad API')]));
  requestAnimationFrame(poll);
}
requestAnimationFrame(poll);
addEventListener('gamepadconnected', (e) => { (report.steps.connected ??= []).push({ index: e.gamepad.index, id: e.gamepad.id, mapping: e.gamepad.mapping, buttons: e.gamepad.buttons.length, axes: e.gamepad.axes.length }); save(); });

/** Wait for a button press (on pad, or any pad); null after ms. */
async function press(ms, { pad = null, button = null } = {}) {
  presses = [];
  const end = performance.now() + ms;
  while (performance.now() < end) {
    const hit = presses.find((p) => (pad == null || p.pad === pad) && (button == null || p.button === button));
    if (hit) return hit;
    await wait(30);
  }
  return null;
}

/** A yes/no question, answered with A/B or by clicking. */
function ask(title, text) {
  return new Promise((resolve) => {
    let done = false;
    const answer = (v) => { if (!done) { done = true; resolve(v); } };
    show(title, text, el('div', { class: 'check-row' }, button('yes (A)', () => answer(true), true), button('no (B)', () => answer(false))));
    (async () => {
      presses = [];
      while (!done) {
        const hit = presses.find((p) => p.button === 0 || p.button === 1);
        if (hit) answer(hit.button === 0);
        await wait(30);
      }
    })();
  });
}

/** Something to do, with a skip button. Resolves with what run() found, or 'skipped'. */
function step(title, text, run) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    show(title, text, el('div', { class: 'check-row' }, button('skip this', () => finish('skipped'))));
    run().then(finish, (err) => finish({ error: err?.message ?? String(err) }));
  });
}

// ---------- the steps ----------

async function basics() {
  show('Looking at this browser…', 'A few seconds, nothing to do.');
  const b = {
    userAgent: navigator.userAgent, screen: [screen.width, screen.height], viewport: [innerWidth, innerHeight], dpr: devicePixelRatio,
    secure: isSecureContext, subtle: Boolean(crypto.subtle), gamepadApi: Boolean(navigator.getGamepads),
    speechSynthesis: Boolean(window.speechSynthesis), recognition: Boolean(window.SpeechRecognition || window.webkitSpeechRecognition),
    mediaDevices: Boolean(navigator.mediaDevices?.getUserMedia), mediaRecorder: typeof MediaRecorder !== 'undefined',
    recorderTypes: typeof MediaRecorder !== 'undefined' ? ['audio/webm', 'audio/webm;codecs=opus', 'audio/ogg', 'audio/mp4', 'audio/wav'].filter((t) => MediaRecorder.isTypeSupported(t)) : [],
    fullscreen: Boolean(document.documentElement.requestFullscreen), pointer: matchMedia('(pointer: coarse)').matches ? 'coarse' : matchMedia('(pointer: fine)').matches ? 'fine' : 'none',
    hover: matchMedia('(hover: hover)').matches,
  };
  // The stage's pictures come from the sandbox on another site; some browsers drop them.
  try {
    const config = await api('GET', 'config');
    const sb = new Sandbox({ config, inspector: { note() {} } });
    sb.mount(document.body);
    await Promise.race([sb.ready, wait(8000)]);
    b.sandbox = sb.bridge ? (await sb.checkPictures() ? 'pictures cross' : 'pictures dropped, pixels used') : 'sandbox did not start';
    sb.remove();
  } catch (err) { b.sandbox = `error: ${err.message}`; }
  return b;
}

async function firstController() {
  const hit = await step('Controller 1', 'Press A on your first controller.', () => press(25000));
  if (hit && hit !== 'skipped') return { seen: true, pad: hit.pad, button: hit.button, keysDuring: keys.slice(-5) };
  const pointer = await ask('No controller came through', 'Does the controller move a mouse pointer around the screen?');
  return { seen: false, pointer, keysDuring: keys.slice(-10) };
}

async function eachButton(pad) {
  const found = {};
  for (const [i, name] of BUTTONS.entries()) {
    const hit = await step(`Button ${i + 1} of ${BUTTONS.length}`, `Press ${name} on controller 1.`, () => press(10000, { pad }));
    found[name] = hit === 'skipped' ? 'skipped' : hit ? (hit.button === i ? 'ok' : `came as button ${hit.button}`) : 'nothing in 10 s';
  }
  return found;
}

async function sticks(pad) {
  const out = {};
  for (const [name, axes] of [['left stick', [0, 1]], ['right stick', [2, 3]]]) {
    out[name] = await step(name, `Move the ${name} on controller 1 all the way around, slowly, a couple of times.`, async () => {
      const range = axes.map(() => [0, 0]);
      const end = performance.now() + 6000;
      while (performance.now() < end) {
        const p = navigator.getGamepads?.()[pad];
        if (p) axes.forEach((a, k) => { range[k][0] = Math.min(range[k][0], p.axes[a] ?? 0); range[k][1] = Math.max(range[k][1], p.axes[a] ?? 0); });
        await wait(30);
      }
      return { axes, range: range.map((r) => r.map((v) => +v.toFixed(2))) };
    });
  }
  // Triggers can be axes or analog buttons.
  out.triggers = await step('Triggers', 'Squeeze both triggers slowly all the way, then let go.', async () => {
    let lt = 0, rt = 0;
    const end = performance.now() + 5000;
    while (performance.now() < end) {
      const p = navigator.getGamepads?.()[pad];
      if (p) { lt = Math.max(lt, p.buttons[6]?.value ?? 0); rt = Math.max(rt, p.buttons[7]?.value ?? 0); }
      await wait(30);
    }
    return { lt: +lt.toFixed(2), rt: +rt.toFixed(2) };
  });
  return out;
}

async function secondController(first) {
  const hit = await step('Controller 2', 'If you have a second controller, press A on it. (No second one? Skip.)', async () => {
    presses = [];
    const end = performance.now() + 25000;
    while (performance.now() < end) {
      const h = presses.find((p) => p.pad !== first && p.button === 0);
      if (h) return h;
      await wait(30);
    }
    return null;
  });
  return hit === 'skipped' ? 'skipped' : hit ? { seen: true, pad: hit.pad, pads: [...navigator.getGamepads()].filter(Boolean).map((p) => p.id) } : { seen: false };
}

async function speakOut() {
  if (!window.speechSynthesis) return { available: false };
  await wait(300);
  const voices = speechSynthesis.getVoices();
  await ask('Speaking', 'Turn the sound up. Press A and I\'ll say a line.').then(() => {
    const u = new SpeechSynthesisUtterance('Hello! This is gactant, checking that I can talk to your living room.');
    speechSynthesis.speak(u);
  });
  await wait(4500);
  const heard = await ask('Did you hear it?', 'Did you hear a voice say hello?');
  return { voices: voices.length, sample: voices.slice(0, 8).map((v) => `${v.name} (${v.lang})${v.localService ? '' : ' online'}`), heard };
}

async function microphone() {
  if (!navigator.mediaDevices?.getUserMedia) return { available: false };
  const go = await ask('Microphone', 'Next I\'ll ask for the microphone. If the console asks for permission, allow it. Ready?');
  if (!go) return 'declined';
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch (err) { return { allowed: false, error: `${err.name}: ${err.message}` }; }
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput').map((d) => d.label || '(unnamed)');
  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  ctx.createMediaStreamSource(stream).connect(analyser);
  const buf = new Uint8Array(analyser.fftSize);
  const meter = el('div', { class: 'check-meter' }, el('i'));
  show('Say something', 'Talk normally for a few seconds. The bar should jump.', meter);
  let peak = 0;
  const end = performance.now() + 5000;
  while (performance.now() < end) {
    analyser.getByteTimeDomainData(buf);
    const level = Math.max(...buf.map((v) => Math.abs(v - 128))) / 128;
    peak = Math.max(peak, level);
    meter.firstChild.style.width = `${Math.round(level * 100)}%`;
    await wait(40);
  }
  // A short recording played back: what transcribing through a model would need.
  let recording = 'no MediaRecorder';
  if (typeof MediaRecorder !== 'undefined') {
    show('Recording', 'Say "hello ludant" now: I\'m recording three seconds.');
    const chunks = [];
    const rec = new MediaRecorder(stream);
    rec.ondataavailable = (e) => chunks.push(e.data);
    const stopped = new Promise((r) => { rec.onstop = r; });
    rec.start(); await wait(3000); rec.stop(); await stopped;
    const blob = new Blob(chunks, { type: rec.mimeType });
    recording = { mimeType: rec.mimeType, bytes: blob.size };
    const audio = new Audio(URL.createObjectURL(blob));
    try { await audio.play(); } catch (err) { recording.playError = err.message; }
    await wait(3200);
    recording.heardBack = await ask('Did you hear yourself?', 'Did it just play back what you said?');
  }
  stream.getTracks().forEach((t) => t.stop());
  ctx.close();
  return { allowed: true, devices, peak: +peak.toFixed(2), recording };
}

async function recognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return { available: false };
  const go = await ask('Listening', 'Press A, then say "hello ludant, make the dot bigger".');
  if (!go) return 'skipped';
  return step('Listening…', 'Say it now.', () => new Promise((resolve) => {
    const r = new SR();
    r.lang = 'en-US'; r.interimResults = false;
    r.onresult = (e) => resolve({ heard: e.results[0][0].transcript, confidence: e.results[0][0].confidence });
    r.onerror = (e) => resolve({ error: e.error });
    r.onend = () => setTimeout(() => resolve({ error: 'ended without a result' }), 200);
    try { r.start(); } catch (err) { resolve({ error: err.message }); }
  }));
}

async function run() {
  const name = el('input', { class: 'name-input', value: myName() || 'living-room-xbox', maxlength: '40' });
  await new Promise((resolve) => {
    show('Device check', 'This walks through what playing here needs: controllers, sound, the microphone. Each step says what to do and shows what came through. Everything is saved for Claude to read, so you don\'t have to report anything. About five minutes.',
      el('label', { class: 'check-row' }, 'this device is called ', name),
      el('div', { class: 'check-row' }, button('start (A)', resolve, true)));
    press(600000, { button: 0 }).then((hit) => hit && resolve());
  });
  report.device = name.value.trim() || 'unnamed';
  await save();
  const plan = [
    ['basics', basics],
    ['controller1', firstController],
    ['buttons', () => (report.steps.controller1?.seen ? eachButton(report.steps.controller1.pad) : 'no controller')],
    ['sticks', () => (report.steps.controller1?.seen ? sticks(report.steps.controller1.pad) : 'no controller')],
    ['controller2', () => secondController(report.steps.controller1?.pad ?? -1)],
    ['speech', speakOut],
    ['microphone', microphone],
    ['recognition', recognition],
  ];
  for (const [key, fn] of plan) {
    report.steps[key] = await fn();
    await save();
  }
  report.finished = new Date().toISOString();
  report.keys = keys.slice(-40);
  await save();
  show('Done, thank you!', `Everything was saved as report ${reportId}. You can close this page.`, el('pre', { class: 'check-summary' }, JSON.stringify(report.steps, null, 1)));
}

run();

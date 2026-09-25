// main.ts — the scrying window. Polls the sim, interpolates, paints. Holds no world state of its own.

import { MetaResponse, StateResponse, MAP_W, MAP_H, formatDate } from '../../shared/types.js';
import { SimApi, Soldiers } from './api.js';
import { Camera, Renderer } from './render.js';

const SOLDIER_POLL_MS = 250;
const STATE_POLL_MS = 1000;

const canvas = document.getElementById('world') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const panel = document.getElementById('panel')!;
const $ = (id: string) => document.getElementById(id)!;

const cam = new Camera();
const renderer = new Renderer(ctx);
let api: SimApi;
let meta: MetaResponse | null = null;
let state: StateResponse | null = null;
let prev: Soldiers | null = null, cur: Soldiers | null = null;
let curAt = 0;
let lastChronicleTick = -1;

function resize() {
  canvas.width = innerWidth * devicePixelRatio;
  canvas.height = innerHeight * devicePixelRatio;
}

function panelWidth() {
  return panel.classList.contains('hidden') ? 0 : panel.getBoundingClientRect().width;
}

async function loadStatics() {
  meta = await api.meta();
  const [{ terrain, height }, regions] = await Promise.all([api.terrain(), api.regions()]);
  renderer.paintTerrain(terrain, height);
  renderer.setRegions(regions);
  prev = cur = null;
  lastChronicleTick = -1;
  $('chronicle').innerHTML = '';
  cam.fit(innerWidth, innerHeight, panelWidth());
}

async function pollState() {
  try {
    const s = await api.state();
    $('error').textContent = '';
    if (!meta || s.age !== meta.age || s.seed !== meta.seed) await loadStatics();
    state = s;
    renderer.paintTerritory(s);
    updatePanel(s);
  } catch {
    $('error').textContent = `The scrying pool is clouded. (no sim at ${api.base})`;
  }
  setTimeout(pollState, STATE_POLL_MS);
}

async function pollSoldiers() {
  try {
    const s = await api.soldiers();
    if (!cur || s.tick !== cur.tick) { prev = cur; cur = s; curAt = performance.now(); }
  } catch { /* shown by state poll */ }
  setTimeout(pollSoldiers, SOLDIER_POLL_MS);
}

function frame() {
  if (meta && state) {
    const t = Math.min(1, (performance.now() - curAt) / SOLDIER_POLL_MS);
    renderer.draw(cam, meta, state, prev, cur, t);
  }
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- panel

function esc(s: string) {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

function updatePanel(s: StateResponse) {
  $('age').textContent = `THE AGE ${roman(s.age)}`;
  $('date').textContent = s.date;
  const waiting = $('waiting');
  waiting.textContent = s.stalledBy ? `Time slows while ${s.stalledBy} deliberates…` : '';
  waiting.classList.toggle('on', !!s.stalledBy);

  $('kingdoms').innerHTML = [...s.kingdoms].sort((a, b) => Number(b.alive) - Number(a.alive) || b.settlements - a.settlements).map(k => {
    const mind = k.brain === 'script' ? 'script' : k.brain.replace(/:.*$/, '');
    const wars = k.wars.map(w => `<span class="war" style="--wc:${s.kingdoms[w].color}">⚔ ${esc(shortName(s.kingdoms[w].name))}</span>`).join(' ');
    const coin = k.gold < 0 ? `<span class="debt">${k.gold.toLocaleString()} crowns</span>` : `${k.gold.toLocaleString()} crowns`;
    return `
    <div class="realm ${k.alive ? '' : 'fallen'}" style="--c:${k.color}" data-k="${k.id}">
      <div class="top"><span class="name">${esc(k.name)}</span><span class="brain ${k.brain === 'script' ? '' : 'mind'}" title="${esc(k.brain)}">${esc(mind)}</span></div>
      <div class="king">${esc(k.ruler.title)} ${esc(k.ruler.name)}, ${k.ruler.age}, ${esc(k.ruler.temperament)}${k.honor < 0.6 ? ' · <i>oathbreaker</i>' : ''}</div>
      ${k.alive ? `<div class="stats">${k.settlements} towns · ${k.soldiers.toLocaleString()} soldiers · ${coin}</div>` : '<div class="stats">fallen</div>'}
      ${k.alive && wars ? `<div class="wars">${wars}</div>` : ''}
      ${k.alive && k.thinking && k.brain !== 'script' ? '<div class="thinking">in council…</div>' : ''}
      ${k.alive && k.lastThought ? `<div class="thought">“${esc(k.lastThought)}”</div>` : ''}
      ${k.alive && k.lastDecrees.length ? `<div class="decrees">${k.lastDecrees.map(esc).join(' · ')}</div>` : ''}
    </div>`;
  }).join('');

  const box = $('chronicle');
  const fresh = s.chronicle.filter(e => e.tick > lastChronicleTick || lastChronicleTick < 0);
  if (fresh.length) {
    const atTop = box.scrollTop < 20;
    for (const e of fresh) {
      const d = document.createElement('div');
      if (lastChronicleTick >= 0) d.className = 'new';
      const c = e.faction >= 0 ? s.kingdoms[e.faction]?.color : '#d9b35f';
      d.innerHTML = `<span class="when" style="color:${c}">${esc(formatDate(e.tick).replace(/, Year.*/, ''))}</span>${esc(e.text)}`;
      box.prepend(d);
    }
    while (box.children.length > 200) box.lastChild!.remove();
    if (atTop) box.scrollTop = 0;
    lastChronicleTick = s.chronicle[s.chronicle.length - 1].tick;
  }
}

function shortName(n: string): string {
  return n.replace(/^(Kingdom|Crown|Principality|Free March|Dominion|Banner) of /, '').replace(/ (Realm|Compact)$/, '');
}

function roman(n: number): string {
  const map: [number, string][] = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, s] of map) while (n >= v) { out += s; n -= v; }
  return out;
}

// ---------------------------------------------------------------- input

let drag: { x: number; y: number; cx: number; cy: number } | null = null;
canvas.addEventListener('mousedown', e => {
  drag = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y };
  canvas.classList.add('dragging');
});
addEventListener('mouseup', () => { drag = null; canvas.classList.remove('dragging'); });
addEventListener('mousemove', e => {
  if (!drag) return;
  cam.x = drag.cx - (e.clientX - drag.x) / cam.scale;
  cam.y = drag.cy - (e.clientY - drag.y) / cam.scale;
});
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const [wx, wy] = cam.toWorld(e.clientX, e.clientY, innerWidth, innerHeight);
  cam.scale = Math.max(0.4, Math.min(24, cam.scale * Math.exp(-e.deltaY * 0.0015)));
  const [nx, ny] = cam.toWorld(e.clientX, e.clientY, innerWidth, innerHeight);
  cam.x += wx - nx;
  cam.y += wy - ny;
}, { passive: false });

$('kingdoms').addEventListener('click', e => {
  const el = (e.target as HTMLElement).closest('.realm') as HTMLElement | null;
  if (!el || !meta || !state) return;
  const k = +el.dataset.k!;
  // Fly to the realm's largest holding
  const held = state.settlements.filter(s => s.owner === k).sort((a, b) => b.garrison - a.garrison)[0];
  if (!held) return;
  const s = meta.settlements[held.id];
  cam.scale = Math.max(cam.scale, 3);
  cam.x = s.x + panelWidth() / 2 / cam.scale;
  cam.y = s.y;
});

async function togglePause() {
  const h = await api.health();
  const r = await api.control(h.paused ? 'resume' : 'pause');
  $('pause').textContent = r.paused ? 'RESUME' : 'PAUSE';
}
$('pause').addEventListener('click', togglePause);
$('fit').addEventListener('click', () => cam.fit(innerWidth, innerHeight, panelWidth()));

addEventListener('keydown', e => {
  if (e.key === 'h' || e.key === 'H') panel.classList.toggle('hidden');
  if (e.key === 'f' || e.key === 'F') cam.fit(innerWidth, innerHeight, panelWidth());
  if (e.key === ' ') { e.preventDefault(); togglePause(); }
});
addEventListener('resize', resize);

// ---------------------------------------------------------------- go

(async () => {
  resize();
  api = await SimApi.locate();
  try {
    const h = await api.health();
    $('pause').textContent = h.paused ? 'RESUME' : 'PAUSE';
  } catch { /* shown by state poll */ }
  pollState();
  pollSoldiers();
  requestAnimationFrame(frame);
  void MAP_W; void MAP_H;
})();

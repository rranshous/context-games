// main.ts — the scrying window. Polls the sim, interpolates, paints. Holds no world state of its own.

import { MetaResponse, StateResponse, MAP_W, MAP_H, formatDate } from '../../shared/types.js';
import { SimApi, Soldiers } from './api.js';
import { Camera, Renderer } from './render.js';
import { drawHistory, HistoryData } from './history.js';
import { Wanderer } from './wander.js';

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
const open = new Set<number>(); // realm cards expanded to show their reign
const wanderer = new Wanderer(cam, document.getElementById('caption')!);

function resize() {
  canvas.width = innerWidth * devicePixelRatio;
  canvas.height = innerHeight * devicePixelRatio;
}

function panelWidth() {
  return panel.classList.contains('hidden') ? 0 : panel.getBoundingClientRect().width;
}

async function loadStatics() {
  meta = await api.meta();
  // A viewer built for a different map size would draw the land skewed under the towns; fetch the current viewer instead
  if (meta.w !== MAP_W || meta.h !== MAP_H) { location.reload(); return; }
  const [{ terrain, height }, regions] = await Promise.all([api.terrain(), api.regions()]);
  renderer.paintTerrain(terrain, height);
  renderer.setRegions(regions);
  prev = cur = null;
  lastChronicleTick = -1;
  annalsSeen = -1;
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

// The minds share this CPU; a window needn't paint faster than the eye needs
const FPS = Math.max(1, parseInt(new URLSearchParams(location.search).get('fps') ?? '24', 10));
let lastDraw = 0;

function frame(now: number) {
  if (now - lastDraw < 1000 / FPS - 2) { requestAnimationFrame(frame); return; }
  lastDraw = now;
  if (meta && state) {
    wanderer.step(now, meta, state, innerWidth, innerHeight, panelWidth());
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
  $('date').textContent = `${s.date} · ${s.season}`;
  const waiting = $('waiting');
  waiting.textContent = s.stalledBy ? `The world holds its breath while ${s.stalledBy} deliberates…` : '';
  waiting.classList.toggle('on', !!s.stalledBy);

  $('kingdoms').innerHTML = [...s.kingdoms].sort((a, b) => Number(b.alive) - Number(a.alive) || b.settlements - a.settlements).map(k => {
    const mind = k.brain === 'script' ? 'script' : k.brain.replace(/:.*$/, '');
    const wars = k.wars.map(w => `<span class="war" style="--wc:${s.kingdoms[w].color}">⚔ ${esc(shortName(s.kingdoms[w].name))}</span>`)
      .concat((k.allies ?? []).map(w => `<span class="war" style="--wc:${s.kingdoms[w].color}">⛨ ${esc(shortName(s.kingdoms[w].name))}</span>`)).join(' ');
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
      ${open.has(k.id) ? `<div class="reign"><div class="origin">${esc(k.origin)}${k.honor < 1 ? ` · honor ${Math.round(k.honor * 100)}%` : ''} · ${k.income} in${k.trade ? ` (${k.trade} trade)` : ''}, ${k.upkeep} out a day</div>${mindLine(k)}${
        k.reign.length ? k.reign.slice().reverse().map(r => `<div>${esc(r)}</div>`).join('') : '<div><i>No councils yet.</i></div>'}</div>` : ''}
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
      const icon = omen(e.text);
      if (icon.cls) d.classList.add(icon.cls);
      d.innerHTML = `<span class="when" style="color:${c}">${esc(formatDate(e.tick).replace(/, Year.*/, ''))}</span>${icon.glyph ? `<span class="glyph">${icon.glyph}</span>` : ''}${esc(e.text)}`;
      box.prepend(d);
    }
    while (box.children.length > 200) box.lastChild!.remove();
    if (atTop) box.scrollTop = 0;
    lastChronicleTick = s.chronicle[s.chronicle.length - 1].tick;
  }
}

/** How this realm's mind has ruled so far: model, councils, pace, habits. */
function mindLine(k: StateResponse['kingdoms'][number]): string {
  if (k.brain === 'script') return '<div class="origin">ruled by script</div>';
  const link = ` · <span class="chamber-link" data-chamber="${k.id}">open the council chamber</span>` +
    ` · <span class="chamber-link" data-whisper="${k.id}">whisper…</span>`;
  const m = k.mind;
  if (!m || !m.councils) return `<div class="origin">mind: ${esc(k.brain)}, no councils yet${link}</div>`;
  const tools = Object.entries(m.tools).sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n.replace('_', ' ')} ${c}`).join(', ');
  return `<div class="origin">mind: ${esc(k.brain)} · ${m.councils} councils · ~${Math.round(m.seconds / m.councils)}s each · ${tools || 'no commands'}${m.misfires ? ` · ${m.misfires} misfired` : ''}${link}</div>`;
}

/** A glyph and style for the kinds of history worth noticing at a glance. */
function omen(t: string): { glyph: string; cls: string } {
  if (/rises in rebellion/.test(t)) return { glyph: '🔥', cls: 'big' };
  if (/takes the throne/.test(t)) return { glyph: '♛', cls: 'big' };
  if (/^The .* is no more\. |rules the whole continent|Age .* begins|The gods tire/.test(t)) return { glyph: '✦', cls: 'big' };
  if (/declares war/.test(t)) return { glyph: '⚔', cls: 'big' };
  if (/swear peace/.test(t)) return { glyph: '☮', cls: 'big' };
  if (/swear alliance|honors its alliance/.test(t)) return { glyph: '⛨', cls: 'big' };
  if (/betrays the alliance/.test(t)) return { glyph: '🗡', cls: 'big' };
  if (/rise against/.test(t)) return { glyph: '✊', cls: 'big' };
  if (/turn their coats|break their contract/.test(t)) return { glyph: '¤', cls: 'big' };
  if (/falls to the/.test(t)) return { glyph: '♜', cls: 'big' };
  if (/^Envoy of/.test(t)) return { glyph: '✉', cls: 'speech' };
  if (/proclaims:/.test(t)) return { glyph: '📜', cls: 'speech' };
  if (/ takes /.test(t)) return { glyph: '⚑', cls: '' };
  if (/Battle of/.test(t)) return { glyph: '⚔', cls: '' };
  if (/sellswords/.test(t)) return { glyph: '¤', cls: '' };
  if (/ sends [\d,]+ crowns to /.test(t)) return { glyph: '¤', cls: 'speech' };
  if (/Plague/.test(t)) return { glyph: '☠', cls: '' };
  return { glyph: '', cls: '' };
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
  if (wanderer.on) wanderer.toggle(false); // taking the reins ends the wandering
  drag = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y };
  canvas.classList.add('dragging');
});
addEventListener('mouseup', () => { drag = null; canvas.classList.remove('dragging'); });
addEventListener('mousemove', e => {
  if (!drag) { hover(e); return; }
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
  const ch = (e.target as HTMLElement).closest('[data-chamber]') as HTMLElement | null;
  if (ch) { openChamber(+ch.dataset.chamber!); return; }
  const wh = (e.target as HTMLElement).closest('[data-whisper]') as HTMLElement | null;
  if (wh) {
    const k = state?.kingdoms[+wh.dataset.whisper!];
    const text = k && prompt(`What do you whisper to ${k.ruler.title} ${k.ruler.name}? They will hear it at their next council.`);
    if (k && text?.trim()) api.whisper(k.id, text.trim());
    return;
  }
  const el = (e.target as HTMLElement).closest('.realm') as HTMLElement | null;
  if (!el || !meta || !state) return;
  const k = +el.dataset.k!;
  if (open.has(k)) open.delete(k); else open.add(k);
  updatePanel(state);
  // Fly to the realm's seat
  const seat = state.kingdoms[k].capital;
  if (state.settlements[seat]?.owner !== k) return;
  const s = meta.settlements[seat];
  cam.scale = Math.max(cam.scale, 3);
  cam.x = s.x + panelWidth() / 2 / cam.scale;
  cam.y = s.y;
});

// ---------------------------------------------------------------- hover: what is this?

const tip = document.createElement('div');
tip.id = 'map-tip';
tip.hidden = true;
document.body.append(tip);

function hover(e: MouseEvent) {
  if (!meta || !state || e.target !== canvas) { tip.hidden = true; return; }
  const [wx, wy] = cam.toWorld(e.clientX, e.clientY, innerWidth, innerHeight);
  const reach = 10 / cam.scale;
  let html = '';
  // Armies first: they sit on top
  let best = reach * 1.6;
  for (const a of state.armies) {
    const d = Math.hypot(a.x - wx, a.y - wy);
    if (d < best && a.size >= 10) {
      best = d;
      const k = state.kingdoms[a.faction];
      const spirit = a.morale >= 0.8 ? 'high spirits' : a.morale >= 0.5 ? 'steady' : a.morale >= 0.3 ? 'grumbling' : 'near mutiny';
      html = `<b style="color:${k.color}">General ${esc(a.general)}</b><br>${esc(k.name)}<br>${a.size.toLocaleString()} soldiers, ${spirit}` +
        `${a.renown ? `<br>has taken ${a.renown} town${a.renown > 1 ? 's' : ''}` : ''}<br>${a.order === 'march' ? 'marching on' : 'holding'} ${esc(meta.settlements[a.target].name)}`;
    }
  }
  if (!html) {
    for (const b of state.battles ?? []) {
      if (Math.hypot(b.x + 0.5 - wx, b.y + 0.5 - wy) < reach * 2.5) {
        const near = meta.settlements.reduce((p, m) => Math.hypot(m.x - b.x, m.y - b.y) < Math.hypot(p.x - b.x, p.y - b.y) ? m : p);
        html = `<b style="color:#ff8a6a">Battle near ${esc(near.name)}</b><br>${b.factions.map(f => esc(state!.kingdoms[f]?.name ?? '')).join(' against ')}<br>${b.days} day${b.days > 1 ? 's' : ''}, ${b.deaths.toLocaleString()} fallen`;
        break;
      }
    }
  }
  if (!html) {
    best = reach;
    for (const m of meta.settlements) {
      const d = Math.hypot(m.x + 0.5 - wx, m.y + 0.5 - wy);
      if (d < best) {
        best = d;
        const v = state.settlements[m.id];
        const k = state.kingdoms[v.owner];
        const seat = k && k.capital === m.id;
        html = `<b>${esc(m.name)}</b>${seat ? ' · seat' : ''}<br><span style="color:${k?.color}">${esc(k?.name ?? '')}</span><br>${v.garrison} garrisoned` +
          `${v.siege > 0 ? `<br>under siege, ${Math.round(v.siege * 100)}%` : ''}`;
      }
    }
  }
  tip.hidden = !html;
  if (html) {
    tip.innerHTML = html;
    tip.style.left = `${e.clientX + 14}px`;
    tip.style.top = `${e.clientY + 14}px`;
  }
}

// ---------------------------------------------------------------- tabs: chronicle / annals / history

let tab = 'chronicle';
let metric: 'held' | 'soldiers' = 'held';
let historyData: HistoryData | null = null;
let moments: { tick: number; text: string; glyph: string }[] = [];
let annalsSeen = -1;

document.querySelectorAll<HTMLButtonElement>('#tabs button').forEach(b => b.addEventListener('click', () => {
  tab = b.dataset.tab!;
  document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x === b));
  for (const id of ['chronicle', 'annals', 'history']) $(id).hidden = id !== tab;
  refreshTab();
}));
document.querySelectorAll<HTMLButtonElement>('.metric button').forEach(b => b.addEventListener('click', () => {
  metric = b.dataset.metric as 'held' | 'soldiers';
  document.querySelectorAll('.metric button').forEach(x => x.classList.toggle('on', x === b));
  if (historyData) drawHistory($('history-chart'), historyData, metric, moments);
}));

async function refreshTab() {
  try {
    if (tab === 'history') {
      const [h, c] = await Promise.all([api.history(), api.chronicleSince(0)]);
      historyData = h;
      moments = c.entries.filter(e => /takes the throne|rises in rebellion|declares war|swear peace|swear alliance|falls to the|^The .* is no more\. /.test(e.text))
        .map(e => ({ tick: e.tick, text: e.text, glyph: omen(e.text).glyph }));
      drawHistory($('history-chart'), historyData, metric, moments);
    } else if (tab === 'annals') {
      const annals = await api.annals();
      const last = annals.length ? annals[annals.length - 1].year : 0;
      if (last !== annalsSeen) {
        annalsSeen = last;
        $('annals').innerHTML = annals.length
          ? annals.slice().reverse().map(a => `<div class="annal"><h3>THE YEAR ${a.year}</h3><p>${esc(a.text)}</p><div class="by">set down by the scribe (${esc(a.by)})</div></div>`).join('')
          : '<p class="empty">The scribe writes at each year\'s end. The first annal is not yet written.</p>';
      }
    }
  } catch { /* shown by state poll */ }
}
setInterval(() => { if (tab !== 'chronicle') refreshTab(); }, 15000);

async function togglePause() {
  const h = await api.health();
  const r = await api.control(h.paused ? 'resume' : 'pause');
  $('pause').textContent = r.paused ? 'RESUME' : 'PAUSE';
}
$('pause').addEventListener('click', togglePause);
$('fit').addEventListener('click', () => cam.fit(innerWidth, innerHeight, panelWidth()));

addEventListener('keydown', e => {
  if (e.key === 'h' || e.key === 'H') panel.classList.toggle('hidden');
  if (e.key === 'w' || e.key === 'W') wanderer.toggle();
  if (e.key === 'f' || e.key === 'F') cam.fit(innerWidth, innerHeight, panelWidth());
  if (e.key === ' ') { e.preventDefault(); togglePause(); }
});
addEventListener('resize', resize);

// ---------------------------------------------------------------- the council chamber

/** Show exactly what a ruler's mind would be sent at council right now. */
async function openChamber(id: number) {
  const k = state?.kingdoms[id];
  if (!k) return;
  const ctx = await api.context(id);
  $('chamber-title').textContent = `THE COUNCIL OF ${k.ruler.title.toUpperCase()} ${k.ruler.name.toUpperCase()}`;
  $('chamber-span').textContent = `What ${ctx.model} is given at council: who they are, the councils they remember with their own commands and what came of them, and today's report.`;
  const last = ctx.messages.length - 1;
  $('chamber-list').innerHTML = ctx.messages.map((m, i) => {
    const who = m.role === 'system' ? 'WHO THEY ARE' : m.role === 'user' ? (i === last ? 'TODAY\'S REPORT' : 'A REMEMBERED COUNCIL')
      : m.role === 'assistant' ? 'THEY COMMANDED' : `WHAT CAME OF IT (${(m.tool_name ?? '').replace('_', ' ')})`;
    const calls = (m.tool_calls ?? []).map(c => `<div class="call">${esc(c.function.name)}(${esc(Object.entries(c.function.arguments).map(([a, v]) => `${a}: ${JSON.stringify(v)}`).join(', '))})</div>`).join('');
    const body = (m.content ? `<pre>${esc(m.content.replace(/ \/no_think$/, ''))}</pre>` : '') + calls;
    return `<div class="msg ${m.role}${i === last ? ' now' : ''}"><div class="who">${who}</div>${body || '<pre><i>(silence)</i></pre>'}</div>`;
  }).join('');
  $('chamber').hidden = false;
  $('chamber-list').scrollTop = $('chamber-list').scrollHeight;
}
$('chamber-close').addEventListener('click', () => { $('chamber').hidden = true; });

// ---------------------------------------------------------------- while you were away

// Per-viewer memory of the last moment this browser looked in (a convenience; safe to lose)
const seenKey = () => `qw-seen-${api.base}`;
function readSeen(): { tick: number; seed: number } | null {
  try { return JSON.parse(localStorage.getItem(seenKey()) ?? 'null'); } catch { return null; }
}
function writeSeen() {
  if (!state) return;
  try { localStorage.setItem(seenKey(), JSON.stringify({ tick: state.tick, seed: state.seed })); } catch { /* private window */ }
}
setInterval(writeSeen, 30000);
addEventListener('beforeunload', writeSeen);

async function welcomeBack() {
  const seen = readSeen();
  const first = !seen;
  const c = await api.chronicleSince(seen?.tick ?? 0);
  const newWorld = !!seen && seen.seed !== c.seed;
  const since = newWorld || first ? 0 : seen!.tick;
  const days = Math.floor((c.tick - since) / 24);
  if (!newWorld && !first && days < 30) return;
  if (first && days < 90) return;
  const big = c.entries.filter(e => omen(e.text).cls === 'big');
  if (!big.length && !newWorld) return;
  const years = Math.floor(days / 360), months = Math.floor((days % 360) / 30);
  const span = [years ? `${years} year${years > 1 ? 's' : ''}` : '', months ? `${months} month${months > 1 ? 's' : ''}` : ''].filter(Boolean).join(' and ') || `${days} days`;
  document.querySelector('#away h2')!.textContent = first ? 'THE STORY SO FAR' : 'WHILE YOU WERE AWAY';
  $('away-span').textContent = first
    ? `${span} of the Age ${roman(c.age)}. The great deeds, newest first.`
    : newWorld
    ? 'The world you knew is gone. A new continent has risen in its place.'
    : `${span} have passed in the world. ${c.oldest > since ? 'The oldest records have faded; here is what remains.' : ''}`;
  $('away-list').innerHTML = big.slice(-150).reverse().map(e => {
    const col = e.faction >= 0 ? state?.kingdoms[e.faction]?.color ?? '#d9b35f' : '#d9b35f';
    return `<div><span class="when" style="color:${col}">${esc(formatDate(e.tick))}</span>${omen(e.text).glyph} ${esc(e.text)}</div>`;
  }).join('');
  $('away').hidden = false;
}
$('away-close').addEventListener('click', () => { $('away').hidden = true; writeSeen(); });

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
  setTimeout(() => welcomeBack().catch(() => {}), 1500);
  if (new URLSearchParams(location.search).has('wander')) wanderer.toggle(true);
  requestAnimationFrame(frame);
  void MAP_W; void MAP_H;
})();

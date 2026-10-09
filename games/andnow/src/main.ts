// Browser viewer: draws the sim, plus the window.explorer hook for Claude.
import { asciiBody, asciiMap, LETTERS, statusLine } from './sim/ascii';
import { DIR_NAMES, GLYPH_DOCS, glyphOf } from './sim/glyphs';
import { summarize } from './sim/match';
import { parseWarrior, WarriorSpec } from './sim/warrior-file';
import { CONFIG, DEBRIS, World } from './sim/world';
import { BUNDLED } from './warriors';

// Every warrior the viewer knows: bundled ones, plus evolved ones fetched at startup
// from warriors/evolved/manifest.json (written by the evolver), named `evo:<name>`.
const SOURCES: Record<string, string> = { ...BUNDLED };

const CELL = 14;
const HUES = [205, 25, 130, 290, 55, 330, 170, 0];
const SPEEDS = [1, 2, 4, 8, 16, 32, 64, 256]; // ticks per second, roughly

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('board');
const ctx = canvas.getContext('2d')!;
const banner = $('banner'), tip = $('tip'), cardsEl = $('cards'), logEl = $('log'), tickEl = $('tick');
const seedEl = $<HTMLInputElement>('seed'), speedEl = $<HTMLInputElement>('speed');
const showIpEl = $<HTMLInputElement>('showIp'), showGlyphsEl = $<HTMLInputElement>('showGlyphs');
const playBtn = $<HTMLButtonElement>('play');

let world: World;
let specs: WarriorSpec[] = [];
let playing = false;
let tickBudget = 0;
let lastFrame = performance.now();

// ---------- setup ----------

const params = new URLSearchParams(location.search);
const initial = (params.get('w') ?? 'bomber,stalker').split(',');
seedEl.value = params.get('seed') ?? '1';

const pickersEl = $('pickers');
const pickers: HTMLSelectElement[] = [];
for (let i = 0; i < 4; i++) {
  const sel = document.createElement('select');
  sel.dataset.want = initial[i] ?? '';
  sel.style.borderLeft = `4px solid hsl(${HUES[i]} 70% 55%)`;
  pickersEl.appendChild(sel);
  pickers.push(sel);
}

function fillPickers() {
  for (const sel of pickers) {
    const want = sel.value || sel.dataset.want || '';
    sel.innerHTML = `<option value="">—</option>` + Object.keys(SOURCES).map((k) => `<option>${k}</option>`).join('');
    sel.value = want in SOURCES ? want : '';
  }
}

async function loadEvolved() {
  try {
    const files: string[] = await (await fetch('warriors/evolved/manifest.json', { cache: 'no-store' })).json();
    await Promise.all(files.map(async (f) => {
      SOURCES[`evo:${f.replace(/\.warrior$/, '')}`] = await (await fetch(`warriors/evolved/${f}`, { cache: 'no-store' })).text();
    }));
  } catch { /* no evolved warriors yet */ }
}

function newMatch(sources?: string[], seed?: number) {
  const srcs = sources ?? pickers.map((p) => p.value).filter(Boolean).map((k) => SOURCES[k]);
  specs = srcs.map((s, i) => parseWarrior(s, `warrior${i + 1}`));
  world = new World(seed ?? (Number(seedEl.value) || 1), specs);
  seedEl.value = String(world.seed);
  canvas.width = world.w * CELL;
  canvas.height = world.h * CELL;
  render();
}

$('reset').onclick = () => newMatch();
playBtn.onclick = () => setPlaying(!playing);
$('step').onclick = () => { setPlaying(false); world.tick(); render(); };
showIpEl.onchange = showGlyphsEl.onchange = () => render();

function setPlaying(p: boolean) {
  playing = p;
  playBtn.textContent = p ? 'Pause' : 'Play';
}

// ---------- loop ----------

function frame(now: number) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (playing && !world.result.over) {
    tickBudget += dt * SPEEDS[Number(speedEl.value)];
    let n = 0;
    while (tickBudget >= 1 && n < 500 && !world.result.over) { world.tick(); tickBudget--; n++; }
    if (world.result.over) setPlaying(false);
    render();
  }
  requestAnimationFrame(frame);
}

// ---------- drawing ----------

function color(id: number, l: number, a = 1) { return `hsl(${HUES[id % HUES.length]} 60% ${l}% / ${a})`; }

function render() {
  const { w, h } = world;
  const glyphs = showGlyphsEl.checked;
  ctx.font = `bold ${CELL - 3}px ui-monospace, Menlo, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = world.idx(x, y), px = x * CELL, py = y * CELL;
      const o = world.owner[i];
      if (!world.isFloor(x, y)) { ctx.fillStyle = '#1a1f29'; ctx.fillRect(px, py, CELL, CELL); continue; }
      ctx.fillStyle = '#0e1117';
      ctx.fillRect(px, py, CELL, CELL);
      if (o >= 0) {
        ctx.fillStyle = color(o, 28);
        ctx.fillRect(px + 0.5, py + 0.5, CELL - 1, CELL - 1);
        if (glyphs) { ctx.fillStyle = color(o, 78); ctx.fillText(glyphOf(world.code[i]), px + CELL / 2, py + CELL / 2 + 1); }
      } else if (o === DEBRIS) {
        ctx.fillStyle = '#2a2d33';
        ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
        if (glyphs) { ctx.fillStyle = '#555b66'; ctx.fillText(glyphOf(world.code[i]), px + CELL / 2, py + CELL / 2 + 1); }
      } else if (world.resource[i]) {
        const size = world.resource[i] === 1;
        ctx.fillStyle = size ? '#3fb950' : '#e3b341';
        ctx.beginPath();
        if (size) { ctx.arc(px + CELL / 2, py + CELL / 2, CELL / 3, 0, Math.PI * 2); }
        else { ctx.moveTo(px + CELL / 2, py + 2); ctx.lineTo(px + CELL - 2, py + CELL / 2); ctx.lineTo(px + CELL / 2, py + CELL - 2); ctx.lineTo(px + 2, py + CELL / 2); }
        ctx.fill();
      }
    }
  }
  if (showIpEl.checked) {
    for (const wr of world.warriors) {
      if (!wr.alive) continue;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(wr.ipX * CELL + 1, wr.ipY * CELL + 1, CELL - 2, CELL - 2);
    }
  }
  renderSide();
}

function renderSide() {
  tickEl.textContent = `tick ${world.t}`;
  cardsEl.innerHTML = world.warriors.map((wr) => {
    const g = wr.alive ? glyphOf(world.code[world.idx(wr.ipX, wr.ipY)]) : '';
    return `<div class="card ${wr.alive ? '' : 'dead'}" style="border-left-color:${color(wr.id, 55)}">
      <div class="name">${LETTERS[wr.id]} · ${esc(wr.name)}</div>
      <div class="stats">${wr.alive
        ? `cells ${wr.cellCount}/${Math.floor(wr.maxSize)} · speed ${wr.speed.toFixed(2)} · ran ${wr.executed}<br>at '${esc(g)}' heading ${DIR_NAMES[wr.dir]} · last action ${wr.lastOk ? 'ok' : 'failed'}`
        : `died at tick ${wr.diedAt}: ${esc(wr.deathReason ?? '')}`}</div>
      <div class="stack">stack [${wr.stack.slice(-12).join(' ')}]</div>
    </div>`;
  }).join('');
  logEl.innerHTML = world.events.slice(-40).filter((e) => e.kind !== 'shed').map((e) =>
    `<div style="color:${e.who !== undefined ? color(e.who, 65) : '#e6edf3'}">t${e.t} ${esc(e.text)}</div>`).join('');
  logEl.scrollTop = logEl.scrollHeight;
  if (world.result.over) {
    banner.style.display = 'block';
    banner.textContent = world.result.winner === null
      ? `No winner: ${world.result.reason}`
      : `${world.warriors[world.result.winner].name} wins (${world.result.reason})`;
  } else banner.style.display = 'none';
}

function esc(s: string) { return s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`); }

// Hover: what's in this cell.
canvas.onmousemove = (ev) => {
  const r = canvas.getBoundingClientRect();
  const x = Math.floor((ev.clientX - r.left) / CELL), y = Math.floor((ev.clientY - r.top) / CELL);
  if (!world.inBounds(x, y)) { tip.style.display = 'none'; return; }
  const i = world.idx(x, y), o = world.owner[i];
  let text = '';
  if (o >= 0 || o === DEBRIS) {
    const g = glyphOf(world.code[i]);
    text = `${o >= 0 ? world.warriors[o].name : 'debris'}  '${g}'  ${GLYPH_DOCS[g] ?? (g >= '0' && g <= '9' ? `push ${g}` : '')}`;
  } else if (world.resource[i]) text = world.resource[i] === 1 ? 'size pickup' : 'speed pickup';
  if (!text) { tip.style.display = 'none'; return; }
  tip.textContent = text;
  tip.style.display = 'block';
  tip.style.left = `${x * CELL + CELL + 4}px`;
  tip.style.top = `${y * CELL + CELL + 4}px`;
};
canvas.onmouseleave = () => { tip.style.display = 'none'; };

// ---------- explorer hook ----------
// Claude drives this through Playwright's evaluate: load matches, step, read state,
// read the board as text, take a screenshot.

const explorer = {
  help: () => [
    'explorer.warriors()                     names of bundled warriors',
    'explorer.load(["bomber","stalker"], 3)  new match from bundled names and a seed',
    'explorer.loadSource([text, ...], seed)  new match from warrior-file text',
    'explorer.step(n)                        advance n ticks, returns state()',
    'explorer.runUntilOver(maxTicks)         run to the end (or max), returns summary',
    'explorer.play() / pause() / setSpeed(0..7)',
    'explorer.state()                        tick, result, warriors (incl. stack, IP)',
    'explorer.ascii({glyphs})                board as text; explorer.body(id) a warrior\'s grid',
    'explorer.events(n)                      last n events',
    'explorer.screenshot()                   canvas as a PNG data URL',
  ].join('\n'),
  warriors: () => Object.keys(SOURCES),
  source: (name: string) => SOURCES[name],
  load(names: string[], seed?: number) {
    names.forEach((n, i) => { if (pickers[i]) pickers[i].value = n; });
    for (let i = names.length; i < pickers.length; i++) pickers[i].value = '';
    newMatch(names.map((n) => SOURCES[n]), seed);
    return this.state();
  },
  loadSource(sources: string[], seed?: number) { newMatch(sources, seed); return this.state(); },
  step(n = 1) { for (let i = 0; i < n && !world.result.over; i++) world.tick(); render(); return this.state(); },
  runUntilOver(maxTicks = CONFIG.tickCap) {
    for (let i = 0; i < maxTicks && !world.result.over; i++) world.tick();
    render();
    return summarize(world);
  },
  play() { setPlaying(true); },
  pause() { setPlaying(false); },
  setSpeed(s: number) { speedEl.value = String(s); },
  state: () => ({
    tick: world.t,
    seed: world.seed,
    result: world.result,
    status: statusLine(world),
    warriors: world.warriors.map((w) => ({
      id: w.id, name: w.name, alive: w.alive, cells: w.cellCount, maxSize: +w.maxSize.toFixed(2),
      speed: +w.speed.toFixed(2), ip: { x: w.ipX, y: w.ipY }, dir: DIR_NAMES[w.dir],
      glyph: w.alive ? glyphOf(world.code[world.idx(w.ipX, w.ipY)]) : null,
      stack: w.stack.slice(-16), lastOk: w.lastOk, executed: w.executed, death: w.deathReason,
    })),
  }),
  ascii: (opts: { glyphs?: boolean } = {}) => asciiMap(world, opts),
  body: (id: number) => asciiBody(world, id),
  events: (n = 30) => world.events.slice(-n).map((e) => `t${e.t} ${e.text}`),
  screenshot: () => canvas.toDataURL('image/png'),
  config: CONFIG,
  get world() { return world; },
};
(window as unknown as { explorer: typeof explorer }).explorer = explorer;

fillPickers();
loadEvolved().then(() => {
  fillPickers();
  newMatch();
  requestAnimationFrame(frame);
});

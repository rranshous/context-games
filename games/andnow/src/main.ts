// Browser viewer: draws the sim, plus the window.explorer hook for Claude.
import { asciiBody, asciiMap, LETTERS, statusLine } from './sim/ascii';
import { DIR_NAMES, GLYPH_DOCS, glyphOf } from './sim/glyphs';
import { summarize } from './sim/match';
import { parseWarrior, WarriorSpec } from './sim/warrior-file';
import { applyDish, armorOf, bandOf } from './sim/dish';
import { CONFIG, DEBRIS, World } from './sim/world';
import { BUNDLED } from './warriors';

// Every warrior the viewer knows: bundled ones, plus evolved ones fetched at startup
// from warriors/evolved/manifest.json (written by the evolver), named `evo:<name>`.
const SOURCES: Record<string, string> = { ...BUNDLED };

let CELL = 14; // px per cell; the petri plate is scaled to fit the screen
const HUES = [205, 25, 130, 290, 55, 330, 170, 0];
const SPEEDS = [1, 2, 4, 8, 16, 32, 64, 256, Infinity]; // ticks per second, roughly; the last is flat out

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('board');
const ctx = canvas.getContext('2d')!;
const banner = $('banner'), tip = $('tip'), cardsEl = $('cards'), logEl = $('log'), tickEl = $('tick');
const seedEl = $<HTMLInputElement>('seed'), speedEl = $<HTMLInputElement>('speed');
const showIpEl = $<HTMLInputElement>('showIp'), showGlyphsEl = $<HTMLInputElement>('showGlyphs');
const playBtn = $<HTMLButtonElement>('play');
const dishEl = $('dish');

let world: World;
let specs: WarriorSpec[] = [];
let matchNames: string[] | null = null; // picker names of this match's warriors (null: loaded from source)
let playing = false;
let tickBudget = 0;
let lastFrame = performance.now();

// ---------- setup ----------

const params = new URLSearchParams(location.search);
// Petri dish (?petri=1): the toxin-gradient plate, no score (same rules as dist/petri.mjs;
// settings from the URL, e.g. &toxin=0.002&size=96, defaults in src/sim/dish.ts).
// Island survival (?island=1): the side-view sea with seals and sharks. It's a
// dish too (same settings plus island ones), so it implies PETRI.
const ISLAND = params.get('island') === '1';
const PETRI = params.has('petri') || ISLAND;
if (PETRI) applyDish((k) => params.get(k));
// No tick limit in the viewer: a match runs until one lineage is left (?ticks=N to judge
// by body size at tick N, as the runners do).
CONFIG.tickCap = Number(params.get('ticks')) || Infinity;
const initial = (params.get('w') ?? (ISLAND ? 'amoeba,shark,shark,shark' : PETRI ? 'amoeba' : 'evo:morph4-twitch,evo:amoeba-g')).split(',');
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
    // The picker offers only the curated evolved warriors (manifest.json); bundled ones
    // still load by name from ?w=.
    const names = Object.keys(SOURCES).filter((k) => k.startsWith('evo:') || k === want);
    sel.innerHTML = `<option value="">—</option>` + names.map((k) => `<option>${k}</option>`).join('');
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
  matchNames = sources ? null : pickers.map((p) => p.value).filter(Boolean);
  const srcs = sources ?? pickers.map((p) => p.value).filter(Boolean).map((k) => SOURCES[k]);
  specs = srcs.map((s, i) => parseWarrior(s, `warrior${i + 1}`));
  world = new World(seed ?? (Number(seedEl.value) || 1), specs);
  seedEl.value = String(world.seed);
  CELL = PETRI ? Math.max(3, Math.min(10, Math.floor((Math.min(window.innerWidth - 380, ISLAND ? 1300 : 1000) - 24) / world.w))) : 14;
  islandBg = null;
  canvas.width = world.w * CELL;
  canvas.height = world.h * CELL;
  render();
}

$('reset').onclick = () => newMatch();
$('petri').textContent = PETRI ? 'Back to matches' : 'Petri dish';
$('island').onclick = () => { location.search = '?island=1'; };
$('petri').onclick = () => { location.search = PETRI ? '' : '?petri=1&w=amoeba'; };
dishEl.style.display = PETRI ? 'block' : 'none';
playBtn.onclick = () => setPlaying(!playing);

// Share: a link that rebuilds this exact match (same warriors, seed and settings; the sim is
// deterministic) and jumps to the current tick, plus a one-line status for context.
function shareText(): string {
  const q = new URLSearchParams(location.search);
  if (matchNames) q.set('w', matchNames.join(','));
  q.set('seed', String(world.seed));
  q.set('t', String(world.t));
  const url = `${location.origin}${location.pathname}?${q.toString().replace(/%3A/g, ':').replace(/%2C/g, ',')}`;
  const living = world.living();
  const alive = PETRI ? `${living.length} warriors` : living.map((w) => `${w.name} ${w.cellCount}c`).join(', ');
  const end = world.result.over ? ` — over: ${world.result.reason}` : '';
  return `andnow match ${url}\ntick ${world.t}; alive: ${alive || 'none'}${end}${matchNames ? '' : ' (warriors loaded from source: link has the seed only)'}`;
}
function copyText(text: string): boolean {
  // navigator.clipboard needs a secure context (https or localhost); over the LAN it's
  // missing, so fall back to a selected textarea and execCommand.
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { /* unsupported */ }
  ta.remove();
  return ok;
}
$('share').onclick = async () => {
  const text = shareText();
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch { ok = copyText(text); }
  if (!ok) { window.prompt('Copy this:', text); return; }
  $('share').textContent = 'Copied!';
  setTimeout(() => { $('share').textContent = 'Copy link'; }, 1500);
};
$('step').onclick = () => { setPlaying(false); world.tick(); render(); };
showIpEl.onchange = showGlyphsEl.onchange = () => render();

function setPlaying(p: boolean) {
  playing = p;
  playBtn.textContent = p ? 'Pause' : 'Play';
}

// ---------- loop ----------

let lastRender = 0;

function frame(now: number) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (playing && !world.result.over) {
    const speed = SPEEDS[Number(speedEl.value)];
    if (speed === Infinity) {
      // Flat out: sim for most of each frame and redraw only a few times a second.
      const until = performance.now() + 50;
      while (!world.result.over && performance.now() < until) world.tick();
      tickBudget = 0;
      if (now - lastRender > 250 || world.result.over) { render(); lastRender = now; }
    } else {
      tickBudget += dt * speed;
      let n = 0;
      // At most ~40 ms of sim per frame (a full dish is slow); drop what doesn't fit.
      const until = performance.now() + 40;
      while (tickBudget >= 1 && n < 500 && !world.result.over && performance.now() < until) { world.tick(); tickBudget--; n++; }
      if (tickBudget > 1) tickBudget = 1;
      render();
      lastRender = now;
    }
    if (world.result.over) setPlaying(false);
  }
  requestAnimationFrame(frame);
}

// ---------- drawing ----------

function color(id: number, l: number, a = 1) { return `hsl(${HUES[id % HUES.length]} 60% ${l}% / ${a})`; }

const TOXIN_TINT = ['#0e1117', '#1b1220', '#281427', '#36162c', '#451831', '#541a35'];
const ARMOR_COLORS = ['#3b82f6', '#22c55e', '#eab308', '#f97316', '#ef4444', '#d946ef'];

function render() {
  if (ISLAND) { renderIsland(); renderSide(); return; }
  const { w, h } = world;
  const glyphs = showGlyphsEl.checked && CELL >= 9;
  const tox = world.board.toxin;
  const armor = new Map<number, number>();
  if (tox) for (const wr of world.living()) armor.set(wr.id, armorOf(world, wr.id));
  ctx.font = `bold ${CELL - 3}px ui-monospace, Menlo, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = world.idx(x, y), px = x * CELL, py = y * CELL;
      const o = world.owner[i];
      if (!world.isFloor(x, y)) { ctx.fillStyle = '#1a1f29'; ctx.fillRect(px, py, CELL, CELL); continue; }
      ctx.fillStyle = tox ? TOXIN_TINT[Math.min(TOXIN_TINT.length - 1, tox[i])] : '#0e1117';
      ctx.fillRect(px, py, CELL, CELL);
      if (o >= 0) {
        // Colored by lineage; DIVIDE's descendants a little lighter per generation. On the
        // plate, colored by armor instead (blue 0K → green → yellow → orange → red 4K+), so
        // a resistant strain sweeping outward shows as a color wave.
        const wo = world.warriors[o];
        ctx.fillStyle = tox ? ARMOR_COLORS[Math.min(ARMOR_COLORS.length - 1, armor.get(o) ?? 0)] : color(wo.lineage, 28 + Math.min(wo.gen, 5) * 4);
        ctx.fillRect(px + 0.5, py + 0.5, CELL - 1, CELL - 1);
        if (glyphs) { ctx.fillStyle = color(wo.lineage, 82); ctx.fillText(glyphOf(world.code[i]), px + CELL / 2, py + CELL / 2 + 1); }
      } else if (o === DEBRIS) {
        ctx.fillStyle = '#2a2d33';
        ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
        if (glyphs) { ctx.fillStyle = '#555b66'; ctx.fillText(glyphOf(world.code[i]), px + CELL / 2, py + CELL / 2 + 1); }
      } else if (world.resource[i]) {
        const size = world.resource[i] === 1;
        ctx.fillStyle = size ? '#3fb950' : '#e3b341';
        ctx.beginPath();
        if (size) { ctx.arc(px + CELL / 2, py + CELL / 2, (CELL / 3) * Math.min(1.6, Math.sqrt(world.ripe[i])), 0, Math.PI * 2); } // bigger = riper
        else { ctx.moveTo(px + CELL / 2, py + 2); ctx.lineTo(px + CELL - 2, py + CELL / 2); ctx.lineTo(px + CELL / 2, py + CELL - 2); ctx.lineTo(px + 2, py + CELL / 2); }
        ctx.fill();
      }
    }
  }
  if (showIpEl.checked && CELL >= 6) {
    for (const wr of world.living()) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(wr.ipX * CELL + 1, wr.ipY * CELL + 1, CELL - 2, CELL - 2);
    }
  }
  renderSide();
}

// ---------- island survival: low-res pixel art, one pixel per cell, scaled up crisp ----------

const pix = document.createElement('canvas');
const pctx = pix.getContext('2d')!;
let islandBg: Uint8ClampedArray | null = null;
type RGB = [number, number, number];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const SEAL_COLORS: RGB[] = [[244, 238, 226], [255, 214, 120], [255, 160, 70], [255, 100, 100], [232, 67, 147], [190, 60, 255]];
const SHARK_COLORS: RGB[] = [[214, 64, 52], [236, 96, 40], [250, 140, 30], [255, 190, 40], [200, 255, 60], [80, 255, 160]];

/** The scenery (sky, islands, water by depth, seabed), drawn once per world. */
function islandBackground(): Uint8ClampedArray {
  const { w, h } = world, b = world.board, S = b.surface ?? 0;
  const out = new Uint8ClampedArray(w * h * 4);
  let bottom = S;
  for (let i = 0; i < w * h; i++) if (b.terrain[i] === 0) bottom = Math.max(bottom, (i / w) | 0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, t = b.terrain[i];
    let c: RGB;
    const n = ((Math.imul(x * 73856093 ^ y * 19349663, 2654435761) >>> 0) % 100) / 100; // stable grain
    if (t !== 0 && y < S) c = mix([110, 190, 240], [200, 235, 255], y / Math.max(1, S)); // sky
    else if (t !== 0) c = mix([70, 55, 45], [40, 32, 28], n * 0.6); // rock
    else if (y < S) {
      const above = y > 0 && b.terrain[i - w] === 0;
      c = above ? mix([226, 204, 140], [205, 180, 120], n) : mix([110, 190, 80], [80, 160, 60], n); // grass on top, sand below
    } else {
      const d = (y - S) / Math.max(1, bottom - S);
      c = mix([60, 165, 220], [8, 22, 58], Math.pow(d, 0.8));
      if ((b.toxin?.[i] ?? 0) % 2) c = mix(c, [0, 0, 0], 0.06); // faint pressure bands
      if (y < (b.sharkLine ?? 0)) c = mix(c, [150, 230, 240], 0.14); // the shallows: no sharks
      if (y === (b.sharkLine ?? -1) - 1 && x % 4 < 2) c = mix(c, [255, 255, 255], 0.25); // dashed shark line
      c = mix(c, [255, 255, 255], (n - 0.5) * 0.03);
    }
    out.set([c[0], c[1], c[2], 255], i * 4);
  }
  return out;
}

function renderIsland() {
  const { w, h } = world;
  if (!islandBg) { islandBg = islandBackground(); pix.width = w; pix.height = h; }
  const img = pctx.createImageData(w, h), d = img.data;
  d.set(islandBg);
  const armor = new Map<number, number>();
  for (const wr of world.living()) armor.set(wr.id, armorOf(world, wr.id));
  const put = (i: number, c: RGB) => { d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; };
  for (let i = 0; i < w * h; i++) {
    const o = world.owner[i];
    if (o >= 0) {
      const wo = world.warriors[o], a = Math.min(5, armor.get(o) ?? 0);
      let c = (wo.realm ? SHARK_COLORS : SEAL_COLORS)[a];
      if (i === world.idx(wo.ipX, wo.ipY) && showIpEl.checked) c = mix(c, [0, 0, 0], 0.45); // the eye
      put(i, c);
    } else if (o === DEBRIS) put(i, mix([d[i * 4], d[i * 4 + 1], d[i * 4 + 2]], [150, 140, 130], 0.3)); // marine snow, faint
    else if (world.resource[i] === 1) put(i, mix([30, 150, 70], [90, 230, 110], Math.min(1, (world.ripe[i] - 1) / 4)));
    else if (world.resource[i] === 2) put(i, [240, 210, 70]);
  }
  pctx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(pix, 0, 0, w * CELL, h * CELL);
}

function renderSide() {
  tickEl.textContent = `tick ${world.t}`;
  cardsEl.innerHTML = world.warriors.filter((wr) => wr.gen === 0).map((wr) => {
    const g = wr.alive ? glyphOf(world.code[world.idx(wr.ipX, wr.ipY)]) : '';
    const kin = world.warriors.filter((k) => k.lineage === wr.id && k.gen > 0);
    const kinLine = kin.length
      ? `<div class="stats">lineage: ${kin.filter((k) => k.alive).length} of ${kin.length} descendants alive, up to generation ${Math.max(...kin.map((k) => k.gen))}</div>` : '';
    return `<div class="card ${wr.alive || kin.some((k) => k.alive) ? '' : 'dead'}" style="border-left-color:${color(wr.id, 55)}">
      <div class="name">${LETTERS[wr.id]} · ${esc(wr.name)}</div>${kinLine}
      <div class="stats">${wr.alive
        ? `cells ${wr.cellCount}/${Math.floor(wr.maxSize)} · speed ${wr.speed.toFixed(2)} · ran ${wr.executed}<br>at '${esc(g)}' heading ${DIR_NAMES[wr.dir]} · last action ${wr.lastAct ? `${wr.lastAct} ` : ''}${wr.lastOk ? 'ok' : 'failed'}`
        : `died at tick ${wr.diedAt}: ${esc(wr.deathReason ?? '')}`}</div>
      <div class="stack">stack [${wr.stack.slice(-12).join(' ')}]</div>
    </div>`;
  }).join('');
  if (ISLAND) renderIslandPanel(); else if (PETRI) renderDish();
  logEl.innerHTML = world.events.slice(-40).filter((e) => e.kind !== 'shed').map((e) =>
    `<div style="color:${e.who !== undefined ? color(world.warriors[e.who]?.lineage ?? e.who, 65) : '#e6edf3'}">t${e.t} ${esc(e.text)}</div>`).join('');
  logEl.scrollTop = logEl.scrollHeight;
  if (world.result.over) {
    banner.style.display = 'block';
    banner.textContent = world.result.winner === null
      ? `No winner: ${world.result.reason}`
      : `${world.warriors[world.result.winner].name} wins (${world.result.reason})`;
  } else banner.style.display = 'none';
}

/** A warrior's genome: its glyph grid, cropped. */
function genomeOf(id: number): string {
  const cells = world.cellsOf(id);
  if (!cells.length) return '';
  const xs = cells.map((c) => c % world.w), ys = cells.map((c) => (c / world.w) | 0);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
  const rows: string[] = [];
  for (let y = y0; y <= y1; y++) {
    let r = '';
    for (let x = x0; x <= x1; x++) { const i = world.idx(x, y); r += world.owner[i] === id ? glyphOf(world.code[i]) : ' '; }
    rows.push(r.replace(/\s+$/, ''));
  }
  return rows.join(' / ');
}

function renderDish() {
  const living = world.living();
  const bands = new Array(CONFIG.plateBands).fill(0), armors = new Map<number, number>();
  for (const w of living) {
    bands[bandOf(world, w.id)]++;
    const a = armorOf(world, w.id);
    armors.set(a, (armors.get(a) ?? 0) + 1);
  }
  const counts = new Map<string, { n: number; lineage: number }>();
  for (const w of living) {
    const g = genomeOf(w.id);
    const c = counts.get(g) ?? { n: 0, lineage: w.lineage };
    c.n++;
    counts.set(g, c);
  }
  const founders = world.warriors.filter((w) => w.gen === 0).map((w) => genomeOf(w.id) || w.spec.source.split('---')[1]?.trim().split('\n').join(' / '));
  const died = world.warriors.filter((w) => !w.alive).length;
  const top = [...counts.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 8);
  dishEl.innerHTML = `<div class="name">Petri dish</div>
    <div class="stats">${living.length} alive · ${world.warriors.length - world.warriors.filter((w) => w.gen === 0).length} born · ${died} died · deepest generation ${Math.max(0, ...living.map((w) => w.gen))} · ${counts.size} genomes alive</div>
    <div class="stats">by toxin level (0 = clean middle): ${bands.map((n, b) => `<span style="background:${TOXIN_TINT[b]};padding:0 4px">${b}: ${n}</span>`).join(' ')}</div>
    <div class="stats">by armor (K cells): ${[...armors.entries()].sort((a, b) => a[0] - b[0]).map(([a, n]) => `<span style="color:${ARMOR_COLORS[Math.min(ARMOR_COLORS.length - 1, a)]}">${a}K: ${n}</span>`).join(' · ')}</div>
    ${top.map(([g, c]) => `<div class="genome"><span style="color:${color(c.lineage, 65)}">${String(c.n).padStart(3)} ×</span> <code>${esc(g)}</code>${founders.includes(g) ? ' <span class="stats">(founder)</span>' : ''}</div>`).join('')}`;
}

function renderIslandPanel() {
  const living = world.living();
  const realm = (r: number) => living.filter((w) => w.realm === r);
  const css = (c: RGB) => `rgb(${c.join(',')})`;
  const part = (r: number, title: string, colors: RGB[]) => {
    const ws = realm(r), bands = new Array(CONFIG.plateBands).fill(0), arm = new Map<number, number>(), counts = new Map<string, number>();
    for (const w of ws) {
      bands[bandOf(world, w.id)]++;
      const a = armorOf(world, w.id);
      arm.set(a, (arm.get(a) ?? 0) + 1);
      const g = genomeOf(w.id);
      counts.set(g, (counts.get(g) ?? 0) + 1);
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    return `<div class="name" style="margin-top:6px">${title}: ${ws.length}</div>
      <div class="stats">by depth (0 = shallows): ${bands.map((n, b) => `${b}: ${n}`).join(' · ')}</div>
      <div class="stats">by armor: ${[...arm.entries()].sort((a, b) => a[0] - b[0]).map(([a, n]) => `<span style="color:${css(colors[Math.min(5, a)])}">${a}K: ${n}</span>`).join(' · ')}</div>
      ${top.map(([g, n]) => `<div class="genome"><span class="stats">${String(n).padStart(3)} ×</span> <code>${esc(g)}</code></div>`).join('')}`;
  };
  const deaths = new Map<string, number>();
  for (const w of world.warriors) if (!w.alive && w.deathReason) {
    const k = `${w.realm ? 'shark' : 'seal'} ${w.deathReason.replace(/ by .*/, '').replace(/ \(.*/, '').replace('core ', '')}`;
    deaths.set(k, (deaths.get(k) ?? 0) + 1);
  }
  dishEl.innerHTML = `<div class="name">Island survival</div>
    <div class="stats">${world.warriors.length} ever lived</div>
    ${part(0, 'Seals (islanders, eat kelp)', SEAL_COLORS)}
    ${part(1, 'Sharks (eat the dead)', SHARK_COLORS)}
    <div class="stats" style="margin-top:6px">deaths: ${[...deaths.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${esc(k)} ${n}`).join(' · ')}</div>`;
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
  } else if (world.resource[i]) text = ISLAND ? (world.resource[i] === 1 ? 'kelp (seals eat it)' : 'plankton (speed)') : world.resource[i] === 1 ? 'size pickup' : 'speed pickup';
  if (o >= 0 && ISLAND) text = `${world.warriors[o].realm ? 'shark' : 'seal'} ${text}`;
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
    'await explorer.ready                    resolves once evolved warriors are loaded',
    'explorer.warriors()                     names of bundled + evolved (evo:...) warriors',
    'explorer.share()                        the Copy link text: URL (warriors, seed, settings, &t=tick) + status',
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
    const unknown = names.filter((n) => !(n in SOURCES));
    if (unknown.length) throw new Error(`unknown warrior(s): ${unknown.join(', ')} (try explorer.warriors(), or await explorer.ready)`);
    names.forEach((n, i) => { if (pickers[i]) pickers[i].value = n; });
    for (let i = names.length; i < pickers.length; i++) pickers[i].value = '';
    newMatch(names.map((n) => SOURCES[n]), seed);
    return this.state();
  },
  loadSource(sources: string[], seed?: number) { newMatch(sources, seed); return this.state(); },
  step(n = 1) { for (let i = 0; i < n && !world.result.over; i++) world.tick(); render(); return this.state(); },
  runUntilOver(maxTicks = Math.min(CONFIG.tickCap, 20000)) {
    for (let i = 0; i < maxTicks && !world.result.over; i++) world.tick();
    render();
    return summarize(world);
  },
  share: () => shareText(),
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
      stack: w.stack.slice(-16), lastAct: w.lastAct, lastOk: w.lastOk, executed: w.executed, death: w.deathReason,
    })),
  }),
  ascii: (opts: { glyphs?: boolean } = {}) => asciiMap(world, opts),
  body: (id: number) => asciiBody(world, id),
  events: (n = 30) => world.events.slice(-n).map((e) => `t${e.t} ${e.text}`),
  screenshot: () => canvas.toDataURL('image/png'),
  config: CONFIG,
  ready: Promise.resolve() as Promise<void>,
  get world() { return world; },
};
(window as unknown as { explorer: typeof explorer }).explorer = explorer;

fillPickers();
explorer.ready = loadEvolved().then(() => {
  fillPickers();
  newMatch();
  // ?t=N (from a shared link): replay to tick N, paused there.
  const t = Number(params.get('t')) || 0;
  while (world.t < t && !world.result.over) world.tick();
  render();
  requestAnimationFrame(frame);
});

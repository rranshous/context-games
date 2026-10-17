// Browser viewer: draws the sim, plus the window.explorer hook for Claude.
import { asciiBody, asciiMap, LETTERS, statusLine } from './sim/ascii';
import { DIR_NAMES, GLYPH_DOCS, glyphOf } from './sim/glyphs';
import { summarize } from './sim/match';
import { parseWarrior, WarriorSpec } from './sim/warrior-file';
import { applyDish, armorOf, bandOf } from './sim/dish';
import { CONFIG, DEBRIS, World } from './sim/world';
import { loadWorld } from './sim/save';
import { BUNDLED } from './warriors';
import { ClimbView } from './climb-view';

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
// The Climb (?climb=1): the tall world, up into air and down into water (also a dish).
const CLIMB = params.get('climb') === '1';
const PETRI = params.has('petri') || ISLAND || CLIMB;
if (PETRI) applyDish((k) => params.get(k));
// No tick limit in the viewer: a match runs until one lineage is left (?ticks=N to judge
// by body size at tick N, as the runners do).
CONFIG.tickCap = Number(params.get('ticks')) || Infinity;
const initial = (params.get('w') ?? (CLIMB ? 'climber,diver,hunter' : ISLAND ? 'amoeba,shark,shark' : PETRI ? 'amoeba' : 'evo:morph4-twitch,evo:amoeba-g')).split(',');
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
  if (CLIMB) {
    // A fixed viewport onto the tall world, plus the minimap strip beside it.
    const mini = $<HTMLCanvasElement>('minimap');
    // Phones (narrow screens) stack: the view across the full width with a slim strip beside
    // it, the controls and stats below (see the media query in index.html).
    const narrow = window.innerWidth < 900;
    const miniW = narrow ? 56 : 110;
    canvas.width = narrow ? window.innerWidth - 24 - miniW - 8 : Math.max(400, window.innerWidth - 380 - 140);
    canvas.height = narrow ? Math.round(window.innerHeight * 0.62) : Math.max(300, window.innerHeight - 40);
    mini.width = miniW;
    mini.height = canvas.height;
    mini.style.display = 'block';
    mini.style.right = `-${miniW + 8}px`;
    $('stage').style.marginRight = `${miniW + 10}px`;
    sizeTimeline();
    if (!climbView) {
      const cam = (params.get('cam') ?? '').split(',').map(Number);
      climbView = new ClimbView(canvas, mini, () => world, () => render(), cam.length === 3 && cam.every(Number.isFinite) ? { x: cam[0], y: cam[1], zoom: cam[2] } : undefined);
      climbView.glyphs = showGlyphsEl.checked;
    }
    render();
    return;
  }
  CELL = PETRI ? Math.max(3, Math.min(10, Math.floor((Math.min(window.innerWidth - 380, ISLAND ? 1300 : 1000) - 24) / world.w))) : 14;
  islandBg = null;
  canvas.width = world.w * CELL;
  canvas.height = world.h * CELL;
  sizeTimeline();
  render();
}

$('reset').onclick = () => newMatch();
$('petri').textContent = PETRI ? 'Back to matches' : 'Petri dish';
$('island').onclick = () => { location.search = '?island=1'; };
$('climb').onclick = () => { location.search = '?climb=1'; };
$('petri').onclick = () => { location.search = PETRI ? '' : '?petri=1&w=amoeba'; };
dishEl.style.display = PETRI ? 'block' : 'none';
playBtn.onclick = () => { seekTo = null; setPlaying(!playing); };

// Share: a link that rebuilds this exact match (same warriors, seed and settings; the sim is
// deterministic) and jumps to the current tick. Copy link copies just the URL; explorer.share
// adds a one-line status for context.
function shareUrl(): string {
  const q = new URLSearchParams(location.search);
  if (matchNames) q.set('w', matchNames.join(','));
  q.set('seed', String(world.seed));
  q.set('t', String(world.t));
  // (cam y in the world's first rows, before any grew on above: loading moves it down by yShift)
  if (CLIMB && climbView) q.set('cam', `${Math.round(climbView.cam.x)},${Math.round(climbView.cam.y - (world.yShift ?? 0))},${+climbView.cam.zoom.toFixed(2)}`);
  // ?pick=<id>: the picked body (the link opens on it, picked and followed).
  const pick = CLIMB ? climbView?.selected ?? null : null;
  if (pick !== null) q.set('pick', String(pick)); else q.delete('pick');
  return `${location.origin}${location.pathname}?${q.toString().replace(/%3A/g, ':').replace(/%2C/g, ',').replace(/%2F/g, '/')}`;
}
function shareText(): string {
  const url = shareUrl(), pick = CLIMB ? climbView?.selected ?? null : null;
  const living = world.living();
  const alive = PETRI ? `${living.length} warriors` : living.map((w) => `${w.name} ${w.cellCount}c`).join(', ');
  const end = world.result.over ? ` — over: ${world.result.reason}` : '';
  const picked = pick !== null ? `; picked: ${world.warrior(pick).name} (${world.warrior(pick).cellCount} cells)` : '';
  if (CLIMB) return `andnow climb ${url}\ntick ${world.t}; ${living.length} alive${picked}`;
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
/** Copy the share link (just the URL, to paste straight into a browser), and say so on `el` for a moment. */
async function copyShare(el: HTMLElement, label: string, done = 'Copied!') {
  const text = shareUrl();
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch { ok = copyText(text); }
  if (!ok) { window.prompt('Copy this:', text); return; }
  el.textContent = done;
  setTimeout(() => { el.textContent = label; }, 1500);
}
$('share').onclick = () => copyShare($('share'), 'Copy link');
$('step').onclick = () => { setPlaying(false); world.tick(); render(); };
showIpEl.onchange = showGlyphsEl.onchange = () => { if (climbView) climbView.glyphs = showGlyphsEl.checked; render(); };

function setPlaying(p: boolean) {
  playing = p;
  playBtn.textContent = p ? 'Pause' : 'Play';
}

// ---------- loop ----------

let lastRender = 0;

function frame(now: number) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (seekTo !== null) {
    // Seeking: sim flat out toward the target, redrawing a few times a second.
    const until = performance.now() + 60;
    while (world.t < seekTo && !world.result.over && performance.now() < until) world.tick();
    if (world.t >= seekTo || world.result.over) {
      seekTo = null;
      rateTick = Infinity;
      render();
      const then = afterSeek;
      afterSeek = null;
      then?.();
    } else if (now - lastRender > 300) {
      render();
      lastRender = now;
      tickEl.textContent = `seeking: tick ${world.t} of ${seekTo}…`;
    }
  }
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
  else if (seekTo === null && climbView?.gliding) render(); // (paused: let the camera finish gliding)
  requestAnimationFrame(frame);
}

// ---------- drawing ----------

function color(id: number, l: number, a = 1) { return `hsl(${HUES[id % HUES.length]} 60% ${l}% / ${a})`; }

const TOXIN_TINT = ['#0e1117', '#1b1220', '#281427', '#36162c', '#451831', '#541a35'];
const ARMOR_COLORS = ['#3b82f6', '#22c55e', '#eab308', '#f97316', '#ef4444', '#d946ef'];

let climbView: ClimbView | null = null;

function render() {
  renderTimeline();
  if (CLIMB && climbView) { climbView.render(); renderSide(); renderFinder(); return; }
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
        const wo = world.warrior(o);
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
let bgVersion = -1;
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
  if (!islandBg || bgVersion !== world.terrainVersion) { islandBg = islandBackground(); bgVersion = world.terrainVersion; pix.width = w; pix.height = h; }
  const img = pctx.createImageData(w, h), d = img.data;
  d.set(islandBg);
  const armor = new Map<number, number>();
  for (const wr of world.living()) armor.set(wr.id, armorOf(world, wr.id));
  const put = (i: number, c: RGB) => { d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; };
  for (let i = 0; i < w * h; i++) {
    const o = world.owner[i];
    if (o >= 0) {
      const wo = world.warrior(o), a = Math.min(5, armor.get(o) ?? 0);
      let c = (wo.realm ? SHARK_COLORS : SEAL_COLORS)[a];
      if (i === world.idx(wo.ipX, wo.ipY) && showIpEl.checked) c = mix(c, [0, 0, 0], 0.45); // the eye
      put(i, c);
    } else if (o === DEBRIS) put(i, mix([d[i * 4], d[i * 4 + 1], d[i * 4 + 2]], [150, 140, 130], 0.3)); // marine snow, faint
    else if (world.resource[i] === 1) {
      // Kelp: dark green when fresh, ripening to gold; a ripe one grows a frond above it.
      const r = Math.min(1, (world.ripe[i] - 1) / Math.max(1, CONFIG.foodRipeMax - 1));
      put(i, r < 0.5 ? mix([25, 120, 55], [80, 210, 90], r * 2) : mix([80, 210, 90], [250, 210, 60], (r - 0.5) * 2));
      if (r > 0.6 && i >= w && world.owner[i - w] === -1 && !world.resource[i - w] && world.isFloor((i - w) % w, ((i - w) / w) | 0)) put(i - w, mix([d[(i - w) * 4], d[(i - w) * 4 + 1], d[(i - w) * 4 + 2]], [200, 190, 70], 0.5));
    }
    else if (world.resource[i] === 2) put(i, [240, 210, 70]);
  }
  pctx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(pix, 0, 0, w * CELL, h * CELL);
}

let rateTick = 0, rateAt = performance.now(), tps = 0;

function renderSide() {
  // Ticks per second: sampled about once a second, smoothed a little.
  const now = performance.now();
  if (world.t < rateTick) { rateTick = world.t; rateAt = now; tps = 0; }
  else if (now - rateAt >= 1000) {
    const inst = ((world.t - rateTick) * 1000) / (now - rateAt);
    tps = tps ? tps * 0.5 + inst * 0.5 : inst;
    rateTick = world.t; rateAt = now;
  }
  tickEl.textContent = `tick ${world.t} · ${tps < 10 ? tps.toFixed(1) : Math.round(tps)} ticks/s`;
  cardsEl.innerHTML = world.allWarriors().filter((wr) => wr.gen === 0).map((wr) => {
    const g = wr.alive ? glyphOf(world.code[world.idx(wr.ipX, wr.ipY)]) : '';
    const kin = world.living().filter((k) => k.lineage === wr.id && k.gen > 0), born = world.bornCount(wr.id);
    const kinLine = born
      ? `<div class="stats">lineage: ${kin.length} of ${born} descendants alive${kin.length ? `, up to generation ${Math.max(...kin.map((k) => k.gen))}` : ''}</div>` : '';
    return `<div class="card ${wr.alive || kin.length ? '' : 'dead'}" style="border-left-color:${color(wr.id, 55)}">
      <div class="name">${LETTERS[wr.id]} · ${esc(wr.name)}</div>${kinLine}
      <div class="stats">${wr.alive
        ? `cells ${wr.cellCount}/${Math.floor(wr.maxSize)} · speed ${wr.speed.toFixed(2)} · ran ${wr.executed}<br>at '${esc(g)}' heading ${DIR_NAMES[wr.dir]} · last action ${wr.lastAct ? `${wr.lastAct} ` : ''}${wr.lastOk ? 'ok' : 'failed'}`
        : `died at tick ${wr.diedAt}: ${esc(wr.deathReason ?? '')}`}</div>
      <div class="stack">stack [${wr.stack.slice(-12).join(' ')}]</div>
    </div>`;
  }).join('');
  if (CLIMB && climbView) dishEl.innerHTML = climbView.panel(esc); else if (ISLAND) renderIslandPanel(); else if (PETRI) renderDish();
  logEl.innerHTML = world.events.slice(-40).filter((e) => e.kind !== 'shed').map((e) =>
    `<div style="color:${e.who !== undefined ? color(world.warrior(e.who)?.lineage ?? e.who, 65) : '#e6edf3'}">t${e.t} ${esc(e.text)}</div>`).join('');
  logEl.scrollTop = logEl.scrollHeight;
  if (world.result.over) {
    banner.style.display = 'block';
    banner.textContent = world.result.winner === null
      ? `No winner: ${world.result.reason}`
      : `${world.warrior(world.result.winner).name} wins (${world.result.reason})`;
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
  const founders = world.allWarriors().filter((w) => w.gen === 0).map((w) => genomeOf(w.id) || w.spec.source.split('---')[1]?.trim().split('\n').join(' / '));
  const died = [...world.deaths.values()].reduce((a, n) => a + n, 0);
  const top = [...counts.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 8);
  dishEl.innerHTML = `<div class="name">Petri dish</div>
    <div class="stats">${living.length} alive · ${world.everLived() - world.allWarriors().filter((w) => w.gen === 0).length} born · ${died} died · deepest generation ${Math.max(0, ...living.map((w) => w.gen))} · ${counts.size} genomes alive</div>
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
      <div class="stats">pace ${ws.length ? (ws.reduce((t, w) => t + (w.pace ?? 0), 0) / ws.length).toFixed(2) : '-'} on average (speed, hunger and aging)</div>
      <div class="stats">by depth (0 = shallows): ${bands.map((n, b) => `${b}: ${n}`).join(' · ')}</div>
      <div class="stats">by armor: ${[...arm.entries()].sort((a, b) => a[0] - b[0]).map(([a, n]) => `<span style="color:${css(colors[Math.min(5, a)])}">${a}K: ${n}</span>`).join(' · ')}</div>
      ${top.map(([g, n]) => `<div class="genome"><span class="stats">${String(n).padStart(3)} ×</span> <code>${esc(g)}</code></div>`).join('')}`;
  };
  const deaths = new Map<string, number>();
  for (const [rk, n] of world.deaths) {
    const [realm, why] = rk.split('|');
    deaths.set(`${realm === '1' ? 'shark' : 'seal'} ${why.replace('core ', '')}`, n);
  }
  dishEl.innerHTML = `<div class="name">Island survival</div>
    <div class="stats">${world.everLived()} ever lived</div>
    ${part(0, 'Seals (islanders, eat kelp)', SEAL_COLORS)}
    ${part(1, 'Sharks (eat the dead)', SHARK_COLORS)}
    <div class="stats" style="margin-top:6px">deaths: ${[...deaths.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${esc(k)} ${n}`).join(' · ')}</div>`;
}

function genomeOfCell(id: number) { return genomeOf(id); }

function esc(s: string) { return s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`); }

// Hover: what's in this cell.
canvas.onmousemove = (ev) => {
  const r = canvas.getBoundingClientRect();
  const [x, y] = CLIMB && climbView ? climbView.cellAt(ev.clientX - r.left, ev.clientY - r.top) : [Math.floor((ev.clientX - r.left) / CELL), Math.floor((ev.clientY - r.top) / CELL)];
  if (!world.inBounds(x, y)) { tip.style.display = 'none'; return; }
  const i = world.idx(x, y), o = world.owner[i];
  let text = '';
  if (o >= 0 || o === DEBRIS) {
    const g = glyphOf(world.code[i]);
    text = `${o >= 0 ? world.warrior(o).name : 'debris'}  '${g}'  ${GLYPH_DOCS[g] ?? (g >= '0' && g <= '9' ? `push ${g}` : '')}`;
  } else if (world.resource[i]) text = ISLAND ? (world.resource[i] === 1 ? 'kelp (seals eat it)' : 'plankton (speed)') : world.resource[i] === 1 ? 'size pickup' : 'speed pickup';
  if (o >= 0 && ISLAND) text = `${world.warrior(o).realm ? 'shark' : 'seal'} ${text}`;
  if (CLIMB) {
    const n = world.board.step?.[i] ?? 0;
    if (world.resource[i]) text = `plant ×${(world.richness(i) * world.ripe[i]).toFixed(0)} food (ripeness ${world.ripe[i].toFixed(1)})`;
    const t = o >= 0 ? world.warrior(o).traits : undefined;
    if (t) text += `\narmor ${t.armor} · insulation ${t.insulation} · bite ${t.bite} · pace ${t.pace.toFixed(2)} · eats ${t.plants && t.meat ? 'both' : t.meat ? 'meat' : t.plants ? 'plants' : 'nothing'}\nmax size ${Math.floor(world.warrior(o).maxSize)} · ${genomeOfCell(o)}`;
    text = `${text ? text + '\n' : ''}step ${n > 0 ? '+' + n : n}${world.board.terrain[i] ? ' · rock' : ''}`;
  }
  if (!text) { tip.style.display = 'none'; return; }
  tip.textContent = text;
  tip.style.display = 'block';
  tip.style.left = `${CLIMB ? ev.clientX - r.left + 14 : x * CELL + CELL + 4}px`;
  tip.style.top = `${CLIMB ? ev.clientY - r.top + 14 : y * CELL + CELL + 4}px`;
};
canvas.onmouseleave = () => { tip.style.display = 'none'; };

// ---------- jumping to a tick ----------
// Any mode can seek forward by simulating flat out. With a bake (?bake=runs/bake/<name>,
// written by dist/bake.mjs) it loads the nearest saved checkpoint first, so tick 150,000
// is a download away, and the timeline under the board shows the whole run to tap through.

interface Mark { t: number; file: string; alive: number; kb: number; biggest?: { id: number; cells: number; x: number; y: number; name: string; genome: string } }
interface Bake { query: string; every: number; ticks: number | null; done?: boolean; marks: Mark[] }
const BAKE = params.get('bake');
let bake: Bake | null = null;
let seekTo: number | null = null;
let afterSeek: (() => void) | null = null;
let scrub: number | null = null; // the tick under a finger dragging along the timeline
const timeline = $<HTMLCanvasElement>('timeline');
const gotoEl = $<HTMLInputElement>('goto');
const finderEl = $('finder');

/** Fetch the bake's index. Returns false when the page is reloading with the bake's settings. */
async function loadBake(): Promise<boolean> {
  if (!BAKE) return true;
  bake = (await (await fetch(`${BAKE}/index.json`, { cache: 'no-store' })).json()) as Bake;
  const want = new URLSearchParams(bake.query);
  if ([...want].some(([k, v]) => params.get(k) !== v)) {
    for (const [k, v] of params) if (!want.has(k)) want.set(k, v);
    location.replace(`?${want.toString().replace(/%2C/g, ',').replace(/%2F/g, '/')}`);
    return false;
  }
  // A bake still being written grows: pick up new checkpoints now and then.
  const poll = setInterval(async () => {
    try { bake = (await (await fetch(`${BAKE}/index.json`, { cache: 'no-store' })).json()) as Bake; } catch { /* keep the old one */ }
    if (bake?.done) clearInterval(poll);
    renderTimeline();
  }, 30000);
  timeline.style.display = 'block';
  return true;
}

async function readMark(m: Mark): Promise<World> {
  const buf = new Uint8Array(await (await fetch(`${BAKE}/${m.file}`)).arrayBuffer());
  const gz = buf[0] === 0x1f && buf[1] === 0x8b; // (unless the server already unzipped it)
  const raw = gz ? new Uint8Array(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()) : buf;
  return loadWorld(raw);
}

/** Jump to a tick (paused there), then run `then`. */
async function seek(target: number, then?: () => void) {
  setPlaying(false);
  target = Math.max(0, Math.floor(target));
  const follow = climbView?.follow ?? null;
  if (bake) {
    let m: Mark | undefined;
    for (const k of bake.marks) if (k.t <= target) m = k;
    if (m && (world.t > target || m.t > world.t)) {
      seekTo = null;
      tickEl.textContent = `loading tick ${m.t}…`;
      world = await readMark(m);
      CONFIG.tickCap = Number(params.get('ticks')) || Infinity;
    }
  } else if (world.t > target) newMatch();
  if (climbView) climbView.follow = follow; // (same ids in the same run: keep following)
  seekTo = target;
  afterSeek = then ?? null;
  rateTick = Infinity; // (a jump isn't a speed: restart the ticks/s reading)
  render();
}

gotoEl.onkeydown = (e) => { if (e.key === 'Enter') $('go').click(); };
$('go').onclick = () => { if (gotoEl.value !== '') void seek(Number(gotoEl.value)); };

function sizeTimeline() {
  timeline.width = canvas.width;
  timeline.height = 52;
}

const kfmt = (t: number) => (t >= 1000 ? `${+(t / 1000).toFixed(t % 1000 ? 1 : 0)}k` : String(t));

/** The run at a glance: alive (grey) and the biggest body (red) per checkpoint, and where we are. */
function renderTimeline() {
  if (!bake || timeline.style.display === 'none') return;
  const g = timeline.getContext('2d')!, W = timeline.width, H = timeline.height, marks = bake.marks;
  const T = Math.max(marks[marks.length - 1].t, world.t, 1), X = (t: number) => (t / T) * (W - 1);
  const maxAlive = Math.max(1, ...marks.map((m) => m.alive)), maxBig = Math.max(1, ...marks.map((m) => m.biggest?.cells ?? 0));
  g.fillStyle = '#0d1117';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#161b22';
  g.fillRect(0, 0, X(marks[marks.length - 1].t), H); // baked so far
  const top = 14, h = H - top - 2;
  g.beginPath();
  g.moveTo(X(marks[0].t), H - 2);
  for (const m of marks) g.lineTo(X(m.t), H - 2 - (m.alive / maxAlive) * h);
  g.lineTo(X(marks[marks.length - 1].t), H - 2);
  g.fillStyle = '#30363d';
  g.fill();
  g.beginPath();
  marks.forEach((m, k) => { const y = H - 2 - ((m.biggest?.cells ?? 0) / maxBig) * h; if (k) g.lineTo(X(m.t), y); else g.moveTo(X(m.t), y); });
  g.strokeStyle = '#ff6b8b';
  g.lineWidth = 1.5;
  g.stroke();
  const line = (t: number, c: string) => { g.fillStyle = c; g.fillRect(Math.round(X(t)) - 1, 0, 2, H); };
  if (seekTo !== null) line(seekTo, '#e3b341');
  line(world.t, '#fff');
  g.font = '11px ui-monospace, Menlo, monospace';
  g.textBaseline = 'top';
  g.fillStyle = '#8b949e';
  g.fillText(`alive ≤${maxAlive}`, 4, 2);
  g.fillStyle = '#ff6b8b';
  g.fillText(`biggest ≤${maxBig}`, 4 + g.measureText(`alive ≤${maxAlive}  `).width, 2);
  g.fillStyle = '#8b949e';
  g.textAlign = 'right';
  g.fillText(kfmt(T), W - 4, 2);
  g.textAlign = 'left';
  if (scrub !== null) {
    line(scrub, '#58a6ff');
    const label = `tick ${kfmt(scrub)}`, lw = g.measureText(label).width + 8, lx = Math.min(W - lw, Math.max(0, X(scrub) - lw / 2));
    g.fillStyle = '#161b22';
    g.fillRect(lx, top, lw, 15);
    g.fillStyle = '#e6edf3';
    g.fillText(label, lx + 4, top + 2);
  }
}

{
  const tickAt = (e: PointerEvent) => {
    const r = timeline.getBoundingClientRect(), T = Math.max(bake?.marks[bake.marks.length - 1].t ?? 0, world.t, 1);
    const t = Math.round(((e.clientX - r.left) / r.width) * T);
    const every = bake?.every ?? 1;
    return Math.max(0, Math.min(T, Math.round(t / every) * every)); // snap to checkpoints: instant to load
  };
  timeline.addEventListener('pointerdown', (e) => { timeline.setPointerCapture(e.pointerId); scrub = tickAt(e); renderTimeline(); });
  timeline.addEventListener('pointermove', (e) => { if (scrub !== null) { scrub = tickAt(e); renderTimeline(); } });
  timeline.addEventListener('pointerup', () => { if (scrub !== null) { const t = scrub; scrub = null; void seek(t); } });
  timeline.addEventListener('pointercancel', () => { scrub = null; renderTimeline(); });
}

/** Climb: find the biggest body, now or anywhere in the bake. */
function renderFinder() {
  finderEl.style.display = 'block';
  let big: { id: number; cells: number } | null = null;
  for (const w of world.living()) if (!big || w.cellCount > big.cells) big = { id: w.id, cells: w.cellCount };
  let ever: Mark | null = null;
  for (const m of bake?.marks ?? []) if (m.biggest && (!ever || m.biggest.cells > ever.biggest!.cells)) ever = m;
  const following = climbView?.follow ?? null;
  const html = [
    big ? `<div>biggest now: ${big.cells} cells, ${esc(world.warrior(big.id).name)} · ${following === big.id ? 'following · <a data-unfollow="1">stop</a>' : `<a data-follow="${big.id}">follow it</a>`} <span style="color:#6e7681">(key B)</span></div>` : '',
    ever ? `<div>biggest in this run: ${ever.biggest!.cells} cells at tick ${ever.t} · <a data-ever="${ever.t}">go see it</a></div>` : '',
    climbView?.selected != null ? `<div>picked: ${world.warrior(climbView.selected).cellCount} cells, ${esc(world.warrior(climbView.selected).name)} · ${climbView.selected === following ? 'following · <a data-unfollow="1">stop</a> · ' : `<a data-follow="${climbView.selected}">follow it</a> · `}<a data-copy="1">copy link</a> · <a data-unpick="1">let go</a></div>` : '',
    following !== null && following !== big?.id && following !== climbView?.selected ? `<div>following ${esc(world.warrior(following)?.name ?? '')} · <a data-unfollow="1">stop</a></div>` : '',
  ].join('');
  if (finderEl.innerHTML !== html) finderEl.innerHTML = html;
}

function followBiggest() {
  let big: { id: number; cells: number } | null = null;
  for (const w of world.living()) if (!big || w.cellCount > big.cells) big = { id: w.id, cells: w.cellCount };
  if (big && climbView) climbView.focus(big.id);
}

finderEl.onclick = (e) => {
  const a = (e.target as HTMLElement).closest('a');
  if (!a || !climbView) return;
  if (a.dataset.follow) climbView.focus(Number(a.dataset.follow));
  else if (a.dataset.unfollow) { climbView.follow = null; render(); }
  else if (a.dataset.unpick) { climbView.selected = null; render(); }
  else if (a.dataset.copy) void copyShare(a, 'copy link', 'copied!');
  else if (a.dataset.ever) {
    const m = bake!.marks.find((k) => k.t === Number(a.dataset.ever))!;
    void seek(m.t, () => climbView!.focus(m.biggest!.id));
  }
};
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.key === 'b' || e.key === 'B') followBiggest();
});

/** Every bake on the server (serve.py's /bakes.json), to hop between runs. */
interface BakeRow { path: string; name: string; t: number; alive: number; biggest: number; best: { t: number; cells: number }; state: string }
const bakesEl = $('bakes');
async function renderBakes() {
  let rows: BakeRow[];
  try { rows = await (await fetch('bakes.json', { cache: 'no-store' })).json(); } catch { return; } // (a plain server: no list)
  if (!Array.isArray(rows) || !rows.length) return;
  bakesEl.style.display = 'block';
  bakesEl.innerHTML = '<div class="stats" style="margin-bottom:2px">runs <span style="color:#6e7681">(tick · alive · biggest now · biggest ever)</span></div>' + rows.map((r) =>
    `<a class="${r.path === BAKE ? 'here' : ''}" href="?bake=${encodeURI(r.path)}" title="biggest ever at tick ${r.best.t}">` +
    `<span class="nm">${esc(r.name)}</span><span>${kfmt(r.t)}</span><span>${r.alive}</span><span>${r.biggest}</span>` +
    `<span class="big">${r.best.cells}</span><span class="${r.state === 'live' ? 'live' : ''}">${r.state === 'live' ? '● live' : r.state}</span></a>`).join('');
}
void renderBakes();
setInterval(renderBakes, 30000);

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
    warriors: world.allWarriors().map((w) => ({
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
  /** Climb: the camera (cell coords of the view's top-left, zoom) and who it follows. */
  get view() { return climbView ? { ...climbView.cam, follow: climbView.follow, selected: climbView.selected } : null; },
};
(window as unknown as { explorer: typeof explorer }).explorer = explorer;

fillPickers();
explorer.ready = loadEvolved().then(async () => {
  if (!(await loadBake())) return;
  fillPickers();
  newMatch();
  render();
  requestAnimationFrame(frame);
  // ?t=N (from a shared link): jump to tick N, paused there.
  // A bake opened without ?t starts at its latest checkpoint (the live end), not tick 0.
  const t = params.has('t') ? Number(params.get('t')) || 0 : bake ? bake.marks[bake.marks.length - 1].t : 0;
  // ?pick=<id>: open on that body, picked and followed (if it's alive at that tick).
  const pickBody = () => { const id = Number(params.get('pick')); if (params.has('pick') && climbView && world.warrior(id)?.alive) climbView.focus(id); };
  if (t) await seek(t, pickBody); else pickBody();
});

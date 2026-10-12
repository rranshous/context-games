// Potluck worker page: starts one worker thread per core (adjustable), shows what this
// device is doing and what the whole farm is doing.
const $ = (id) => document.getElementById(id);
const cores = navigator.hardwareConcurrency || 4;
const pageId = (localStorage.getItem('potluck-id') || Math.random().toString(36).slice(2, 8));
try { localStorage.setItem('potluck-id', pageId); } catch {}
const defaultName = (() => {
  const ua = navigator.userAgent;
  const os = /Windows/.test(ua) ? 'windows' : /Mac/.test(ua) ? 'mac' : /Android/.test(ua) ? 'android' : /Linux/.test(ua) ? 'linux' : 'device';
  return `${os}-${pageId}`;
})();
let name = localStorage.getItem('potluck-name') || defaultName;
let threads = [];
let session = ''; // new each time the threads are (re)started
// 0 threads = watching only (e.g. a dashboard on the machine that runs the work itself).
const saved = localStorage.getItem('potluck-threads');
let wanted = saved === null ? cores : Number(saved);
let paused = false;
let done = 0;

$('name').value = name;
$('name').onchange = () => { name = $('name').value || defaultName; try { localStorage.setItem('potluck-name', name); } catch {} restart(); };
$('cores').textContent = cores;
$('threads').max = cores;
$('threads').value = wanted;
const threadsLabel = () => { $('threadsOut').textContent = wanted === 0 ? '0 (watching only)' : wanted; };
threadsLabel();
$('threads').oninput = () => { wanted = Number($('threads').value); threadsLabel(); try { localStorage.setItem('potluck-threads', wanted); } catch {} restart(); };
$('pause').onclick = () => {
  paused = !paused;
  $('pause').textContent = paused ? 'Resume' : 'Pause';
  for (const t of threads) t.postMessage({ type: 'pause', paused });
  heartbeat(); render();
};

function log(text, cls = '') {
  const div = document.createElement('div');
  div.textContent = `${new Date().toLocaleTimeString()} ${text}`;
  div.className = cls;
  $('log').prepend(div);
  while ($('log').children.length > 50) $('log').lastChild.remove();
}

function restart() {
  for (const t of threads) t.terminate();
  threads = [];
  session = Math.random().toString(36).slice(2, 10);
  for (let i = 0; i < wanted; i++) {
    const t = new Worker('/worker.js', { type: 'module' });
    t.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'done') { done++; log(`thread ${i}: finished an item in ${dur(m.ms)}`, 'ok'); }
      if (m.type === 'canary') log(`thread ${i}: canary ${m.ok ? 'passed' : 'FAILED'} for ${m.task} (${Math.round(m.ms)} ms)${m.detail ? ` — ${m.detail}` : ''}`, m.ok ? 'ok' : 'bad');
      if (m.type === 'error') log(`thread ${i}: ${m.text}`, 'bad');
    };
    t.postMessage({ type: 'start', id: `${pageId}-${i}`, page: { name, cores, threads: wanted, page: pageId, session } });
    if (paused) t.postMessage({ type: 'pause', paused });
    threads.push(t);
  }
}

// ---------- the farm, as the server sees it ----------
// Items can run for an hour without a word from their thread (run() is synchronous), so
// the page polls the server for who's on what since when, and ticks the clocks itself.
let status = null, clockOffset = 0, reachable = true;

async function refresh() {
  try {
    const s = await (await fetch('/api/status')).json();
    clockOffset = (s.now ?? Date.now()) - Date.now();
    status = s; reachable = true;
  } catch { reachable = false; }
  render();
}

const serverNow = () => Date.now() + clockOffset;
const pad = (n) => String(n).padStart(2, '0');
/** A ticking clock: 4:07, 1:04:12. */
function clock(ms) {
  const t = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
/** A rough length: 42s, 4m 12s, 38m, 1h 04m. */
function dur(ms) {
  const t = Math.max(0, Math.round(ms / 1000));
  if (t < 60) return `${t}s`;
  if (t < 600) return `${Math.floor(t / 60)}m ${pad(t % 60)}s`;
  if (t < 3600) return `${Math.round(t / 60)}m`;
  return `${Math.floor(t / 3600)}h ${pad(Math.floor(t / 60) % 60)}m`;
}
const ago = (at) => { const ms = serverNow() - at; return ms < 5000 ? 'just now' : `${dur(ms)} ago`; };
const threadNo = (id) => id.split('-').pop();
const isLive = (w) => w.live ?? w.ago <= 10;

/** When a job's farm share is likely done: hand queued items to whichever thread frees up first. */
function jobEta(job, idleThreads, now) {
  const avg = job.durations?.avgMs;
  if (!avg) return null;
  const free = (job.leases ?? []).map((l) => Math.max(0, avg - (now - l.since)));
  for (let i = 0; i < idleThreads; i++) free.push(0);
  if (!free.length) return null;
  for (let q = 0; q < job.queued; q++) {
    let k = 0;
    for (let i = 1; i < free.length; i++) if (free[i] < free[k]) k = i;
    free[k] += avg;
  }
  return Math.max(...free);
}

function render() {
  const now = serverNow();
  // Freshly drawn stripes and dots pick up their animation where the old ones were.
  document.documentElement.style.setProperty('--phase', `${-(Date.now() % 1200) / 1000}s`);
  document.documentElement.style.setProperty('--pulse', `${-(Date.now() % 2000) / 1000}s`);
  const s = status;
  const live = s ? s.workers.filter(isLive) : [];
  const jobsById = new Map((s?.jobs ?? []).map((j) => [j.id, j]));

  // --- jobs ---
  const open = (s?.jobs ?? []).filter((j) => j.remaining > 0);
  $('jobs').innerHTML = open.map((j) => {
    const done = j.done ?? j.total - j.remaining, queued = j.queued ?? Math.max(0, j.remaining - j.leased);
    const pct = (n) => `${(100 * n / Math.max(1, j.total)).toFixed(2)}%`;
    const taskName = j.task;
    const idle = live.filter((w) => w.state === 'idle' && w.passed.includes(taskName)).length;
    const eta = jobEta({ ...j, queued }, idle, now);
    const d = j.durations;
    return `<div class="job">
      <div class="job-head"><span class="job-title">${esc(j.label || j.task || '?')}</span><span class="job-count"><b>${done}</b> / ${j.total} done</span></div>
      <div class="bar"><span class="done" style="width:${pct(done)}"></span><span class="run" style="width:${pct(j.leased)}"></span></div>
      <div class="job-meta">
        <span><i class="key" style="background:var(--work)"></i>${done} done</span>
        <span><i class="key" style="background:#6fbf7b;opacity:.7"></i><b>${j.leased}</b> running</span>
        <span><i class="key" style="background:var(--track);outline:1px solid var(--line)"></i>${queued} waiting</span>
        ${j.started ? `<span>started ${ago(j.started)}</span>` : ''}
        <span>${d ? `items take <b>~${dur(d.avgMs)}</b>${d.n > 1 ? ` (${dur(d.minMs)}–${dur(d.maxMs)})` : ''}` : 'no item finished yet, so no estimate'}</span>
        ${eta !== null ? `<span><b>~${dur(eta)}</b> to go</span>` : ''}
      </div></div>`;
  }).join('') || `<div class="empty">${!reachable ? 'server unreachable' : s?.queue ? `${s.queue} items waiting` : 'nothing queued: waiting for work'}</div>`;

  // --- threads, grouped by device ---
  const devices = new Map();
  for (const w of live) {
    const key = w.name || w.id;
    const dv = devices.get(key) ?? { name: key, threads: [], done: 0, failed: new Set() };
    dv.threads.push(w); dv.done += w.done;
    for (const f of w.failed) dv.failed.add(f);
    devices.set(key, dv);
  }
  const busy = (w) => w.state === 'working' || w.state === 'verifying';
  const all = [...devices.values()].sort((a, b) => (b.name === name) - (a.name === name) || b.threads.filter(busy).length - a.threads.filter(busy).length || a.name.localeCompare(b.name));
  const doneTotal = all.reduce((a, dv) => a + dv.done, 0);
  let nextFinish = null;
  $('devices').innerHTML = all.map((dv) => {
    const sorted = dv.threads.slice().sort((a, b) => threadNo(a.id) - threadNo(b.id));
    const working = sorted.filter(busy).sort((a, b) => (a.current?.since ?? 0) - (b.current?.since ?? 0));
    const resting = sorted.filter((w) => !busy(w));
    const tiles = working.map((w) => {
      const c = w.current ?? { label: w.working, since: null };
      const elapsed = c.since ? now - c.since : null;
      if (w.state === 'verifying') {
        return `<div class="tile verifying"><div class="tile-top"><span class="state"><i class="dot"></i>verifying</span><span class="thread-no">thread ${threadNo(w.id)}</span></div>
          <div class="what">canary for ${esc(c.label || '?')}</div>
          <div class="clock">${elapsed !== null ? clock(elapsed) : '…'}</div>
          <div class="bar verify"><span class="fill" style="width:100%"></span></div>
          <div class="eta">proving this device computes identical results</div></div>`;
      }
      const job = jobsById.get(c.job);
      const avg = job?.durations?.avgMs;
      let cls = 'unknown', width = 100, eta = 'first of this job: no estimate yet';
      if (c.stale) { cls = 'stale'; eta = 'already done elsewhere; result will be dropped'; }
      else if (avg && elapsed !== null) {
        if (elapsed <= avg) {
          cls = ''; width = 100 * elapsed / avg; eta = `~${dur(avg - elapsed)} left · typical ${dur(avg)}`;
          if (nextFinish === null || avg - elapsed < nextFinish) nextFinish = avg - elapsed;
        } else { cls = 'over'; eta = `longer than typical (${dur(avg)}), still going`; }
      }
      const item = c.index !== undefined && c.index !== null ? `item ${c.index + 1}${job ? ` of ${job.total}` : ''} · ` : '';
      return `<div class="tile${c.stale ? ' stale' : ''}"><div class="tile-top"><span class="state"><i class="dot"></i>${c.stale ? 'finishing' : 'working'}</span><span class="thread-no">${item}thread ${threadNo(w.id)}</span></div>
        <div class="what" title="${esc(c.label || '')}">${esc(c.label || '?')}</div>
        <div class="clock">${elapsed !== null ? clock(elapsed) : '…'}</div>
        <div class="bar ${cls}"><span class="fill" style="width:${width.toFixed(2)}%"></span></div>
        <div class="eta">${eta}</div></div>`;
    }).join('');
    const paused = resting.filter((w) => w.state === 'paused');
    const idlers = resting.length ? `<div class="idlers">${resting.length - paused.length ? `idle:` : ''} ${resting.filter((w) => w.state !== 'paused').map((w) => `<span class="chip" title="${esc(w.last ? `last: ${w.last.label} #${w.last.index + 1}, ${dur(w.last.ms)}` : 'nothing yet')}">${threadNo(w.id)}</span>`).join('')}
      ${paused.length ? ` paused: ${paused.map((w) => `<span class="chip">${threadNo(w.id)}</span>`).join('')}` : ''}</div>` : '';
    return `<div class="device"><div class="device-head">
        <span class="device-name">${esc(dv.name)}</span>${dv.name === name ? '<span class="tag">this device</span>' : ''}
        <span class="muted"><b class="${working.length ? 'ok' : ''}">${working.length}</b> of ${dv.threads.length} threads busy</span>
        <span class="muted">${dv.done} items done${doneTotal && all.length > 1 ? ` (${Math.round(100 * dv.done / doneTotal)}% of farm)` : ''}</span>
        ${dv.failed.size ? `<span class="bad">canary failed: ${[...dv.failed].map(esc).join(', ')}</span>` : ''}
      </div>${tiles ? `<div class="tiles">${tiles}</div>` : ''}${idlers}</div>`;
  }).join('') || `<div class="empty">${reachable ? 'no devices connected' : 'server unreachable'}</div>`;

  // --- recently finished ---
  const fin = (s?.finished ?? []).slice(-12).reverse();
  $('recent').innerHTML = fin.length ? `<table><thead><tr><th>item</th><th>took</th><th class="hide-narrow">by</th><th>when</th></tr></thead><tbody>${fin.map((f) =>
    `<tr><td>${esc(f.label)} <span class="muted">#${f.index + 1}</span></td><td class="num"><b>${dur(f.ms)}</b></td><td class="hide-narrow muted">${esc(f.name || f.worker)}</td><td class="num muted">${ago(f.at)}</td></tr>`).join('')}</tbody></table>`
    : '<div class="empty">nothing finished yet</div>';

  // --- headline ---
  const workingN = live.filter((w) => w.state === 'working' && !w.current?.stale).length;
  const verifyingN = live.filter((w) => w.state === 'verifying').length;
  const doneN = open.reduce((a, j) => a + (j.done ?? j.total - j.remaining), 0), totalN = open.reduce((a, j) => a + j.total, 0);
  $('summary').innerHTML = !reachable ? '<span class="bad">server unreachable</span>'
    : !s ? 'connecting…'
    : workingN || verifyingN || open.length
      ? [`<b>${workingN}</b> of ${live.length} threads working`, verifyingN ? `<b>${verifyingN}</b> verifying` : '',
        open.length ? `<b>${doneN}</b> / ${totalN} items done` : '', nextFinish !== null ? `next finish in <b>~${dur(nextFinish)}</b>` : ''].filter(Boolean).join(' · ')
      : `${live.length} threads ready · waiting for work`;

  const mineLive = live.filter((w) => w.name === name);
  $('mine').innerHTML = wanted === 0 ? 'watching only: this device does no work'
    : `${paused ? '<b class="bad">paused</b> · ' : ''}<b>${mineLive.filter(busy).length}</b> of ${wanted} threads busy · <b>${done}</b> items finished here since this page opened`;
}
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

// The worker threads can't speak while running a long item, so this (main) thread vouches for them.
function heartbeat() {
  if (!threads.length) return;
  fetch('/api/heartbeat', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ workers: threads.map((_, i) => `${pageId}-${i}`), session, name, cores, threads: wanted, paused }) }).catch(() => {});
}

// ---------- staying awake ----------
// Browsers freeze background tabs to save power (Edge "sleeping tabs", Chrome Energy/Memory
// Saver), which stops the worker threads until someone looks at the tab again. Chrome
// doesn't freeze tabs holding an IndexedDB connection or a Web Lock, so hold both. (Web
// Locks and the screen wake lock need HTTPS or localhost; IndexedDB works over plain http.)
// The dependable fix is the browser's own never-sleep list; see the tip on the page.
try { const req = indexedDB.open('potluck-keepalive'); req.onsuccess = () => { window.potluckDb = req.result; }; } catch {}
if (navigator.locks) navigator.locks.request('potluck-keepalive', () => new Promise(() => {})).catch(() => {});

// Keep the screen on (phones, wall displays): only while this page is visible.
let wakeLock = null;
const wantWake = () => localStorage.getItem('potluck-wake') === '1';
async function applyWake() {
  try {
    if (wantWake() && document.visibilityState === 'visible' && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!wantWake() && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { /* not allowed here (needs https or localhost) */ }
}
if ('wakeLock' in navigator) {
  $('wakeRow').hidden = false;
  $('wake').checked = wantWake();
  $('wake').onchange = () => { try { localStorage.setItem('potluck-wake', $('wake').checked ? '1' : '0'); } catch {} applyWake(); };
  document.addEventListener('visibilitychange', applyWake);
  applyWake();
}

// Notice when this tab was asleep: the heartbeat stalls while it's frozen.
let lastBeat = Date.now();
setInterval(() => {
  const gap = Date.now() - lastBeat;
  if (gap > 30000) log(`this tab was asleep for ${Math.round(gap / 1000)} s; see "keeping this page awake" below`, 'bad');
  lastBeat = Date.now();
}, 5000);

const ua = navigator.userAgent;
$('tip').innerHTML = /Edg\//.test(ua)
  ? `Edge puts background tabs to sleep. Settings → System and performance → <b>Never put these sites to sleep</b> → add <code>${location.host}</code>.`
  : /Chrome\//.test(ua)
    ? `Chrome may freeze background tabs. Settings → Performance → <b>Always keep these sites active</b> → add <code>${location.host}</code>.`
    : `Browsers may pause background tabs. If this device stops showing up on the farm, keep this page in its own window or add <code>${location.host}</code> to the browser's never-sleep list.`;

restart();
refresh();
setInterval(refresh, 2000);
setInterval(render, 1000);
heartbeat();
setInterval(heartbeat, 4000);

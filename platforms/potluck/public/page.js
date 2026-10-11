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
// 0 threads = watching only (e.g. a dashboard on the machine that runs the work itself).
const saved = localStorage.getItem('potluck-threads');
let wanted = saved === null ? cores : Number(saved);
let paused = false;
let done = 0;
const recent = [];

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
  for (let i = 0; i < wanted; i++) {
    const t = new Worker('/worker.js', { type: 'module' });
    t.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'done') { done++; recent.push(Date.now()); }
      if (m.type === 'canary') log(`thread ${i}: canary ${m.ok ? 'passed' : 'FAILED'} for ${m.task} (${Math.round(m.ms)} ms)${m.detail ? ` — ${m.detail}` : ''}`, m.ok ? 'ok' : 'bad');
      if (m.type === 'error') log(`thread ${i}: ${m.text}`, 'bad');
    };
    t.postMessage({ type: 'start', id: `${pageId}-${i}`, page: { name, cores, threads: wanted, page: pageId } });
    if (paused) t.postMessage({ type: 'pause', paused });
    threads.push(t);
  }
}

async function refresh() {
  const now = Date.now();
  while (recent.length && now - recent[0] > 30000) recent.shift();
  $('mine').textContent = wanted === 0 ? 'watching only: this device does no work' : `${done} batches done here · ${recent.length * 2}/min`;
  try {
    const s = await (await fetch('/api/status')).json();
    // Group threads into devices.
    const devices = new Map();
    for (const w of s.workers) {
      // Only threads seen recently (the server remembers stopped ones for a while; this is
      // the same 10 s rule its capacity check uses).
      if (w.ago > 10) continue;
      const key = w.name || w.id;
      const d = devices.get(key) ?? { name: key, threads: 0, done: 0, perMin: 0, failed: new Set(), working: new Map() };
      d.threads++; d.done += w.done; d.perMin += w.perMin;
      if (w.working && w.perMin) d.working.set(w.working, (d.working.get(w.working) ?? 0) + 1);
      for (const f of w.failed) d.failed.add(f);
      devices.set(key, d);
    }
    // Each device's share of what the farm is doing right now (by rate) and of everything
    // it has done since the server started.
    const all = [...devices.values()];
    const rateTotal = all.reduce((a, d) => a + d.perMin, 0) || 1;
    const doneTotal = all.reduce((a, d) => a + d.done, 0) || 1;
    $('farm').innerHTML = all.map((d) =>
      `<tr><td>${esc(d.name)}${d.name === name ? ' (this)' : ''}</td><td>${d.threads}</td><td>${d.done}</td><td>${d.perMin}/min</td><td>${d.threads ? Math.round(d.perMin / d.threads) : 0}/min</td><td>${Math.round(100 * d.perMin / rateTotal)}% now · ${Math.round(100 * d.done / doneTotal)}% total</td><td>${[...d.working].map(([l, n]) => `${esc(l)}${n > 1 ? ` ×${n}` : ''}`).join('<br>') || '<span class="idle">idle</span>'}</td><td class="bad">${[...d.failed].map(esc).join(', ')}</td></tr>`).join('');
    // The whole farm: every device added up.
    const threads = all.reduce((a, d) => a + d.threads, 0), rate = all.reduce((a, d) => a + d.perMin, 0);
    $('farmTotal').innerHTML = all.length > 1
      ? `<tr class="total"><td>whole farm (${all.length} devices)</td><td>${threads}</td><td>${all.reduce((a, d) => a + d.done, 0)}</td><td>${rate}/min</td><td>${threads ? Math.round(rate / threads) : 0}/min</td><td></td><td></td><td></td></tr>` : '';
    $('queue').textContent = `${s.queue} waiting · ${s.jobs.filter((j) => j.remaining > 0).map((j) => `${esc(j.label || j.task || '?')}: ${j.total - j.remaining}/${j.total}`).join(' · ') || 'no work queued'}`;
  } catch { $('queue').textContent = 'server unreachable'; }
}
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

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

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
      const d = devices.get(key) ?? { name: key, threads: 0, done: 0, perMin: 0, failed: new Set() };
      d.threads++; d.done += w.done; d.perMin += w.perMin;
      for (const f of w.failed) d.failed.add(f);
      devices.set(key, d);
    }
    $('farm').innerHTML = [...devices.values()].map((d) =>
      `<tr><td>${esc(d.name)}${d.name === name ? ' (this)' : ''}</td><td>${d.threads}</td><td>${d.done}</td><td>${d.perMin}/min</td><td class="bad">${[...d.failed].map(esc).join(', ')}</td></tr>`).join('');
    $('queue').textContent = `${s.queue} waiting · ${s.jobs.map((j) => `${esc(j.task ?? '?')}: ${j.total - j.remaining}/${j.total}`).join(' · ') || 'no jobs'}`;
  } catch { $('queue').textContent = 'server unreachable'; }
}
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

restart();
refresh();
setInterval(refresh, 2000);

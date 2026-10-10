// One Potluck worker thread: lease an input, run it with the task's module, post the
// output, repeat. Before working on a task it hasn't seen, it runs the task's canary
// (if any); a failed canary means this thread never takes that task.
let id = '', page = {}, paused = false, idle = 0;
const modules = new Map(); // task id -> module
const verified = new Set();

const post = async (path, body) => {
  const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
};
const load = async (task) => {
  if (!modules.has(task)) modules.set(task, await import(`/tasks/${task}.mjs`));
  return modules.get(task);
};

async function loop() {
  while (true) {
    if (paused) { await new Promise((r) => setTimeout(r, 500)); continue; }
    try {
      const work = await post('/api/lease', { worker: id, verified: [...verified], ...page });
      if (work.none) {
        // Nothing to do: back off (up to ~1 s) so idle pages stay quiet.
        idle = Math.min(idle + 1, 10);
        await new Promise((r) => setTimeout(r, 100 * idle + Math.random() * 100));
        continue;
      }
      idle = 0;
      if (work.verify) {
        self.postMessage({ type: 'status', text: `checking ${work.verify}` });
        const mod = await load(work.verify);
        const t0 = performance.now();
        const res = mod.canary ? await mod.canary() : { ok: true, detail: 'no canary' };
        await post('/api/canary', { worker: id, task: work.verify, ok: res.ok, detail: res.detail });
        if (res.ok) verified.add(work.verify);
        self.postMessage({ type: 'canary', task: work.verify, ok: res.ok, detail: res.detail, ms: performance.now() - t0 });
      } else if (work.item) {
        const { job, index, task, input } = work.item;
        const mod = await load(task);
        const t0 = performance.now();
        const output = await mod.run(input);
        await post('/api/result', { worker: id, job, index, output });
        self.postMessage({ type: 'done', ms: performance.now() - t0 });
      }
    } catch (e) {
      self.postMessage({ type: 'error', text: String(e.message ?? e) });
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'start') { id = m.id; page = m.page; loop(); }
  if (m.type === 'pause') paused = m.paused;
};

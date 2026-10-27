// Run trials: one ludant, one request, one view of its soma, one model. Each trial is a
// fresh body (see body.js) that hears the request in its chat and works until it's idle;
// then a fresh build of what it became is played a little and looked at, and a judge reads
// the request, what changed and the pictures.
//
//   node run.mjs --games evevina-f08ff7 --tasks tweak,feature --approaches full,outline,skeleton \
//                --models sonnet,haiku --reps 1 --out runs/r1 [--parallel 2] [--floor 4]
//
// It stops starting trials once the key has less than --floor dollars left.
// Results: <out>/<trial>.json, pictures beside them, and <out>/summary.tsv.

import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { APPROACHES, navTools, renderSections, runNav } from './views.mjs';
import { GAMES, PLAY, playFor } from './tasks.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const GACTANT = join(ROOT, 'platforms/gactant');
const MODELS = { sonnet: 'anthropic/claude-sonnet-5.5', haiku: 'anthropic/claude-haiku-5.5' };
const JUDGES = { ...MODELS, opus: 'anthropic/claude-opus-5.5' };
const PERSON = 'Robby';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1]]] : a), []));
const list = (k, d) => (args[k] ?? d).split(',').filter(Boolean);
const games = list('games', Object.keys(GAMES).join(','));
const tasks = list('tasks', 'tweak,feature,across');
const approaches = list('approaches', APPROACHES.join(','));   // a view, and +split for a cache mark between the soma and the frame
const models = list('models', 'sonnet,haiku');
const JUDGE = JUDGES[args.judge ?? 'sonnet'];
const reps = Number(args.reps ?? 1), parallel = Number(args.parallel ?? 2), floor = Number(args.floor ?? 4);
const out = resolve(args.out ?? `runs/${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`);
mkdirSync(out, { recursive: true });

const KEY = readFileSync(join(GACTANT, '.env'), 'utf8').match(/^OPENROUTER_API_KEY=(.*)$/m)[1].trim();
const CONTEXT = readFileSync(join(GACTANT, 'public/js/frame.js'), 'utf8').match(/const CONTEXT = `([\s\S]*?)`;\n/)[1];

// ---------- OpenRouter ----------

async function openrouter(body) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ max_tokens: 32000, usage: { include: true }, provider: { order: ['anthropic'], allow_fallbacks: true }, ...body }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && !json.error && json.choices?.length) return json;
    // An answer with no choices (it happens: no tokens, no error) is tried again too.
    if (attempt < 3 && (res.status === 429 || res.status >= 500 || json.error?.code >= 500 || (res.ok && !json.error))) { await new Promise((r) => setTimeout(r, 4000 * (attempt + 1))); continue; }
    throw new Error(`openrouter ${res.status}: ${JSON.stringify(json.error ?? json).slice(0, 300)}`);
  }
}

async function remaining() {
  const j = await (await fetch('https://openrouter.ai/api/v1/key', { headers: { Authorization: `Bearer ${KEY}` } })).json();
  return j.data?.limit_remaining ?? Infinity;
}

// ---------- serving the repo to the bench page ----------

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
const server = createServer((req, res) => {
  const p = join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT) || !existsSync(p)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(p)] ?? 'application/octet-stream' }).end(readFileSync(p));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function benchPage(onInfer, onCompany = () => '') {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  page.on('pageerror', (e) => console.warn('  page error:', e.message.slice(0, 200)));
  await page.exposeFunction('benchInfer', onInfer);
  await page.exposeFunction('benchView', (approach, sections) => renderSections(approach, sections));
  await page.exposeFunction('benchNav', (approach, tool, input, sections) => runNav(approach, tool, input, sections));
  await page.exposeFunction('benchNavSchemas', (approach) => navTools(approach));
  await page.exposeFunction('benchCompany', onCompany);
  await page.goto(`${BASE}/experiments/soma-views/body.html`);
  await page.waitForFunction(() => window.benchReady, null, { timeout: 30000 });
  return page;
}

function company(ludant, spent = 0, live = false) {
  const l = ludant.lineage ?? {}, s = ludant.soma;
  const name = `${s.given}${s.sections.title ? `-${s.sections.title.trim().split(/\s+/).map((w) => w[0].toUpperCase() + w.slice(1)).join('-')}` : ''}`;
  const lineage = l.from ? `You are a copy of ${l.from.name}, published by ${l.from.by ?? 'someone'}.` : `You were seeded here${l.seededBy ? ` by ${l.seededBy}` : ''}.`;
  return `Your name is ${name}: your given name ${s.given}, and your title section.\nHere with you now: ${PERSON}. ${live ? 'Your thinking in this sitting has a cost, shown in the note at the end of the conversation' : `Your thinking in this sitting has cost $${spent.toFixed(2)} so far`}, and ${PERSON} pays for it, through their own OpenRouter account. The people here can see that meter. ${lineage} People who have sat with you: ${PERSON}.
Anyone sitting with you can play you, ask you to change, take checkpoints, put you back to one, and publish you so others can take copies. A checkpoint is taken whenever someone sits down.`;
}

// ---------- one trial ----------

const CODE = ['game', 'tools', 'hooks'];

/** A line diff of two texts (longest common subsequence), as unified-ish hunks. */
function diff(a, b) {
  const x = a.split('\n'), y = b.split('\n'), n = x.length, m = y.length;
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const ops = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && x[i] === y[j]) { ops.push([' ', x[i], i + 1]); i++; j++; }
    else if (j < m && (i === n || L[i][j + 1] >= L[i + 1][j])) { ops.push(['+', y[j], i + 1]); j++; }
    else { ops.push(['-', x[i], i + 1]); i++; }
  }
  const keep = new Set();
  ops.forEach((o, k) => { if (o[0] !== ' ') for (let d = -2; d <= 2; d++) keep.add(k + d); });
  let text = '', last = -2, added = 0, removed = 0;
  ops.forEach((o, k) => {
    if (o[0] === '+') added++; if (o[0] === '-') removed++;
    if (!keep.has(k)) return;
    if (k !== last + 1) text += `@@ near line ${o[2]}\n`;
    text += `${o[0]}${o[1]}\n`;
    last = k;
  });
  return { text, added, removed };
}

async function judge(trial, before, after, changes, chat) {
  const asked = trial.requests.length === 1 ? `The player asked: "${trial.requests[0]}"`
    : `Over one sitting the player said these, in order (the AI woke for each, remembering only what it wrote into itself):\n${trial.requests.map((r, i) => `${i + 1}. "${r}"`).join('\n')}\nJudge "done" over everything that asked for a change (a question only needed a true answer in the chat), and give each line its own score in "each".`;
  const pic = (url) => ({ type: 'image_url', image_url: { url } });
  const changed = changes.map((c) => `### section ${c.section} (+${c.added} −${c.removed} lines)\n${c.text.slice(0, 14000)}`).join('\n\n') || '(no code section changed)';
  const said = chat.filter((m) => m.who !== PERSON).map((m) => `- ${m.text}`).join('\n') || '(it said nothing in the chat)';
  const body = {
    model: JUDGE, max_tokens: 1500,
    response_format: { type: 'json_schema', json_schema: { name: 'verdict', strict: true, schema: VERDICT } },
    messages: [{ role: 'user', content: [
      { type: 'text', text: `You are grading an AI that changed its own browser game's code because a player asked.\n\nThe game: ${GAMES[trial.game].about}\n${asked}\n\nWhat the AI said to the player in the chat:\n${said}\n\nWhat changed in the code:\n${changed}\n\nBelow: a picture of the game before the change, then after it, both taken after the same scripted few seconds of play (waiting, a press of space, arrows, a click). The game was rebuilt from scratch for each. ${after.faults && Object.keys(after.faults).length ? `After the change, building the code reported faults: ${JSON.stringify(after.faults)}.` : 'After the change, the code built without faults.'} ${after.halted ? `The game halted while playing: ${after.halted}.` : ''} ${after.errors?.length ? `Errors while playing: ${JSON.stringify(after.errors).slice(0, 800)}.` : 'No errors while playing.'}\n\nJudge from the code mostly; the pictures only show the game still works and how it looks. Answer with only a JSON object: {"each": [one 0/1/2 per line the player said], "done": 2 if the request is fully and sensibly done, 1 if partly or with a real flaw, 0 if not done, "broke": true if the change broke something that worked before (the game no longer runs, or a feature it had is gone), "notes": "one or two sentences"}` },
      { type: 'text', text: 'Before:' }, pic(before.pics.at(-1)), { type: 'text', text: 'After:' }, pic(after.pics.at(-1)),
    ] }],
  };
  let cost = 0, text = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await openrouter(body);
    cost += res.usage?.cost ?? 0;
    text = res.choices?.[0]?.message?.content ?? '';
    try {
      const v = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
      if (Array.isArray(v.each) && v.each.length === trial.requests.length) return { ...v, cost, judge: JUDGE };
    } catch {}
  }
  return { done: null, broke: null, notes: `judge said: ${text.slice(0, 300)}`, cost, judge: JUDGE };
}

const VERDICT = { type: 'object', additionalProperties: false, required: ['each', 'done', 'broke', 'notes'], properties: {
  each: { type: 'array', items: { type: 'integer', enum: [0, 1, 2] } }, done: { type: 'integer', enum: [0, 1, 2] }, broke: { type: 'boolean' }, notes: { type: 'string' },
} };

/** A wake's conversation, shortened: what woke it, what it thought and called, what came back. */
const clip = (x, n) => { const s = typeof x === 'string' ? x : Array.isArray(x) ? x.map((c) => c.text ?? `[${c.type}]`).join(' ') : JSON.stringify(x ?? ''); return s.length > n ? `${s.slice(0, n)}…` : s; };
const trace = (msgs) => msgs.map((x) => ({ role: x.role, text: clip(x.content, 600), calls: x.tool_calls?.map((c) => `${c.function.name}(${clip(c.function.arguments, 400)})`) }));

async function trial(t) {
  const file = join(out, `${t.id}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));   // done already: a rerun picks up where it stopped
  const ludant = JSON.parse(readFileSync(join(import.meta.dirname, 'data', `${t.game}.json`), 'utf8'));
  const art = ludant.art.map(({ name, w, h, prompt, image }) => ({ name, w, h, prompt, image }));
  const m = { calls: 0, prompt: 0, cached: 0, written: 0, completion: 0, cost: 0, tools: {}, started: Date.now(), log: [], wakes: [] };
  const [view, split] = [t.approach.split('+')[0], t.approach.includes('+split')];
  const onInfer = async ({ messages, tools, name, sections, faults }) => {
    // live: the soma as it is right now, and the meter, after everything else, so the
    // cached prefix (the system text and the conversation) never changes for it.
    // delta: only the sections changed since the sitting began (the system text has the rest).
    if (view === 'live' || view === 'delta') {
      const f = Object.entries(faults ?? {}).map(([k, v]) => `- ${k}: ${v}`).join('\n');
      m.base ??= { ...sections };
      const changed = Object.fromEntries(Object.entries(sections).filter(([k, v]) => m.base[k] !== v));
      const gone = Object.keys(m.base).filter((k) => !(k in sections));
      const soma = view === 'live' ? `<soma name="${name}" as-of="now">\n${renderSections('outline', sections)}\n</soma>`
        : Object.keys(changed).length || gone.length
          ? `Sections changed since this sitting began, as they are now:\n<soma name="${name}" as-of="now">\n${renderSections('outline', changed)}${gone.length ? `\n(removed: ${gone.join(', ')})` : ''}\n</soma>`
          : 'No section of your soma has changed since this sitting began.';
      messages = [...messages, { role: 'system', content: `${soma}\nYour thinking in this sitting has cost $${m.cost.toFixed(2)} so far.${f ? `\nFaults in your code sections right now:\n${f}` : ''}` }];
    }
    if (m.calls >= 40 * t.requests.length) throw new Error('the bench stops a trial after 40 calls a wake');
    // +split: what the site would do with a second cache mark, after the soma and before the
    // frame (whose cost meter changes every wake), so an unchanged soma is read from cache.
    if (split) {
      const sys = messages[0].content[0], at = sys.text.indexOf('\n\n<frame>\n');
      messages = [{ role: 'system', content: [{ type: 'text', text: sys.text.slice(0, at), cache_control: { type: 'ephemeral' } }, { type: 'text', text: sys.text.slice(at), cache_control: { type: 'ephemeral' } }] }, ...messages.slice(1)];
    }
    const res = await openrouter({ model: MODELS[t.model], messages, tools });
    m.last = [...messages.slice(1), res.choices?.[0]?.message ?? {}];
    const u = res.usage ?? {};
    m.calls++; m.prompt += u.prompt_tokens ?? 0; m.completion += u.completion_tokens ?? 0; m.cost += u.cost ?? 0;
    m.cached += u.prompt_tokens_details?.cached_tokens ?? 0; m.written += u.prompt_tokens_details?.cache_write_tokens ?? 0;
    m.firstPrompt ??= u.prompt_tokens;
    m.log.push({ wake: m.wakes.length, at: Math.round((Date.now() - m.started) / 1000), prompt: u.prompt_tokens, cached: u.prompt_tokens_details?.cached_tokens ?? 0, written: u.prompt_tokens_details?.cache_write_tokens ?? 0, completion: u.completion_tokens, cost: u.cost ?? 0 });
    for (const c of res.choices?.[0]?.message?.tool_calls ?? []) m.tools[c.function.name] = (m.tools[c.function.name] ?? 0) + 1;
    return res;
  };
  const page = await benchPage(onInfer, () => company(ludant, m.cost, view === 'live' || view === 'delta'));
  try {
    await page.evaluate((cfg) => window.bench.start(cfg), { soma: ludant.soma, art, approach: view, context: CONTEXT, person: PERSON });
    for (const text of t.requests) {
      const at = { calls: m.calls, cost: m.cost };
      await page.evaluate((x) => window.bench.say(x), text);
      m.wakes.push({ calls: m.calls - at.calls, cost: m.cost - at.cost, trace: trace(m.last ?? []) });
    }
    const r = await page.evaluate(() => window.bench.result());
    m.seconds = Math.round((Date.now() - m.started) / 1000);
    const before = await page.evaluate(([soma, steps]) => window.bench.play(soma, steps), [ludant.soma, playFor(t.game, t.task)]);
    const after = await page.evaluate(([soma, steps]) => window.bench.play(soma, steps), [r.soma, playFor(t.game, t.task)]);
    const changes = CODE.filter((s) => (ludant.soma.sections[s] ?? '') !== (r.soma.sections[s] ?? '')).map((s) => ({ section: s, ...diff(ludant.soma.sections[s] ?? '', r.soma.sections[s] ?? '') }));
    const failedEdits = r.notes.filter((n) => n.kind === 'fault' && /^edit_section/.test(n.text)).map((n) => n.text.split('→ ').pop());
    const verdict = await judge(t, before, after, changes, r.chat);
    after.pics.forEach((p, i) => writeFileSync(join(out, `${t.id}-after-${i}.png`), Buffer.from(p.split(',')[1], 'base64')));
    const record = {
      ...t, ...m, verdict,
      changed: changes.map(({ section, added, removed }) => ({ section, added, removed })),
      failedEdits, faults: after.faults, halted: after.halted, errors: after.errors,
      said: r.chat.filter((x) => x.who !== PERSON).map((x) => x.text),
      diff: changes.map((c) => `### ${c.section}\n${c.text}`).join('\n'),
      soma: r.soma,
    };
    writeFileSync(file, JSON.stringify(record, null, 1));
    return record;
  } finally { await page.close(); }
}

// ---------- a dry run: build and play each game as it is, no thinking ----------

if (args.dry) {
  for (const game of games) {
    const ludant = JSON.parse(readFileSync(join(import.meta.dirname, 'data', `${game}.json`), 'utf8'));
    const page = await benchPage(async () => { throw new Error('no thinking in a dry run'); }, () => company(ludant));
    const started = await page.evaluate((cfg) => window.bench.start(cfg), { soma: ludant.soma, art: ludant.art, approach: 'full', context: CONTEXT, person: PERSON });
    const played = await page.evaluate(([soma, steps]) => window.bench.play(soma, steps), [ludant.soma, playFor(game, args.task)]);
    played.pics.forEach((p, i) => writeFileSync(join(out, `${game}-dry-${i}.png`), Buffer.from(p.split(',')[1], 'base64')));
    console.log(game, started.name, 'faults', JSON.stringify(played.faults), 'halted', played.halted, 'errors', JSON.stringify(played.errors).slice(0, 300));
    await page.close();
  }
  await browser.close(); server.close(); process.exit(0);
}

// ---------- judging again: the same evidence, judged again (by the same judge, or another) ----------
//   node run.mjs --rejudge runs/r2-convo,runs/r2-arcade --judge opus --out runs/judge-opus

if (args.rejudge) {
  const befores = {};
  const rows = list('rejudge').flatMap((d) => readdirSync(d).filter((f) => f.endsWith('.json')).map((f) => join(d, f)));
  for (const path of rows) {
    const r = JSON.parse(readFileSync(path, 'utf8'));
    const file = join(out, `${r.id}.json`);
    if (existsSync(file)) continue;
    const key = `${r.game}/${r.task}`;
    if (!befores[key]) {
      const ludant = JSON.parse(readFileSync(join(import.meta.dirname, 'data', `${r.game}.json`), 'utf8'));
      const page = await benchPage(async () => { throw new Error('no thinking when judging again'); }, () => company(ludant));
      await page.evaluate((cfg) => window.bench.start(cfg), { soma: ludant.soma, art: ludant.art, approach: 'full', context: CONTEXT, person: PERSON });
      befores[key] = await page.evaluate(([soma, steps]) => window.bench.play(soma, steps), [ludant.soma, playFor(r.game, r.task)]);
      await page.close();
    }
    const dir = path.slice(0, path.lastIndexOf('/'));
    const pics = readdirSync(dir).filter((f) => f.startsWith(`${r.id}-after-`)).sort().map((f) => `data:image/png;base64,${readFileSync(join(dir, f)).toString('base64')}`);
    const texts = Object.fromEntries((r.diff ?? '').split(/^### /m).filter(Boolean).map((p) => [p.slice(0, p.indexOf('\n')), p.slice(p.indexOf('\n') + 1)]));
    const changes = r.changed.map((c) => ({ ...c, text: texts[c.section] ?? '' }));
    const verdict = await judge(r, befores[key], { pics, faults: r.faults, halted: r.halted, errors: r.errors }, changes, r.said.map((text) => ({ who: 'ludant', text })));
    writeFileSync(file, JSON.stringify({ id: r.id, from: path, model: r.model, approach: r.approach, before: r.verdict, verdict }, null, 1));
    console.log(`${r.id}: was ${JSON.stringify(r.verdict.each)} now ${JSON.stringify(verdict.each)}`);
  }
  await browser.close(); server.close(); process.exit(0);
}

// ---------- the plan ----------

const plan = [];
for (let rep = 1; rep <= reps; rep++) for (const game of games) for (const task of tasks) for (const model of models) for (const approach of approaches) {
  const requests = task.startsWith('convo') ? GAMES[game][task] : [GAMES[game].tasks[task]];
  if (!requests?.[0]) continue;
  plan.push({ id: `${game.split('-')[0]}-${task}-${model}-${approach}-${rep}`, game, task, model, approach, rep, requests });
}
console.log(`${plan.length} trials into ${out}`);

const done = [];
let next = 0, stopped = false;
if (args.shuffle) plan.sort(() => Math.random() - 0.5);
async function worker() {
  while (next < plan.length && !stopped) {
    const t = plan[next++];
    const left = await remaining();
    if (left < floor) { stopped = true; console.log(`stopping: $${left.toFixed(2)} left on the key`); break; }
    try {
      const r = await trial(t);
      done.push(r);
      console.log(`${t.id}: done=${r.verdict?.done} broke=${r.verdict?.broke} $${r.cost.toFixed(3)} ${r.calls} calls ${r.seconds}s  edits failed ${r.failedEdits.length}  | ${String(r.verdict?.notes ?? '').slice(0, 120)}`);
    } catch (err) { console.log(`${t.id}: FAILED ${err.message.slice(0, 300)}`); }
  }
}
await Promise.all(Array.from({ length: parallel }, worker));

// A summary of everything in the folder, this run and any before it.
const rows = readdirSync(out).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(out, f), 'utf8')));
const tsv = ['id\tgame\ttask\tmodel\tapproach\tdone\tbroke\tcost\tcalls\tfirst_prompt\tprompt\tcached\tcompletion\tseconds\tfailed_edits\tfaults\ttools',
  ...rows.map((r) => [r.id, r.game, r.task, r.model, r.approach, r.verdict?.done, r.verdict?.broke, r.cost.toFixed(4), r.calls, r.firstPrompt, r.prompt, r.cached, r.completion, r.seconds, r.failedEdits.length, Object.keys(r.faults ?? {}).join('/'), JSON.stringify(r.tools)].join('\t'))];
writeFileSync(join(out, 'summary.tsv'), tsv.join('\n') + '\n');
console.log(`summary: ${join(out, 'summary.tsv')}  (key has $${(await remaining()).toFixed(2)} left)`);
await browser.close();
server.close();

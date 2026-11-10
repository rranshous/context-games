// Screenshots of gactant's pages, as a person would see them, through the machine's
// headless Google Chrome: for reviewing how the site looks and reads, on a phone or a
// desktop, as someone new or someone back. Zero dependencies (the DevTools protocol, as in
// chrome-fetch.mjs). Several can run at once: each has its own Chrome.
//
//   node tools/page-shots.mjs --out <dir> [--size 390x844] [--mobile] [--profile <dir>] <steps>
//
// --minutes N allows a longer run (default 3). --profile keeps the browser's storage between runs (someone coming back); without it,
// every run is a stranger. Steps run in order, each one an argument:
//   goto:<url>          open a page (and wait for it to settle)
//   shot:<name>         save <out>/<name>.png (the viewport) and print the page's visible text
//   full:<name>         the same, the whole page top to bottom
//   click:<text or css> click the first button or link whose text contains it (or a CSS selector)
//   type:<text>         type into the focused field (or the first visible one)
//   key:<Enter|Escape|...>
//   scroll:<px>         scroll the page to this height
//   wait:<ms>
//   eval:<js>           run it in the page and print what it returns
//
// e.g. node tools/page-shots.mjs --out /tmp/x --size 390x844 --mobile goto:http://127.0.0.1:7780/ full:lobby click:'Little Catch' wait:2000 shot:asked

import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
let out = '.', size = '1280x800', mobile = false, profile = null, limit = 180;
const steps = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--out') out = args[++i];
  else if (a === '--size') size = args[++i];
  else if (a === '--mobile') mobile = true;
  else if (a === '--profile') profile = args[++i];
  else if (a === '--minutes') limit = Number(args[++i]) * 60;
  else steps.push(a);
}
if (!steps.length) { console.error('usage: page-shots.mjs --out <dir> [--size WxH] [--mobile] [--profile dir] goto:<url> shot:<name> ...'); process.exit(2); }
mkdirSync(out, { recursive: true });
const [width, height] = size.split('x').map(Number);

const dir = profile ?? mkdtempSync(join(tmpdir(), 'page-shots-'));
if (profile) mkdirSync(profile, { recursive: true });
const chrome = spawn(process.env.CHROME || 'google-chrome', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
  `--user-data-dir=${dir}`, '--remote-debugging-port=0', 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
// Closed politely, so Chrome writes the profile's storage out (a kill can lose the last of it).
let closeBrowser = async () => {};
const done = async (code) => {
  await Promise.race([closeBrowser(), new Promise((r) => setTimeout(r, 3000))]).catch(() => {});
  chrome.kill();
  setTimeout(() => { if (!profile) try { rmSync(dir, { recursive: true, force: true }); } catch {} process.exit(code); }, 300);
};
setTimeout(() => { console.error(`page-shots: timed out after ${limit / 60} minutes`); done(1); }, limit * 1000);

const browserWs = await new Promise((resolve) => {
  let seen = '';
  chrome.stderr.on('data', (d) => { seen += d; const m = seen.match(/DevTools listening on (ws:\/\/\S+)/); if (m) resolve(m[1]); });
});
const port = new URL(browserWs).port;
closeBrowser = () => new Promise((resolve) => {
  const b = new WebSocket(browserWs);
  b.addEventListener('open', () => b.send(JSON.stringify({ id: 1, method: 'Browser.close' })));
  b.addEventListener('close', resolve);
  chrome.on('exit', resolve);
});
const [target] = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).filter((t) => t.type === 'page');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let next = 0;
const waiting = new Map();
const logs = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
  else if (m.method === 'Runtime.exceptionThrown') logs.push(`page error: ${m.params.exceptionDetails?.exception?.description?.split('\n')[0]}`);
  else if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) logs.push(`console ${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`.slice(0, 300));
});
const send = (method, params = {}) => new Promise((resolve) => { const id = ++next; waiting.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });
const run = async (expression) => {
  const { result } = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description?.split('\n')[0] ?? 'failed');
  return result.result?.value;
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setFocusEmulationEnabled', { enabled: true });   // so typing reaches the focused field
await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

const VISIBLE_TEXT = `(() => {
  const t = document.body.innerText.replace(/\\n{3,}/g, '\\n\\n').trim();
  return t.length > 3000 ? t.slice(0, 3000) + '\\n…' : t;
})()`;

async function shot(name, full) {
  await pause(300);
  let clip;
  if (full) {
    // Scroll through first, so pictures that load as they come into view have.
    await run(`(async () => { for (let y = 0; y < document.body.scrollHeight; y += innerHeight / 2) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 150)); } scrollTo(0, 0); })()`);
    await pause(1200);
    const { contentSize, cssContentSize } = await send('Page.getLayoutMetrics').then((m) => m.result);
    const c = cssContentSize ?? contentSize;
    clip = { x: 0, y: 0, width, height: Math.min(Math.ceil(c.height), 12000), scale: 1 };
  }
  const { result } = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip, captureBeyondViewport: true } : {}) });
  const file = join(out, `${name}.png`);
  writeFileSync(file, Buffer.from(result.data, 'base64'));
  console.log(`\n== ${name}: ${file} (${await run('location.pathname + location.search')})\n${await run(VISIBLE_TEXT)}`);
}

try {
  for (const step of steps) {
    const at = step.indexOf(':');
    const [kind, value] = [step.slice(0, at), step.slice(at + 1)];
    if (kind === 'goto') {
      await send('Page.navigate', { url: value });
      await pause(2500);
    } else if (kind === 'shot' || kind === 'full') await shot(value, kind === 'full');
    else if (kind === 'click') {
      const hit = await run(`(() => {
        const v = ${JSON.stringify(value)};
        let el = null;
        try { el = document.querySelector(v); } catch {}
        el ||= [...document.querySelectorAll('button, a, [role=button], .card, summary, label')].find((e) => e.offsetParent !== null && e.textContent.trim().toLowerCase().includes(v.toLowerCase()));
        if (!el) return null;
        el.scrollIntoView({ block: 'center' });
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2, what: (el.textContent.trim() || el.tagName).slice(0, 60) };
      })()`);
      if (!hit) { console.log(`\n(click: nothing visible matches "${value}")`); continue; }
      for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: hit.x, y: hit.y, button: 'left', clickCount: 1 });
      console.log(`\n(clicked "${hit.what}")`);
      await pause(1500);
    } else if (kind === 'type') {
      // Into the focused field, or else the first visible one.
      await run(`(() => { const a = document.activeElement; if (a && a !== document.body) return; [...document.querySelectorAll('input, textarea')].find((e) => e.offsetParent !== null)?.focus(); })()`);
      await send('Input.insertText', { text: value });
    }
    else if (kind === 'key') {
      const codes = { Enter: 13, Escape: 27, Tab: 9, ' ': 32, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40 };
      for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: value, code: value, windowsVirtualKeyCode: codes[value] ?? value.toUpperCase().charCodeAt(0), ...(value === 'Enter' ? { text: '\r' } : {}) });
      await pause(400);
    } else if (kind === 'scroll') { await run(`window.scrollTo(0, ${Number(value)})`); await pause(400); }
    else if (kind === 'wait') await pause(Number(value));
    else if (kind === 'eval') console.log(`\n(eval) ${JSON.stringify(await run(value))}`);
    else console.log(`(unknown step ${step})`);
  }
  if (logs.length) console.log(`\n== errors and warnings in the page\n${[...new Set(logs)].join('\n')}`);
  done(0);
} catch (err) {
  console.error('page-shots:', err.message);
  done(1);
}

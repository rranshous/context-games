// curl, but through the machine's Google Chrome: for networks whose filter blocks
// gactant.com by the name in the TLS hello (Spectrum's Security Shield, while the domain
// is new). Chrome's hello gets past it where curl's doesn't. Zero dependencies: it starts
// headless Chrome, opens the URL's origin, and runs fetch() there over the DevTools protocol.
//
//   node tools/chrome-fetch.mjs https://gactant.com/api/config
//   node tools/chrome-fetch.mjs -X POST -H 'Content-Type: application/json' -d '{"a":1}' https://gactant.com/api/x
//   node tools/chrome-fetch.mjs -i https://gactant.com/        (-i: status and headers too)

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.stdout.on('error', () => {});   // piped into head: fine
const args = process.argv.slice(2);
let method = 'GET', body, url, head = false;
const headers = {};
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '-X') method = args[++i];
  else if (a === '-H') { const [k, ...v] = args[++i].split(':'); headers[k.trim()] = v.join(':').trim(); }
  else if (a === '-d') { body = args[++i]; if (method === 'GET') method = 'POST'; }
  else if (a === '-i') head = true;
  else url = a;
}
if (!url) { console.error('usage: chrome-fetch.mjs [-X method] [-H "k: v"] [-d body] [-i] <url>'); process.exit(2); }

const profile = mkdtempSync(join(tmpdir(), 'chrome-fetch-'));
const chrome = spawn(process.env.CHROME || 'google-chrome', [
  '--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${profile}`, '--remote-debugging-port=0', 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
const done = (code) => { chrome.kill(); setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch {} process.exit(code); }, 200); };
setTimeout(() => { console.error('chrome-fetch: timed out'); done(1); }, 60_000);

// Chrome says where its DevTools endpoint is on stderr.
const browserWs = await new Promise((resolve) => {
  let seen = '';
  chrome.stderr.on('data', (d) => { seen += d; const m = seen.match(/DevTools listening on (ws:\/\/\S+)/); if (m) resolve(m[1]); });
});
const port = new URL(browserWs).port;
const [target] = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).filter((t) => t.type === 'page');

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let next = 0;
const waiting = new Map();
const events = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
  else if (m.method) events.push(m);
});
const send = (method, params = {}) => new Promise((resolve) => { const id = ++next; waiting.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });

// Same-origin from a page on the URL's own origin, so no CORS gets in the way.
await send('Page.enable');
await send('Page.navigate', { url: new URL('/robots.txt', url).href });
for (let t = 0; t < 300 && !events.some((e) => e.method === 'Page.loadEventFired'); t++) await new Promise((r) => setTimeout(r, 100));

const expression = `(async () => {
  const r = await fetch(${JSON.stringify(url)}, ${JSON.stringify({ method, headers, body })});
  return JSON.stringify({ status: r.status, headers: [...r.headers], text: await r.text() });
})()`;
const { result } = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
if (result.exceptionDetails || result.result?.type !== 'string') {
  console.error('chrome-fetch:', result.exceptionDetails?.exception?.description ?? JSON.stringify(result));
  done(1);
} else {
  const r = JSON.parse(result.result.value);
  if (head) console.log(`HTTP ${r.status}\n${r.headers.map(([k, v]) => `${k}: ${v}`).join('\n')}\n`);
  process.stdout.write(r.text);
  if (!r.text.endsWith('\n')) process.stdout.write('\n');
  done(r.status >= 400 ? 22 : 0);
}

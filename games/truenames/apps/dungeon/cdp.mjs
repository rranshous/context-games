// Drive a desktop instance over its debugging port (launch it with --remote-debugging-port=<port>), for testing
// choristers: `node apps/dungeon/cdp.mjs <port> eval "<js>"` or `node apps/dungeon/cdp.mjs <port> shot <file.png>`.
import WebSocket from 'ws';
import { writeFileSync } from 'node:fs';
const [port, mode, arg] = process.argv.slice(2);
const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = list.find((p) => p.type === 'page' && /127\.0\.0\.1:47\d+/.test(p.url));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.once('open', r));
let id = 0;
const call = (method, params = {}) => new Promise((res) => { const i = ++id; ws.on('message', function h(m) { const d = JSON.parse(m); if (d.id === i) { ws.off('message', h); res(d.result); } }); ws.send(JSON.stringify({ id: i, method, params })); });
if (mode === 'eval') {
  const r = await call('Runtime.evaluate', { expression: arg, awaitPromise: true, returnByValue: true });
  console.log(JSON.stringify(r.result?.value ?? r.exceptionDetails ?? r, null, 1));
} else {
  const r = await call('Page.captureScreenshot', { format: 'png' });
  writeFileSync(arg, Buffer.from(r.data, 'base64'));
  console.log('saved', arg);
}
ws.close();

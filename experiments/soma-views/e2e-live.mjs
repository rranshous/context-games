// End to end on a local gactant: seed a ludant, talk to it, and check every think sends the
// soma live in a trailing system note, and that the system text above it is read from cache.
//   node e2e-live.mjs <scratch data dir>
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const data = process.argv[2], PORT = 7811, base = `http://127.0.0.1:${PORT}`;
const server = spawn(process.execPath, ['server.mjs', '--port', String(PORT), '--data', data], { cwd: new URL('../../platforms/gactant/', import.meta.url).pathname, stdio: ['ignore', 'ignore', 'inherit'] });
for (let i = 0; i < 50; i++) { try { await fetch(`${base}/api/config`); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
const calls = [];
page.on('request', (r) => { if (r.url().endsWith('/api/infer')) calls.push({ body: JSON.parse(r.postData()) }); });
page.on('response', async (r) => { if (r.url().endsWith('/api/infer')) { const j = await r.json().catch(() => ({})); const c = calls.find((x) => !x.usage); if (c) c.usage = j.usage; } });
try {
  await page.goto(`${base}/`);
  await page.click('.seed-btn');
  await page.fill('.name-input', 'Robby');
  await page.click('text=that\'s me');
  await page.click('text=I\'ve kept it');
  await page.waitForURL(/frame\.html/);
  await page.waitForFunction(() => window.explorer, null, { timeout: 30000 });
  await page.evaluate(() => window.explorer.idle());
  for (const text of ['Make the dot orange, and tell me what you changed.', 'What colour is the dot now, and where in your game is that set?']) {
    await page.evaluate((t) => window.explorer.say(t), text);
    await page.evaluate(() => window.explorer.idle());
  }
  const said = await page.evaluate(() => window.explorer.state().chat?.slice?.(-4) ?? window.explorer.state());
  for (const [i, c] of calls.entries()) {
    const m = c.body.messages, note = m.at(-1), sys = m[0].content[0].text;
    console.log(`call ${i}: ${m.length} messages, last is ${note.role}${note.role === 'system' && /as-of="now"/.test(note.content) ? ' (the soma, now)' : ''}; system text ${sys.length} chars; prompt ${c.usage?.prompt_tokens} cached ${c.usage?.prompt_tokens_details?.cached_tokens} $${c.usage?.cost?.toFixed(4)}`);
  }
  console.log('system text the same on every call:', new Set(calls.map((c) => c.body.messages[0].content[0].text)).size === 1);
  console.log('a note:\n', calls.at(-1).body.messages.at(-1).content.slice(0, 1500));
  console.log('chat:', JSON.stringify(said).slice(0, 1500));
  (await import('node:fs')).writeFileSync(`${data}/calls.json`, JSON.stringify(calls, null, 1));
} finally { await browser.close(); server.kill(); }

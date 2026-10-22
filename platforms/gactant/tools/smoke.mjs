// A quick run through what matters, against a fresh local server with its own scratch
// data: pages and their policies, seeding and owning, saving, refusing strangers,
// publishing and copying, reports, events and ops. Exits non-zero if anything is off.
//
//   node tools/smoke.mjs

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 7799, base = `http://127.0.0.1:${PORT}`, TOKEN = `smoke-${Date.now()}`;
const data = mkdtempSync(join(tmpdir(), 'gactant-smoke-'));
const server = spawn(process.execPath, ['server.mjs', '--port', String(PORT), '--data', data], {
  cwd: HERE, env: { ...process.env, GACTANT_ADMIN_TOKEN: TOKEN, GACTANT_PUBLIC: '1' }, stdio: ['ignore', 'ignore', 'pipe'],
});
let serverErr = '';
server.stderr.on('data', (d) => { serverErr += d; });

let failed = 0;
const ok = (what, cond, detail = '') => { console.log(`${cond ? '  ok  ' : '  FAIL'} ${what}${!cond && detail ? `: ${detail}` : ''}`); if (!cond) failed++; };
const call = async (method, path, body) => {
  const res = await fetch(`${base}/api/${path}`, { method, headers: { 'Content-Type': 'application/json', Origin: base }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json().catch(() => ({})) };
};

try {
  for (let i = 0; i < 50; i++) { try { await fetch(`${base}/api/config`); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }

  const page = await fetch(`${base}/frame.html`);
  ok('frame page has the site policy', /script-src 'self'/.test(page.headers.get('content-security-policy') ?? ''));
  const box = await fetch(`${base}/sandbox.html`);
  ok('sandbox page has its own policy', /connect-src 'none'/.test(box.headers.get('content-security-policy') ?? ''));
  ok('another site is refused', (await fetch(`${base}/api/config`, { headers: { Origin: 'https://elsewhere.example' } })).status === 403);

  const seed = await call('POST', 'ludants', { by: 'smoke' });
  ok('seed gives an owner key', seed.status === 200 && seed.json.owner, JSON.stringify(seed.json));
  const { id, owner } = seed.json;
  ok('a stranger can\'t hold it', (await call('POST', `ludants/${id}/hold`, { token: 's', who: 'stranger' })).json.notYours === true);
  ok('the owner can', (await call('POST', `ludants/${id}/hold`, { token: 'w', owner, who: 'smoke' })).json.held === true);
  const got = await call('GET', `ludants/${id}`);
  ok('reading it never shows the owner hash', got.status === 200 && !('owner' in got.json));
  const soma = { ...got.json.soma, sections: { ...got.json.soma.sections, title: 'smoke-test', game: 'function (stage) { return { frame() { stage.ctx.fillText("hello", 10, 10); } }; }' } };
  ok('saving with the hold works', (await call('PUT', `ludants/${id}`, { token: 'w', owner, soma, surfaces: {} })).status === 200);
  ok('saving without it is refused', (await call('PUT', `ludants/${id}`, { token: 'x', soma, surfaces: {} })).status === 403);
  ok('arrive', (await call('POST', `ludants/${id}/arrive`, { token: 'w', owner, who: 'smoke' })).status === 200);
  ok('a stranger can\'t publish it', (await call('POST', 'published', { ludant: id, by: 'stranger' })).status === 403);
  const pub = await call('POST', 'published', { ludant: id, by: 'smoke', token: 'w', owner });
  ok('publish', pub.status === 200 && pub.json.id, JSON.stringify(pub.json));
  const list = await call('GET', 'published');
  ok('it\'s listed (untrusted)', list.json.some?.((p) => p.id === pub.json.id && p.trusted === false));
  const copy = await call('POST', `published/${pub.json.id}/copy`, { by: 'player' });
  ok('a copy comes with its own owner key', copy.json.owner && copy.json.id !== id);
  ok('a stranger may copy a ludant by its link', (await call('POST', `ludants/${id}/copy`, { by: 'stranger' })).json.owner);
  ok('a report goes in', (await call('POST', 'flags', { published: pub.json.id, reason: 'other', by: 'smoke' })).json.id);
  ok('events go in', (await call('POST', 'events', { browser: 'smoke', events: [{ kind: 'sit' }] })).status === 200);
  const ops = await call('POST', 'admin/ops', { token: TOKEN });
  ok('ops reads back, with the report and storage', ops.json.flagsOpen === 1 && ops.json.storage?.kinds?.ludants?.docs === 3, JSON.stringify({ flagsOpen: ops.json.flagsOpen, storage: ops.json.storage }));
  ok('ops refuses a wrong token', (await call('POST', 'admin/ops', { token: 'nope' })).status === 403);
  ok('abandon', (await call('POST', `ludants/${id}/abandon`, { token: 'w', owner, by: 'smoke' })).status === 200);
  ok('its link says so', (await call('GET', `ludants/${id}`)).status === 410);
} catch (err) {
  ok('the run itself', false, err.stack);
} finally {
  server.kill();
  rmSync(data, { recursive: true, force: true });
}
if (serverErr.trim()) console.log(`server said:\n${serverErr.trim()}`);
console.log(failed ? `\n${failed} failed` : '\nall good');
process.exit(failed ? 1 : 0);

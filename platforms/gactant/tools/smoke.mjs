// A quick run through what matters, against a fresh local server with its own scratch
// data: pages and their policies; people (device keys, passes, a second device by code,
// removing one, recovery); seeding and owning, saving, refusing strangers, publishing and
// copying, reports, events and ops. Exits non-zero if anything is off.
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
const call = async (method, path, body, who = {}) => {
  const res = await fetch(`${base}/api/${path}`, { method, headers: { 'Content-Type': 'application/json', Origin: base, ...(who.pass ? { 'X-Gactant-Pass': who.pass } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json().catch(() => ({})) };
};

try {
  for (let i = 0; i < 50; i++) { try { await fetch(`${base}/api/config`); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }

  const page = await fetch(`${base}/frame.html`);
  ok('frame page has the site policy', /script-src 'self'/.test(page.headers.get('content-security-policy') ?? ''));
  const box = await fetch(`${base}/sandbox.html`);
  ok('sandbox page has its own policy', /connect-src 'none'/.test(box.headers.get('content-security-policy') ?? ''));
  for (const path of ['/privacy.html', '/rules.html', '/robots.txt', '/sitemap.xml', '/og.jpg', '/box/index.html']) ok(`${path} is there`, (await fetch(`${base}${path}`)).status === 200);
  ok('another site is refused', (await fetch(`${base}/api/config`, { headers: { Origin: 'https://elsewhere.example' } })).status === 403);

  // People: each device a key pair, as a browser makes one.
  const b64u = (bytes) => Buffer.from(bytes).toString('base64url');
  const device = async () => {
    const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
    const { x, y } = await crypto.subtle.exportKey('jwk', keys.publicKey);
    const prove = async () => {
      const { challenge } = (await call('POST', 'people/challenge')).json;
      return { challenge, signature: b64u(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys.privateKey, new TextEncoder().encode(challenge))) };
    };
    return { key: { kty: 'EC', crv: 'P-256', x, y }, prove };
  };
  const A = await device();
  const made = await call('POST', 'people', { name: 'Smoke', label: 'smoke A', key: A.key, ...(await A.prove()) });
  ok('a new person, with a pass and a recovery code', made.json.pass && made.json.recovery?.split('-').length === 12, JSON.stringify(made.json));
  const pass = made.json.pass, me = made.json.person;
  const as = (p) => ({ pass: p });
  ok('a forged signature is refused', (await call('POST', 'people', { name: 'X', key: A.key, ...(await A.prove()), signature: 'AAAA' })).status === 401);
  const renewed = await call('POST', 'people/pass', { person: me.id, device: me.devices[0].id, ...(await A.prove()) });
  ok('a device renews its pass', renewed.json.pass && renewed.json.pass !== pass);

  const seed = await call('POST', 'ludants', { by: 'smoke' }, as(pass));
  ok('a person seeds a ludant', seed.status === 200 && seed.json.id, JSON.stringify(seed.json));
  ok('nobody seeds without being someone', (await call('POST', 'ludants', { by: 'anon' })).status === 401);
  const { id } = seed.json;
  const S = await device();
  const stranger = (await call('POST', 'people', { name: 'Stranger', label: 'S', key: S.key, ...(await S.prove()) })).json.pass;
  ok('a stranger can\'t hold it', (await call('POST', `ludants/${id}/hold`, { token: 's', who: 'stranger' }, as(stranger))).json.notYours === true);
  ok('nor can anyone signed out', (await call('POST', `ludants/${id}/hold`, { token: 's', who: '?' })).json.notYours === true);
  ok('a forged pass counts for nothing', (await call('POST', `ludants/${id}/hold`, { token: 's', who: '?' }, as(pass.slice(0, -10) + (pass.at(-10) === 'A' ? 'B' : 'A') + pass.slice(-9)))).json.notYours === true);
  ok('its owner can', (await call('POST', `ludants/${id}/hold`, { token: 'w', who: 'smoke' }, as(pass))).json.held === true);
  const got = await call('GET', `ludants/${id}`, undefined, as(pass));
  ok('reading it never shows who owns it', got.status === 200 && !('owner' in got.json));
  const soma = { ...got.json.soma, sections: { ...got.json.soma.sections, title: 'smoke-test', game: 'function (stage) { return { frame() { stage.ctx.fillText("hello", 10, 10); } }; }' } };
  const surfaces = { chat: { messages: [{ who: 'smoke', text: 'a secret' }] } };
  ok('saving with the hold works', (await call('PUT', `ludants/${id}`, { token: 'w', soma, surfaces }, as(pass))).status === 200);
  ok('a stranger can\'t save over it', (await call('PUT', `ludants/${id}`, { token: 'w', soma, surfaces: {} }, as(stranger))).status === 403);
  ok('the owner reads the chat', JSON.stringify((await call('GET', `ludants/${id}`, undefined, as(pass))).json.surfaces).includes('a secret'));
  ok('a stranger doesn\'t', !JSON.stringify((await call('GET', `ludants/${id}`, undefined, as(stranger))).json).includes('a secret'));
  ok('and is told it isn\'t theirs', (await call('GET', `ludants/${id}`, undefined, as(stranger))).json.yours === false);
  ok('nor finds it in their lobby', !(await call('GET', 'ludants?mine=1', undefined, as(stranger))).json.some((l) => l.id === id));
  ok('arrive', (await call('POST', `ludants/${id}/arrive`, { token: 'w', who: 'smoke' }, as(pass))).status === 200);
  ok('a picture of it', (await call('POST', `ludants/${id}/thumb`, { token: 'w', image: 'data:image/jpeg;base64,AAAA' }, as(pass))).status === 200);
  const firstThumb = (await call('GET', `thumbs/l/${id}`)).json.url;
  ok('the picture is served from the art store', firstThumb?.startsWith('/art/t/') && (await fetch(`${base}${firstThumb}`)).status === 200, firstThumb);
  await call('POST', `ludants/${id}/thumb`, { token: 'w', image: 'data:image/jpeg;base64,BBBB' }, as(pass));
  ok('a new picture replaces it, and the old one goes', (await call('GET', `thumbs/l/${id}`)).json.url !== firstThumb && (await fetch(`${base}${firstThumb}`)).status === 404);
  // Art: kept as files, named by what's in them.
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const made1 = await call('POST', `ludants/${id}/assets`, { token: 'w', name: 'dot', image: PNG, w: 1, h: 1, prompt: 'a dot', by: 'smoke' }, as(pass));
  ok('art is kept', made1.json.url?.startsWith('/art/a/') && !('file' in made1.json), JSON.stringify(made1.json));
  const artRes = await fetch(`${base}${made1.json.url}`);
  ok('art is served as it was sent, to any site', artRes.headers.get('content-type') === 'image/png' && artRes.headers.get('access-control-allow-origin') === '*' && Buffer.from(await artRes.arrayBuffer()).toString('base64') === PNG.split(',')[1]);
  ok('a stranger can\'t add art', (await call('POST', `ludants/${id}/assets`, { token: 'w', name: 'x', image: PNG }, as(stranger))).status === 403);
  ok('art that isn\'t a picture is refused', (await call('POST', `ludants/${id}/assets`, { token: 'w', name: 'x', image: 'data:text/html;base64,PGI+' }, as(pass))).status === 400);

  // Another device of theirs, by a code.
  const { code } = (await call('POST', 'people/pair', {}, as(pass))).json;
  const A2 = await device();
  const joined = await call('POST', 'people/join', { label: 'smoke A2', key: A2.key, code, ...(await A2.prove()) });
  ok('a second device joins with a code', joined.json.person?.id === me.id && joined.json.person.devices.length === 2, JSON.stringify(joined.json));
  ok('a code works once', (await call('POST', 'people/join', { label: 'again', key: (await device()).key, code, ...(await A2.prove()) })).status === 401);
  const pass2 = joined.json.pass;
  ok('the second device reads the chat', JSON.stringify((await call('GET', `ludants/${id}`, undefined, as(pass2))).json.surfaces).includes('a secret'));
  ok('and finds the ludant in its lobby', (await call('GET', 'ludants?mine=1', undefined, as(pass2))).json.some((l) => l.id === id));
  const d2 = joined.json.person.devices.find((d) => d.current).id;
  ok('a device can be removed', (await call('POST', 'people/remove', { device: d2 }, as(pass))).json.devices?.length === 1);
  ok('its pass stops working at once', (await call('GET', `ludants?mine=1`, undefined, as(pass2))).json.length === 0);

  // Every device lost: the recovery code.
  const A3 = await device();
  const back = await call('POST', 'people/join', { label: 'smoke A3', key: A3.key, recovery: made.json.recovery.toUpperCase().replace(/-/g, ' '), ...(await A3.prove()) });
  ok('the recovery code brings them back, and gives a new one', back.json.person?.id === me.id && back.json.recovery && back.json.recovery !== made.json.recovery, JSON.stringify(back.json));
  ok('the old recovery code stops working', (await call('POST', 'people/join', { label: 'x', key: (await device()).key, recovery: made.json.recovery, ...(await A3.prove()) })).status === 401);
  ok('over http, a public site won\'t take a secret instead of a key', (await call('POST', 'people', { name: 'X', secret: 'x'.repeat(40), ...(await A.prove()) })).status === 400);

  ok('a stranger can\'t publish it', (await call('POST', 'published', { ludant: id, by: 'stranger', token: 'w' }, as(stranger))).status === 403);
  const pub = await call('POST', 'published', { ludant: id, by: 'smoke', token: 'w' }, as(pass));
  ok('publish', pub.status === 200 && pub.json.id, JSON.stringify(pub.json));
  const list = await call('GET', 'published');
  ok('it\'s listed (untrusted)', list.json.some?.((p) => p.id === pub.json.id && p.trusted === false));
  const copy = await call('POST', `published/${pub.json.id}/copy`, { by: 'player' }, as(stranger));
  ok('a copy draws with the same art file', (await call('GET', `ludants/${copy.json.id}/assets`, undefined, as(stranger))).json[0]?.url === made1.json.url);
  ok('a publication has its own picture', (await call('GET', `thumbs/p/${pub.json.id}`)).json.url?.startsWith(`/art/t/p-${pub.json.id}-`));
  ok('a copy belongs to whoever took it', copy.json.id && (await call('POST', `ludants/${copy.json.id}/hold`, { token: 'c', who: 'stranger' }, as(stranger))).json.held === true);
  const linkCopy = await call('POST', `ludants/${id}/copy`, { by: 'stranger' }, as(stranger));
  ok('a stranger may copy a ludant by its link', linkCopy.json.id);
  ok('the copy starts without the chat', !JSON.stringify((await call('GET', `ludants/${linkCopy.json.id}`, undefined, as(stranger))).json).includes('a secret'));
  ok('a report goes in', (await call('POST', 'flags', { published: pub.json.id, reason: 'other', by: 'smoke' }, as(stranger))).json.id);
  ok('events go in', (await call('POST', 'events', { browser: 'smoke', events: [{ kind: 'sit' }] })).status === 200);
  const ops = await call('POST', 'admin/ops', { token: TOKEN });
  ok('ops reads back, with the report and storage', ops.json.flagsOpen === 1 && ops.json.storage?.kinds?.ludants?.docs === 3, JSON.stringify({ flagsOpen: ops.json.flagsOpen, storage: ops.json.storage }));
  ok('ops refuses a wrong token', (await call('POST', 'admin/ops', { token: 'nope' })).status === 403);
  const owners = await call('POST', 'admin/owners', { token: TOKEN });
  ok('admin lists owners by person', Array.isArray(owners.json) && owners.json.every((l) => l.owned && /Smoke|Stranger/.test(l.owner)));
  ok('a ludant a person owns can\'t be given away', (await call('POST', 'admin/own', { token: TOKEN, ludant: id, person: 'p-0000000000000000' })).status === 409);
  ok('abandon', (await call('POST', `ludants/${id}/abandon`, { token: 'w', by: 'smoke' }, as(pass))).status === 200);
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

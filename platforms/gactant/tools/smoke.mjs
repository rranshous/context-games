// A quick run through what matters, against a fresh local server with its own scratch
// data: pages and their policies; people (device keys, passes, a second device by code,
// removing one, recovery); seeding and owning, saving, refusing strangers, publishing and
// copying, reports, events and ops. Exits non-zero if anything is off.
//
//   node tools/smoke.mjs

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { entryHash, genesisText, signedText } from '../match.mjs';
import { recoveryProof } from '../public/js/recovery.js';
import { markText } from '../public/js/marks.js';

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');
// --base <url>: against a server that's already running (`wrangler dev`, say, with ADMIN_TOKEN
// and ARCHIVE_OVER_MS=0, and GACTANT_ADMIN_TOKEN here to match), instead of a fresh Node one.
const given = process.argv.includes('--base') ? process.argv[process.argv.indexOf('--base') + 1] : null;
const PORT = 7799, base = given ?? `http://127.0.0.1:${PORT}`, TOKEN = given ? process.env.GACTANT_ADMIN_TOKEN : `smoke-${Date.now()}`;
const data = given ? null : mkdtempSync(join(tmpdir(), 'gactant-smoke-'));
const server = given ? null : spawn(process.execPath, ['server.mjs', '--port', String(PORT), '--data', data], {
  cwd: HERE, env: { ...process.env, GACTANT_ADMIN_TOKEN: TOKEN, GACTANT_PUBLIC: '1', GACTANT_ARCHIVE_OVER_MS: '0' }, stdio: ['ignore', 'ignore', 'pipe'],
});
let serverErr = '';
server?.stderr.on('data', (d) => { serverErr += d; });

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
    const sign = async (text) => b64u(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys.privateKey, new TextEncoder().encode(text)));
    return { key: { kty: 'EC', crv: 'P-256', x, y }, prove, sign };
  };
  const A = await device();
  const made = await call('POST', 'people', { name: 'Smoke', label: 'smoke A', key: A.key, ...(await A.prove()) });
  ok('a new person, with a pass and a recovery code', made.json.pass && made.json.recovery?.split('-').length === 12, JSON.stringify(made.json));
  const pass = made.json.pass, me = made.json.person;
  Object.assign(A, { person: me.id, id: me.devices[0].id });
  const as = (p) => ({ pass: p });
  ok('a forged signature is refused', (await call('POST', 'people', { name: 'X', key: A.key, ...(await A.prove()), signature: 'AAAA' })).status === 401);
  const renewed = await call('POST', 'people/pass', { person: me.id, device: me.devices[0].id, ...(await A.prove()) });
  ok('a device renews its pass', renewed.json.pass && renewed.json.pass !== pass);

  const seed = await call('POST', 'ludants', { by: 'smoke' }, as(pass));
  ok('a person seeds a ludant', seed.status === 200 && seed.json.id, JSON.stringify(seed.json));
  ok('nobody seeds without being someone', (await call('POST', 'ludants', { by: 'anon' })).status === 401);
  const { id } = seed.json;
  const S = await device();
  const sMade = (await call('POST', 'people', { name: 'Stranger', label: 'S', key: S.key, ...(await S.prove()) })).json;
  const stranger = sMade.pass;
  Object.assign(S, { person: sMade.person.id, id: sMade.person.devices[0].id });
  ok('a stranger can\'t hold it', (await call('POST', `ludants/${id}/hold`, { token: 's', who: 'stranger' }, as(stranger))).json.notYours === true);
  ok('nor can anyone signed out', (await call('POST', `ludants/${id}/hold`, { token: 's', who: '?' })).json.notYours === true);
  ok('a forged pass counts for nothing', (await call('POST', `ludants/${id}/hold`, { token: 's', who: '?' }, as(pass.slice(0, -10) + (pass.at(-10) === 'A' ? 'B' : 'A') + pass.slice(-9)))).status === 401);
  ok('its owner can', (await call('POST', `ludants/${id}/hold`, { token: 'w', who: 'smoke' }, as(pass))).json.held === true);
  const got = await call('GET', `ludants/${id}`, undefined, as(pass));
  ok('reading it never shows who owns it', got.status === 200 && !('owner' in got.json));
  const soma = { ...got.json.soma, sections: { ...got.json.soma.sections, title: 'smoke-test', game: 'function (stage) { return { frame() { stage.ctx.fillText("hello", 10, 10); } }; }' } };
  // What's private is sealed in the browser; the server keeps the ciphertext and hands it back.
  const surfaces = { stage: { width: 640, height: 360 }, sealed: { v: 1, iv: 'aaaa', data: 'a-secret-sealed' } };
  ok('a public install won\'t keep a chat that isn\'t sealed', (await call('PUT', `ludants/${id}`, { token: 'w', soma, surfaces: { chat: { messages: [{ who: 'smoke', text: 'plain' }] } } }, as(pass))).status === 400);
  ok('saving with the hold works', (await call('PUT', `ludants/${id}`, { token: 'w', soma, surfaces }, as(pass))).status === 200);
  ok('a stranger can\'t save over it', (await call('PUT', `ludants/${id}`, { token: 'w', soma, surfaces: {} }, as(stranger))).status === 403);
  ok('the owner reads what was sealed', JSON.stringify((await call('GET', `ludants/${id}`, undefined, as(pass))).json.surfaces).includes('a-secret-sealed'));
  ok('a stranger doesn\'t', !JSON.stringify((await call('GET', `ludants/${id}`, undefined, as(stranger))).json).includes('a-secret'));
  ok('and is told it isn\'t theirs', (await call('GET', `ludants/${id}`, undefined, as(stranger))).json.yours === false);
  ok('nor finds it in their lobby', !(await call('GET', 'ludants?mine=1', undefined, as(stranger))).json.some((l) => l.id === id));
  ok('arrive', (await call('POST', `ludants/${id}/arrive`, { token: 'w', who: 'smoke' }, as(pass))).status === 200);
  ok('a picture of it', (await call('POST', `ludants/${id}/thumb`, { token: 'w', image: 'data:image/jpeg;base64,AAAA' }, as(pass))).status === 200);
  // A problem it reports, sent by its person.
  const issue = { token: 'w', by: 'Smoke', title: 'matches never meet', wrong: 'two copies open separate matches', soma, table: { drafts: [], matches: [] }, doings: [{ at: 'x', kind: 'did', text: 'table {}' }] };
  ok('a stranger can\'t send its report', (await call('POST', `ludants/${id}/issue`, issue, as(stranger))).status === 403);
  ok('a report needs what went wrong', (await call('POST', `ludants/${id}/issue`, { ...issue, wrong: '' }, as(pass))).status === 400);
  const filed = (await call('POST', `ludants/${id}/issue`, issue, as(pass))).json;
  ok('its person sends its report', /^i-[0-9a-f]{8}$/.test(filed.id ?? ''), JSON.stringify(filed));
  ok('the admins see it, in brief', (await call('POST', 'admin/issues', { token: TOKEN })).json.some?.((i) => i.id === filed.id && i.title === 'matches never meet' && !i.soma));
  ok('and whole, with its soma', (await call('POST', 'admin/issues', { token: TOKEN, id: filed.id })).json.soma?.sections != null);
  ok('and can close it', (await call('POST', 'admin/issues', { token: TOKEN, id: filed.id, status: 'done' })).json.status === 'done' && !(await call('POST', 'admin/issues', { token: TOKEN })).json.some((i) => i.id === filed.id));
  ok('nobody else can read reports', (await call('POST', 'admin/issues', { token: 'nope' })).status === 403);
  // The admins answer: a letter waiting for that ludant, for its owner only.
  const replied = (await call('POST', 'admin/issues', { token: TOKEN, id: filed.id, reply: 'try view(m).view.seats' })).json;
  const rid = replied.replies?.[0]?.id;
  ok('the admins reply', /^r-[0-9a-f]{8}$/.test(rid ?? ''), JSON.stringify(replied).slice(0, 200));
  ok('a heartbeat says a letter is waiting', (await call('POST', `ludants/${id}/heartbeat`, { token: 'w', seconds: 0, spent: 0 }, as(pass))).json.mail === 1);
  ok('its owner reads it', (await call('GET', `ludants/${id}/mail`, undefined, as(pass))).json[0]?.text === 'try view(m).view.seats');
  ok('nobody else does', (await call('GET', `ludants/${id}/mail`, undefined, as(stranger))).status === 403 && !('mail' in (await call('GET', `ludants/${id}`, undefined, as(stranger))).json));
  ok('its frame says it has it', (await call('POST', `ludants/${id}/mail`, { token: 'w', took: [rid] }, as(pass))).json.mail === 0);
  ok('and the report says it was delivered', (await call('POST', 'admin/issues', { token: TOKEN, id: filed.id })).json.replies[0].delivered);
  const answered = await call('POST', `ludants/${id}/issue`, { token: 'w', by: 'Smoke', about: filed.id, wrong: 'that did it, thanks' }, as(pass));
  ok('the ludant answers on its report', answered.json.id === filed.id);
  const thread = (await call('POST', 'admin/issues', { token: TOKEN, id: filed.id })).json;
  ok('and the thread goes on there, opened again', thread.thread?.length === 2 && thread.thread[1].text === 'that did it, thanks' && thread.status === 'open');
  // A ludant reporting the person with it: no card; the recent chat goes with it if the person says so.
  const personReport = { token: 'w', who: 'Smoke', what: 'kept asking for something illegal', why: 'after I said no twice', chat: [{ who: 'Smoke', text: 'sent without asking', at: 1 }] };
  ok('a stranger can\'t report through someone else\'s ludant', (await call('POST', `ludants/${id}/report-person`, personReport, as(stranger))).status === 403);
  ok('a report about a person says what happened', (await call('POST', `ludants/${id}/report-person`, { ...personReport, what: '' }, as(pass))).status === 400);
  const pr = (await call('POST', `ludants/${id}/report-person`, personReport, as(pass))).json;
  const flagged = async () => (await call('POST', 'admin/flags', { token: TOKEN })).json.find?.((f) => f.id === pr.id);
  const prFlag = await flagged();
  ok('it goes to moderation, with who it\'s about, and no chat until the person sends it', prFlag?.from === 'ludant' && prFlag.reason === 'person' && !prFlag.chat?.length && prFlag.person && prFlag.personName === 'Smoke', JSON.stringify(prFlag ?? pr).slice(0, 300));
  ok('a stranger can\'t add to it', (await call('POST', `ludants/${id}/report-person-evidence`, { token: 'w', id: pr.id, chat: [{ who: 'x', text: 'y' }] }, as(stranger))).status === 403);
  await call('POST', `ludants/${id}/report-person-evidence`, { token: 'w', id: pr.id, chat: [{ who: 'Smoke', text: 'do it anyway', at: 1 }] }, as(pass));
  ok('the person can send the chat with it', (await flagged())?.chat?.[0]?.text === 'do it anyway');
  ok('once', (await call('POST', `ludants/${id}/report-person-evidence`, { token: 'w', id: pr.id, chat: [{ who: 'x', text: 'again' }] }, as(pass))).status === 404);
  await call('POST', 'admin/moderate', { token: TOKEN, action: 'dismiss', flag: pr.id });
  ok('not on someone else\'s report', (await call('POST', `ludants/${id}/issue`, { token: 'w', about: 'i-00000000', wrong: 'x' }, as(pass))).status === 404);
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
  ok('a pass alone can\'t make a code to add a device', (await call('POST', 'people/pair', {}, as(pass))).status === 401);
  const { code } = (await call('POST', 'people/pair', { ...(await A.prove()) }, as(pass))).json;
  const A2 = await device();
  const joined = await call('POST', 'people/join', { label: 'smoke A2', key: A2.key, code, ...(await A2.prove()) });
  ok('a second device joins with a code', joined.json.person?.id === me.id && joined.json.person.devices.length === 2, JSON.stringify(joined.json));
  ok('a code works once', (await call('POST', 'people/join', { label: 'again', key: (await device()).key, code, ...(await A2.prove()) })).status === 401);
  const pass2 = joined.json.pass;
  ok('the second device reads what was sealed', JSON.stringify((await call('GET', `ludants/${id}`, undefined, as(pass2))).json.surfaces).includes('a-secret-sealed'));
  ok('and finds the ludant in its lobby', (await call('GET', 'ludants?mine=1', undefined, as(pass2))).json.some((l) => l.id === id));
  const d2 = joined.json.person.devices.find((d) => d.current).id;
  ok('a device can be removed', (await call('POST', 'people/remove', { device: d2, ...(await A.prove()) }, as(pass))).json.devices?.length === 1);
  ok('its pass stops working at once', (await call('GET', `ludants?mine=1`, undefined, as(pass2))).status === 401);

  // Every device lost: the recovery code.
  const A3 = await device();
  const back = await call('POST', 'people/join', { label: 'smoke A3', key: A3.key, recoveryProof: await recoveryProof(made.json.recovery.toUpperCase().replace(/-/g, ' ')), ...(await A3.prove()) });
  ok('the recovery code brings them back, and gives a new one', back.json.person?.id === me.id && back.json.recovery && back.json.recovery !== made.json.recovery, JSON.stringify(back.json));
  ok('the old recovery code stops working', (await call('POST', 'people/join', { label: 'x', key: (await device()).key, recoveryProof: await recoveryProof(made.json.recovery), ...(await A3.prove()) })).status === 401);

  // Sealing: the person's key goes between their devices; the server only carries it, sealed.
  const words = () => Array.from({ length: 12 }, () => 'bada').join('-').replace(/bada/g, () => ['ba', 'de', 'fi', 'go', 'hu'][Math.random() * 5 | 0] + ['ka', 'le', 'mi', 'no', 'pu'][Math.random() * 5 | 0]);
  const vault = { iv: 'v-iv', data: 'v-wrapped-key' };
  const K = await device();
  const sealer = await call('POST', 'people', { name: 'Sealer', label: 'K1', key: K.key, ...(await K.prove()), recoveryProof: await recoveryProof(words()), vault });
  ok('a browser makes the recovery code and its vault; the server doesn\'t see the code again', sealer.status === 200 && !sealer.json.recovery && sealer.json.person.vault?.data === 'v-wrapped-key', JSON.stringify(sealer.json));
  const kpass = sealer.json.pass;
  ok('a recovery code\'s proof that isn\'t one is refused', (await call('POST', 'people/recovery', { recoveryProof: 'abc', vault, ...(await K.prove()) }, as(kpass))).status === 400);
  ok('and the code itself is never what\'s sent: a code in its place is refused', (await call('POST', 'people/recovery', { recoveryProof: words(), vault, ...(await K.prove()) }, as(kpass))).status === 400);
  ok('the server won\'t make a code that would lock the key away', (await call('POST', 'people/recovery', { ...(await K.prove()) }, as(kpass))).status === 409);
  ok('nor take a first key twice', (await call('POST', 'people/recovery', { recoveryProof: await recoveryProof(words()), vault, first: true, ...(await K.prove()) }, as(kpass))).status === 409);
  const { code: kcode } = (await call('POST', 'people/pair', { ...(await K.prove()) }, as(kpass))).json;
  const K2 = await device();
  const kbox = { kty: 'EC', crv: 'P-256', x: 'bx', y: 'by' };
  const k2 = await call('POST', 'people/join', { label: 'K2', key: K2.key, code: kcode, box: kbox, ...(await K2.prove()) });
  const k2id = k2.json.person.devices.find((d) => d.current).id;
  const asked = (await call('GET', 'people/me', undefined, as(kpass))).json.devices.find((d) => d.id === k2id);
  ok('a device joining with a code asks for the key', asked?.asking?.x === 'bx', JSON.stringify(asked));
  const handed = { iv: 'h-iv', data: 'h-wrapped', from: { kty: 'EC', crv: 'P-256', x: 'fx', y: 'fy' } };
  ok('another of their devices hands it over', (await call('POST', 'people/hand', { device: k2id, handed, ...(await K.prove()) }, as(kpass))).json.done === true);
  const k2me = (await call('GET', 'people/me', undefined, as(k2.json.pass))).json;
  ok('and only the asking device is shown it', k2me.devices.find((d) => d.current)?.handed?.data === 'h-wrapped' && !JSON.stringify((await call('GET', 'people/me', undefined, as(kpass))).json).includes('h-wrapped'));
  ok('which says it took it', !(await call('POST', 'people/took', {}, as(k2.json.pass))).json.devices.some((d) => d.asking || d.handed));
  const K3 = await device();
  const krec = words();
  await call('POST', 'people/recovery', { recoveryProof: await recoveryProof(krec), vault: { iv: 'v2-iv', data: 'v2-wrapped' }, ...(await K.prove()) }, as(kpass));
  const k3 = await call('POST', 'people/join', { label: 'K3', key: K3.key, recoveryProof: await recoveryProof(krec), ...(await K3.prove()) });
  ok('with the recovery code, a new device gets the vault to open, and makes the next code itself', k3.json.person?.vault?.data === 'v2-wrapped' && !k3.json.recovery, JSON.stringify(k3.json));
  ok('a sealed person\'s ludants are sealed too: a wipe leaves only sealed ones', typeof (await call('POST', 'admin/wipe-unsealed', { token: TOKEN })).json.wiped === 'number');
  ok('over http, a public site won\'t take a secret instead of a key', (await call('POST', 'people', { name: 'X', secret: 'x'.repeat(40), ...(await A.prove()) })).status === 400);

  ok('a stranger can\'t share it', (await call('POST', `ludants/${id}/share`, { by: 'stranger', token: 'w' }, as(stranger))).status === 403);
  // A letter from the admins in its soma stays with it: not in what's shared, or copies.
  await call('PUT', `ludants/${id}`, { token: 'w', soma: { ...soma, sections: { ...soma.sections, letters_from_gactant_admins: 'a letter (r-00000000)' } }, surfaces }, as(pass));
  // Sharing: a line, with a first version, private until it's made public.
  const shared = await call('POST', `ludants/${id}/share`, { by: 'smoke', token: 'w' }, as(pass));
  ok('share: a link, with a first version, private', shared.status === 200 && shared.json.id?.startsWith('line-') && shared.json.latest?.version === 1 && shared.json.public === false, JSON.stringify(shared.json));
  const line = shared.json.id, v1 = shared.json.latest.id;
  ok('a private game isn\'t in the lobby', !(await call('GET', 'published')).json.some?.((p) => p.line === line));
  ok('its link says what it is, to anyone', (await call('GET', `lines/${line}`)).json.latest?.id === v1);
  const pubd = await call('POST', `ludants/${id}/share`, { by: 'smoke', token: 'w', public: true }, as(pass));
  ok('made public, it\'s listed, and up front at once (this install has no publish check, and nobody has reported it)', pubd.json.public === true && (await call('GET', 'published')).json.some?.((p) => p.id === v1 && p.trusted === true));
  const pub = { json: { id: v1 } };
  const copy = await call('POST', `lines/${line}/copy`, { by: 'player' }, as(stranger));
  const copied = (await call('GET', `ludants/${copy.json.id}`, undefined, as(stranger))).json;
  ok('a copy by the link goes without the letters, and follows', copy.status === 200 && !('letters_from_gactant_admins' in copied.soma.sections) && copied.follows?.following === true && copied.follows.by === 'smoke', JSON.stringify(copied.follows));
  ok('a copy draws with the same art file', (await call('GET', `ludants/${copy.json.id}/assets`, undefined, as(stranger))).json[0]?.url === made1.json.url);
  ok('a version has its own picture', (await call('GET', `thumbs/p/${v1}`)).json.url?.startsWith(`/art/t/p-${v1}-`));
  ok('a copy belongs to whoever took it', copy.json.id && (await call('POST', `ludants/${copy.json.id}/hold`, { token: 'c', who: 'stranger' }, as(stranger))).json.held === true);
  ok('its maker sees one follower, and nothing new to send', (await call('GET', `ludants/${id}`, undefined, as(pass))).json.line?.followers === 1 && (await call('POST', `ludants/${id}/update`, { by: 'smoke', token: 'w' }, as(pass))).status === 409);
  // The maker changes the game and sends an update; the copy takes it when it's next opened.
  const changed = { ...soma, sections: { ...soma.sections, game: `${soma.sections.game}\n// v2` } };
  const put2 = (await call('PUT', `ludants/${id}`, { token: 'w', soma: changed, surfaces }, as(pass))).json;
  ok('after a change, followers are behind', put2.behind === true && put2.followers === 1, JSON.stringify(put2));
  const v2 = (await call('POST', `ludants/${id}/update`, { by: 'smoke', token: 'w' }, as(pass))).json;
  ok('send an update: version 2', v2.latest?.version === 2, JSON.stringify(v2));
  await call('POST', `ludants/${copy.json.id}/release`, { token: 'c' }, as(stranger));
  const caught = (await call('GET', `ludants/${copy.json.id}`, undefined, as(stranger))).json;
  ok('the copy takes the update as it\'s opened, keeping its own memory', caught.updatedTo?.version === 2 && caught.soma.sections.game.endsWith('// v2') && caught.soma.sections.memory === copied.soma.sections.memory, JSON.stringify(caught.updatedTo));
  ok('only the newest public version is in the lobby', (await call('GET', 'published')).json.filter((p) => p.line === line).map((p) => p.version).join() === '2');
  ok('an update doesn\'t make the game new again: copies count across its versions', (await call('GET', 'published')).json.find((p) => p.line === line)?.copies >= 1);
  // A reshare from the follower: its own link passes the maker's versions through.
  await call('POST', `ludants/${copy.json.id}/hold`, { token: 'c', who: 'stranger' }, as(stranger));
  const reline = (await call('POST', `ludants/${copy.json.id}/share`, { by: 'stranger', token: 'c' }, as(stranger))).json;
  ok('a follower can reshare, and its link passes the maker\'s versions through', reline.id && reline.latest?.id === v2.latest.id, JSON.stringify(reline));
  // Changing a following copy's game takes its person's OK (the frame asks: madeOwn).
  const theirs = { ...caught.soma, sections: { ...caught.soma.sections, game: `${caught.soma.sections.game}\n// mine` } };
  ok('a following copy\'s game doesn\'t change without its person\'s OK', (await call('PUT', `ludants/${copy.json.id}`, { token: 'c', soma: theirs, surfaces: {} }, as(stranger))).status === 423);
  ok('memory changes freely', (await call('PUT', `ludants/${copy.json.id}`, { token: 'c', soma: { ...caught.soma, sections: { ...caught.soma.sections, memory: 'I remember' } }, surfaces: {} }, as(stranger))).status === 200);
  await call('PUT', `ludants/${copy.json.id}`, { token: 'c', soma: theirs, surfaces: {}, madeOwn: true }, as(stranger));
  const own = (await call('GET', `ludants/${copy.json.id}`, undefined, as(stranger))).json;
  ok('with it, the copy is its own version, and the maker has no followers', own.follows?.following === false && (await call('GET', `ludants/${id}`, undefined, as(pass))).json.line?.followers === 0, JSON.stringify(own.follows));
  ok('and its reshared link now has only its own versions', (await call('GET', `lines/${reline.id}`)).json.latest?.id !== v2.latest.id);
  const refollow = (await call('POST', `ludants/${copy.json.id}/follow`, { token: 'c' }, as(stranger))).json;
  ok('it can go back to following, and gets the newest', refollow.following === true && refollow.version === 2 && (await call('GET', `ludants/${copy.json.id}`, undefined, as(stranger))).json.soma.sections.game.endsWith('// v2'));
  // A copy made its own is a spin-off of the game it came from, counted once however often
  // it goes back and leaves again; not shared in the lobby, it's only counted.
  await call('PUT', `ludants/${copy.json.id}`, { token: 'c', soma: theirs, surfaces: {}, madeOwn: true }, as(stranger));
  const mineNow = (await call('GET', 'ludants?mine=1', undefined, as(pass))).json.find((l) => l.id === id);
  ok('your own say how their shared game is doing: following, and spin-offs', mineNow?.shared?.line === line && mineNow.shared.spinoffs === 1 && mineNow.shared.followers === 0, JSON.stringify(mineNow?.shared));
  const tree = (await call('GET', `lines/${line}/tree`)).json;
  ok('a game\'s tree: its versions, and a private spin-off only counted', tree.versions?.length === 2 && tree.spinoffs?.unlisted === 1 && tree.spinoffs.listed.length === 0, JSON.stringify(tree).slice(0, 300));
  // Marks: a fingerprint of something a person did, signed by their device, kept with the time.
  const fp = 'a'.repeat(64);
  ok('a mark needs its device\'s signature', (await call('POST', 'marks', { ludant: id, hash: fp, signature: 'AAAA' }, as(pass))).status === 401);
  const marked = (await call('POST', 'marks', { ludant: id, hash: fp, signature: await A.sign(markText(id, fp)) }, as(pass))).json;
  const mark = (await call('GET', `marks/${fp}`)).json;
  ok('a signed mark is kept, with the time, and anyone can look it up', marked.at && mark.at === marked.at && mark.signed && mark.name === 'Smoke' && mark.text === markText(id, fp), JSON.stringify(mark).slice(0, 200));
  ok('marking it again keeps the first time', (await call('POST', 'marks', { ludant: id, hash: fp, signature: await A.sign(markText(id, fp)) }, as(pass))).json.at === marked.at);
  ok('a mark needs someone signed in', (await call('POST', 'marks', { ludant: id, hash: 'b'.repeat(64) })).status === 401);
  ok('a spin-off\'s tree says what it\'s based on', (await call('GET', `lines/${reline.id}/tree`)).json.from?.title != null);
  await call('POST', `ludants/${copy.json.id}/release`, { token: 'c' }, as(stranger));
  ok('an old version\'s link gives the newest, following', (await call('GET', `ludants/${(await call('POST', `published/${v1}/copy`, { by: 'player' }, as(stranger))).json.id}`, undefined, as(stranger))).json.soma.sections.game.endsWith('// v2'));
  const linkCopy = await call('POST', `ludants/${id}/copy`, { by: 'stranger' }, as(stranger));
  ok('a stranger may copy a ludant by its link', linkCopy.json.id);
  ok('so does a copy by its link', !('letters_from_gactant_admins' in (await call('GET', `ludants/${linkCopy.json.id}`, undefined, as(stranger))).json.soma.sections));
  ok('the copy starts without the chat', !JSON.stringify((await call('GET', `ludants/${linkCopy.json.id}`, undefined, as(stranger))).json).includes('a secret'));
  ok('a report goes in', (await call('POST', 'flags', { published: v2.latest.id, reason: 'other', by: 'smoke' }, as(stranger))).json.id);
  ok('a report takes it off the front until a person looks', (await call('GET', 'published')).json.find?.((p) => p.id === v2.latest.id)?.trusted === false);
  ok('events go in', (await call('POST', 'events', { browser: 'smoke', events: [{ kind: 'sit' }] })).status === 200);
  const ops = await call('POST', 'admin/ops', { token: TOKEN });
  ok('ops reads back, with the report and storage', ops.json.flagsOpen === 1 && ops.json.storage?.kinds?.ludants?.docs >= 3, JSON.stringify({ flagsOpen: ops.json.flagsOpen, storage: ops.json.storage }));
  ok('ops refuses a wrong token', (await call('POST', 'admin/ops', { token: 'nope' })).status === 403);
  const owners = await call('POST', 'admin/owners', { token: TOKEN });
  ok('admin lists owners by person', Array.isArray(owners.json) && owners.json.every((l) => l.owned && /Smoke|Stranger/.test(l.owner)));
  ok('a ludant a person owns can\'t be given away', (await call('POST', 'admin/own', { token: TOKEN, ludant: id, person: 'p-0000000000000000' })).status === 409);
  // Tables: a draft, private; tried; locked by hash; a match of signed actions.
  const ttt = readFileSync(join(HERE, 'tools/fixtures/tic-tac-toe.js'), 'utf8');
  const draft = await call('POST', 'drafts', { name: 'tic-tac-toe', source: 'function init() { return {} }' }, as(pass));
  ok('a draft', draft.json.id, JSON.stringify(draft.json));
  ok('it says what it still needs', (await call('GET', `drafts/${draft.json.id}`, undefined, as(pass))).json.missing?.join() === 'join,move,view,result');
  ok('someone else\'s draft isn\'t there', (await call('GET', `drafts/${draft.json.id}`, undefined, as(stranger))).status === 404);
  ok('a draft missing rules can\'t be locked', (await call('POST', `drafts/${draft.json.id}/lock`, {}, as(pass))).status === 422);
  ok('a draft changes', (await call('PUT', `drafts/${draft.json.id}`, { source: ttt }, as(pass))).json.missing?.length === 0);
  const tried = await call('POST', `drafts/${draft.json.id}/try`, { steps: [{ do: 'join', as: 'a' }, { do: 'join', as: 'b' }, { do: 'move', as: 'b', data: { cell: 0 } }, { do: 'move', as: 'a', data: { cell: 4 } }] }, as(pass));
  ok('a practice run: joins, a refusal, a move', tried.json.steps?.map((x) => x.ok).join() === 'true,true,false,true' && tried.json.steps[2].error === 'it\'s X\'s turn', JSON.stringify(tried.json).slice(0, 300));
  // Time: every call gets { now, started }; a practice run's clock moves only by wait.
  const timed = (await call('POST', 'drafts', { name: 'cooldown', source: `function init(seed, o, t) { return { started: t.started, last: t.now }; }
function join(s, p, r, t) { return { ...s, last: t.now }; }
function move(s, p, a, t) { if (t.now - s.last < 1000) throw new Error('too soon'); return { ...s, last: t.now }; }
function view(s, p, t) { return { since: t.now - s.last }; }
function result(s, t) { return null; }` }, as(pass))).json;
  const cool = (await call('POST', `drafts/${timed.id}/try`, { steps: [{ do: 'join', as: 'a' }, { do: 'move', as: 'a' }, { do: 'move', as: 'a', wait: 1500 }] }, as(pass))).json;
  ok('rules get the time, and a practice run\'s clock moves by wait', cool.steps?.map((x) => x.ok).join() === 'true,false,true' && cool.steps[1].error === 'too soon' && cool.steps[2].now - cool.steps[0].now === 1500, JSON.stringify(cool.steps).slice(0, 300));
  await call('POST', `drafts/${timed.id}/remove`, {}, as(pass));
  const locked = await call('POST', `drafts/${draft.json.id}/lock`, {}, as(pass));
  const rb = locked.json.rulebook;
  ok('locked, named by its hash', /^[0-9a-f]{64}$/.test(rb ?? ''), JSON.stringify(locked.json));
  ok('anyone can read a rulebook', (await call('GET', `rulebooks/${rb}`)).json.source === ttt);
  ok('locking the same rules again gives the same hash', (await call('POST', `drafts/${draft.json.id}/lock`, {}, as(pass))).json.rulebook === rb);
  const match = (await call('POST', 'matches', { rulebook: rb }, as(pass))).json;
  ok('a match', match.id && match.n === 0, JSON.stringify(match));
  const early = (await call('GET', `matches/${match.id}/log`)).json;
  ok('its seed stays hidden until it\'s over', early.genesis && early.seed === undefined && early.salt === undefined, JSON.stringify(early).slice(0, 200));
  let head = match.head, n = 0;
  const act = async (who, dev, kind, data, extra = {}) => {
    const sig = await dev.sign(signedText({ match: match.id, n, prev: head, person: dev.person, device: dev.id, kind, data }));
    const r = await call('POST', `matches/${match.id}/act`, { kind, data, n, prev: head, signature: sig, ...extra }, as(who));
    if (r.status === 200) { n = r.json.n; head = r.json.head; }
    return r;
  };
  // A look that waits: it answers when the next action comes, not before.
  const waited = call('GET', `matches/${match.id}?after=0`, undefined, as(stranger)).then((r) => ({ ...r, at: Date.now() }));
  await new Promise((r) => setTimeout(r, 1000));
  const joinedAt = Date.now();
  ok('a signed join', (await act(pass, A, 'join', null)).json.view?.you === 'X');
  const w = await waited;
  ok('a waiting look answers with the next action', w.json.n === 1 && w.at >= joinedAt, JSON.stringify(w.json).slice(0, 200));
  ok('a join signed by another device is refused', (await call('POST', `matches/${match.id}/act`, { kind: 'join', data: null, n, prev: head, signature: await A.sign(signedText({ match: match.id, n, prev: head, person: S.person, device: S.id, kind: 'join', data: null })) }, as(stranger))).status === 401);
  ok('an action on an old head is refused', (await call('POST', `matches/${match.id}/act`, { kind: 'join', data: null, n: 0, prev: match.head, signature: await S.sign(signedText({ match: match.id, n: 0, prev: match.head, person: S.person, device: S.id, kind: 'join', data: null })) }, as(stranger))).status === 409);
  ok('the second player joins, as O', (await act(stranger, S, 'join', null)).json.view?.you === 'O');
  const wrong = await act(stranger, S, 'move', { cell: 0 });
  ok('the rules refuse a move out of turn', wrong.status === 422 && wrong.json.refused === 'it\'s X\'s turn', JSON.stringify(wrong.json));
  ok('playing through a ludant that isn\'t yours is refused', (await act(pass, A, 'move', { cell: 0 }, { ludant: linkCopy.json.id })).status === 403);
  // Live: sockets hear each action as it happens, and players share values with each other.
  const socket = (who) => new Promise((resolve, reject) => {
    const heard = [];
    const ws = new WebSocket(`${base.replace(/^http/, 'ws')}/api/matches/${match.id}/live`, { protocols: who ? ['gactant', who] : ['gactant'], headers: { Origin: base } });
    const live = { ws: null, heard, pongs: 0 };
    ws.onmessage = (e) => { if (e.data === 'pong') live.pongs++; else heard.push(JSON.parse(e.data)); };
    ws.onopen = () => resolve(Object.assign(live, { ws }));
    ws.onerror = () => reject(new Error('no socket'));
  });
  const until = async (fn, ms = 3000) => { const end = Date.now() + ms; while (Date.now() < end) { const v = fn(); if (v) return v; await new Promise((r) => setTimeout(r, 30)); } return null; };
  const [liveA, liveS, liveOn] = await Promise.all([socket(pass), socket(stranger), socket(null)]);
  await act(pass, A, 'move', { cell: 0 });
  const pushed = await until(() => liveS.heard.find((m) => m.type === 'look' && m.n === n));
  ok('a move is pushed to everyone following it live, each as they see it', pushed?.view?.you === 'O' && (await until(() => liveA.heard.find((m) => m.type === 'look' && m.n === n)))?.view?.you === 'X', JSON.stringify(liveS.heard).slice(0, 200));
  liveA.ws.send(JSON.stringify({ share: { x: 12, y: 34 } }));
  const sharedS = await until(() => liveS.heard.find((m) => m.type === 'shared'));
  ok('a player shares a value with the others at once', sharedS?.value?.x === 12 && sharedS.name === 'Smoke' && (await until(() => liveOn.heard.find((m) => m.type === 'shared'))) && !liveA.heard.some((m) => m.type === 'shared'), JSON.stringify(sharedS));
  liveOn.ws.send(JSON.stringify({ share: 1 }));
  ok('someone not playing can\'t share', (await until(() => liveOn.heard.find((m) => m.type === 'error')))?.error.includes('only players'));
  liveA.ws.send('ping');
  ok('a ping is answered', await until(() => liveA.pongs > 0));
  const t0 = Date.now();
  liveOn.ws.send(JSON.stringify({ time: t0 }));
  const told = await until(() => liveOn.heard.find((m) => m.type === 'time'));
  ok('a clock check is answered with the server\'s time, to anyone following', told?.t0 === t0 && told.now >= t0 - 5 && told.now <= Date.now() + 5, JSON.stringify(told));
  ok('a pushed look carries the server\'s time', typeof pushed?.now === 'number');
  for (const l of [liveA, liveS, liveOn]) l.ws.close();
  for (const [who, dev, cell] of [[stranger, S, 3], [pass, A, 1], [stranger, S, 4]]) await act(who, dev, 'move', { cell });
  const won = await act(pass, A, 'move', { cell: 2 }, { ludant: id });
  ok('X wins, and the result names the person who won', won.json.result?.winner === 'X' && won.json.result.winners?.[0] === me.id, JSON.stringify(won.json));
  ok('a move after the end is refused', (await act(stranger, S, 'move', { cell: 8 })).status === 422);
  const board = (await call('GET', `rulebooks/${rb}/standings`, undefined, as(stranger))).json;
  ok('standings count the match: a win and a loss', board.matches === 1 && board.players?.[0]?.id === me.id && board.players[0].wins === 1 && board.players[1]?.losses === 1, JSON.stringify(board));
  ok('and say where you stand', board.you?.rank === 2 && board.you.losses === 1);
  const seen = (await call('GET', `matches/${match.id}`, undefined, as(stranger))).json;
  ok('each player sees their own view', seen.view?.you === 'O' && seen.you === true && seen.n === 7);
  ok('a look carries the server\'s time and when the match began', typeof seen.now === 'number' && seen.started <= seen.now);
  ok('the rulebook lists its matches', (await call('GET', `rulebooks/${rb}/matches`)).json[0]?.id === match.id);
  // Anyone can check the log: the chain, every signature, and the replay.
  const { log, seed: mSeed, salt, options, genesis, keys, started } = (await call('GET', `matches/${match.id}/log`)).json;
  const sha = async (t) => Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t))).toString('hex');
  let prev = await sha(genesisText({ id: match.id, rulebook: rb, seed: mSeed, salt, options, started }));
  let chain = prev === genesis;
  for (const e of log) {
    const text = signedText({ match: match.id, n: e.n, prev, person: e.player.id, device: e.device, kind: e.kind, data: e.data });
    const key = await crypto.subtle.importKey('jwk', keys[e.device], { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    chain &&= e.prev === prev && e.hash === await entryHash(text, e.signature, e.time) && e.time >= started && await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, Buffer.from(e.signature, 'base64url'), new TextEncoder().encode(text));
    prev = e.hash;
  }
  ok('the log brings the signers\' public keys', keys && Object.values(keys).map((k) => k.x).sort().join() === [A.key.x, S.key.x].sort().join());
  ok('the log checks out: a chain of signed actions', chain && log.length === 7 && prev === head);
  ok('it says which ludant a move was played through', log.at(-1).through?.id === id);
  // A report from a game that was in a match carries the match: who played, and how far it was.
  const withMatch = (await call('POST', 'flags', { ludant: id, reason: 'other', by: 'smoke', note: 'they said something', matches: [match.id, 'not-a-match'] }, as(pass))).json;
  const mf = (await call('POST', 'admin/flags', { token: TOKEN })).json.find?.((f) => f.id === withMatch.id);
  ok('a report brings the matches its game was in', mf?.matches?.length === 1 && mf.matches[0].id === match.id && mf.matches[0].players.includes('Smoke') && mf.matches[0].n === 7, JSON.stringify(mf?.matches));
  await call('POST', 'admin/moderate', { token: TOKEN, action: 'dismiss', flag: withMatch.id });
  const spent = (await call('GET', 'tables/budget', undefined, as(pass))).json;
  ok('a budget says what\'s been used today', spent.actions?.used === 4 && spent.steps?.used > 0 && spent.steps.allowed > spent.steps.used, JSON.stringify(spent).slice(0, 200));
  // Over: archived on the next sweep, its log whole, still checkable, and closed to actions.
  const swept = (await call('POST', 'admin/sweep', { token: TOKEN })).json;
  ok('a match that\'s over is archived', swept.archived >= 1, JSON.stringify(swept));
  const after = (await call('GET', `matches/${match.id}`, undefined, as(stranger))).json;
  ok('an archived match still says how it ended, and who was in it', after.archived && after.result?.winner === 'X' && after.you === true && after.players?.length === 2, JSON.stringify(after));
  const kept = (await call('GET', `matches/${match.id}/log`)).json;
  ok('its log is kept whole, with the keys', kept.log?.length === 7 && kept.log.at(-1).hash === head && Object.keys(kept.keys ?? {}).length === 2);
  // And from outside, trusting nothing: tools/check-match.mjs replays it, each action at its own time.
  const checked = await new Promise((resolve) => {
    const p = spawn(process.execPath, [join(HERE, 'tools/check-match.mjs'), match.id, base], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('close', (code) => resolve({ code, out }));
  });
  ok('check-match replays it from outside: chain, signatures and result, at each action\'s time', checked.code === 0 && /checks out: the chain, every signature, and the replay/.test(checked.out), checked.out.slice(-400));
  ok('an archived match takes no actions', (await act(stranger, S, 'move', { cell: 8 })).status === 410);
  // A one-player game with a high-score table: a match per run, and the best kept in standings.
  const solo = 'function init() { return { points: 0, done: false, who: null } }\nfunction join(s, p) { if (s.who) throw new Error(\'one player\'); s.who = p.id; return s }\nfunction move(s, p, a) { s.points = a.points; s.done = true; return s }\nfunction view(s) { return s }\nfunction result(s) { return s.done ? { scores: { [s.who]: s.points } } : null }';
  const soloDraft = (await call('POST', 'drafts', { name: 'solo', source: solo }, as(pass))).json;
  const soloRb = (await call('POST', `drafts/${soloDraft.id}/lock`, {}, as(pass))).json.rulebook;
  const run = async (who, dev, points) => {
    const m = (await call('POST', 'matches', { rulebook: soloRb }, as(who))).json;
    let at = 0, prev = m.head;
    for (const [kind, data] of [['join', null], ['move', { points }]]) {
      const r = await call('POST', `matches/${m.id}/act`, { kind, data, n: at, prev, signature: await dev.sign(signedText({ match: m.id, n: at, prev, person: dev.person, device: dev.id, kind, data })) }, as(who));
      at = r.json.n; prev = r.json.head;
    }
    return m.id;
  };
  const bestRun = await run(pass, A, 420);
  await run(pass, A, 300);
  await run(stranger, S, 500);
  const scored = (await call('GET', `rulebooks/${soloRb}/standings?by=best`, undefined, as(pass))).json;
  ok('scores keep each player\'s best, ranked by it, with the match that made it', scored.players?.[0]?.best === 500 && scored.players[1]?.id === me.id && scored.players[1].best === 420 && scored.players[1].scored === 2 && scored.players[1].bestMatch === bestRun && scored.you?.rank === 2, JSON.stringify(scored));
  ok('a scored run is no win or loss', scored.players[1].played === 0);
  ok('a board with no scores has nobody ranked by best', (await call('GET', `rulebooks/${rb}/standings?by=best`, undefined, as(pass))).json.players?.length === 0);
  // Practice runs say what each call did and cost, and where broken rules broke.
  const broken = (await call('POST', 'drafts', { name: 'broken', source: 'function init() { return { n: 0 } }\nfunction join(s) { return s }\nfunction move(s, p, a) {\n  return s.board.length;\n}\nfunction view(s) { return s }\nfunction result() { return null }' }, as(pass))).json;
  const ran = (await call('POST', `drafts/${broken.id}/try`, { steps: [{ do: 'join', as: 'a' }, { do: 'move', as: 'a', data: {} }] }, as(pass))).json;
  ok('a practice run counts steps and sizes', ran.steps?.[0]?.ok && ran.steps[0].steps >= 1 && ran.steps[0].stateSize > 0 && ran.limits?.stepsPerCall > 0, JSON.stringify(ran).slice(0, 300));
  ok('and says a broken rule is broken, on its own line', ran.steps?.[1]?.broken === true && ran.steps[1].line === 4, JSON.stringify(ran.steps?.[1]));
  const heavy = (await call('POST', 'drafts', { name: 'heavy', source: 'function init() { let s = 0; for (let i = 0; i < 3e6; i++) s += i; return { s } }\nfunction join(s) { return s }\nfunction move(s) { return s }\nfunction view(s) { return s }\nfunction result() { return null }' }, as(pass))).json;
  ok('it warns past half of a limit', (await call('POST', `drafts/${heavy.id}/try`, { steps: [] }, as(pass))).json.warnings?.some((w) => /init steps/.test(w)));

  // Apparent CSAM (the Scanning Tool matched a file): preserved privately, what used it taken down.
  const bad = (await call('POST', 'ludants', { by: 'smoke' }, as(pass))).json.id;
  await call('POST', `ludants/${bad}/hold`, { token: 'c', who: 'smoke' }, as(pass));
  const badArt = (await call('POST', `ludants/${bad}/assets`, { token: 'c', name: 'pic', image: `data:image/png;base64,${Buffer.from(`not-a-real-picture-${Date.now()}`).toString('base64')}` }, as(pass))).json;
  const badFile = badArt.url?.replace(/^\/art\//, '');
  const taken = (await call('POST', 'admin/csam', { token: TOKEN, file: `${base}${badArt.url}` })).json;
  ok('a matched picture is preserved, and what used it taken down', taken.file === badFile && taken.ludants?.[0]?.id === bad && taken.people?.[0]?.name === 'Smoke', JSON.stringify(taken).slice(0, 300));
  ok('the ludant is gone, the picture no longer served', (await call('GET', `ludants/${bad}`, undefined, as(pass))).status === 410 && (await fetch(`${base}${badArt.url}`)).status === 404);
  ok('and the record stays for the report', (await call('POST', 'admin/preserved', { token: TOKEN })).json.some?.((r) => r.id === taken.id));
  if (data) ok('kept privately, with the ludant', existsSync(join(data, 'preserved-files', taken.id, `ludant-${bad}.json`)) && existsSync(join(data, 'preserved-files', taken.id, badFile.replace('/', '-'))));
  ok('only with the admin token', (await call('POST', 'admin/csam', { token: 'nope', file: badFile })).status === 403);
  ok('abandon', (await call('POST', `ludants/${id}/abandon`, { token: 'w', by: 'smoke' }, as(pass))).status === 200);
  ok('its link says so', (await call('GET', `ludants/${id}`)).status === 410);
} catch (err) {
  ok('the run itself', false, err.stack);
} finally {
  server?.kill();
  if (data) rmSync(data, { recursive: true, force: true });
}
if (serverErr.trim()) console.log(`server said:\n${serverErr.trim()}`);
console.log(failed ? `\n${failed} failed` : '\nall good');
process.exit(failed ? 1 : 0);

// Check a match from outside, trusting nothing the server says about it: its log is a hash
// chain from the genesis, every signed action is signed by the key of the device that took
// it, and replaying the log through the rulebook (fetched by its hash, and checked against
// it) gives the same result. tables.mjs says what's signed and how.
//
//   node tools/check-match.mjs <match> [https://gactant.com]

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRules } from '../rules.mjs';
import { genesisText, signedText } from '../match.mjs';

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');
const [match, to = 'https://gactant.com'] = process.argv.slice(2);
if (!match) { console.error('node tools/check-match.mjs <match> [install]'); process.exit(2); }
const base = to.replace(/\/$/, '');
const get = async (path) => { const r = await fetch(`${base}/api/${path}`, { headers: { Origin: base } }); if (!r.ok) throw new Error(`${path}: ${r.status}`); return r.json(); };
const sha = async (t) => Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t))).toString('hex');
const bad = [];
const fail = (what) => { bad.push(what); console.log(`  FAIL ${what}`); };

let m = await get(`matches/${match}/log`);
const log = [...m.log], keys = { ...m.keys };
while (m.more) { m = await get(`matches/${match}/log?from=${log.length}`); log.push(...m.log); Object.assign(keys, m.keys); }
const rb = await get(`rulebooks/${m.rulebook}`);
if (await sha(rb.source) !== m.rulebook) fail('the rulebook isn\'t the one its hash names');
console.log(`${match}: ${rb.name} (${m.rulebook.slice(0, 12)}…), ${log.length} actions, seed ${m.seed}`);

let prev = await sha(genesisText({ id: match, rulebook: m.rulebook, seed: m.seed, options: m.options }));
if (prev !== m.genesis) fail('the genesis doesn\'t match the match\'s id, rulebook, seed and options');
const rules = await createRules(await WebAssembly.compile(readFileSync(join(HERE, 'vendor/quickjs/quickjs.wasm'))));
let state = rules.call(rb.source, 'init', [m.seed, m.options]).value;
let unsigned = 0;
for (const e of log) {
  const text = signedText({ match, n: e.n, prev, kind: e.kind, data: e.data });
  if (e.prev !== prev) fail(`action ${e.n}: its prev isn't the hash before it`);
  if (e.hash !== await sha(`${text}\n${e.signature ?? 'unsigned'}`)) fail(`action ${e.n}: its hash doesn't match what it says`);
  if (!e.signature) unsigned++;
  else if (!keys[e.device]) fail(`action ${e.n}: no key for device ${e.device} (removed since?)`);
  else {
    const key = await crypto.subtle.importKey('jwk', keys[e.device], { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    if (!await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, Buffer.from(e.signature, 'base64url'), new TextEncoder().encode(text))) fail(`action ${e.n}: the signature isn't ${e.player.name}'s device's`);
  }
  try { state = rules.call(rb.source, e.kind, [state, e.player, e.data]).value; } catch (err) { fail(`action ${e.n}: the rules refuse it on replay (${err.message})`); }
  console.log(`  ${String(e.n).padStart(3)} ${e.player.name}${e.through ? ` (through ${e.through.name})` : ''} ${e.kind} ${JSON.stringify(e.data)}`);
  prev = e.hash;
}
if (prev !== m.head) fail('the chain doesn\'t end at the match\'s head');
const result = rules.call(rb.source, 'result', [state]).value ?? null;
if (JSON.stringify(result) !== JSON.stringify(m.result ?? null)) fail(`replayed, the result is ${JSON.stringify(result)}, not ${JSON.stringify(m.result)}`);
console.log(`result: ${JSON.stringify(result)}${unsigned ? ` (${unsigned} actions unsigned: devices without keys)` : ''}`);
console.log(bad.length ? `\n${bad.length} problem(s)` : '\nchecks out: the chain, every signature, and the replay');
process.exit(bad.length ? 1 : 0);

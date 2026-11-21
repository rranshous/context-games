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
import { entryHash, genesisText, signedText } from '../match.mjs';

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
const over = m.seed !== undefined;
console.log(`${match}: ${rb.name} (${m.rulebook.slice(0, 12)}…), ${log.length} actions, ${over ? `seed ${m.seed}` : 'not over (its seed stays hidden until it is, so the chain and signatures are checked, not the replay)'}`);

let prev = over ? await sha(genesisText({ id: match, rulebook: m.rulebook, seed: m.seed, salt: m.salt, options: m.options, started: m.started })) : m.genesis;
if (prev !== m.genesis) fail('the genesis doesn\'t match the match\'s id, rulebook, seed, salt and options');
const rules = await createRules(await WebAssembly.compile(readFileSync(join(HERE, 'vendor/quickjs/quickjs.wasm'))));
// Each call gets the time it had: the match's start, and each action's own (none before v3).
const at = (now) => (m.started == null ? undefined : { now, started: m.started });
// Matches before v4 had a 32-bit seed and this generator: put back, on the rulebook's own first
// line (so its lines keep their numbers), for replaying them as they were played.
const MULBERRY32 = 'globalThis.random = (n) => { let t = (Number(n) + 0x6D2B79F5) >>> 0; let r = Math.imul(t ^ (t >>> 15), t | 1); r ^= r + Math.imul(r ^ (r >>> 7), r | 61); return [((r ^ (r >>> 14)) >>> 0) / 4294967296, t]; };';
const source = typeof m.seed === 'number' ? MULBERRY32 + rb.source : rb.source;
let state = over ? rules.call(source, 'init', [m.seed, m.options, at(m.started)]).value : null;
let clock = m.started ?? 0;
let unsigned = 0;
for (const e of log) {
  const text = signedText({ match, n: e.n, prev, person: e.player.id, device: e.device, kind: e.kind, data: e.data });
  if (e.prev !== prev) fail(`action ${e.n}: its prev isn't the hash before it`);
  if (e.hash !== await entryHash(text, e.signature, e.time)) fail(`action ${e.n}: its hash doesn't match what it says`);
  if (e.time != null && e.time < clock) fail(`action ${e.n}: its time goes backwards`);
  clock = e.time ?? clock;
  if (!e.signature) unsigned++;
  else if (!e.key) fail(`action ${e.n}: it keeps no key for device ${e.device}`);
  else {
    const key = await crypto.subtle.importKey('jwk', e.key, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    if (!await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, Buffer.from(e.signature, 'base64url'), new TextEncoder().encode(text))) fail(`action ${e.n}: the signature isn't ${e.player.name}'s device's`);
  }
  if (over && e.kind === 'moves') {
    // Moves made together: each applied on its own, and refused or not as it was then.
    let ended = false;   // a move that ends the match refuses the rest
    e.data.forEach((one, i) => {
      let applied = 0;
      if (!ended) try { const v = rules.call(source, 'move', [state, e.player, one, at(e.time)]).value; if (JSON.stringify(v).length <= 200_000) { state = v; applied = 1; ended = (rules.call(source, 'result', [state, at(e.time)]).value ?? null) !== null; } } catch {}
      if (applied !== (e.outcomes?.[i] ?? 1)) fail(`action ${e.n}, move ${i + 1} of ${e.data.length}: on replay it was ${applied ? 'applied' : 'refused'}, but the match says the opposite`);
    });
  } else if (over) try { state = rules.call(source, e.kind, [state, e.player, e.data, at(e.time)]).value; } catch (err) { fail(`action ${e.n}: the rules refuse it on replay (${err.message})`); }
  console.log(`  ${String(e.n).padStart(3)} ${e.player.name}${e.through ? ` (through ${e.through.name})` : ''} ${e.kind} ${JSON.stringify(e.data)}`);
  prev = e.hash;
}
if (prev !== m.head) fail('the chain doesn\'t end at the match\'s head');
if (over) {
  const result = rules.call(source, 'result', [state, at(clock)]).value ?? null;
  if (JSON.stringify(result) !== JSON.stringify(m.result ?? null)) fail(`replayed, the result is ${JSON.stringify(result)}, not ${JSON.stringify(m.result)}`);
  console.log(`result: ${JSON.stringify(result)}`);
}
// An unsigned action is only the server's word (a device without a key, on a local install):
// nothing here can show who took it.
if (unsigned) fail(`${unsigned} action(s) unsigned, so who took them can't be checked`);
console.log(bad.length ? `\n${bad.length} problem(s)` : `\nchecks out: the chain, every signature${over ? ', and the replay' : ''}`);
process.exit(bad.length ? 1 : 0);

// Who this browser's person is (people.mjs has the other half). This device keeps its own
// key pair in IndexedDB; the private half is made non-extractable, so no script can read it
// out, only use it here. Signing a fresh challenge from the server gets a pass for 24 hours,
// kept in localStorage and renewed silently when it runs low.
//
//   await pass()                  -> the current pass, renewed if needed; null if this device isn't anyone's yet
//   await become(name)            -> { recovery }   a new person, with this device
//   await join({ code | recovery }) -> { recovery? }   this device joins someone (a code from
//                                    another of their devices, or their recovery code)
//   who()                         -> { person, name } from the pass, or null (no network)
//   mine(path, body)              -> people/me, pair, name, remove, recovery, as its person
//   await sign(text)              -> this device's signature over text (null if it keeps a secret)
//   forgetDevice()                -> this device stops being anyone's (after it's removed)
//
// Private things (a ludant's chat, sketches, saves) are sealed here before they're saved, with
// a content key that's the person's, not the device's: every device of theirs holds it, and
// the server never does. It travels as a vault (wrapped under a key derived from the
// recovery code, which is made here so the server never knows what opens it) and from
// device to device (wrapped for a public key the asking device offers). See people.mjs.
//
//   await contentKey({ fresh })   -> the key, or null: this device hasn't got it yet (it has
//                                    asked for it), or can't seal (plain http). fresh(code) is
//                                    called with a new recovery code when this device makes
//                                    the person's very first key (it must be shown).
//   await unlock(recovery)        -> the key, from the vault with the recovery code
//   await handOver()              -> how many of their devices that asked were handed the key
//   await seal(value, ludant), await unseal(sealed, ludant)
//   await newRecovery()           -> { recovery }   a new code (and vault, where there's a key)
//
// Over plain http (a phone on the LAN reaching a local install) browsers won't do the
// cryptography, so the device keeps a random secret instead; only a local install takes it,
// and nothing is sealed there.

const DB = 'gactant', STORE = 'device', ME = 'me';
const PASS = 'gactant-pass';
const RENEW_BEFORE_MS = 30 * 60_000;
const canSign = () => Boolean(globalThis.crypto?.subtle) && globalThis.isSecureContext !== false;

function db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function load() {
  try {
    const d = await db();
    return await new Promise((resolve, reject) => { const r = d.transaction(STORE).objectStore(STORE).get(ME); r.onsuccess = () => resolve(r.result ?? null); r.onerror = () => reject(r.error); });
  } catch { return null; }
}
async function save(value) {
  const d = await db();
  await new Promise((resolve, reject) => { const t = d.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(value, ME); t.oncomplete = resolve; t.onerror = () => reject(t.error); });
}
async function clear() {
  const d = await db();
  await new Promise((resolve) => { const t = d.transaction(STORE, 'readwrite'); t.objectStore(STORE).delete(ME); t.oncomplete = resolve; t.onerror = resolve; });
}

const b64u = (bytes) => {
  const a = new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64u = (s) => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const enc = new TextEncoder();
const post = async (path, body) => {
  const res = await fetch(`/api/people${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.error || `people${path}: ${res.status}`), { status: res.status, body: json });
  return json;
};

/** What a device says, roughly, so its person can tell their devices apart. */
function label() {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'a browser';
  const on = /Xbox/.test(ua) ? 'Xbox' : /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'something';
  return `${browser} on ${on}`;
}

/** This device's proof, over a fresh challenge: a signature, or its secret. */
async function proof(device) {
  const { challenge } = await post('/challenge');
  if (device.keys) {
    const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, device.keys.privateKey, new TextEncoder().encode(challenge));
    return { challenge, signature: b64u(sig) };
  }
  return { challenge, secret: device.secret };
}

/** A new device: a key pair (or, where that can't be done, a secret), and what it offers. */
async function makeDevice() {
  if (canSign()) {
    const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
    const jwk = await crypto.subtle.exportKey('jwk', keys.publicKey);
    return { device: { keys }, offer: { key: { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y } } };
  }
  const secret = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('');
  return { device: { secret }, offer: { secret } };
}

function keep(answer) {
  try {
    localStorage.setItem(PASS, JSON.stringify({ pass: answer.pass, until: answer.until, person: answer.person.id, name: answer.person.name }));
    localStorage.setItem('gactant-name', answer.person.name);
  } catch {}
}
function kept() { try { return JSON.parse(localStorage.getItem(PASS) || 'null'); } catch { return null; } }

/** Whether this device seals (it has a key pair: not over plain http). */
export async function canSeal() { return Boolean((await load())?.keys); }

export function who() { const k = kept(); return k ? { person: k.person, name: k.name } : null; }

let renewing = null;
export async function pass() {
  const k = kept();
  if (k && Date.parse(k.until) - Date.now() > RENEW_BEFORE_MS) return k.pass;
  renewing ??= (async () => {
    const device = await load();
    if (!device?.person) return null;
    try {
      const answer = await post('/pass', { person: device.person, device: device.id, ...(await proof(device)) });
      keep(answer);
      return answer.pass;
    } catch (err) {
      // Removed by another of its person's devices: it's nobody's now.
      if (err.status === 401) { await forgetDevice(); return null; }
      throw err;
    }
  })().finally(() => { renewing = null; });
  return renewing;
}

/** A new pass now, for one the server no longer knows (it answered 401). null if this
 *  device isn't anyone's (any more). */
export async function renew() {
  try { localStorage.removeItem(PASS); } catch {}
  return pass();
}

/** A signature by this device's key over text (base64url), for actions at a table: proof
 *  that this device, and so its person, took them. null where the device keeps a secret
 *  instead of a key; the server then records the action as unsigned. */
export async function sign(text) {
  const device = await load();
  if (!device?.keys) return null;
  return b64u(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, device.keys.privateKey, new TextEncoder().encode(text)));
}

export async function become(name) {
  const { device, offer } = await makeDevice();
  const proved = await proof(device);
  // With a key, this device makes the person's content key, and the recovery code that
  // opens its vault; without one (plain http), the server makes the code.
  const content = device.keys ? await newContentKey() : null;
  const recovery = content ? recoveryCode() : null;
  const answer = await post('', { name, label: label(), ...offer, ...proved, ...(content ? { recovery, vault: await vaultFor(content, recovery) } : {}) });
  await save({ ...device, person: answer.person.id, id: answer.person.devices.find((d) => d.current).id, ...(content ? { content } : {}) });
  keep(answer);
  return { recovery: recovery ?? answer.recovery };
}

export async function join({ code, recovery }) {
  const { device, offer } = await makeDevice();
  const proved = await proof(device);
  // Joining with a code, this device asks for the key at once, so the device that made the
  // code can hand it over while it's still open.
  const asking = device.keys && code ? await askingKeys() : null;
  const answer = await post('/join', { label: label(), ...offer, ...proved, ...(code ? { code } : { recovery }), ...(asking ? { box: asking.box } : {}) });
  const saved = { ...device, person: answer.person.id, id: answer.person.devices.find((d) => d.current).id, ...(asking ? { asking: asking.keys } : {}) };
  // With the recovery code, the vault opens here; the code has been used, so a new one
  // (and a new vault under it) replaces it.
  if (recovery && device.keys && answer.person.vault) {
    saved.content = await openVault(answer.person.vault, recovery);
    await save(saved);
    keep(answer);
    const fresh = recoveryCode();
    await mine('recovery', { recovery: fresh, vault: await vaultFor(saved.content, fresh) });
    return { recovery: fresh, name: answer.person.name };
  }
  await save(saved);
  keep(answer);
  return { recovery: answer.recovery ?? null, name: answer.person.name };
}

// ---------- the content key ----------

// A recovery code: twelve made-up words (people.mjs checks the shape).
const C = 'bdfghjklmnprstvz', V = 'aeiou';
const word = () => { const r = crypto.getRandomValues(new Uint8Array(4)); return C[r[0] % 16] + V[r[1] % 5] + C[r[2] % 16] + V[r[3] % 5]; };
const recoveryCode = () => Array.from({ length: 12 }, word).join('-');
const tidyCode = (s) => String(s ?? '').toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');

const AES = { name: 'AES-GCM', length: 256 };
const newContentKey = () => crypto.subtle.generateKey(AES, true, ['encrypt', 'decrypt']);
const iv = () => crypto.getRandomValues(new Uint8Array(12));

/** The key the vault is wrapped under, from the recovery code (and nothing the server has). */
async function vaultKey(code) {
  const base = await crypto.subtle.importKey('raw', enc.encode(tidyCode(code)), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('gactant vault v1'), info: enc.encode('content key') }, base, AES, false, ['wrapKey', 'unwrapKey']);
}
async function vaultFor(content, code) {
  const n = iv();
  return { iv: b64u(n), data: b64u(await crypto.subtle.wrapKey('raw', content, await vaultKey(code), { name: 'AES-GCM', iv: n })) };
}
async function openVault(vault, code) {
  try { return await crypto.subtle.unwrapKey('raw', unb64u(vault.data), await vaultKey(code), { name: 'AES-GCM', iv: unb64u(vault.iv) }, AES, true, ['encrypt', 'decrypt']); }
  catch { throw new Error('that recovery code doesn\'t open your private things'); }
}

/** A key pair for being handed the key: the private half stays here. */
async function askingKeys() {
  const keys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey']);
  const { x, y } = await crypto.subtle.exportKey('jwk', keys.publicKey);
  return { keys, box: { kty: 'EC', crv: 'P-256', x, y } };
}
const shared = async (privateKey, box) => crypto.subtle.deriveKey(
  { name: 'ECDH', public: await crypto.subtle.importKey('jwk', { ...box, ext: true }, { name: 'ECDH', namedCurve: 'P-256' }, false, []) },
  privateKey, AES, false, ['wrapKey', 'unwrapKey']);

export async function contentKey({ fresh } = {}) {
  const device = await load();
  if (!device?.keys || !device.person) return null;
  if (device.content) return device.content;
  const me = await mine('me');
  const here = me.devices.find((d) => d.current);
  // Handed over by another of their devices.
  if (here?.handed && device.asking) {
    const content = await crypto.subtle.unwrapKey('raw', unb64u(here.handed.data), await shared(device.asking.privateKey, here.handed.from),
      { name: 'AES-GCM', iv: unb64u(here.handed.iv) }, AES, true, ['encrypt', 'decrypt']);
    await keepContent(device, content);
    return content;
  }
  // Nobody has one yet (a person from before sealing): this device makes it, with a new
  // recovery code that opens its vault, which they must be shown.
  if (!me.vault) {
    const content = await newContentKey();
    const code = recoveryCode();
    try {
      await mine('recovery', { recovery: code, vault: await vaultFor(content, code), first: true });
      await keepContent(device, content);
      await fresh?.(code);
      return content;
    } catch (err) { if (err.status !== 409) throw err; }   // another device just did: ask it
  }
  // Ask for it, once: any device of theirs that has it hands it over (handOver).
  if (!device.asking || !here?.asking) {
    const asking = await askingKeys();
    await save({ ...device, asking: asking.keys });
    await mine('box', { box: asking.box });
  }
  return null;
}
async function keepContent(device, content) {
  const { asking, ...rest } = device;
  await save({ ...rest, content });
  if (asking) await mine('took').catch(() => {});
}

export async function unlock(recovery) {
  const device = await load();
  const me = await mine('me');
  if (!me.vault) throw new Error('there\'s nothing to unlock yet');
  const content = await openVault(me.vault, recovery);
  await keepContent(device, content);
  return content;
}

export async function handOver() {
  const device = await load();
  if (!device?.content) return 0;
  const me = await mine('me');
  let n = 0;
  for (const d of me.devices.filter((x) => x.asking && !x.current)) {
    const mineKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey']);
    const { x, y } = await crypto.subtle.exportKey('jwk', mineKeys.publicKey);
    const n12 = iv();
    const data = await crypto.subtle.wrapKey('raw', device.content, await shared(mineKeys.privateKey, d.asking), { name: 'AES-GCM', iv: n12 });
    await mine('hand', { device: d.id, handed: { iv: b64u(n12), data: b64u(data), from: { kty: 'EC', crv: 'P-256', x, y } } });
    n++;
  }
  return n;
}

export async function newRecovery() {
  const device = await load();
  if (!device?.content) return mine('recovery');
  const code = recoveryCode();
  await mine('recovery', { recovery: code, vault: await vaultFor(device.content, code) });
  return { recovery: code };
}

/** Sealed for one ludant: the same key, but a blob sealed for one won't open as another's. */
const about = (ludant) => enc.encode(`gactant/sealed/v1\n${ludant}`);
export async function seal(value, ludant) {
  const content = (await load())?.content;
  if (!content) throw new Error('this device hasn\'t got your key');
  const n = iv();
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: n, additionalData: about(ludant) }, content, enc.encode(JSON.stringify(value)));
  return { v: 1, iv: b64u(n), data: b64u(data) };
}
export async function unseal(sealed, ludant) {
  const content = (await load())?.content;
  if (!content) throw new Error('this device hasn\'t got your key');
  const data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(sealed.iv), additionalData: about(ludant) }, content, unb64u(sealed.data));
  return JSON.parse(new TextDecoder().decode(data));
}

export async function forgetDevice() {
  await clear();
  try { localStorage.removeItem(PASS); } catch {}
}

/** Looking after themselves, signed in: people/me, pair, name, remove, recovery. */
export async function mine(path, body) {
  const ask = async (p) => {
    if (!p) throw Object.assign(new Error('this device isn\'t anyone\'s yet'), { status: 401 });
    return fetch(`/api/people/${path}`, path === 'me'
      ? { headers: { 'X-Gactant-Pass': p } }
      : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Gactant-Pass': p }, body: JSON.stringify(body ?? {}) });
  };
  let res = await ask(await pass());
  if (res.status === 401) res = await ask(await renew());
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.error || `people/${path}: ${res.status}`), { status: res.status, body: json });
  if (path === 'name') { const k = kept(); if (k) { k.name = json.name; try { localStorage.setItem(PASS, JSON.stringify(k)); localStorage.setItem('gactant-name', json.name); } catch {} } }
  return json;
}

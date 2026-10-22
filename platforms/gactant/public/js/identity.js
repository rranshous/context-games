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
//   forgetDevice()                -> this device stops being anyone's (after it's removed)
//
// Over plain http (a phone on the LAN reaching a local install) browsers won't do the
// cryptography, so the device keeps a random secret instead; only a local install takes it.

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

const b64u = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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

export async function become(name) {
  const { device, offer } = await makeDevice();
  const proved = await proof(device);
  const answer = await post('', { name, label: label(), ...offer, ...proved });
  await save({ ...device, person: answer.person.id, id: answer.person.devices.find((d) => d.current).id });
  keep(answer);
  return { recovery: answer.recovery };
}

export async function join({ code, recovery }) {
  const { device, offer } = await makeDevice();
  const proved = await proof(device);
  const answer = await post('/join', { label: label(), ...offer, ...proved, ...(code ? { code } : { recovery }) });
  await save({ ...device, person: answer.person.id, id: answer.person.devices.find((d) => d.current).id });
  keep(answer);
  return { recovery: answer.recovery ?? null, name: answer.person.name };
}

export async function forgetDevice() {
  await clear();
  try { localStorage.removeItem(PASS); } catch {}
}

/** Looking after themselves, signed in: people/me, pair, name, remove, recovery. */
export async function mine(path, body) {
  const p = await pass();
  if (!p) throw Object.assign(new Error('this device isn\'t anyone\'s yet'), { status: 401 });
  const res = await fetch(`/api/people/${path}`, path === 'me'
    ? { headers: { 'X-Gactant-Pass': p } }
    : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Gactant-Pass': p }, body: JSON.stringify(body ?? {}) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.error || `people/${path}: ${res.status}`), { status: res.status, body: json });
  if (path === 'name') { const k = kept(); if (k) { k.name = json.name; try { localStorage.setItem(PASS, JSON.stringify(k)); localStorage.setItem('gactant-name', json.name); } catch {} } }
  return json;
}
